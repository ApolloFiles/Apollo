import type { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { fastifyPlugin } from 'fastify-plugin';
import { IS_PRODUCTION } from '../../../../constants.js';
import ServerTiming from './ServerTiming.js';

declare module 'fastify' {
  interface FastifyReply {
    serverTiming?: ServerTiming;
  }
}

export default fastifyPlugin(registerPlugin);

function registerPlugin(instance: FastifyInstance, _opts: FastifyPluginOptions, done: (err?: Error) => void): void {
  instance.decorateReply('serverTiming');

  instance.addHook('onRequest', (_request, reply, done): void => {
    reply.serverTiming = new ServerTiming();
    done();
  });

  // Authentication only resolves in preHandler, so the header can be gated no earlier than this
  instance.addHook('onSend', (request, reply, payload: unknown, done): void => {
    if (!IS_PRODUCTION || request.getAuthenticatedUserOptional()?.hasSuperUserPrivileges) {
      reply.serverTiming?.setHttpHeader(reply);
    }
    done();
  });

  done();
}
