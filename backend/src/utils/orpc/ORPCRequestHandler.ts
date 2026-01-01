import * as oRpcNodeJs from '@orpc/server/node';
import * as oRpcPlugins from '@orpc/server/plugins';
import { singleton } from 'tsyringe';
import AppConfiguration from '../../config/AppConfiguration.js';
import type { ORPCInitialContext } from './oRpcRouteBuilder.js';
import { oRpcRouter } from './oRpcRouter.js';

@singleton()
export default class ORPCRequestHandler extends oRpcNodeJs.RPCHandler<ORPCInitialContext> {
  constructor(
    appConfig: AppConfiguration,
  ) {
    super(
      oRpcRouter,
      {
        plugins: [new oRpcPlugins.CORSPlugin({
          origin: () => appConfig.config.baseUrl,
        })],
      },
    );
  }
}
