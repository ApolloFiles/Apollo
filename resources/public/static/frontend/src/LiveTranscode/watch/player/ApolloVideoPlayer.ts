import * as CommunicationProtocol from '../../../../../../../../src/media/watch/sessions/CommunicationProtocol';
import {PlayerMode} from '../../../../../../../../src/media/watch/sessions/CommunicationProtocol';
import MediaSession from '../MediaSession';
import GlobalPlayerShortcuts from './GlobalPlayerShortcuts';
import PlayerController from './PlayerController';
import PlayerControls from './PlayerControls';
import HlsPlayerElement from './PlayerElements/HlsPlayerElement';
import LiveTranscodePlayerElement from './PlayerElements/LiveTranscodePlayerElement';
import NativePlayerElement from './PlayerElements/NativePlayerElement';
import PlayerElement from './PlayerElements/PlayerElement';
import TwitchPlayerElement from './PlayerElements/TwitchPlayerElement';
import YouTubePlayerElement from './PlayerElements/YouTubePlayerElement';
import PlayerState from './PlayerState';

export default class ApolloVideoPlayer {
  readonly _playerState: PlayerState;
  readonly playerController: PlayerController;
  readonly _controls: PlayerControls;
  private readonly playerShortcut: GlobalPlayerShortcuts;
  private readonly mediaSession: MediaSession;

  readonly _videoPlayerWrapper: HTMLDivElement;

  _currentMedia: CommunicationProtocol.Media | null = null;

  constructor(mediaSessionId: string) {
    const rootContainer = document.getElementById('debug5374890')!;
    const playerWithControlsContainer = rootContainer.querySelector<HTMLElement>('.video-player-container')!;
    this._videoPlayerWrapper = playerWithControlsContainer.querySelector<HTMLDivElement>('.video-player-wrapper')!;

    const playerControlsContainer = playerWithControlsContainer.querySelector<HTMLElement>('[data-video-player-element="player-controls"]')!;
    this._playerState = new PlayerState(playerWithControlsContainer);

    this.mediaSession = new MediaSession(mediaSessionId, this);

    this.playerController = new PlayerController(this._playerState, this.mediaSession);
    this._controls = new PlayerControls(this._videoPlayerWrapper, playerControlsContainer, playerWithControlsContainer, this._playerState, this.playerController);
    this.playerShortcut = new GlobalPlayerShortcuts(playerWithControlsContainer, this._controls, this.playerController, this._playerState);

    this._playerState.on('stateChanged', () => {
      playerWithControlsContainer.classList.remove('is-loading', 'is-paused');
      if (this._playerState.paused) {
        playerWithControlsContainer.classList.add('is-paused');
      }
    });

    const existingVideoElement = this.findVideoElement();
    if (existingVideoElement != null && (existingVideoElement.src ?? '').length > 0) {
      this._changeMedia({
        mode: 'native',
        uri: existingVideoElement.src,
        metadata: {
          posterUri: existingVideoElement.poster || undefined
        }
      }).catch(console.error);
    } else {
      this._changeMedia(null).catch(console.error);
    }
  }

  private findVideoElement(): HTMLVideoElement | null {
    return this._videoPlayerWrapper.querySelector<HTMLVideoElement>('video');
  }

  async requestMediaChange(mode: PlayerMode | null, uri: string | null): Promise<void> {
    const ownClientId = this.mediaSession.getOwnClient()?.getClientId()!;
    if (mode == null || uri == null) {
      await this.mediaSession.changeMedia(null, ownClientId);
      return;
    }

    await this.mediaSession.changeMedia({mode, uri}, ownClientId);
  }

  async _changeMedia(media: CommunicationProtocol.Media | null): Promise<void> {
    this._playerState._prepareDestroyOfReferenceElement();
    this._videoPlayerWrapper.innerHTML = '';
    this._controls.setEnabled(false);

    if (media == null) {
      const placeholderElement = document.createElement('div');
      placeholderElement.classList.add('placeholder-text');
      placeholderElement.innerText = 'No media selected';

      this._videoPlayerWrapper.appendChild(placeholderElement);
      this._controls.setEnabled(true);
    } else if (media.mode == 'native') {
      const player = new NativePlayerElement(this._videoPlayerWrapper);
      await player.loadMedia(media);
      this._playerState._setReferenceElement(player);

      this._controls.setEnabled(true);
    } else if (media.mode == 'hls') {
      const player = new HlsPlayerElement(this._videoPlayerWrapper);
      await player.loadMedia(media);
      this._playerState._setReferenceElement(player);

      this._controls.setEnabled(true);
    } else if (media.mode == 'live_transcode') {
      const player = new LiveTranscodePlayerElement(this._videoPlayerWrapper);
      await player.loadMedia(media);
      this._playerState._setReferenceElement(player);

      this._controls.setEnabled(true);
    } else if (media.mode == 'youtube') {
      const player = new YouTubePlayerElement(this._videoPlayerWrapper);
      await player.loadMedia(media);
      this._playerState._setReferenceElement(player);
    } else if (media.mode == 'twitch') {
      const player = new TwitchPlayerElement(this._videoPlayerWrapper);
      await player.loadMedia(media);
      this._playerState._setReferenceElement(player);
    } else {
      throw new Error('Unknown media mode: ' + media.mode);
    }

    if (media != null) {
      this._playerState._getReferenceElement().loadSubtitles(media, this);
    }

    this._currentMedia = media;

    if (this._playerState.isNativeReferenceElement()) {
      this._controls.applyVideoPlayerStateFromLocalStorage();
    }
  }
}
