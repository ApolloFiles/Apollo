import Crypto from 'crypto';
import WebSocket, { RawData } from 'ws';
import IUserFile from '../../../../files/IUserFile';
import LiveTranscodeManifestGenerator from '../LiveTranscodeManifestGenerator';
import {
  ClientConnectMessage,
  ClientDisconnectMessage,
  MediaChangeMessage,
  Message,
  StateData,
  StatePingMessage,
  SuperMasterChangeMessage,
  SyncStateMessage,
  WelcomeMessage
} from './CommunicationProtocol';

export type Client = { readonly id: string, readonly socket: WebSocket, displayName: string };
export type PlaybackState = { timestamp: Date } & StateData;

export default class LiveTranscodeSession {
  public readonly id: string;
  public mediaFile: IUserFile;

  public manifestGenerator: LiveTranscodeManifestGenerator;
  public playbackState: PlaybackState;

  public exposedDir?: string;
  private readonly connectedClients: { [clientId: string]: Client } = {};
  private superMasterId?: string;

  constructor(id: string, mediaFile: IUserFile, manifestGenerator: LiveTranscodeManifestGenerator) {
    this.id = id;
    this.mediaFile = mediaFile;
    this.manifestGenerator = manifestGenerator;
    this.playbackState = {timestamp: new Date(0), paused: true, currentTime: 0, playbackRate: 1};
  }

  async welcomeClient(socket: WebSocket): Promise<void> {
    const clientDisplayName = 'Max Mustermann'; // TODO: Initial value can maybe be parsed from query params?
    const clientId = this.generateClientId();
    socket.on('close', () => this.disconnectClient(clientId));

    this.connectedClients[clientId] = {id: clientId, socket, displayName: clientDisplayName};

    let initialState: WelcomeMessage['data']['initialState'] = undefined;
    const hlsManifest = this.manifestGenerator.generateManifest();
    if (this.manifestGenerator.isManifestReady()) {
      const manifest = await hlsManifest;
      initialState = {
        media: {
          uri: `/live_transcode/s/${this.id}/f/master.m3u8`,
          duration: manifest.duration,
          mode: 'live_transcode'
        },

        paused: this.playbackState.paused,
        currentTime: this.playbackState.currentTime,
        playbackRate: this.playbackState.playbackRate
      };
    } else {
      hlsManifest
          .then((manifest) => {
            this.send<MediaChangeMessage>(socket, {
              type: 'mediaChange',
              data: {
                media: {
                  uri: `/live_transcode/s/${this.id}/f/master.m3u8`,
                  duration: manifest.duration,
                  mode: 'live_transcode'
                }
              }
            });
          })
          .catch(console.error);
    }
    this.send<WelcomeMessage>(socket, {
      type: 'welcome',
      data: {
        clientId,
        displayName: clientDisplayName,
        initialState
      }
    });

    this.broadcast<ClientConnectMessage>({
      type: 'clientConnect',
      data: {
        clientId,
        displayName: clientDisplayName
      }
    }, clientId);

    for (const connectedClients of Object.values(this.connectedClients)) {
      if (connectedClients.id === clientId) {
        continue;
      }

      this.send<ClientConnectMessage>(socket, {
        type: 'clientConnect',
        data: {
          clientId: connectedClients.id,
          displayName: connectedClients.displayName
        }
      });
    }

    if (this.superMasterId == null) {
      this.updateSuperMaster();
    } else {
      this.send<SuperMasterChangeMessage>(socket, {
        type: 'superMasterChange',
        data: {
          clientId: this.superMasterId!
        }
      });
    }

    const parseMessage = (data: RawData): Message => {
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
    };

    socket.on('message', (data) => {
      try {
        const message = parseMessage(data);

        switch (message.type) {
          case 'syncState':
            if (message.data.clientId !== clientId) {
              socket.close(1002 /* Protocol error */, 'Invalid clientId in syncState message');
              return;
            }

            this.playbackState = {
              timestamp: new Date(),
              paused: message.data.state.paused,
              currentTime: message.data.state.currentTime,
              playbackRate: message.data.state.playbackRate
            };
            this.broadcast<SyncStateMessage>({
              type: 'syncState',
              data: {
                clientId,
                state: this.playbackState
              }
            }, clientId);
            break;
          case 'statePing':
            if (message.data.clientId !== clientId) {
              socket.close(1002 /* Protocol error */, 'Invalid clientId in statePing message');
              return;
            }

            if (message.data.clientId === this.superMasterId) {
              this.playbackState = {
                ...this.playbackState,
                timestamp: new Date(),
                currentTime: message.data.state.currentTime
              };
            }

            this.broadcast<StatePingMessage>({
              type: 'statePing',
              data: {
                clientId,
                state: message.data.state
              }
            }, clientId);
            break;
          default:
            // TODO: remove debug and close connection
            console.log('received unhandled message:', message);
            // client.close(1002 /* Protocol error */, 'Invalid message type');
            return;
        }
      } catch (err) {
        socket.close(1002 /* Protocol error */, 'Invalid message');
      }
    });
  }

  private disconnectClient(clientId: string): void {
    if (!this.connectedClients.hasOwnProperty(clientId)) {
      return;
    }

    const socket = this.connectedClients[clientId].socket;
    if (socket.readyState === WebSocket.OPEN) {
      socket.close(1000 /* CLOSE_NORMAL */);
    }
    delete this.connectedClients[clientId];

    this.updateSuperMaster();
    this.broadcast<ClientDisconnectMessage>({
      type: 'clientDisconnect',
      data: {
        clientId
      }
    });

    if (Object.getOwnPropertyNames(this.connectedClients).length <= 0 && !this.playbackState.paused) {
      // TODO: If no client are connected, pause the session (gst + expected/target state)
      this.playbackState = {
        timestamp: new Date(),
        paused: true,
        currentTime: this.playbackState.currentTime,
        playbackRate: this.playbackState.playbackRate
      };
    }
  }

  private updateSuperMaster(): void {
    if (this.superMasterId != null && this.connectedClients.hasOwnProperty(this.superMasterId)) {
      return;
    }

    const clientIds = Object.getOwnPropertyNames(this.connectedClients);
    if (clientIds.length <= 0) {
      this.superMasterId = undefined;
      return;
    }

    this.superMasterId = clientIds[0];
    this.broadcast<SuperMasterChangeMessage>({
      type: 'superMasterChange',
      data: {
        clientId: this.superMasterId
      }
    });
  }

  private broadcast<T extends Message>(packet: T, excludedClientId?: string): void {
    for (const clientId in this.connectedClients) {
      if (excludedClientId === clientId) {
        continue;
      }

      this.send(this.connectedClients[clientId].socket, packet);
    }
  }

  private send<T extends Message>(socket: WebSocket, packet: T): void {
    socket.send(JSON.stringify(packet), (err) => {
      if (err) console.error(err);
    });
  }

  private generateClientId(): string {
    let clientId;
    do {
      clientId = Crypto.randomBytes(8).toString('hex');
    } while (this.connectedClients.hasOwnProperty(clientId));
    return clientId;
  }
}
