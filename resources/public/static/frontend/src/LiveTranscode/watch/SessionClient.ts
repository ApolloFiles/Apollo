import AWN from 'awesome-notifications';
import * as CommunicationProtocol from '../../../../../../../src/media/watch/sessions/CommunicationProtocol';
import MediaSession from './MediaSession';
import ClientStateElement from './player/ClientStateElement';
import LiveTranscodePlayerElement from './player/PlayerElements/LiveTranscodePlayerElement';
import PlayerState from './player/PlayerState';

export default class SessionClient {
  private static readonly notification = new AWN({});

  private readonly session: MediaSession;

  private clientId: string | null = null;
  private displayName: string | null = null;

  private websocket: WebSocket | null = null;
  readonly _clientStateElement = new ClientStateElement('You');

  constructor(session: MediaSession) {
    this.session = session;

    this.connect();
  }

  isConnected(): boolean {
    return this.clientId != null;
  }

  isSuperMaster(): boolean {
    return this.session.getSuperMasterId() != null && this.session.getSuperMasterId() === this.clientId;
  }

  getClientId(): string | null {
    return this.clientId;
  }

  sendChangeMedia(media: CommunicationProtocol.Media | null, issuerClientId: string): void {
    this.send<CommunicationProtocol.MediaChangeMessage>({
      type: 'mediaChange',
      data: {
        issuerClientId,
        media
      }
    });
  }

  sendRequestMediaChange(media: CommunicationProtocol.Media | null): void {
    this.send<CommunicationProtocol.RequestMediaChangeMessage>({
      type: 'requestMediaChange',
      data: {
        clientId: this.clientId!,
        media
      }
    });
  }

  _sendPlaybackStatePing(playerState: PlayerState): void {
    this.send<CommunicationProtocol.PlaybackStatePingMessage>({
      type: 'playbackStatePing',
      data: {
        clientId: this.clientId!,
        state: {
          paused: playerState.paused,
          currentTime: playerState.currentTime,
          playbackRate: playerState.playbackRate
        }
      }
    });
  }

  private connect(): void {
    this.disconnect();

    const webSocketUri = SessionClient.generateWebSocketUri();
    console.log(`Connecting to websocket at '${webSocketUri}'...`);

    this.websocket = new WebSocket(webSocketUri, 'media-watch');
    this.websocket.addEventListener('error', (event) => {
      console.error('WebSocket error:', event);
      SessionClient.notification.alert('WebSocket error occurred...');
    });
    this.websocket.addEventListener('close', (event) => {
      console.log('WebSocket closed:', event);
      SessionClient.notification.alert(`Connection to server closed: [${event.code}] ${event.reason}`);

      this.session._clearConnectedClients();

      this.websocket = null;
      this.clientId = null;
      this.displayName = null;
    });
    this.websocket.addEventListener('open', () => SessionClient.notification.success('Connected to server'));

    this.websocket.addEventListener('message', (event) => {
      let msg;
      try {
        msg = SessionClient.parseMessage(event);
      } catch (err: any) {
        this.disconnect(1003, err.message);
        throw err;
      }

      this.handleIncomingMessage(msg).catch(console.error);
    }, {passive: true});
  }

  private disconnect(code?: number, reason?: string): void {
    this.websocket?.close(code, reason);

    this.session._clearConnectedClients();

    this.websocket = null;
    this.clientId = null;
    this.displayName = null;
  }

