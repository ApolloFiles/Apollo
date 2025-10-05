import type { ClientContext } from '@orpc/server';
import * as oRpcNodeJs from '@orpc/server/node';
import type { IncomingMessage, ServerResponse } from 'node:http';

export default class InitialRequestRouter {
  constructor(
    private readonly rpcHandler: oRpcNodeJs.RPCHandler<ClientContext>,
    private readonly fastifyHandler: (req: IncomingMessage, res: ServerResponse) => void,
    private readonly frontendHandler: (req: IncomingMessage, res: ServerResponse) => void,
  ) {
  }

  async route(req: IncomingMessage, res: ServerResponse): Promise<void> {
    let requestHandled = await this.tryExecuteORpcHandler(req, res);
    if (requestHandled) {
      return;
    }

    requestHandled = this.tryExecuteFastifyHandler(req, res);
    if (requestHandled) {
      return;
    }

    this.frontendHandler(req, res);
  }

  private async tryExecuteORpcHandler(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
    const { matched } = await this.rpcHandler.handle(req, res, {
      context: { headers: req.headers },
      prefix: '/api/_frontend/oRPC',
    });
    return matched;
  }

  private tryExecuteFastifyHandler(req: IncomingMessage, res: ServerResponse): boolean {
    const normalizedUrl = req.url?.toLowerCase() ?? '';
    if (!normalizedUrl.startsWith('/api/')) {
      return false;
    }

    this.fastifyHandler(req, res);
    return true;
  }
}
