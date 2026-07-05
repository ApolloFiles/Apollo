export default class ApolloUser {
  constructor(
    public readonly id: string,
    public readonly displayName: string,
    public readonly blocked: boolean,
    public readonly isSuperUser: boolean,
    public readonly uiLanguage: string | null,
  ) {
  }

  get hasSuperUserPrivileges(): boolean {
    return this.isSuperUser && !this.blocked;
  }
}
