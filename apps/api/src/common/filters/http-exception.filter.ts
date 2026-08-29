import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';

interface ErrorBody {
  success: false;
  statusCode: number;
  message: string;
  errors?: Array<{ field: string; message: string }>;
  path: string;
  timestamp: string;
}

/**
 * Normalises every error into the ApiFailure shape declared in @bazaar/shared,
 * so the frontend has one error contract to handle.
 *
 * D1: internal error details are logged server-side but never returned to the
 * client in production - stack traces leak schema and file layout.
 */
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    const body: ErrorBody = {
      success: false,
      statusCode: status,
      message: this.resolveMessage(exception, status),
      errors: this.resolveFieldErrors(exception),
      path: request.url,
      timestamp: new Date().toISOString(),
    };

    if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      this.logger.error(
        `${request.method} ${request.url} -> ${status}`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    }

    response.status(status).json(body);
  }

  private resolveMessage(exception: unknown, status: number): string {
    if (exception instanceof HttpException) {
      const payload = exception.getResponse();
      if (typeof payload === 'string') return payload;
      if (typeof payload === 'object' && payload !== null && 'message' in payload) {
        const { message } = payload as { message: unknown };
        if (typeof message === 'string') return message;
        if (Array.isArray(message)) return 'Validation failed';
      }
      return exception.message;
    }

    return status >= HttpStatus.INTERNAL_SERVER_ERROR
      ? 'Internal server error'
      : 'Request could not be processed';
  }

  /**
   * Two shapes reach here:
   *   - ZodValidationPipe throws `{ message, errors: [{ field, message }] }`
   *   - class-validator's ValidationPipe throws `{ message: string[] }`
   * Both are normalised into the `errors` array the frontend forms read.
   */
  private resolveFieldErrors(exception: unknown): ErrorBody['errors'] {
    if (!(exception instanceof HttpException)) return undefined;

    const payload = exception.getResponse();
    if (typeof payload !== 'object' || payload === null) return undefined;

    if ('errors' in payload) {
      const { errors } = payload as { errors: unknown };
      if (Array.isArray(errors)) {
        return errors.filter(
          (entry): entry is { field: string; message: string } =>
            typeof entry === 'object' &&
            entry !== null &&
            typeof (entry as { field?: unknown }).field === 'string' &&
            typeof (entry as { message?: unknown }).message === 'string',
        );
      }
    }

    if (!('message' in payload)) return undefined;

    const { message } = payload as { message: unknown };
    if (!Array.isArray(message)) return undefined;

    return message
      .filter((entry): entry is string => typeof entry === 'string')
      .map((entry) => ({ field: entry.split(' ')[0] ?? 'unknown', message: entry }));
  }
}
