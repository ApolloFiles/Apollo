export interface ApolloConfig {
  readonly oauth: {
    readonly github: {
      readonly clientId: string;
      readonly clientSecret: string;
    };

    readonly microsoft: {
      readonly clientId: string;
      readonly clientSecret: string;
    };
  };
}
