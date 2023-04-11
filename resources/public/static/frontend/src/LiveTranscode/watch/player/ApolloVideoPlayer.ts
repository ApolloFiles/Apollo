import Hls from 'hls.js';
import { PlayerMode } from '../../../../../../../../src/media/watch/sessions/CommunicationProtocol';
import MediaSession from '../MediaSession';
import PlayerControls from './PlayerControls';
import PlayerState from './PlayerState';
import NativePlayerWrapper from './state_wrappers/NativePlayerWrapper';
import TwitchPlayerWrapper from './state_wrappers/TwitchPlayerWrapper';
import YouTubePlayerWrapper from './state_wrappers/YouTubePlayerWrapper';

export default class ApolloVideoPlayer {
  // TODO: Gibt noch nen Player-Controller oder so, der den PlayerState callen kann oder merkt, dass er nicht SuperMaster ist und es stattdessen requestet und nix macht
  readonly _playerState: PlayerState;
  readonly _controls: PlayerControls;
  private readonly mediaSession: MediaSession;

  private readonly videoPlayerWrapper: HTMLDivElement;

  _currentMedia: { type: PlayerMode, src: string } | null = null;

  private loadedTwitchJs = false;
  private loadedYoutubeJs = false;

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

      this._changeMedia('native', src, poster, false).catch(console.error);
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

  async _changeMedia(type: PlayerMode | null, src: string | null, poster?: string, autoplay: boolean = false): Promise<void> {
    this._playerState._prepareDestroyOfReferenceElement();
    this.videoPlayerWrapper.innerHTML = '';
    this._controls.setEnabled(false);

    if (type == null || src == null) {
      const placeholderElement = document.createElement('div');
      placeholderElement.classList.add('placeholder-text');
      placeholderElement.innerText = 'No media selected';

      this.videoPlayerWrapper.appendChild(placeholderElement);
      this._controls.setEnabled(true);
    } else if (type == 'native' || type == 'hls') {
      const videoElement = document.createElement('video');
      videoElement.playsInline = true;
      videoElement.autoplay = autoplay;
      videoElement.poster = poster ?? '';

      if (type == 'hls' && Hls.isSupported()) {
        const hls = new Hls({debug: false, autoStartLoad: false});

        hls.loadSource(src);
        hls.attachMedia(videoElement);
        hls.once(Hls.Events.MANIFEST_PARSED, () => {
          hls?.startLoad(0);
        });
      } else {
        videoElement.src = src;
      }

      this.videoPlayerWrapper.appendChild(videoElement);
      this._controls.setEnabled(true);

      this._playerState._setReferenceElement(new NativePlayerWrapper(videoElement));
    } else if (type == 'twitch') {
      if (!this.loadedTwitchJs) {
        await this.loadJs('https://player.twitch.tv/js/embed/v1.js');
        this.loadedTwitchJs = true;
      }

      // @ts-ignore
      const twitchPlayer = new Twitch.Player(this.videoPlayerWrapper, {
        width: '100%',
        height: '100%',
        channel: src,
        autoplay
      });
      (window as any).twitch = twitchPlayer;  // TODO: remove debug

      this._playerState._setReferenceElement(new TwitchPlayerWrapper(twitchPlayer));
    } else if (type == 'youtube') {
      await this.loadYouTubeIframeApi();

      // TODO: Use current UI language Apollo uses instead of 'en'
      const ytPlayer = await YouTubePlayerWrapper.createYouTubePlayerAndWaitForReadyEvent(this.videoPlayerWrapper, src, autoplay, 'en');
      (window as any).youtube = ytPlayer;  // TODO: remove debug

      this._playerState._setReferenceElement(new YouTubePlayerWrapper(ytPlayer));
    } else {
      throw new Error('Unknown media type: ' + type);
    }

    this._currentMedia = (type == null || src == null) ? null : {type, src};
    this._controls.applyVideoPlayerStateFromLocalStorage();
  }

  private async loadJs(url: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const scriptElement = document.createElement('script');
      scriptElement.setAttribute('src', url);
      scriptElement.addEventListener('load', () => resolve());
      scriptElement.addEventListener('error', () => reject(new Error('Unable to load script: ' + url)));

      document.querySelector('head')!.appendChild(scriptElement);
    });
  }

  private async loadYouTubeIframeApi(): Promise<void> {
    if (this.loadedYoutubeJs) {
      return;
    }

    return new Promise(async (resolve): Promise<void> => {
      (window as any).onYouTubeIframeAPIReady = () => {
        delete (window as any).onYouTubeIframeAPIReady;
        resolve();
      };

      await this.loadJs('https://www.youtube.com/iframe_api');
      this.loadedYoutubeJs = true;
    });
  }
}
