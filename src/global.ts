export interface ApolloConfig {
  readonly baseUrl: string;

  readonly webserver: {
    readonly host: string;
    readonly port: number;
  };
 
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
