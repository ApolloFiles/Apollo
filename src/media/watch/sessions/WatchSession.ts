import Crypto from 'node:crypto';
import { ApolloWebSocket } from '../../../global';
import {
  ClientConnectMessage,
  ClientDisconnectMessage,
  Media,
  MediaChangeMessage,
  Message,
  PlaybackState,
  SuperMasterChangeMessage,
  WelcomeMessage
} from './CommunicationProtocol';
import BaseSessionMedia from './media/BaseSessionMedia';
import SessionMedia from './media/SessionMedia';
import TemporaryDirectory from './TemporaryDirectory';
import WatchSessionClient from './WatchSessionClient';

export default class WatchSession {
  public readonly id: string;
  public readonly workingDir: TemporaryDirectory;

  private currentMedia: BaseSessionMedia | null = null;
  private playbackState: PlaybackState = { paused: true, currentTime: 0, playbackRate: 1 };

  private readonly connectedClients: Map<string, WatchSessionClient> = new Map();
  private superMasterId: string | null = null;

  constructor(id: string) {
    this.id = id;
    this.workingDir = TemporaryDirectory.create(this.id);
  }

  getSuperMasterId(): string | null {
    return this.superMasterId;
  }

  getSuperMaster(): WatchSessionClient | null {
    if (this.superMasterId == null) {
      return null;
    }

    return this.connectedClients.get(this.superMasterId) ?? null;
  }

  async clearMedia(issuerClientId: string): Promise<void> {
    this.currentMedia = null;
    await this._broadcast<MediaChangeMessage>({
      type: 'mediaChange',
      data: {
        issuerClientId,
        media: null
      }
    });
  }

  async changeMedia(media: Media, issuerClientId: string): Promise<void> {
    await this.currentMedia?.cleanup(this);

    console.log('[DEBUG] Changing media to', media.uri, 'with mode', media.mode);
    this.currentMedia = SessionMedia.constructSessionMedia(media);

    await this.currentMedia.init(this, this.connectedClients.get(issuerClientId)!);

    await this._broadcast<MediaChangeMessage>({
      type: 'mediaChange',
      data: {
        issuerClientId,
        media: this.currentMedia.data
      }
    });
  }

  async welcomeClient(socket: ApolloWebSocket, displayName: string): Promise<void> {
    const clientId = this.generateClientId();
    socket.on('close', () => this.disconnectClient(clientId));

    const client = WatchSessionClient.init(clientId, displayName, this, socket);

    const welcomeClientList = Array.from(this.connectedClients.values())
      .map((client) => {
        return {
          clientId: client.id,
          displayName: client.displayName
        };
      });
    this.connectedClients.set(clientId, client);

    await client._send<WelcomeMessage>({
      type: 'welcome',
      data: {
        clientId,
        displayName: client.displayName,
        clients: welcomeClientList,
        media: this.currentMedia?.data,
        playbackState: this.playbackState
      }
    });

    await this._broadcast<ClientConnectMessage>({
      type: 'clientConnect',
      data: {
        clientId,
        displayName: client.displayName
      }
    }, clientId);

    if (this.superMasterId == null) {
      await this.updateSuperMaster();
    } else {
      await client._send<SuperMasterChangeMessage>({
        type: 'superMasterChange',
        data: {
          clientId: this.superMasterId!
        }
      });
    }
  }

  async disconnectClient(clientId: string): Promise<void> {
    const client = this.connectedClients.get(clientId);
    if (client == null) {
      return;
    }

    client.closeNormally();
    this.connectedClients.delete(clientId);

    await this.updateSuperMaster();
    await this._broadcast<ClientDisconnectMessage>({
      type: 'clientDisconnect',
      data: {
        clientId
      }
    });

    if (this.connectedClients.size <= 0) {
      this.playbackState = {
        ...this.playbackState,
        paused: true
      };
    }
  }

  private async updateSuperMaster(): Promise<void> {
    if (this.superMasterId != null && this.connectedClients.has(this.superMasterId)) {
      return;
    }

    const firstClientId = this.connectedClients.keys().next().value;
    if (typeof firstClientId != 'string') {
      this.superMasterId = null;
      return;
    }

    this.superMasterId = firstClientId;
    await this._broadcast<SuperMasterChangeMessage>({
      type: 'superMasterChange',
      data: {
        clientId: this.superMasterId
      }
    });
  }

  _setPlaybackState(playbackState: PlaybackState): void {
    this.playbackState = playbackState;
  }

  async _broadcast<T extends Message>(packet: T, excludedClientId?: string): Promise<void> {
    for (const [clientId, connectedClient] of this.connectedClients) {
      if (excludedClientId === clientId) {
        continue;
      }

      await connectedClient._send(packet);
    }
  }

  private generateClientId(): string {
    let clientId;
    do {
      clientId = Crypto.randomBytes(10).toString('hex');
    } while (this.connectedClients.has(clientId));
    return clientId;
  }
}
