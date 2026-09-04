import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue, Worker, type Job } from 'bullmq';
import IORedis from 'ioredis';

/** A registered job handler. Throwing lets BullMQ retry with backoff. */
export type JobHandler = (payload: Record<string, unknown>) => Promise<void>;

const QUEUE_NAME = 'bazaar';

/**
 * Deferred and scheduled work (BullMQ).
 *
 * Everything here is a *side effect of something already committed* - the
 * review-request email seven days after delivery, and anything later that has
 * to happen at a time nobody is holding a request open for. The order is
 * already delivered whether or not the email goes out, so a job that fails must
 * never be able to fail the transaction that queued it.
 *
 * Redis is the real implementation. When it is unreachable this falls back to
 * in-process `setTimeout`s, in the same spirit as RedisService: local
 * development works with nothing running, and the degradation is loud rather
 * than silent. The fallback is explicitly NOT production-safe - a timer dies
 * with the process, so a seven-day delay does not survive a deploy. `isDurable`
 * reports which mode is live and /health surfaces it.
 */
@Injectable()
export class QueueService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(QueueService.name);
  private readonly handlers = new Map<string, JobHandler>();

  private queue: Queue | null = null;
  private worker: Worker | null = null;
  private connection: IORedis | null = null;

  /** Pending in-memory jobs, keyed by job id so they can be cancelled. */
  private readonly timers = new Map<string, NodeJS.Timeout>();

  constructor(private readonly config: ConfigService) {}

  async onModuleInit(): Promise<void> {
    const url = this.config.get<string>('REDIS_URL');

    if (!url || !(await this.canReach(url))) {
      this.logger.warn(
        'Redis is not reachable - scheduled jobs will run on in-process timers. ' +
          'They will not survive a restart.',
      );
      return;
    }

    // BullMQ requires `maxRetriesPerRequest: null` on the connection it blocks
    // on; anything else makes the worker's BRPOPLPUSH give up mid-wait.
    this.connection = new IORedis(url, { maxRetriesPerRequest: null });
    this.queue = new Queue(QUEUE_NAME, { connection: this.connection });

    this.worker = new Worker(
      QUEUE_NAME,
      async (job: Job) => {
        const handler = this.handlers.get(job.name);

        if (!handler) {
          // A job queued by a previous deploy whose handler has since been
          // removed. Dropping it is right; crashing the worker is not.
          this.logger.warn(`No handler registered for job "${job.name}" - discarding.`);
          return;
        }

        await handler(job.data as Record<string, unknown>);
      },
      { connection: this.connection, concurrency: 4 },
    );

    this.worker.on('failed', (job, error) => {
      this.logger.error(`Job ${job?.name ?? 'unknown'} failed: ${error.message}`);
    });

    this.logger.log('Job queue connected to Redis.');
  }

  async onModuleDestroy(): Promise<void> {
    for (const timer of this.timers.values()) clearTimeout(timer);
    this.timers.clear();

    await this.worker?.close();
    await this.queue?.close();
    this.connection?.disconnect();
  }

  /** True when jobs are persisted in Redis rather than held in this process. */
  isDurable(): boolean {
    return this.queue !== null;
  }

  /**
   * Handlers are registered by the module that owns the work, at boot. Doing it
   * this way rather than wiring processors here keeps the queue ignorant of
   * orders, mail and everything else it carries.
   */
  register(name: string, handler: JobHandler): void {
    this.handlers.set(name, handler);
  }

  /**
   * Runs `name` with `payload` after `delayMs`.
   *
   * `jobId` makes the enqueue idempotent: BullMQ refuses a second job with an
   * id it already holds, so an order that somehow reaches DELIVERED twice still
   * only ever asks for one review.
   */
  async schedule(
    name: string,
    payload: Record<string, unknown>,
    delayMs: number,
    jobId?: string,
  ): Promise<void> {
    const delay = Math.max(0, delayMs);

    if (this.queue) {
      await this.queue.add(name, payload, {
        delay,
        jobId,
        attempts: 3,
        backoff: { type: 'exponential', delay: 30_000 },
        removeOnComplete: 500,
        removeOnFail: 1000,
      });
      return;
    }

    const key = jobId ?? `${name}:${Date.now()}:${Math.random()}`;
    if (this.timers.has(key)) return;

    // `unref` so a pending job never holds the process open on shutdown.
    const timer = setTimeout(() => {
      this.timers.delete(key);
      void this.run(name, payload);
    }, delay);

    timer.unref?.();
    this.timers.set(key, timer);
  }

  /** Runs `name` as soon as the event loop allows, off the request path. */
  async enqueue(
    name: string,
    payload: Record<string, unknown>,
    jobId?: string,
  ): Promise<void> {
    await this.schedule(name, payload, 0, jobId);
  }

  async cancel(jobId: string): Promise<void> {
    if (this.queue) {
      const job = await this.queue.getJob(jobId);
      await job?.remove();
      return;
    }

    const timer = this.timers.get(jobId);
    if (timer) {
      clearTimeout(timer);
      this.timers.delete(jobId);
    }
  }

  private async run(name: string, payload: Record<string, unknown>): Promise<void> {
    const handler = this.handlers.get(name);
    if (!handler) return;

    try {
      await handler(payload);
    } catch (error) {
      // No retry in fallback mode - there is no store to retry from.
      this.logger.error(
        `In-process job "${name}" failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  /** A short probe, so a missing Redis costs a second at boot and not a hang. */
  private async canReach(url: string): Promise<boolean> {
    const probe = new IORedis(url, {
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      retryStrategy: () => null,
      connectTimeout: 1_000,
    });

    try {
      await probe.connect();
      await probe.ping();
      return true;
    } catch {
      return false;
    } finally {
      probe.disconnect();
    }
  }
}
