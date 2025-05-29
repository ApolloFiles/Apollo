import type { StartPlaybackResponse } from '../../../webserver/Api/v0/media/player-session/change-media';
import type { PlayerSessionInfoResponse } from '../../../webserver/Api/v0/media/player-session/info';
import { MESSAGE_TYPE } from './WebSocketDataMessageType';

export type WebSocketMessage = {
  type: MESSAGE_TYPE;
  data: Record<string, unknown>;
}

export interface WelcomeMessage extends WebSocketMessage {
  type: MESSAGE_TYPE.WELCOME,
  data: {
    connectionId: number,
    userId: string,
    serverTime: number,
  },
}

export interface SessionInfoMessage extends WebSocketMessage {
  type: MESSAGE_TYPE.SESSION_INFO,
  data: Omit<PlayerSessionInfoResponse['session'], 'yourId'>,
}

export interface MediaChangedMessage extends WebSocketMessage {
  type: MESSAGE_TYPE.MEDIA_CHANGED,
  data: {
    media: StartPlaybackResponse | null,
  },
}

export interface PlayerStateUpdateMessage extends WebSocketMessage {
  type: MESSAGE_TYPE.PLAYER_STATE_UPDATE,
  data: {
    connectionId: number,
    userId: string,
    timestamp: number,
    state: {
      seeked: boolean,
      paused: boolean,
      currentTime: number,
      playbackRate: number,
    },
  },
}

export interface ReferencePlayerChangedMessage extends WebSocketMessage {
  type: MESSAGE_TYPE.REFERENCE_PLAYER_CHANGED,
  data: {
    connectionId: number,
    userId: string,
  },
}

export interface ClockSyncMessage extends WebSocketMessage {
  type: MESSAGE_TYPE.CLOCK_SYNC,
  data: {
    serverTime: number,
  },
}

export class WebSocketMessageValidator {
  static isPlayerStateUpdateMessageStrictCheck(message: WebSocketMessage): message is PlayerStateUpdateMessage {
    return Object.keys(message).length === 2 &&
      message.type === MESSAGE_TYPE.PLAYER_STATE_UPDATE &&

      typeof message.data === 'object' && message.data != null &&
      Object.keys(message.data).length === 4 &&

      typeof message.data.connectionId === 'number' &&
      typeof message.data.userId === 'string' &&
      typeof message.data.timestamp === 'number' &&

      typeof message.data.state === 'object' && message.data.state != null &&
      Object.keys(message.data.state).length === 4 &&

      typeof (message.data.state as any).seeked === 'boolean' &&
      typeof (message.data.state as any).paused === 'boolean' &&
      typeof (message.data.state as any).currentTime === 'number' &&
      typeof (message.data.state as any).playbackRate === 'number';
  }

  static isWebSocketMessage(message: unknown): message is WebSocketMessage {
    return typeof message === 'object' && message != null &&
      typeof (message as any).type === 'number' &&
      typeof (message as any).data === 'object' && (message as any).data != null;
  }
}
