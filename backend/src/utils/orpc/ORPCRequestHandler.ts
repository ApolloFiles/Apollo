import * as oRpcNodeJs from '@orpc/server/node';
import * as oRpcPlugins from '@orpc/server/plugins';
import { singleton } from 'tsyringe';
import type { ORPCInitialContext } from './oRpcRouteBuilder.js';
import { oRpcRouter } from './oRpcRouter.js';

@singleton()
export default class ORPCRequestHandler extends oRpcNodeJs.RPCHandler<ORPCInitialContext> {
  constructor() {
    super(
      oRpcRouter,
      {
        // FIXME: Configure CORS properly
        plugins: [new oRpcPlugins.CORSPlugin()],
      },
    );
  }
}
