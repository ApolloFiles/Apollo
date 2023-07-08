import {RawData, WebSocket} from 'ws';
import AbstractUser from '../../../AbstractUser';
import {
  Message,
  PlaybackStatePingMessage,
  RequestMediaChangeMessage,
  RequestPlaybackStateChangeMessage
} from './CommunicationProtocol';
import WatchSession from './WatchSession';

export const WS_CLOSE_NORMAL = 1000;
export const WS_CLOSE_PROTOCOL_ERROR = 1002;

export default class WatchSessionClient {
  public readonly id: string;
  private readonly session: WatchSession;
  private readonly socket: WebSocket;

  public displayName: string;

  private constructor(id: string, displayName: string, session: WatchSession, socket: WebSocket) {
    this.id = id;
    this.displayName = displayName;
    this.session = session;
    this.socket = socket;

    socket.on('message', (data) => {
      this.onMessage(data)
          .catch((err) => {
            console.error(err);
            socket.close(WS_CLOSE_PROTOCOL_ERROR, 'Error while handling message (invalid message format?)');
          });
    });
  }

  closeNormally(): void {
    if (this.socket.readyState === WebSocket.OPEN) {
      this.socket.close(WS_CLOSE_NORMAL);
    }
  }

  getApolloUser(): AbstractUser {
    return this.socket.apollo.user!;
  }

  private isSuperMaster(): boolean {
    return this.session.getSuperMasterId() === this.id;
  }

  private async onMessage(data: RawData): Promise<void> {
    const message = WatchSessionClient.parseMessage(data);

    // FIXME: this.send and this.broadcast are async, but we don't await them here
    // TODO: Refactor
    switch (message.type) {
      case 'playbackStatePing':
        this.ensureClientIdIsOwn(message);

        if (this.isSuperMaster()) {
          this.session._setPlaybackState({
            paused: message.data.state.paused,
            currentTime: message.data.state.currentTime,
            playbackRate: message.data.state.playbackRate
          });
        }

        await this.session._broadcast<PlaybackStatePingMessage>({
          type: 'playbackStatePing',
          data: {
            clientId: this.id,
            state: message.data.state
          }
        }, this.id);
        break;

      case 'mediaChange':
        if (!this.isSuperMaster()) {
          return;
        }

        console.log('[DEBUG] Received media change from super master:', message.data.media);

        if (message.data.media == null) {
          await this.session.clearMedia(this.id);
          break;
        }

        await this.session.changeMedia(message.data.media, message.data.issuerClientId);
        break;

      case 'requestMediaChange':
        this.ensureClientIdIsOwn(message);

        this.session.getSuperMaster()?._send<RequestMediaChangeMessage>({
          type: 'requestMediaChange',
          data: {
            clientId: message.data.clientId,
            media: message.data.media // TODO: validate
          }
        });
        break;
      case 'requestPlaybackStateChange':
        this.ensureClientIdIsOwn(message);

        this.session.getSuperMaster()?._send<RequestPlaybackStateChangeMessage>({
          type: 'requestPlaybackStateChange',
          data: {
            clientId: message.data.clientId,
            state: message.data.state // TODO: validate
          }
        });
        break;

      case 'welcome':
      case 'clientConnect':
      case 'clientDisconnect':
      case 'superMasterChange':
      default:
        // TODO: remove debug and close connection
        console.log('received unhandled message:', message);
        // client.close(WEBSOCKET_CLOSE_PROTOCOL_ERROR, 'Invalid message type');
        return;
    }
  }

  async _send<T extends Message>(packet: T): Promise<void> {
    return new Promise((resolve) => {
      this.socket.send(JSON.stringify(packet), (err) => {
        if (err) {
          console.error('Error while sending message to WebSocket:', err);
        }

        resolve();
      });
    });
  }

  private ensureClientIdIsOwn(msg: Message & { data: { clientId: string } }): void {
    if (msg.data.clientId !== this.id) {
      this.socket.close(WS_CLOSE_PROTOCOL_ERROR, 'Provided clientId does not your own clientId');
    }
  }

  static init(clientId: string, displayName: string, session: WatchSession, socket: WebSocket): WatchSessionClient {
    return new WatchSessionClient(clientId, displayName, session, socket);
  }

  private static parseMessage(data: RawData): Message {
    let message;
    try {
      message = JSON.parse(data.toString('utf-8'));
    } catch (err) {
      throw new Error('Invalid json in message');
    }

    if (typeof message.type !== 'string' || typeof message.data !== 'object') {
      throw new Error('Invalid message content');
    }
    return message;
  }
}
