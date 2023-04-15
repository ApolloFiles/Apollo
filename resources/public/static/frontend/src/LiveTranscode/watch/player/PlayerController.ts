import MediaSession from '../MediaSession';
import PlayerState from './PlayerState';

export default class PlayerController {
  private playerState: PlayerState;
  private session: MediaSession;

  constructor(playerState: PlayerState, session: MediaSession) {
    this.playerState = playerState;
    this.session = session;
  }

  set playbackRate(playbackRate: number) {
    if (this.shouldRequestStateChange()) {
      this.session.getOwnClient()?.sendRequestPlaybackStateChange({playbackRate});
      return;
    }

    this.playerState.playbackRate = playbackRate;
  }

  async togglePlay(): Promise<void> {
    if (this.shouldRequestStateChange()) {
      this.session.getOwnClient()?.sendRequestPlaybackStateChange({paused: !this.playerState.paused});
      return;
    }

    await this.playerState.togglePlay();
  }

  async seek(time: number): Promise<void> {
    if (this.shouldRequestStateChange()) {
      this.session.getOwnClient()!.sendRequestPlaybackStateChange({currentTime: time});
      return;
    }

    await this.playerState.seek(time);
  }

  async seekBack10(): Promise<void> {
    await this.seek(this.playerState.currentTime - 10);
  }

  async seekForward10(): Promise<void> {
    await this.seek(this.playerState.currentTime + 10);
  }

  private shouldRequestStateChange(): boolean {
    const ownClient = this.session.getOwnClient();
    return ownClient != null && ownClient.isConnected() && !ownClient.isSuperMaster();
  }
}
