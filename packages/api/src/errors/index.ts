export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: string;

  constructor(message: string, statusCode: number, code: string) {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.code = code;
  }
}

export class UnauthorizedError extends AppError {
  // `code` lets the client tell recoverable 401s apart (e.g. EMAIL_NOT_VERIFIED
  // offers a resend link) without parsing the message.
  constructor(message = 'Unauthorized', code = 'UNAUTHORIZED') {
    super(message, 401, code);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'Forbidden', code = 'FORBIDDEN') {
    super(message, 403, code);
  }
}

export class NotFoundError extends AppError {
  constructor(message = 'Not found') {
    super(message, 404, 'NOT_FOUND');
  }
}

export class ValidationError extends AppError {
  constructor(message = 'Validation failed') {
    super(message, 400, 'VALIDATION_ERROR');
  }
}

export class ConflictError extends AppError {
  constructor(message = 'Resource already exists') {
    super(message, 409, 'CONFLICT');
  }
}

/**
 * The row changed since the client last saw it (its ifVersion is stale). The
 * response carries the current row so the client can merge and retry.
 */
export class VersionConflictError extends AppError {
  public readonly current: unknown;
  constructor(current: unknown, message = 'This was changed by someone else since you loaded it') {
    super(message, 409, 'VERSION_CONFLICT');
    this.current = current;
  }
}
