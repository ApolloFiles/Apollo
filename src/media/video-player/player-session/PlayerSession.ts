import Crypto from 'node:crypto';
import { container } from 'tsyringe';
import { ApolloWebSocket } from '../../../global';
import ApolloUser from '../../../user/ApolloUser';
import LocalFile from '../../../user/files/local/LocalFile';
import VirtualFile from '../../../user/files/VirtualFile';
import { StartPlaybackResponse } from '../../../webserver/Api/v0/media/player-session/change-media';
import { WS_CLOSE_NORMAL } from '../../watch/sessions/WatchSessionClient';
import WebSocketDataBuilder from '../../watch/websocket/WebSocketDataBuilder';
import VideoLiveTranscodeMedia from '../live-transcode/VideoLiveTranscodeMedia';
import VideoLiveTranscodeMediaFactory from '../live-transcode/VideoLiveTranscodeMediaFactory';
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

  private currentMedia: VideoLiveTranscodeMedia | null = null;
  private playerState: { lastUpdated: Date, data: { currentTime: number } } | null = null;  // TODO
  public readonly tmpDir: TemporaryDirectory;

  constructor(id: string, owner: ApolloUser) {
    this.id = id;
    this.owner = owner;

    this.tmpDir = TemporaryDirectory.create(this.id);
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

      this.broadcastSessionInfo();
    });

    this.broadcastSessionInfo();
  }

  private broadcastSessionInfo(): void {
    for (const client of this.clientConnections) {
      client.send(WebSocketDataBuilder.buildSessionInfo(this, client.apollo.user!.id.toString()), (err) => {
        if (err) {
          console.error('Error sending session info message:', err);
          client.terminate();
        }
      });
    }
  }

  private broadcastMediaChanged(): void {
    for (const client of this.clientConnections) {
      client.send(WebSocketDataBuilder.buildMediaChanged(this.currentMedia), (err) => {
        if (err) {
          console.error('Error sending media changed message:', err);
          client.terminate();
        }
      });
    }
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
