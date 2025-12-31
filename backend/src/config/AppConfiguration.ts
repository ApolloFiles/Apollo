import Os from 'node:os';
import Path from 'node:path';
import { singleton } from 'tsyringe';
import { IS_PRODUCTION } from '../constants.js';

export type AppConfig = {
  serverInterface: string;
  serverPort: number;
  baseUrl: string;

  paths: {
    dataDirectory: string;
  },

  login: {
    oAuth: {
      [providerId: string]: { clientId: string, clientSecret: string };
    }
  }

  media: {
    externalProviders: {
      myAnimeList: {
        clientId: string;
      },
      theMovieDb: {
        apiReadAccessToken: string;
      },
      theTvDb: {
        apiKey: string;
      }
    }
  }
};

@singleton()
export default class AppConfiguration {
  public readonly config: AppConfig;

  constructor() {
    const serverInterface = process.env.APOLLO_SERVER_INTERFACE || '0.0.0.0';
    const serverPort = parseInt(process.env.APOLLO_SERVER_PORT ?? '', 10) || 8081;

    this.config = this.deepFreeze({
      serverInterface,
      serverPort,
      baseUrl: process.env.APOLLO_BASE_URL || `http://localhost:5177`,

      paths: {
        dataDirectory: this.determineApolloDataDirectory(),
      },

      login: {
        // TODO: Rename env variable
        oAuth: JSON.parse(process.env.BETTER_AUTH_OAUTH_CONFIG_JSON ?? '{}'), // TODO: Move from JSON in env to something better
      },

      media: {
        externalProviders: {
          myAnimeList: {
            clientId: process.env.APOLLO_MEDIA_MYANIMELIST_CLIENT_ID || '',
          },
          theMovieDb: {
            apiReadAccessToken: process.env.APOLLO_MEDIA_TMDB_API_READ_ACCESS_TOKEN || '',
          },
          theTvDb: {
            apiKey: process.env.APOLLO_MEDIA_TVDB_API_KEY || '',
          },
        },
      },
    } satisfies AppConfig);

    if (IS_PRODUCTION && !this.config.baseUrl.toLowerCase().startsWith('https://')) {
      console.warn(`[WARNING] The configured BaseURL does NOT start with https:// – Please ensure that you have a reverse proxy or load balancer in front of Apollo that handles HTTPS termination.`);
    }
  }

  private deepFreeze(obj: any): any {
    for (const key of Object.keys(obj)) {
      if (typeof obj[key] === 'object') {
        this.deepFreeze(obj[key]);
      }
    }
    return Object.freeze(obj);
  }

  private determineApolloDataDirectory(): string {
    let dataDir = process.env.APOLLO_DATA_DIRECTORY;
    if (dataDir == null) {
      dataDir = Path.join(Os.homedir(), 'Apollo');
      console.warn(`Environment variable 'APOLLO_DATA_DIRECTORY' not set. Using default: ${dataDir}`);
    }

    return dataDir;
  }
}
