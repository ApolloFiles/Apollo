import { WebSocket } from 'ws';
import PlayerSession from './media/video-player/player-session/PlayerSession';
import { ServerTiming } from './ServerTiming';
import ApolloUser from './user/ApolloUser';

declare module 'express' {
  interface Request {
    user?: ApolloUser | null;
  }

  interface Response {
    locals: {
      timings?: ServerTiming;
    };
  }
}

export interface ApolloWebSocket extends WebSocket {
  apollo: {
    user?: ApolloUser;
    playerSessionId?: PlayerSession['id'];
    isAlive: boolean;

    pingRtt: number;
    lastPingTimestamp: number;
  };
}

declare module 'express-session' {
  interface SessionData {
    userId?: string;

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

  readonly mediaLibrary: {
    readonly externalProviders: {
      readonly myAnimeList: {
        readonly clientId: string;
      }
      readonly theMovieDb: {
        readonly apiReadAccessToken: string;
      }
      readonly theTvDb: {
        readonly apiKey: string;
      }
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
    readonly tokenSalt: string;
  };
}
