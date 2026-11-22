export type ErrorCode =
  | 'NOT_FOUND'
  | 'BAD_REQUEST'
  | 'CONFLICT'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'INVALID_MANIFEST'
  | 'START_FAILED'
  | 'DAEMON_UNAVAILABLE'
  | 'NOT_IMPLEMENTED'
  | 'INTERNAL';

const STATUS: Record<ErrorCode, number> = {
  NOT_FOUND: 404,
  BAD_REQUEST: 400,
  CONFLICT: 409,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  INVALID_MANIFEST: 422,
  START_FAILED: 500,
  DAEMON_UNAVAILABLE: 503,
  NOT_IMPLEMENTED: 501,
  INTERNAL: 500,
};

/** Error dengan kode yang dipetakan ke format respons API seragam. */
export class AppError extends Error {
  readonly code: ErrorCode;
  readonly statusCode: number;
  readonly details: string[] | undefined;

  constructor(code: ErrorCode, message: string, details?: string[]) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.statusCode = STATUS[code] ?? 500;
    this.details = details;
  }
}

export interface ErrorBody {
  error: { code: ErrorCode; message: string; details?: string[] };
}

export function errorBody(code: ErrorCode, message: string, details?: string[]): ErrorBody {
  return { error: details && details.length ? { code, message, details } : { code, message } };
}

export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
