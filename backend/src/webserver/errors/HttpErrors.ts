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

export class NotFoundError extends HttpError {
  constructor(httpErrorMessage = 'Requested resource not found') {
    super(404, httpErrorMessage);
  }
}
