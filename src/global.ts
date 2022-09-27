import AbstractUser from './AbstractUser';
import { ServerTiming } from './ServerTiming';

declare module 'express' {
  interface Request {
    user?: AbstractUser | null;
  }

  interface Response {
    locals: {
      timings?: ServerTiming;
    };
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

    readonly trustProxy: string[] | number;
  };

  readonly database: {
    readonly postgres: {
      readonly enabled: boolean;

      readonly host: string;
      readonly port: number;

      readonly username: string;
      readonly password: string;
      readonly database: string;

      readonly ssl: boolean;
      readonly poolSize: number;
    };
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

  readonly secrets: {
    readonly session: string;
  };
}
