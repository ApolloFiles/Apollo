import * as CommunicationProtocol from '../../../../../../../src/media/watch/sessions/CommunicationProtocol';
import ApolloVideoPlayer from './player/ApolloVideoPlayer';
import ClientStateElement from './player/ClientStateElement';
import SessionClient from './SessionClient';

export type OtherSessionClient = CommunicationProtocol.Client & {
  state?: CommunicationProtocol.PlaybackState;
  clientStateElement: ClientStateElement;
};

export default class MediaSession {
  private readonly sessionId: string;
  readonly _videoPlayer: ApolloVideoPlayer;

  private readonly sessionClient: SessionClient;
  private readonly connectedClients: Map<string, OtherSessionClient> = new Map();
  private superMasterId: string | null = null;

  constructor(sessionId: string, videoPlayer: ApolloVideoPlayer) {
    this.sessionId = sessionId;
    this._videoPlayer = videoPlayer;
    this.sessionClient = new SessionClient(this);

    this._videoPlayer._playerState.on('stateChanged', () => {
      if (this.sessionClient.isSuperMaster()) {
        this.sessionClient._sendPlaybackStatePing(this._videoPlayer._playerState);
      }
    });

    this._videoPlayer._playerState.on('timeChanged', () => {
      this.sessionClient._clientStateElement.updateTime(this._videoPlayer._playerState.currentTime);
    });

    setInterval(() => {
      if (!this.sessionClient.isConnected()) {
        return;
      }

      this.sessionClient._sendPlaybackStatePing(this._videoPlayer._playerState);
    }, 1_000);
  }

  getSuperMasterId(): string | null {
    return this.superMasterId;
  }

  getOwnClient(): SessionClient | null {
    return this.sessionClient;
  }

  getClient(clientId: string): OtherSessionClient | null {
    return this.connectedClients.get(clientId) ?? null;
  }

  async changeMedia(media: CommunicationProtocol.Media | null, issuerClientId: string): Promise<void> {
    if (!this.sessionClient.isSuperMaster()) {
      return this.sessionClient.sendRequestMediaChange(media);
    }

    this.sessionClient.sendChangeMedia(media, issuerClientId);
    await this._videoPlayer._changeMedia(media?.mode ?? null, media?.uri ?? null, undefined, true);
  }

  _setConnectedClient(client: CommunicationProtocol.Client): void {
    this.connectedClients.set(client.clientId, {
      ...client,
      clientStateElement: new ClientStateElement(client.displayName)
    });
  }

  _removeConnectedClient(clientId: string): void {
    this.connectedClients.get(clientId)?.clientStateElement.destroy();
    this.connectedClients.delete(clientId);
  }

  _clearConnectedClients(): void {
    this.connectedClients.forEach(client => client.clientStateElement.destroy());
    this.connectedClients.clear();
  }

  _setSuperMaster(clientId: string | null): void {
    const oldPlaybackRate = this.getClient(this.superMasterId ?? '')?.state?.playbackRate;

    this.superMasterId = clientId;

    if (this.sessionClient.isSuperMaster()) {
      this._videoPlayer._playerState.playbackRate = oldPlaybackRate ?? 1;
    }

    this.sessionClient._clientStateElement.updateSuperMaster(this.sessionClient.isSuperMaster());

    this.connectedClients.forEach(client => client.clientStateElement.updateSuperMaster(false));
    if (!this.sessionClient.isSuperMaster()) {
      const client = this.connectedClients.get(this.superMasterId ?? '');
      client?.clientStateElement.updateSuperMaster(true);
    }
  }

  _setPlaybackStateForClient(clientId: string, state: CommunicationProtocol.PlaybackState): void {
    const client = this.connectedClients.get(clientId);
    if (client == null) {
      throw new Error(`Client with id '${clientId}' not found`);
    }

    client.state = state;
    client.clientStateElement.updateTime(state.currentTime);
  }

  async _adjustOwnPlayerStateToCatchUpToMaster(): Promise<void> {
    if (this.sessionClient.isSuperMaster()) {
      return;
    }

    const masterClient = this.connectedClients.get(this.superMasterId ?? '');
    if (masterClient == null) {
      return;
    }

    const masterState = masterClient.state;
    if (masterState == null) {
      return;
    }

    const ownState = this._videoPlayer._playerState;
    if (ownState.paused !== masterState.paused) {
      if (masterState.paused) {
        ownState.pause();
      } else {
        await ownState.play();
      }
    }

    let newOwnPlaybackRate = masterState.playbackRate;

    const currentTimeDifference = masterState.currentTime - ownState.currentTime;
    const currentTimeDifferenceAbs = Math.abs(currentTimeDifference);
    if (currentTimeDifferenceAbs > 10 || masterState.paused) {
      if (masterState.currentTime !== ownState.currentTime) {
        await ownState.seek(masterState.currentTime);
      }
    } else if (currentTimeDifferenceAbs > .25) {
      newOwnPlaybackRate += currentTimeDifferenceAbs / 10;
    }

    ownState.playbackRate = newOwnPlaybackRate;
  }
}
