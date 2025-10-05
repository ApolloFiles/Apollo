import { singleton } from 'tsyringe';

export type AppConfig = {
  serverInterface: string;
  serverPort: number;
  baseUrl: string;

  login: {
    oAuth: {
      [providerId: string]: { clientId: string, clientSecret: string };
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

      login: {
        oAuth: JSON.parse(process.env.BETTER_AUTH_OAUTH_CONFIG_JSON ?? '{}'), // TODO: Move from JSON in env to something better
      },
    } satisfies AppConfig);
  }

  private deepFreeze(obj: any): any {
    for (const key of Object.keys(obj)) {
      if (typeof obj[key] === 'object') {
        this.deepFreeze(obj[key]);
      }
    }
    return Object.freeze(obj);
  }
}