  private async handleIncomingMessage(msg: CommunicationProtocol.Message): Promise<void> {
    switch (msg.type) {
      case 'welcome':
        if (this.clientId != null) {
          throw new Error('Received welcome message after already being connected');
        }

        console.log('[DEBUG] Received welcome message:', msg);
        this.clientId = msg.data.clientId;
        this.displayName = msg.data.displayName;

        this._clientStateElement.updateName(`${this.displayName} (You)`);

        for (const client of msg.data.clients) {
          this.session._setConnectedClient(client);
        }

        if (msg.data.media != null) {
          await this.session._videoPlayer._changeMedia(msg.data.media.mode, msg.data.media.uri);

          const referenceElement = this.session._videoPlayer._playerState._getReferenceElement();
          if (referenceElement instanceof LiveTranscodePlayerElement) {
            referenceElement.duration = msg.data.media?.duration ?? 0;
          }

          if (msg.data.playbackState != null) {
            if (msg.data.playbackState.paused) {
              this.session._videoPlayer._playerState.pause();
            } else {
              await this.session._videoPlayer._playerState.play();
            }

            await this.session._videoPlayer._playerState.seek(msg.data.playbackState.currentTime);
            this.session._videoPlayer._playerState.playbackRate = msg.data.playbackState.playbackRate;
          }
        } else {
          await this.session._videoPlayer._changeMedia(null, null);
        }
        break;

      case 'clientConnect':
        this.session._setConnectedClient(msg.data);
        break;
      case 'clientDisconnect':
        this.session._removeConnectedClient(msg.data.clientId);
        break;
      case 'superMasterChange':
        this.session._setSuperMaster(msg.data.clientId);
        await this.session._adjustOwnPlayerStateToCatchUpToMaster();
        break;

      case 'playbackStatePing':
        if (msg.data.clientId === this.clientId) {
          throw new Error('Received playbackStatePing from self');
        }

        this.session._setPlaybackStateForClient(msg.data.clientId, msg.data.state);
        await this.session._adjustOwnPlayerStateToCatchUpToMaster();
        break;

      case 'mediaChange':
        console.log('[DEBUG] Received mediaChange message:', msg.data);
        await this.session._videoPlayer._changeMedia(msg.data.media?.mode ?? null, msg.data.media?.uri ?? null);

        const referenceElement = this.session._videoPlayer._playerState._getReferenceElement();
        if (referenceElement instanceof LiveTranscodePlayerElement) {
          referenceElement.duration = msg.data.media?.duration ?? 0;
        }
        break;
      case 'requestMediaChange':
        if (!this.isSuperMaster()) {
          console.error('Received requestMediaChange message as non-super master - ignoring');
          break;
        }

        if ((this.session._videoPlayer._currentMedia == null && msg.data.media == null) ||
            (this.session._videoPlayer._currentMedia?.type === msg.data.media?.mode && this.session._videoPlayer._currentMedia?.src === msg.data.media?.uri)) {
          console.warn(`Client '${msg.data.clientId}' requested media change to the same media we're already playing - ignoring`);
          break;
        }

        await this.session.changeMedia(msg.data.media, msg.data.clientId);
        break;

      case 'requestPlaybackStateChange':
        if (!this.isSuperMaster()) {
          console.error('Received requestPlaybackStateChange message as non-super master - ignoring');
          break;
        }

        const ownState = this.session._videoPlayer._playerState;
        const requestedStateChange = msg.data.state;

        if (requestedStateChange.paused != null && requestedStateChange.paused !== ownState.paused) {
          if (requestedStateChange.paused) {
            ownState.pause();
          } else {
            await ownState.play();
          }
        }

        if (requestedStateChange.currentTime != null && requestedStateChange.currentTime !== ownState.currentTime) {
          await ownState.seek(requestedStateChange.currentTime);
        }

        if (requestedStateChange.playbackRate != null && requestedStateChange.playbackRate !== ownState.playbackRate) {
          ownState.playbackRate = requestedStateChange.playbackRate;
        }
        break;

      default:
        console.warn('Received unknown message type:', msg);
        break;
    }
  }

  private send<T extends CommunicationProtocol.Message>(msg: T): void {
    if (this.websocket == null) {
      throw new Error('WebSocket not connected');
    }

    this.websocket.send(JSON.stringify(msg));
  }

  private static parseMessage(event: MessageEvent): CommunicationProtocol.Message {
    if (typeof event.data !== 'string') {
      throw new Error('Received non-string message from websocket');
    }

    const jsonData = JSON.parse(event.data);
    if (jsonData == null || typeof jsonData !== 'object' ||
        typeof jsonData.type !== 'string' || typeof jsonData.data !== 'object') {
      throw new Error('Received invalid message from websocket: ' + event.data);
    }

    return jsonData;
  }

  private static generateWebSocketUri(): string {
    const origin = location.origin.toString();
    if (!origin.startsWith('http')) {
      throw new Error('Unable to generate websocket URI, location.origin is not a valid HTTP URL');
    }

    const protocolAndHost = origin.replace(/http/, 'ws');
    return `${protocolAndHost}/_ws/media/watch/${window.ApolloData.LiveTranscode.sessionId}`;
  }
}
