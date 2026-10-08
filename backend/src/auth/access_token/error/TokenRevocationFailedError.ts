export default class TokenRevocationFailedError extends Error {
  override name = this.constructor.name;
}
