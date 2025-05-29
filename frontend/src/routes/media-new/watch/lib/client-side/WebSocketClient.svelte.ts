import { SvelteMap } from 'svelte/reactivity';
import { MESSAGE_TYPE } from '../../../../../../../src/media/video-player/websocket/WebSocketDataMessageType';
import {
  type ClockSyncMessage,
  type MediaChangedMessage,
  type PlayerStateUpdateMessage,
  type SessionInfoMessage,
  WebSocketMessageValidator,
  type WelcomeMessage,
} from '../../../../../../../src/media/video-player/websocket/WebSocketMessages';
import type VideoPlayer from './VideoPlayer.svelte';

export type WebSocketSelfInfo = {
  connectionId: number;
  userId: string;
}

export type ReferencePlayerState = {
  state: PlayerStateUpdateMessage['data']['state'];
  updated: number;
}

export default class WebSocketClient {
  private connection: WebSocket | undefined;
  private serverTimeOffset = 0;
  private selfInfo: WebSocketSelfInfo | null = null;
  private sessionInfo: SessionInfoMessage['data'] | null = $state(null);
  private userPlaybackState: Map<string, { paused: boolean, currentTime: number }> = new SvelteMap();

  private lastOwnPlayerState: PlayerStateUpdateMessage['data']['state'] | null = null;
  private lastPlayerStateBroadcast: number = -1;

  private referencePlayerUserId: string | null = $state(null);
  private referencePlayerState: ReferencePlayerState | null = $state(null);

  private videoPlayer: VideoPlayer | null = null;

  constructor(
    private readonly sessionId: string,
    private readonly propagateChangeMedia: (media: MediaChangedMessage['data']['media']) => void,
  ) {
    this.reconnect();

    setInterval(() => {
      if (this.connection == null || this.selfInfo == null || this.lastOwnPlayerState == null) {
        return;
      }

      const minimumTimeBetweenBroadcasts = (this.lastOwnPlayerState?.paused ? 5000 : 1000) - 100; // 100ms tolerance
      if ((Date.now() - this.lastPlayerStateBroadcast) >= minimumTimeBetweenBroadcasts || this.lastPlayerStateBroadcast === -1) {
        this.sendPlayerStateMessage();
      }
    }, 1000);
  }

  get $selfInfo(): WebSocketSelfInfo | null {
    return this.selfInfo;
  }

  get $sessionInfo(): SessionInfoMessage['data'] | null {
    return this.sessionInfo;
  }

  get $userPlaybackState(): Map<string, { paused: boolean, currentTime: number }> {
    return this.userPlaybackState;
  }

  get $referencePlayerUserId(): string | null {
    return this.referencePlayerUserId;
  }

  get $referencePlayerState(): ReferencePlayerState | null {
    return this.referencePlayerState;
  }

  setVideoPlayer(videoPlayer: VideoPlayer | null): void {
    this.videoPlayer = videoPlayer;
  }

  // TODO: Can we get rid of this? Worst-case move storing of the sessionInfo somewhere else?
  setSessionInfo(sessionInfo: SessionInfoMessage['data']): void {
    this.sessionInfo = sessionInfo;
    console.log('Session info updated (EXTERNALLY):', sessionInfo);
  }

  updatePlaybackState(player: VideoPlayer, seeked: boolean, forceSend: boolean): void {
    this.lastOwnPlayerState = {
      seeked,
      paused: !player.$isPlaying,
      currentTime: player.$currentTime,
      playbackRate: 1.0, // FIXME: Get actual playback rate
    };

    if (forceSend) {
      this.sendPlayerStateMessage();
    }
  }

  sendPlayerStateMessage(): void {
    if (!this.connection) {
      console.warn('WebSocket connection is not established, cannot broadcast playback state');
      return;
    }
    if (this.selfInfo == null) {
      console.warn('WebSocket selfInfo is not set, cannot broadcast playback state');
      return;
    }
    if (this.lastOwnPlayerState == null) {
      console.warn('WebSocket lastOwnPlayerState is not set, cannot broadcast playback state');
      return;
    }

    this.lastPlayerStateBroadcast = Date.now();
    this.connection.send(JSON.stringify({
      type: MESSAGE_TYPE.PLAYER_STATE_UPDATE,
      data: {
        connectionId: this.selfInfo.connectionId,
        userId: this.selfInfo.userId,
        timestamp: this.getServerTimeNow(),
        state: this.lastOwnPlayerState,
      },
    } satisfies PlayerStateUpdateMessage));
  }

  private reconnect(): void {
    this.connection?.close(1000, 'Reconnecting');
    this.connection = undefined;

    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const webSocketUrl = `${protocol}//${location.host}/_ws/media-new/watch/${encodeURIComponent(this.sessionId)}`;
    this.connection = new WebSocket(webSocketUrl);

    this.connection.addEventListener('open', () => this.handleOpenEvent(), { passive: true });
    this.connection.addEventListener('close', (event) => this.handleCloseEvent(event), { passive: true });
    this.connection.addEventListener('message', (event) => this.handleMessageEvent(event), { passive: true });
    this.connection.addEventListener('error', (event) => this.handleErrorEvent(event), { passive: true });
  }

