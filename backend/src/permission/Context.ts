export default abstract class Context<S, R, A extends string> {
  public constructor(
    public readonly subject: S,
    public readonly resource: R,
    public readonly action: A,
  ) {
  }
}
