import { onError, ORPCError } from '@orpc/server';
import * as oRpcNodeJs from '@orpc/server/node';
import * as oRpcPlugins from '@orpc/server/plugins';
import { singleton } from 'tsyringe';
import AppConfiguration from '../../config/AppConfiguration.js';
import { ORPC_ROUTER, type ORpcInitialContext } from '../../orpc/router/ORpcRouter.js';

@singleton()
export default class ORPCRequestHandler extends oRpcNodeJs.RPCHandler<ORpcInitialContext> {
  constructor(appConfig: AppConfiguration) {
    super(
      ORPC_ROUTER,
      {
        plugins: [
          new oRpcPlugins.CORSPlugin({
            origin: () => appConfig.config.baseUrl,
          }),
        ],
        interceptors: [
          onError((err) => {
            if (err instanceof ORPCError && err.code === 'INTERNAL_SERVER_ERROR') {
              console.dir(err, { depth: 4 }); // Enough depth for useful info in ValidationErrors
            } else {
              console.error(err);
            }
          }),
        ],
      },
    );
  }
}
