import {
  Injectable,
  Logger,
  ServiceUnavailableException,
  type OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Anthropic from '@anthropic-ai/sdk';
import type { ZodSchema } from 'zod';

/** A JSON Schema object handed to `output_config.format`. */
export type JsonSchemaObject = Record<string, unknown>;

export interface CompletionRequest {
  /** The stable half of the prompt - cached when `cacheSystem` is set. */
  system: string;
  messages: Anthropic.MessageParam[];
  maxTokens?: number;
  /**
   * Adds a cache breakpoint after the system prompt. Worth it when the same
   * system text is sent on every request (the chatbot's store briefing); noise
   * when it is assembled per request (a single product's details).
   */
  cacheSystem?: boolean;
}

export interface JsonCompletionRequest<T> extends CompletionRequest {
  /** Constrains the model's output. Claude cannot return anything else. */
  jsonSchema: JsonSchemaObject;
  /**
   * The same contract expressed in Zod, checked after parsing.
   *
   * Belt and braces on purpose: structured outputs guarantee the *shape*, but
   * this is the boundary where model output first becomes application data, and
   * every other such boundary in this codebase runs through a Zod schema.
   */
  validator: ZodSchema<T>;
}

/**
 * The single door to the Claude API.
 *
 * Every AI feature goes through here rather than constructing its own client,
 * so the API key is read once, the model id is decided in one place, and the
 * failure modes - no key configured, rate limited, model refused - map to HTTP
 * statuses consistently instead of each feature inventing its own.
 *
 * The service is deliberately tolerant of not being configured: `ANTHROPIC_API_KEY`
 * is optional, and a store running without one keeps working with the AI
 * surfaces disabled rather than refusing to boot. `isConfigured()` is what the
 * controllers check before promising the frontend anything.
 */
@Injectable()
export class ClaudeService implements OnModuleInit {
  private readonly logger = new Logger(ClaudeService.name);
  private client: Anthropic | null = null;
  private model = 'claude-sonnet-4-6';

  constructor(private readonly config: ConfigService) {}

  onModuleInit(): void {
    this.model = this.config.get<string>('ANTHROPIC_MODEL') ?? this.model;

    const apiKey = this.config.get<string>('ANTHROPIC_API_KEY');
    if (!apiKey) {
      this.logger.warn(
        'ANTHROPIC_API_KEY is not set - AI features (descriptions, chat, review ' +
          'summaries) will answer 503. Recommendations still work: they are ' +
          'computed from order history, not from the model.',
      );
      return;
    }

    this.client = new Anthropic({
      apiKey,
      // Two retries on 429/5xx is the SDK default; the timeout is lowered from
      // ten minutes because every call here sits inside a request a person is
      // waiting on, and a shopper will not wait ten minutes for a chat reply.
      maxRetries: 2,
      timeout: 60_000,
    });

    this.logger.log(`Claude API ready (model: ${this.model})`);
  }

  isConfigured(): boolean {
    return this.client !== null;
  }

  /** The model id every feature reports alongside what it generated. */
  modelId(): string {
    return this.model;
  }

  /** Free-form text completion. */
  async text(request: CompletionRequest): Promise<string> {
    const message = await this.send(request);
    return extractText(message);
  }

  /**
   * Completion constrained to a JSON schema, parsed and validated.
   *
   * Throws `ServiceUnavailableException` rather than a 500 when the model
   * returns something the validator rejects: from the caller's side that is a
   * transient upstream problem they can retry, not a bug in their request.
   */
  async json<T>(request: JsonCompletionRequest<T>): Promise<T> {
    const message = await this.send(request, {
      type: 'json_schema',
      schema: request.jsonSchema,
    });

    const raw = extractText(message);

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      this.logger.error(`Claude returned unparseable JSON: ${raw.slice(0, 500)}`);
      throw new ServiceUnavailableException('The AI service returned an unreadable response.');
    }

    const result = request.validator.safeParse(parsed);
    if (!result.success) {
      this.logger.error(
        `Claude response failed validation: ${result.error.issues
          .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
          .join('; ')}`,
      );
      throw new ServiceUnavailableException('The AI service returned an unexpected response.');
    }

    return result.data;
  }

  /* ---------------------------------------------------------------------- */

  private async send(
    request: CompletionRequest,
    format?: Anthropic.JSONOutputFormat,
  ): Promise<Anthropic.Message> {
    const client = this.client;
    if (!client) {
      throw new ServiceUnavailableException(
        'AI features are not configured on this server (ANTHROPIC_API_KEY is missing).',
      );
    }

    try {
      const message = await client.messages.create({
        model: this.model,
        max_tokens: request.maxTokens ?? 4096,
        system: [
          {
            type: 'text',
            text: request.system,
            ...(request.cacheSystem && { cache_control: { type: 'ephemeral' as const } }),
          },
        ],
        messages: request.messages,
        ...(format && { output_config: { format } }),
      });

      // Safety declines arrive as a 200 with no usable content, so they have to
      // be checked before the content is read rather than caught below.
      if (message.stop_reason === 'refusal') {
        this.logger.warn(
          `Claude declined the request (${message.stop_details?.category ?? 'unspecified'}).`,
        );
        throw new ServiceUnavailableException(
          'The AI service declined to answer this request.',
        );
      }

      return message;
    } catch (error) {
      throw this.toHttpException(error);
    }
  }

  /**
   * Maps SDK errors onto something a client can act on.
   *
   * Nothing upstream is the caller's fault in a way they can fix by changing
   * their request - a bad API key or an exhausted quota is an operator problem -
   * so these are all 503s, and the detail goes to the log rather than the wire.
   */
  private toHttpException(error: unknown): Error {
    if (error instanceof ServiceUnavailableException) return error;

    if (error instanceof Anthropic.RateLimitError) {
      this.logger.warn('Claude API rate limit reached.');
      return new ServiceUnavailableException(
        'The AI service is busy right now. Try again in a moment.',
      );
    }

    if (error instanceof Anthropic.AuthenticationError) {
      this.logger.error('Claude API rejected the configured ANTHROPIC_API_KEY.');
      return new ServiceUnavailableException('AI features are misconfigured on this server.');
    }

    if (error instanceof Anthropic.APIError) {
      this.logger.error(`Claude API error ${error.status ?? '?'}: ${error.message}`);
      return new ServiceUnavailableException('The AI service is temporarily unavailable.');
    }

    this.logger.error(
      `Unexpected failure calling Claude: ${error instanceof Error ? error.message : String(error)}`,
    );
    return new ServiceUnavailableException('The AI service is temporarily unavailable.');
  }
}

/** Joins every text block in the response; ignores thinking and tool blocks. */
function extractText(message: Anthropic.Message): string {
  return message.content
    .filter((block): block is Anthropic.TextBlock => block.type === 'text')
    .map((block) => block.text)
    .join('')
    .trim();
}
