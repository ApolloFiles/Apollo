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
    tmpDirectory: string;
  },

  login: {
    oAuth: {
      [providerId: string]: { clientId: string, clientSecret: string };
    }
  }

  feedback: {
    enabled: boolean;
  }

  ffmpeg: {
    /** `auto`, `off`, or an ordered, comma-separated allowlist of device ids like `vaapi:/dev/dri/renderD129,cuda:0` */
    devices: string;
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

    const pathDataDirectory = this.determineApolloDataDirectory();
    this.config = this.deepFreeze({
      serverInterface,
      serverPort,
      baseUrl: process.env.APOLLO_BASE_URL || `http://localhost:5177`,

      paths: {
        dataDirectory: pathDataDirectory,
        tmpDirectory: this.determineApolloTmpDirectory(pathDataDirectory),
      },

      login: {
        // TODO: Rename env variable
        oAuth: JSON.parse(process.env.BETTER_AUTH_OAUTH_CONFIG_JSON ?? '{}'), // TODO: Move from JSON in env to something better
      },

      feedback: {
        enabled: process.env.APOLLO_FEATURE_FEEDBACK_ENABLED === 'true',
      },

      ffmpeg: {
        devices: process.env.APOLLO_FFMPEG_DEVICES || 'auto',
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
    const dataDir = process.env.APOLLO_DATA_DIRECTORY?.trim();
    if (dataDir == null || dataDir === '') {
      const defaultDataDir = Path.join(Os.homedir(), 'Apollo');
      console.warn(`Environment variable 'APOLLO_DATA_DIRECTORY' not set. Using default: ${defaultDataDir}`);
      return defaultDataDir;
    }

    return Path.resolve(dataDir);
  }

  private determineApolloTmpDirectory(dataDir: string): string {
    const tmpDir = process.env.APOLLO_TMP_DIRECTORY?.trim();
    if (tmpDir == null || tmpDir === '') {
      return Path.join(dataDir, 'tmp');
    }

    return Path.resolve(tmpDir);
  }
}
