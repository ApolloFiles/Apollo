/** @internal */
export class CacheRootError extends Error {
  override name = this.constructor.name;
}
