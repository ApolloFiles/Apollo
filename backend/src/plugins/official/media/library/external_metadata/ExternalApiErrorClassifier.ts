/** @internal */
export class ExternalApiErrorClassifier {
  /** System and undici error codes of failed connections and timeouts */
  private static readonly TRANSIENT_NETWORK_ERROR_CODES: ReadonlySet<string> = new Set([
    'EAI_AGAIN',
    'ECONNREFUSED',
    'ECONNRESET',
    'EHOSTUNREACH',
    'ENETUNREACH',
    'ENOTFOUND',
    'EPIPE',
    'ETIMEDOUT',
    'UND_ERR_BODY_TIMEOUT',
    'UND_ERR_CLOSED',
    'UND_ERR_CONNECT_TIMEOUT',
    'UND_ERR_HEADERS_TIMEOUT',
    'UND_ERR_SOCKET',
  ]);

  static isTransientNetworkError(err: unknown): boolean {
    const code = (err as { code?: unknown } | null)?.code;
    return typeof code === 'string' && ExternalApiErrorClassifier.TRANSIENT_NETWORK_ERROR_CODES.has(code);
  }

  static isTransientHttpStatus(statusCode: number): boolean {
    return statusCode >= 500 || statusCode === 429;
  }
}
