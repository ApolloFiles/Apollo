export abstract class HttpError extends Error {
  protected constructor(
    public readonly httpStatusCode: number,
    public readonly httpErrorMessage: string,
  ) {
    super(`[${httpStatusCode}] ${httpErrorMessage}`);
  }

  createResponseBody(): Record<string, any> {
    return { error: this.httpErrorMessage };
  }
}

export class BadRequestError extends HttpError {
  constructor(httpErrorMessage: string) {
    super(400, httpErrorMessage);
  }
}

export class UnauthorizedError extends HttpError {
  constructor(httpErrorMessage = 'Unauthorized') {
    super(401, httpErrorMessage);
  }
}

export class NotFoundError extends HttpError {
  constructor(httpErrorMessage = 'Requested resource not found') {
    super(404, httpErrorMessage);
  }
}

export class ConflictError extends HttpError {
  constructor(httpErrorMessage: string) {
    super(409, httpErrorMessage);
  }
}

export class LengthRequiredError extends HttpError {
  constructor(httpErrorMessage = 'Content-Length header is required') {
    super(411, httpErrorMessage);
  }
}

export class PayloadTooLargeError extends HttpError {
  constructor(httpErrorMessage: string) {
    super(413, httpErrorMessage);
  }
}

export class UnsupportedMediaTypeError extends HttpError {
  constructor(httpErrorMessage = 'Unsupported media type') {
    super(415, httpErrorMessage);
  }
}
