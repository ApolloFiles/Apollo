export class AniDbError extends Error {
  override name = this.constructor.name;
}
