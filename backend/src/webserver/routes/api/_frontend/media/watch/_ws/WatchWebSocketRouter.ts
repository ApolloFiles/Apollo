import type { FastifyInstance } from 'fastify';
import { injectable } from 'tsyringe';
import { ContainerTokens } from '../../../../../../../constants.js';
import PlayerSessionStorage
  from '../../../../../../../plugins/official/media/_old/video-player/player-session/PlayerSessionStorage.js';
import type { ApolloWebSocket } from '../../../../../../../plugins/official/media/_old/watch/ApolloWebSocket.js';
import {
  WS_CLOSE_PROTOCOL_ERROR,
} from '../../../../../../../plugins/official/media/_old/watch/sessions/WatchSessionClient.js';
import type Router from '../../../../../Router.js';

// TODO: Refactor this
// TODO: Register ping-pong messages/heartbeat to keep connection alive and detect dead connections
@injectable({ token: ContainerTokens.ROUTER })
export default class WatchRouter implements Router {
  constructor(
    private readonly playerSessionStorage: PlayerSessionStorage,
  ) {
  }

  getRoutePrefix(): string {
    return '/api/_frontend/media/watch/_ws';
  }

  allowUnauthenticatedAccess(): boolean {
    return true;
  }

  register(server: FastifyInstance): void {
    server.get('/*', { websocket: true }, async (socket, request): Promise<void> => {
      const apolloUser = request.getSessionData()?.user;
      if (apolloUser == null) {
        socket.close(3000, 'Not logged into Apollo');
        return;
      }

      socket.on('error', console.error);

      // TODO: allow anonymous access

      const sessionIdAndPotentialGetParams = request.url.substring(this.getRoutePrefix().length + 1);
      const sessionId = sessionIdAndPotentialGetParams.split('?')[0];

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
