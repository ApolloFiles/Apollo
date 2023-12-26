export type PlayerMode = 'native' | 'hls' | 'apollo_file' | 'live_transcode' | 'youtube' | 'twitch';

export interface Client {
  readonly clientId: string;
  readonly displayName: string;
}

export interface Media {
  readonly uri: string;
  readonly mode: PlayerMode;
  readonly duration?: number;

  readonly metadata?: {
    readonly title?: string;
    readonly posterUri?: string;

    readonly subtitles?: SubtitleMetadata[];
    readonly fonts?: { uri: string }[];
    readonly audioNames?: { [key: string]: string };
  };
}

export interface SubtitleMetadata {
  readonly title: string;
  readonly language: string;
  readonly codecName: string;
  readonly uri: string;
}

export interface PlaybackState {
  readonly paused: boolean;
  readonly currentTime: number;
  readonly playbackRate: number;
}

export type Message =
  WelcomeMessage
  | ClientConnectMessage
  | ClientDisconnectMessage
  | SuperMasterChangeMessage
  | PlaybackStatePingMessage
  | MediaChangeMessage
  | RequestMediaChangeMessage
  | RequestPlaybackStateChangeMessage
  | BackendDebugInfoMessage;

export type MessageType =
  'welcome'
  | 'clientConnect'
  | 'clientDisconnect'
  | 'superMasterChange'
  | 'playbackStatePing'
  | 'mediaChange'
  | 'requestMediaChange'
  | 'requestPlaybackStateChange'
  | 'backendDebugInfo';

interface BaseMessage {
  readonly type: MessageType;
  readonly data: unknown;
}

export interface WelcomeMessage extends BaseMessage {
  readonly type: 'welcome';
  readonly data: {
    readonly clientId: string;
    readonly displayName: string;

    readonly clients: Array<Client>;
    readonly media?: Media;
    readonly playbackState?: PlaybackState;
  };
}

/**
 * Can be sent multiple times to update the state_wrappers of the client (e.g. displayName)
 */
export interface ClientConnectMessage extends BaseMessage {
  readonly type: 'clientConnect';
  readonly data: Client;
}

export interface ClientDisconnectMessage extends BaseMessage {
  readonly type: 'clientDisconnect';
  readonly data: {
    readonly clientId: string;
  };
}

export interface SuperMasterChangeMessage extends BaseMessage {
  readonly type: 'superMasterChange';
  readonly data: {
    readonly clientId: string;
  };
}

export interface PlaybackStatePingMessage extends BaseMessage {
  readonly type: 'playbackStatePing';
  readonly data: {
    readonly clientId: string;
    readonly state: PlaybackState;
  };
}

export interface MediaChangeMessage extends BaseMessage {
  readonly type: 'mediaChange';
  readonly data: {
    readonly issuerClientId: string;
    readonly media: Media | null;
  };
}

export interface RequestMediaChangeMessage extends BaseMessage {
  readonly type: 'requestMediaChange';
  readonly data: {
    readonly clientId: string;
    readonly media: Media | null;
  };
}

export interface RequestPlaybackStateChangeMessage extends BaseMessage {
  readonly type: 'requestPlaybackStateChange';
  readonly data: {
    readonly clientId: string;
    readonly state: Partial<PlaybackState>;
  };
}

export interface BackendDebugInfoMessage extends BaseMessage {
  readonly type: 'backendDebugInfo';
  readonly data: { [key: string]: unknown };
}
