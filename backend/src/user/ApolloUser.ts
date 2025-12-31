export default class ApolloUser {
  constructor(
    public readonly id: string,
    public readonly displayName: string,
    public readonly blocked: boolean,
  ) {
  }
}
