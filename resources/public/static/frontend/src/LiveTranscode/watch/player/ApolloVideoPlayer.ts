import { PlayerMode } from '../../../../../../../../src/media/watch/sessions/CommunicationProtocol';
import MediaSession from '../MediaSession';
import PlayerControls from './PlayerControls';
import HlsPlayerElement from './PlayerElements/HlsPlayerElement';
import LiveTranscodePlayerElement from './PlayerElements/LiveTranscodePlayerElement';
import NativePlayerElement from './PlayerElements/NativePlayerElement';
import TwitchPlayerElement from './PlayerElements/TwitchPlayerElement';
import YouTubePlayerElement from './PlayerElements/YouTubePlayerElement';
import PlayerState from './PlayerState';

export default class ApolloVideoPlayer {
  // TODO: Gibt noch nen Player-Controller oder so, der den PlayerState callen kann oder merkt, dass er nicht SuperMaster ist und es stattdessen requestet und nix macht
  readonly _playerState: PlayerState;
  readonly _controls: PlayerControls;
  private readonly mediaSession: MediaSession;

  private readonly videoPlayerWrapper: HTMLDivElement;

  _currentMedia: { type: PlayerMode, src: string } | null = null;

  constructor(mediaSessionId: string) {
    const rootContainer = document.getElementById('debug5374890')!;
    const playerWithControlsContainer = rootContainer.querySelector<HTMLElement>('.video-player-container')!;
    this.videoPlayerWrapper = playerWithControlsContainer.querySelector<HTMLDivElement>('.video-player-wrapper')!;

    const playerControlsContainer = playerWithControlsContainer.querySelector<HTMLElement>('[data-video-player-element="player-controls"]')!;
    this._playerState = new PlayerState(playerWithControlsContainer);
    this._controls = new PlayerControls(this.videoPlayerWrapper, playerControlsContainer, playerWithControlsContainer, this._playerState);

    this.mediaSession = new MediaSession(mediaSessionId, this);

    this._playerState.on('stateChanged', () => {
      playerWithControlsContainer.classList.remove('is-loading', 'is-paused');
      if (this._playerState.paused) {
        playerWithControlsContainer.classList.add('is-paused');
      }
    });

    const existingVideoElement = this.findVideoElement();
    if (existingVideoElement != null && (existingVideoElement.src ?? '').length > 0) {
      const src = existingVideoElement.src;
      const poster = existingVideoElement.poster || undefined;

      this._changeMedia('native', src, poster).catch(console.error);
    } else {
      this._changeMedia(null, null).catch(console.error);
    }
  }

  private findVideoElement(): HTMLVideoElement | null {
    return this.videoPlayerWrapper.querySelector<HTMLVideoElement>('video');
  }

  async requestMediaChange(mode: PlayerMode | null, uri: string | null): Promise<void> {
    const ownClientId = this.mediaSession.getOwnClient()?.getClientId()!;
    if (mode == null || uri == null) {
      await this.mediaSession.changeMedia(null, ownClientId);
      return;
    }

    await this.mediaSession.changeMedia({mode, uri}, ownClientId);
  }

  async _changeMedia(type: PlayerMode | null, src: string | null, poster?: string): Promise<void> {
    this._playerState._prepareDestroyOfReferenceElement();
    this.videoPlayerWrapper.innerHTML = '';
    this._controls.setEnabled(false);

    if (type == null || src == null) {
      const placeholderElement = document.createElement('div');
      placeholderElement.classList.add('placeholder-text');
      placeholderElement.innerText = 'No media selected';

      this.videoPlayerWrapper.appendChild(placeholderElement);
      this._controls.setEnabled(true);
    } else if (type == 'native') {
      const player = new NativePlayerElement(this.videoPlayerWrapper);
      await player.loadMedia(src, poster);
      this._playerState._setReferenceElement(player);

      this._controls.setEnabled(true);
    } else if (type == 'hls') {
      const player = new HlsPlayerElement(this.videoPlayerWrapper);
      await player.loadMedia(src, poster);
      this._playerState._setReferenceElement(player);

      this._controls.setEnabled(true);
    } else if (type == 'live_transcode') {
      const player = new LiveTranscodePlayerElement(this.videoPlayerWrapper);
      await player.loadMedia(src, poster);
      this._playerState._setReferenceElement(player);

      this._controls.setEnabled(true);
    } else if (type == 'youtube') {
      const player = new YouTubePlayerElement(this.videoPlayerWrapper);
      await player.loadMedia(src, poster);
      this._playerState._setReferenceElement(player);
    } else if (type == 'twitch') {
      const player = new TwitchPlayerElement(this.videoPlayerWrapper);
      await player.loadMedia(src, poster);
      this._playerState._setReferenceElement(player);
    } else {
      throw new Error('Unknown media type: ' + type);
    }

    this._currentMedia = (type == null || src == null) ? null : {type, src};

    if (this._playerState.isNativeReferenceElement()) {
      this._controls.applyVideoPlayerStateFromLocalStorage();
    }
  }
}
