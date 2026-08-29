import { BadRequestException, Injectable, type PipeTransform } from '@nestjs/common';
import type { ZodSchema } from 'zod';

/**
 * Validates a request payload against a Zod schema from @bazaar/shared.
 *
 * Blueprint rule: "Validate ALL inputs with Zod schemas. No unvalidated data
 * reaches the database." Using the same schema the frontend form uses means a
 * contract change breaks both sides at build time.
 *
 * Usage:
 *   @Body(new ZodValidationPipe(registerSchema)) dto: RegisterInput
 *
 * `RegisterInput` must be a type alias, not a class. TypeScript then emits
 * `Object` as the design-time param type, so the global class-validator
 * ValidationPipe skips it and does not strip the body under `whitelist: true`.
 */
@Injectable()
export class ZodValidationPipe<T> implements PipeTransform<unknown, T> {
  constructor(private readonly schema: ZodSchema<T>) {}

  transform(value: unknown): T {
    const result = this.schema.safeParse(value);

    if (!result.success) {
      throw new BadRequestException({
        message: 'Validation failed',
        errors: result.error.issues.map((issue) => ({
          field: issue.path.join('.') || 'body',
          message: issue.message,
        })),
      });
    }

    return result.data;
  }
}
