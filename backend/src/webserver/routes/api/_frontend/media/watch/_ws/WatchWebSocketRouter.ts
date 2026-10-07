import { HttpRouter } from '@sprax/node-framework/web';
import type { FastifyInstance } from 'fastify';
import PlayerSessionStorage
  from '../../../../../../../plugins/official/media/_old/video-player/player-session/PlayerSessionStorage.js';
import type { ApolloWebSocket } from '../../../../../../../plugins/official/media/_old/watch/ApolloWebSocket.js';
import {
  WS_CLOSE_PROTOCOL_ERROR,
} from '../../../../../../../plugins/official/media/_old/video-player/player-session/WebSocketCloseCodes.js';
import type ApolloRouter from '../../../../../../server/ApolloRouter.js';

// TODO: Refactor this
// TODO: Register ping-pong messages/heartbeat to keep connection alive and detect dead connections
@HttpRouter()
export default class WatchRouter implements ApolloRouter {
  constructor(
    private readonly playerSessionStorage: PlayerSessionStorage,
  ) {
  }

  allowUnauthenticatedAccess(): boolean {
    return true;
  }

  register(server: FastifyInstance): void {
    server.get<{ Params: { '*': string } }>('/*', { websocket: true }, async (socket, request): Promise<void> => {
      const apolloUser = request.getSessionUserOptional()?.user;
      if (apolloUser == null) {
        socket.close(3000, 'Not logged into Apollo');
        return;
      }

      socket.on('error', console.error);

      // TODO: allow anonymous access

      const sessionId = request.params['*'];
      const playerSession = this.playerSessionStorage.findById(sessionId);
      if (playerSession == null || !playerSession.checkAccessForUser(apolloUser)) {
        socket.close(WS_CLOSE_PROTOCOL_ERROR, 'Invalid session ID or missing permissions');
        return;
      }

      const apolloWebSocket = socket as ApolloWebSocket;
      apolloWebSocket.apollo = {
        user: apolloUser,
        playerSessionId: playerSession.id,
        connectionId: playerSession.getNextConnectionId(),
        isAlive: true,

        pingRtt: -1,
        lastPingTimestamp: Date.now(),
      };

      playerSession.handleNewWebSocketConnection(apolloWebSocket);
    });
  }
}
