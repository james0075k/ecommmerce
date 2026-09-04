import { AsyncLocalStorage } from 'node:async_hooks';
import { Injectable } from '@nestjs/common';

/**
 * What a request knows about itself, available anywhere inside it.
 */
export interface RequestContext {
  /** The authenticated user, when there is one. */
  userId: string | null;
  role: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  method: string;
  path: string;
  /**
   * Set once a service has written a considered activity-log entry for this
   * request - one with a real before/after diff.
   *
   * The blanket audit interceptor reads this and stays quiet when it is set, so
   * a route that logs itself properly produces one good row rather than a good
   * row plus a generic one describing the same change. Mutable on purpose: the
   * flag is set from deep inside the request and read at the end of it, and the
   * object identity is what carries it.
   */
  logged: boolean;
}

/**
 * Ambient per-request state, backed by AsyncLocalStorage.
 *
 * The activity log needs the caller's IP and user agent, but the things worth
 * logging happen several layers below the controller - inside a service, often
 * inside a transaction. Threading a `Request` down to them would put HTTP
 * plumbing in the signature of every domain method, and a Nest request-scoped
 * provider would make every class that touches it request-scoped too, which
 * quietly rebuilds the dependency graph on each call.
 *
 * AsyncLocalStorage keeps the context on the async execution path instead: the
 * interceptor enters it once, and anything awaited underneath can read it
 * without being handed it. Reads outside a request return null rather than
 * throwing, so a cron job or a queue worker logging an action is a valid case
 * with no context rather than a crash.
 */
@Injectable()
export class RequestContextService {
  private readonly storage = new AsyncLocalStorage<RequestContext>();

  run<T>(context: RequestContext, callback: () => T): T {
    return this.storage.run(context, callback);
  }

  get(): RequestContext | null {
    return this.storage.getStore() ?? null;
  }

  /** Never throws and never returns undefined - the log is not worth a 500. */
  snapshot(): Pick<RequestContext, 'ipAddress' | 'userAgent' | 'userId'> {
    const context = this.get();
    return {
      ipAddress: context?.ipAddress ?? null,
      userAgent: context?.userAgent ?? null,
      userId: context?.userId ?? null,
    };
  }
}
