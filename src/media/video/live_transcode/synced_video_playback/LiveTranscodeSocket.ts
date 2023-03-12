import WebServer from '../../../../webserver/WebServer';
import VideoPlayerSessions from './VideoPlayerSessions';

export default class LiveTranscodeSocket {
  private readonly webserver: WebServer;
  private readonly playerSessions: VideoPlayerSessions;

  private constructor(webserver: WebServer, playerSessions: VideoPlayerSessions) {
    this.webserver = webserver;
    this.playerSessions = playerSessions;

    webserver.addListenEventHandler(() => {
      const websocketServer = webserver.getWebSocketServer();
      if (websocketServer == null) {
        throw new Error('WebSocket server not initialized');
      }

      websocketServer.on('connection', (client, request) => {
        client.on('error', console.error);

        if (!request.url?.startsWith('/_ws/live_transcode/')) {
          client.close(1002 /* Protocol error */, 'Invalid path');
          return;
        }

        // TODO: Check sub-protocol
        // TODO: Check Apollo login

        const sessionId = request.url.substring('/_ws/live_transcode/'.length);
        const session = playerSessions.find(sessionId);
        if (session == null) {
          client.close(1002 /* Protocol error */, 'Invalid session ID');
          return;
        }

        // TODO: Check file/session access

        session.welcomeClient(client)
            .catch(console.error);
      });
    });
  }

  static attachServer(webserver: WebServer, playerSessions: VideoPlayerSessions): LiveTranscodeSocket {
    return new LiveTranscodeSocket(webserver, playerSessions);
  }
}
