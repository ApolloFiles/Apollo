import Crypto from 'node:crypto';
import { container } from 'tsyringe';
import type { RawData } from 'ws';
import type { ApolloWebSocket } from '../../../global';
import type ApolloUser from '../../../user/ApolloUser';
import type LocalFile from '../../../user/files/local/LocalFile';
import type VirtualFile from '../../../user/files/VirtualFile';
import type { StartPlaybackResponse } from '../../../webserver/Api/v0/media/player-session/change-media';
import { WS_CLOSE_NORMAL, WS_CLOSE_PROTOCOL_ERROR } from '../../watch/sessions/WatchSessionClient';
import type VideoLiveTranscodeMedia from '../live-transcode/VideoLiveTranscodeMedia';
import VideoLiveTranscodeMediaFactory from '../live-transcode/VideoLiveTranscodeMediaFactory';
import { MESSAGE_TYPE } from '../websocket/WebSocketDataMessageType';
import WebSocketMessageBuilder from '../websocket/WebSocketMessageBuilder';
import { type WebSocketMessage, WebSocketMessageValidator } from '../websocket/WebSocketMessages';
import TemporaryDirectory from './TemporaryDirectory';

type Token = {
  readonly token: string,
  readonly expires: Date,
}

type ClientAccessToken = Token & {
  clientId: string,
  lastUsername: string,
  readonly user: ApolloUser | null,
}

export default class PlayerSession {
  public readonly id: string;
  public readonly owner: ApolloUser;

  private readonly userParticipants: ApolloUser[] = [];
  //  private readonly anonymousParticipants: ClientAccessToken[] = []; // TODO: Use/support this
  private _joinToken: Token | null = null;
  private readonly clientConnections: ApolloWebSocket[] = [];
  private referencePlayerClient: ApolloWebSocket | null = null;
  private lastConnectionId = 0;

  private currentMedia: VideoLiveTranscodeMedia | null = null;
  private playerState: { lastUpdated: Date, data: { currentTime: number } } | null = null;  // TODO
  public readonly tmpDir: TemporaryDirectory;

  constructor(id: string, owner: ApolloUser) {
    this.id = id;
    this.owner = owner;

    this.tmpDir = TemporaryDirectory.create(this.id);

    // TODO: Maybe have a smarter way so not every session has their own interval?
    // TODO: When implementing destroying sessions, also clear the interval
    setInterval(() => this.broadcastClockSync(), 60_000);
  }

  get ownerConnected(): boolean {
    return this.clientConnections.some((client) => client.apollo.user?.id === this.owner.id);
  }

  get participants(): { id: string, displayName: string, connected: boolean }[] {
    return this.userParticipants.map((user) => {
      return {
        id: user.id.toString(),
        displayName: user.displayName,
        connected: this.clientConnections.some((client) => client.apollo.user?.id === user.id),
      };
    });
  }

  get joinToken(): { token: string, expiresInSeconds: number } | null {
    if (this._joinToken == null) {
      return null;
    }
    if (Date.now() >= this._joinToken.expires.getTime()) {
      this._joinToken = null;
      return null;
    }

    const expiresInSeconds = Math.floor((this._joinToken.expires.getTime() - Date.now()) / 1000);
    return {
      token: this._joinToken.token,
      expiresInSeconds: expiresInSeconds > 0 ? expiresInSeconds : 0,
    };
  }

  addParticipant(user: ApolloUser): void {
    if (this.checkAccessForUser(user)) {
      return;
    }

    this.userParticipants.push(user);
    this.broadcastSessionInfo();
  }

  removeParticipant(user: ApolloUser): void {
    const index = this.userParticipants.findIndex((participant) => participant.id === user.id);
    if (index !== -1) {
      this.userParticipants.splice(index, 1);
      this.broadcastSessionInfo();
    }

    const connections = this.clientConnections.filter((client) => client.apollo.user?.id === user.id);
    for (const client of connections) {
      client.close(WS_CLOSE_NORMAL, 'You have been removed from the session');
    }
  }

  regenerateJoinToken(): { token: string, expiresInSeconds: number } {
    this._joinToken = {
      token: Crypto.randomUUID(),
      expires: new Date(Date.now() + 60 * 60 * 1000), // 1 hour expiration
    };
    return this.joinToken!;
  }

  getCurrentMedia(): VideoLiveTranscodeMedia | null {
    return this.currentMedia;
  }

  getCurrentFile(): VirtualFile | null {
    return this.currentMedia?.sourceFile ?? null;
  }

  checkAccessForUser(user: ApolloUser): boolean {
    if (user.id === this.owner.id) {
      return true;
    }
    return this.userParticipants.some((participant) => participant.id === user.id);
  }