  private async handleMessageEvent(event: MessageEvent): Promise<void> {
    const message = JSON.parse(event.data);
    if (!WebSocketMessageValidator.isWebSocketMessage(message)) {
      throw new Error('Received message is not a valid WebSocketMessage: ' + event.data);
    }

    // TODO: Instead of warn, disconnect when not receiving a WELCOME message first (at least on invalid/unknown message?)
    //       And do not reconnect (maybe also set a time limit for receiving the WELCOME message?)
    //       In case we are connected to a WebSocket but not exchanging any useful data
    //         -> Something is very wrong and we can just safely disconnect I'd say
    switch (message.type) {
      case MESSAGE_TYPE.WELCOME:
        if (this.selfInfo != null) {
          console.error('Received WELCOME message more than once? Disconnecting!');
          this.connection?.close(1002, 'Unexpect (duplicate?) WELCOME message');
          return;
        }

        const welcomeData = message.data as WelcomeMessage['data'];
        this.serverTimeOffset = welcomeData.serverTime - Date.now();
        this.selfInfo = {
          connectionId: welcomeData.connectionId,
          userId: welcomeData.userId,
        };
        console.info('WebSocket received WELCOME from server');
        break;

      case MESSAGE_TYPE.SESSION_INFO:
        const sessionInfoData = message.data as SessionInfoMessage['data'];
        this.sessionInfo = sessionInfoData;
        break;

      case MESSAGE_TYPE.MEDIA_CHANGED:
        const mediaChangedData = message.data as MediaChangedMessage['data'];
        this.propagateChangeMedia(mediaChangedData.media);
        break;

      case MESSAGE_TYPE.PLAYER_STATE_UPDATE:
        const playerStateUpdateData = message.data as PlayerStateUpdateMessage['data'];
        if (playerStateUpdateData.userId === this.selfInfo?.userId) {
          throw new Error('Received PLAYER_STATE_UPDATE message for self userId, this should not happen');
        }

        this.userPlaybackState.set(playerStateUpdateData.userId, {
          paused: playerStateUpdateData.state.paused,
          currentTime: playerStateUpdateData.state.currentTime,
        });

        if (this.referencePlayerUserId === playerStateUpdateData.userId) {
          const shouldForceSyncVideoPlayer = this.referencePlayerState == null ||
            playerStateUpdateData.state.seeked ||
            playerStateUpdateData.state.paused !== this.referencePlayerState.state.paused;

          this.referencePlayerState = {
            state: playerStateUpdateData.state,
            updated: this.convertServerTimeToLocal(playerStateUpdateData.timestamp),
          };

          if (shouldForceSyncVideoPlayer) {
            this.videoPlayer?.forceStateSynchronization(this.referencePlayerState.state);
          }
        }

        break;

      case MESSAGE_TYPE.REFERENCE_PLAYER_CHANGED:
        const referencePlayerData = message.data as PlayerStateUpdateMessage['data'];

        if (referencePlayerData.userId === this.selfInfo?.userId) {
          this.videoPlayer?.resetPlayerSynchronization(this.referencePlayerState?.state.playbackRate ?? 1.0);
        }

        this.referencePlayerUserId = referencePlayerData.userId;
        this.referencePlayerState = null;
        break;

      case MESSAGE_TYPE.CLOCK_SYNC:
        const clockSyncData = message.data as ClockSyncMessage['data'];
        const newServerTimeOffset = clockSyncData.serverTime - Date.now();

        console.debug('Synchronized server time:', {
          oldOffset: this.serverTimeOffset,
          newOffset: newServerTimeOffset,
        });
        this.serverTimeOffset = newServerTimeOffset;

        break;
      default:
        if (this.selfInfo == null) {
          console.warn('Received unknown message before WELCOME message, ignoring');
        }

        console.error('Unknown WebSocket message type:', message.type, 'with data:', message.data);
        break;
    }
  }

  private handleOpenEvent(): void {
    console.debug('WebSocket connection established');
  }

  private handleCloseEvent(event: CloseEvent): void {
    console.warn('WebSocket connection closed:', event.code, event.reason);
    this.connection = undefined;
    this.selfInfo = null;
    this.userPlaybackState.clear();

    this.videoPlayer?.resetPlayerSynchronization(this.referencePlayerState?.state.playbackRate ?? 1.0);
    this.referencePlayerState = null;

    switch (event.code) {
      case 1002: // Protocol Error
        console.error('WebSocket disconnected due to protocol error, reloading page in 3 seconds...');
        setTimeout(() => window.location.reload(), 3000);
        break;

      case 1001: // Going Away
      case 1005: // No Status Received
      case 1006: // Abnormal Closure
      case 1011: // Internal Error
      case 1012: // Service Restart
      case 1013: // Try Again Later
      case 1014: // Bad gateway
        console.info('Reconnecting WebSocket in 5 seconds...');
        setTimeout(() => this.reconnect(), 5000);
        break;

      case 3000: // Unauthorized
      case 3003: // Forbidden
        alert('Authentication error occurred, please reload the page');
        break;

      default:
        alert('WebSocket connection closed, please reload the page (code=' + event.code + `,reason=${event.reason})`);
        break;
    }
  }

  private handleErrorEvent(event: Event): void {
    console.error('WebSocket error:', event);
  }

  private getServerTimeNow(): number {
    return Date.now() + this.serverTimeOffset;
  }

  private convertServerTimeToLocal(serverTime: number): number {
    return serverTime + this.serverTimeOffset;
  }
}
