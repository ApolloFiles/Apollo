import AbstractUser from './AbstractUser';

declare module 'express' {
  interface Request {
    user?: AbstractUser | null;
  }
}
declare module 'express-session' {
  interface SessionData {
    userId?: AbstractUser['id'];

    oAuthReturnTo?: string;
  }
}

export interface ApolloConfig {
  readonly baseUrl: string;

  readonly webserver: {
    readonly host: string;
    readonly port: number;
  };

  readonly login: {
    readonly thirdParty: {
      readonly [key: string]: {
        readonly enabled: boolean;
        readonly type: 'OAuth2';
        readonly displayName?: string;

        readonly clientId: string;
        readonly clientSecret: string;

        readonly scopes: string[];
        readonly requestBodyContentType: 'x-www-form-urlencoded' | 'json';

        readonly authorizeUrl: string;
        readonly tokenUrl: string;

        readonly accountInfo: {
          readonly url: string;
          readonly idField: string[];
          readonly nameField: string[];
        }
      };
    };
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