  handleNewWebSocketConnection(client: ApolloWebSocket): void {
    this.clientConnections.push(client);
    client.on('close', () => {
      const index = this.clientConnections.indexOf(client);
      if (index !== -1) {
        this.clientConnections.splice(index, 1);
      }

      if (client === this.referencePlayerClient) {
        this.referencePlayerClient = null;
        this.determineReferencePlayerIfNeeded();
      }

      this.broadcastSessionInfo();
    });

    client.on('message', (data) => {
      function parseMessage(data: RawData): WebSocketMessage {
        let message;
        try {
          message = JSON.parse(data.toString('utf-8'));
        } catch (err) {
          throw new Error('Invalid JSON in message');
        }

        if (!WebSocketMessageValidator.isWebSocketMessage(message)) {
          throw new Error('Invalid message content');
        }
        return message;
      }

      try {
        const message = parseMessage(data);

        switch (message.type) {
          case MESSAGE_TYPE.PLAYER_STATE_UPDATE:
            if (!WebSocketMessageValidator.isPlayerStateUpdateMessageStrictCheck(message)) {
              throw new Error('Invalid PlayerStateUpdateMessage format');
            }

            if (message.data.connectionId !== client.apollo.connectionId) {
              throw new Error('Connection ID mismatch in PlayerStateUpdateMessage');
            }

            if (Math.abs(Date.now() - message.data.timestamp) > 15_000) {
              console.error('PlayerStateUpdateMessage timestamp is over 15 seconds out of sync');
              client.close(WS_CLOSE_PROTOCOL_ERROR, 'Your clock is out of sync');
              return;
            }

            this.broadcastMessage(JSON.stringify(message), client);
            break;

          case MESSAGE_TYPE.REQUEST_STATE_CHANGE_PLAYING:
            if (!WebSocketMessageValidator.isRequestStateChangePlayingMessageStrictCheck(message)) {
              throw new Error('Invalid RequestStateChangePlayingMessage format');
            }
            if (this.referencePlayerClient === client) {
              console.warn('Reference player tried to request a state change (playing), ignoring');
              return;
            }

            this.sendMessage(this.referencePlayerClient!, JSON.stringify(message));
            break;

          case MESSAGE_TYPE.REQUEST_STATE_CHANGE_TIME:
            if (!WebSocketMessageValidator.isRequestStateChangeTimeMessageStrictCheck(message)) {
              throw new Error('Invalid RequestStateChangeTimeMessage format');
            }
            if (this.referencePlayerClient === client) {
              console.warn('Reference player tried to request a state change (seek), ignoring');
              return;
            }

            this.sendMessage(this.referencePlayerClient!, JSON.stringify(message));
            break;

          default:
            throw new Error(`Received unexpected message: ${JSON.stringify(message)}`);
        }
      } catch (err) {
        console.error('Error in handling incoming message:', err);
        client.close(WS_CLOSE_PROTOCOL_ERROR, 'Invalid/Malformed data received');
        return;
      }
    });

    client.send(WebSocketMessageBuilder.buildWelcome(client.apollo.connectionId!, client.apollo.user!.id.toString()), (err) => {
      if (err) {
        if (!err.message.includes('WebSocket is not open: readyState 3 (CLOSED)') && !err.message.includes('WebSocket is not open: readyState 2 (CLOSING)')) {
          console.error('Error sending session info message:', err);
          client.close(1011, 'Internal Server Error');
        }
        return;
      }

      if (!this.determineReferencePlayerIfNeeded()) {
        this.sendMessage(client, WebSocketMessageBuilder.buildReferencePlayerChanged(
          this.referencePlayerClient!.apollo.connectionId!,
          this.referencePlayerClient!.apollo.user!.id.toString(),
        ));
      }

      this.broadcastSessionInfo();
    });
  }

  private determineReferencePlayerIfNeeded(): boolean {
    if (this.referencePlayerClient != null) {
      return false;
    }
    if (this.clientConnections.length === 0) {
      return false;
    }

    // TODO: Maybe determine the reference player a bit smarten (and re-elect based on these criteria)
    this.referencePlayerClient = this.clientConnections[0];
    this.broadcastReferencePlayerChanged();
    return true;
  }

  private broadcastSessionInfo(): void {
    this.broadcastMessage(WebSocketMessageBuilder.buildSessionInfo(this));
  }

  private broadcastMediaChanged(): void {
    this.broadcastMessage(WebSocketMessageBuilder.buildMediaChanged(this.id, this.currentMedia));
  }

  private broadcastClockSync(): void {
    const serverTime = Date.now();
    for (const client of this.clientConnections) {
      this.sendMessage(client, WebSocketMessageBuilder.buildClockSync(serverTime));
    }
  }

  private broadcastReferencePlayerChanged(): void {
    if (this.referencePlayerClient == null) {
      throw new Error('Cannot broadcast reference player change when referenceConnectionId is null');
    }

    this.broadcastMessage(WebSocketMessageBuilder.buildReferencePlayerChanged(
      this.referencePlayerClient.apollo.connectionId!,
      this.referencePlayerClient.apollo.user!.id.toString(),
    ));
  }

  private broadcastMessage(message: string, clientToExclude?: ApolloWebSocket): void {
    for (const client of this.clientConnections) {
      if (client === clientToExclude) {
        continue;
      }

      this.sendMessage(client, message);
    }
  }

  private sendMessage(client: ApolloWebSocket, message: string): void {
    client.send(message, (err) => {
      if (err) {
        if (!err.message.includes('WebSocket is not open: readyState 3 (CLOSED)') && !err.message.includes('WebSocket is not open: readyState 2 (CLOSING)')) {
          console.error('Error sending session info message:', err);
          client.close(1011, 'Internal Server Error');
        }
      }
    });
  }

  getNextConnectionId(): number {
    return ++this.lastConnectionId;
  }

  // TODO: I don't think this method should be in here
  async startLiveTranscode(file: LocalFile, startOffsetInSeconds: number = 0, mediaMetadata: StartPlaybackResponse['mediaMetadata']): Promise<VideoLiveTranscodeMedia> {
    // FIXME: do not access the container like that
    const videoLiveTranscodeMediaFactory = container.resolve(VideoLiveTranscodeMediaFactory);

    const newMedia = await videoLiveTranscodeMediaFactory.create(this.tmpDir, file, startOffsetInSeconds, mediaMetadata);
    this.currentMedia?.destroy().catch(console.error);
    this.currentMedia = newMedia;

    this.broadcastMediaChanged();
    return this.currentMedia;
  }
}
