export default class TokenRotationFailedError extends Error {
  override name = this.constructor.name;
}
