export default class FallbackImageMissingError extends Error {
  override name = this.constructor.name;
}
