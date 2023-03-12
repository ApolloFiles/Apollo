export type MediaMode = 'native' | 'hls' | 'live_transcode';

export interface Media {
  readonly uri: string;
  readonly duration?: number;
  readonly mode: MediaMode;
}

export interface StateData {
  readonly paused: boolean;
  readonly currentTime: number;
  readonly playbackRate: number;
}

interface CommunicationProtocol {
  readonly type: 'welcome' | 'clientConnect' | 'clientDisconnect' | 'syncState' | 'statePing' | 'mediaChange' | 'superMasterChange';
  readonly data: unknown;
}

export interface WelcomeMessage extends CommunicationProtocol {
  readonly type: 'welcome';
  readonly data: {
    readonly clientId: string;
    readonly displayName: string;
    // TODO: Also send the current clients instead of spamming clientConnect messages

    readonly initialState?: { readonly media: Media } & StateData;
  };
}

/**
 * Can be sent multiple times to update the state of the client
 */
export interface ClientConnectMessage extends CommunicationProtocol {
  readonly type: 'clientConnect';
  readonly data: {
    readonly clientId: string;
    readonly displayName: string;
  };
}

export interface ClientDisconnectMessage extends CommunicationProtocol {
  readonly type: 'clientDisconnect';
  readonly data: {
    readonly clientId: string;
  };
}

export interface SyncStateMessage extends CommunicationProtocol {
  readonly type: 'syncState';
  readonly data: {
    readonly clientId: string;  // FIXME: Server can attach clientID, client should not be sending it
    readonly state: StateData;
  };
}

export interface StatePingMessage extends CommunicationProtocol {
  readonly type: 'statePing';
  readonly data: {
    readonly clientId: string;  // FIXME: Server can attach clientID, client should not be sending it
    readonly state: StateData;
  };
}

export interface MediaChangeMessage extends CommunicationProtocol {
  readonly type: 'mediaChange';
  readonly data: {
    readonly media: Media;
  };
}

export interface SuperMasterChangeMessage extends CommunicationProtocol {
  readonly type: 'superMasterChange';
  readonly data: {
    readonly clientId: string;
  };
}

export type Message =
    WelcomeMessage
    | ClientConnectMessage
    | ClientDisconnectMessage
    | SyncStateMessage
    | StatePingMessage
    | MediaChangeMessage
    | SuperMasterChangeMessage;
