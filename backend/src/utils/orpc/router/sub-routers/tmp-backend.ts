import { injectable } from 'tsyringe';
import OAuthConfigurationProvider from '../../../../auth/oauth/OAuthConfigurationProvider.js';
import AppConfiguration from '../../../../config/AppConfiguration.js';
import { IS_PRODUCTION } from '../../../../constants.js';
import type { PlainORpcImplementer, SubRouter } from '../ORpcRouter.js';

@injectable()
export default class TmpBackendORpcRouterFactory {
  constructor(
    private readonly appConfig: AppConfiguration,
    private readonly oAuthConfigurationProvider: OAuthConfigurationProvider,
  ) {
  }

  create(os: PlainORpcImplementer): SubRouter<'tmpBackend'> {
    return {
      getConfig: os
        .tmpBackend
        .getConfig
        .handler(() => {
          return {
            appBaseUrl: this.appConfig.config.baseUrl,
            internalBackendBaseUrl: IS_PRODUCTION ? this.appConfig.config.baseUrl : 'http://localhost:8081',
            auth: {
              providers: this.oAuthConfigurationProvider.getAvailableTypes().sort((a, b) => {
                return a.displayName.localeCompare(b.displayName);
              }),
            },
          };
        }),
    };
  }
}
