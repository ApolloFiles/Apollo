type PaginatedRequest = {
  routeOptions: { schema?: { operationId: string } },
  query: { limit: number, cursor?: string | undefined },
};

/** @internal */
export class PageRequest {
  constructor(
    /** Identifies the listing a cursor belongs to; taken from the route's `operationId` */
    public readonly listing: string,
    public readonly limit: number,
    public readonly cursor?: string | undefined,
  ) {
  }

  /** The route's schema has to declare an `operationId`; the parameter type enforces that at compile time */
  static fromRequest(request: PaginatedRequest): PageRequest {
    const operationId = request.routeOptions.schema?.operationId;
    if (typeof operationId !== 'string') {
      throw new Error('A paginated route needs an operationId in its schema');
    }

    return new PageRequest(operationId, request.query.limit, request.query.cursor);
  }
}
