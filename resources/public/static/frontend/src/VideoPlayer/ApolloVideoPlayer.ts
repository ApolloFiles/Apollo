import HlsVideoWrapper from './HlsVideoWrapper';
import HTMLVideoElementWrapper from './HTMLVideoElementWrapper';
import LiveTranscodeVideoWrapper from './LiveTranscodeVideoWrapper';
import VideoElementWrapper from './VideoElementWrapper';

const iconMapping = {
  playing: (isPlaying: boolean) => isPlaying ? 'pause' : 'play_arrow',
  muted: (isMuted: boolean) => isMuted ? 'volume_off' : 'volume_up',
  fullscreen: (isFullscreen: boolean) => isFullscreen ? 'fullscreen_exit' : 'fullscreen'
};

export type AllPlayerElements = {
  _videoElement: HTMLVideoElement,
  playerControls: HTMLElement,
  controlsContainer: HTMLElement,

  playButton: HTMLElement,
  volumeButton: HTMLElement,
  settingsButton: HTMLElement,
  fullscreenButton: HTMLElement,

  progressTimes: HTMLElement,
  progressBarContainer: HTMLElement,
  progressBar: HTMLElement,

  volumeSliderContainer: HTMLElement,
  volumeSlider: HTMLElement,
  volumeSliderChild: HTMLElement,

  settingsContainer: HTMLElement
}

export default class ApolloVideoPlayer {
  private readonly wrappingElement: HTMLElement;
  private readonly allPlayerElements: AllPlayerElements;

  private _videoWrapper: VideoElementWrapper;

  get _videoElement() {
    return this.allPlayerElements._videoElement;
  }

  get videoWrapper() {
    return this._videoWrapper;
  }

  constructor(wrappingElement: HTMLElement) {
    this.wrappingElement = wrappingElement;
    this.allPlayerElements = this.findAllPlayerElements();
    this._videoWrapper = new HTMLVideoElementWrapper(this._videoElement);

    this.initializePlayerEvents();
    this.initializeProgressSlider();
    this.initializeVolumeSlider();
    this.initializeSettingsButton();

    this.initializeFullscreenCapabilities();
    this.initializePlayerStateStorage();

    this.updateDisplayedVolume();
    this.updateDisplayedProgress();
    this.disableAllTextTracks();

    this._videoElement.controls = false;
    this.allPlayerElements.playerControls.classList.remove('d-none');
  }

  async loadMedia(mediaUri: string, mode: 'native' | 'hls' | 'live_transcode' = 'native'): Promise<void> {
    this._videoWrapper.destroyWrapper();

    switch (mode) {
      case 'native':
        this._videoWrapper = new HTMLVideoElementWrapper(this._videoElement);
        break;
      case 'hls':
        this._videoWrapper = new HlsVideoWrapper(this._videoElement);
        break;
      case 'live_transcode':
        this._videoWrapper = new LiveTranscodeVideoWrapper(this._videoElement);
        break;

      default:
        throw new Error(`Unknown mode: ${mode}`);
    }

    return this._videoWrapper.loadMedia(mediaUri);
  }

  togglePause(): void {
    if (this._videoWrapper.paused || this._videoWrapper.ended) {
      this._videoWrapper.play().catch(console.error);
    } else {
      this._videoWrapper.pause();
    }
  }

  toggleMute(): void {
    this._videoWrapper.muted = !this._videoWrapper.muted;
  }

  disableAllTextTracks(): void {
    for (let i = 0; i < this._videoElement.textTracks.length; ++i) {
      this._videoElement.textTracks[i].mode = 'hidden';
    }
  }

  private initializePlayerEvents(): void {
    const togglePauseListener = () => {
      this.hideAdditionalControlContainers();
      this.togglePause();
    };
    this._videoElement.addEventListener('click', togglePauseListener);
    this.allPlayerElements.playButton.addEventListener('click', togglePauseListener, {passive: true});

    this._videoElement.addEventListener('durationchange', () => this.updateDisplayedProgress(), {passive: true});
    this._videoElement.addEventListener('loadedmetadata', () => {
      this.updateDisplayedProgress();
      this.disableAllTextTracks();
    }, {passive: true});
    this._videoElement.addEventListener('timeupdate', () => this.updateDisplayedProgress(), {passive: true});
    this._videoElement.addEventListener('progress', () => this.updateDisplayedProgress(), {passive: true});

    this.allPlayerElements.volumeButton.addEventListener('click', () => this.toggleMute(), {passive: true});
    this._videoElement.addEventListener('volumechange', () => this.updateDisplayedVolume(), {passive: true});

    this._videoElement.addEventListener('waiting', () => this.wrappingElement.classList.add('is-loading'), {passive: true});
    this._videoElement.addEventListener('playing', () => this.wrappingElement.classList.remove('is-loading'), {passive: true});

    this._videoElement.addEventListener('seeking', () => this.wrappingElement.classList.add('is-loading'), {passive: true});
    this._videoElement.addEventListener('seeked', () => this.wrappingElement.classList.remove('is-loading'), {passive: true});

    this._videoElement.addEventListener('play', () => {
      this.wrappingElement.classList.remove('is-paused');
      ApolloVideoPlayer.updateIcon(this.allPlayerElements.playButton, iconMapping.playing(true));
    }, {passive: true});
    this._videoElement.addEventListener('pause', () => {
      this.wrappingElement.classList.add('is-paused');
      ApolloVideoPlayer.updateIcon(this.allPlayerElements.playButton, iconMapping.playing(false));
    }, {passive: true});
  }

  private initializeFullscreenCapabilities(): void {
    if (!document.fullscreenEnabled) {
      this.allPlayerElements.fullscreenButton.setAttribute('disabled', '');
      return;
    }

    this.allPlayerElements.fullscreenButton.addEventListener('click', () => {
      this.hideAdditionalControlContainers();

      const playerWillBeInFullscreen = document.fullscreenElement === null;
      if (playerWillBeInFullscreen) {
        this.wrappingElement.requestFullscreen().catch(console.error);
      } else {
        document.exitFullscreen().catch(console.error);
      }

      ApolloVideoPlayer.updateIcon(this.allPlayerElements.fullscreenButton, iconMapping.fullscreen(playerWillBeInFullscreen));
    }, {passive: true});

    document.addEventListener('fullscreenchange', () => {
      this.hideAdditionalControlContainers();
      ApolloVideoPlayer.updateIcon(this.allPlayerElements.fullscreenButton, iconMapping.fullscreen(!!document.fullscreenElement));
    }, {passive: true});
  }

  private initializeProgressSlider(): void {
    const progressBarContainer = this.allPlayerElements.progressBarContainer;
    let draggingProgress = false;

    progressBarContainer.addEventListener('click', (e) => {
      this.hideAdditionalControlContainers();

      const rect = progressBarContainer.getBoundingClientRect();
      const pos = (e.clientX - rect.left) / progressBarContainer.offsetWidth;
      this._videoWrapper.seek(pos * this._videoWrapper.duration);
    }, {passive: true});

    document.addEventListener('mouseup', () => draggingProgress = false, {passive: true});

    progressBarContainer.addEventListener('mousedown', () => {
      this.hideAdditionalControlContainers();
      draggingProgress = true;
    }, {passive: true});

    document.addEventListener('mousemove', (e) => {
      if (!draggingProgress) {
        return;
      }

      const rect = progressBarContainer.getBoundingClientRect();
      const pos = (e.clientX - rect.left) / progressBarContainer.offsetWidth;
      this._videoWrapper.seek(pos * this._videoWrapper.duration);
    }, {passive: true});
  }

  private initializeVolumeSlider(): void {
    const volumeSlider = this.allPlayerElements.volumeSlider;
    let draggingVolume = false;

    this.allPlayerElements.volumeButton.addEventListener('mouseover', () => {
      this.allPlayerElements.volumeSliderContainer.classList.remove('d-none');
    }, {passive: true});
    this.allPlayerElements.controlsContainer.addEventListener('mouseleave', () => {
      this.allPlayerElements.volumeSliderContainer.classList.add('d-none');
    }, {passive: true});

    volumeSlider.addEventListener('click', (e) => {
      this.hideSettingsContainer();

      const rect = volumeSlider.getBoundingClientRect();
      this._videoWrapper.volume = (rect.bottom - e.clientY) / volumeSlider.offsetHeight;
    }, {passive: true});

    document.addEventListener('mouseup', () => draggingVolume = false, {passive: true});

    volumeSlider.addEventListener('mousedown', () => {
      this.hideSettingsContainer();
      draggingVolume = true;
    }, {passive: true});

    document.addEventListener('mousemove', (e) => {
      if (!draggingVolume) {
        return;
      }

      const rect = volumeSlider.getBoundingClientRect();
      this._videoWrapper.volume = (rect.bottom - e.clientY) / volumeSlider.offsetHeight;
    }, {passive: true});
  }

  private initializeSettingsButton(): void {
    const settingsContainer = this.allPlayerElements.settingsContainer;

    function removeAllChildren(element: HTMLElement): void {
      while (element.firstChild) {
        element.removeChild(element.firstChild);
      }
    }

    function createEntryElement(label: string, passiveClickListener: EventListenerOrEventListenerObject | null): HTMLElement {
      const option = document.createElement('span');
      option.setAttribute('role', 'button');
      option.classList.add('d-block');
      option.innerText = label.replace(' ', '\u00A0');

      if (passiveClickListener != null) {
        option.addEventListener('click', passiveClickListener, {passive: true});
      }

      return option;
    }

    function renderSettingsMenu(options: any): void {
      removeAllChildren(settingsContainer);

      if (typeof options != 'object' || Object.keys(options).length <= 0) {
        settingsContainer.appendChild(createEntryElement('No options available', null));
        return;
      }

      for (const optionLabel in options) {
        const optionValue = options[optionLabel];

        let clickListener = () => renderSettingsMenu(optionValue);
        if (typeof optionValue == 'function') {
          clickListener = () => {
            optionValue();
            settingsContainer.classList.add('d-none');
          };
        }

        settingsContainer.appendChild(createEntryElement(optionLabel, clickListener));
      }
    }

    this.allPlayerElements.settingsButton.addEventListener('click', () => {
      const containerHidden = settingsContainer.classList.toggle('d-none');
      if (containerHidden) {
        return;
      }

      this.hideVolumeSliderContainer();

      const availableSubtitles: { [label: string]: () => void } = {};
      for (let i = 0; i < this._videoElement.textTracks.length; ++i) {
        const textTrack = this._videoElement.textTracks[i];
        if (textTrack.kind !== 'subtitles' && textTrack.kind !== 'captions') {
          continue;
        }

        let entryLabel = textTrack.label;
        let entryLabelCounter = 0;
        while (entryLabel === 'None' || availableSubtitles[entryLabel] != null) {
          ++entryLabelCounter;
          entryLabel = `${textTrack.label} (${entryLabelCounter})`;
        }

        availableSubtitles[entryLabel] = () => {
          this.disableAllTextTracks();
          textTrack.mode = 'showing';
        };
      }

      if (Object.keys(availableSubtitles).length > 0) {
        availableSubtitles['None'] = () => this.disableAllTextTracks();
      }

      const availableOptions = {
        'Quality': {
          'Quelle': () => console.log('Quelle')
        },
        'Audio': {},
        'Subtitles': availableSubtitles,
        'Speed': {
          '0.5x': () => this._videoWrapper.playbackRate = 0.5,
          '0.75x': () => this._videoWrapper.playbackRate = 0.75,
          '1.0x': () => this._videoWrapper.playbackRate = 1.0,
          '1.25x': () => this._videoWrapper.playbackRate = 1.25,
          '1.50x': () => this._videoWrapper.playbackRate = 1.5,
          '2.00x': () => this._videoWrapper.playbackRate = 2.0
        }
      };

      renderSettingsMenu(availableOptions);
    });
  }

  private initializePlayerStateStorage(): void {
    const videoElementWrapper = this._videoWrapper;

    function storePlayerState() {
      localStorage.setItem('playerState', JSON.stringify({
        volume: videoElementWrapper.volume,
        muted: videoElementWrapper.muted
      }));
    }

    function restorePlayerState() {
      const playerState = JSON.parse(localStorage.getItem('playerState') ?? '{}');
      if (!playerState) {
        return;
      }

      if (typeof playerState.volume == 'number' && playerState.volume >= 0 && playerState.volume <= 1) {
        videoElementWrapper.volume = playerState.volume;
      }
      if (typeof playerState.muted == 'boolean') {
        videoElementWrapper.muted = playerState.muted;
      }
    }

    this._videoElement.addEventListener('volumechange', () => storePlayerState(), {passive: true});
    restorePlayerState();
  }

  private findAllPlayerElements(): AllPlayerElements {
    const querySelectNonNull = <T extends HTMLElement>(selector: string): T => {
      const element = this.wrappingElement.querySelector<T>(selector);
      if (!(element instanceof HTMLElement)) {
        throw new Error(`Could not find HTMLElement with selector '${selector}'`);
      }
      return element;
    };

    return {
      _videoElement: querySelectNonNull('video'),
      playerControls: querySelectNonNull('[data-video-player-element="player-controls"]'),
      controlsContainer: querySelectNonNull('[data-video-player-element="controls-container"]'),

      playButton: querySelectNonNull('[data-video-player-element="button-play"]'),
      volumeButton: querySelectNonNull('[data-video-player-element="button-volume"]'),
      settingsButton: querySelectNonNull('[data-video-player-element="button-settings"]'),
      fullscreenButton: querySelectNonNull('[data-video-player-element="button-fullscreen"]'),

      progressTimes: querySelectNonNull('[data-video-player-element="progress-times"]'),
      progressBarContainer: querySelectNonNull('[data-video-player-element="progress-bar"]'),
      progressBar: querySelectNonNull('[data-video-player-element="progress-bar"] [role="progressbar"]'),

      volumeSliderContainer: querySelectNonNull('[data-video-player-element="volume-slider-container"]'),
      volumeSlider: querySelectNonNull('[data-video-player-element="volume-slider"]'),
      volumeSliderChild: querySelectNonNull('[data-video-player-element="volume-slider-child"]'),

      settingsContainer: querySelectNonNull('[data-video-player-element="settings-container"]')
    };
  }

  private findBufferedRangeToDisplay(): { start: number, end: number } | null {
    const currentTime = this._videoWrapper.currentTime;
    const bufferedRanges = this._videoElement.buffered;
    for (let i = 0; i < bufferedRanges.length; ++i) {
      const start = bufferedRanges.start(i);
      const end = bufferedRanges.end(i);
      if (currentTime >= start && currentTime <= end) {
        return {start, end};
      }
    }
    return null;
  }

  private updateDisplayedProgress(): void {
    const bufferedRange = this.findBufferedRangeToDisplay();

    const bufferedPercentage = bufferedRange ? `${((bufferedRange.end / this._videoWrapper.duration) * 100)}%` : '0%';
    const progressPercentage = `${((this._videoWrapper.currentTime / this._videoWrapper.duration) * 100)}%`;
    this.allPlayerElements.progressBar.style.background = `linear-gradient(to right, #ea2d63 0%, #ea2d63 ${progressPercentage}, #cecece ${progressPercentage}, #cecece ${bufferedPercentage}, transparent ${bufferedPercentage}, transparent 100%)`;

    const formattedCurrentTime = ApolloVideoPlayer.formatTime(this._videoWrapper.currentTime);
    const formattedTotalTime = ApolloVideoPlayer.formatTime(this._videoWrapper.duration);
    this.allPlayerElements.progressTimes.innerHTML = `<strong>${formattedCurrentTime}</strong> / ${formattedTotalTime}`;
  }

  private updateDisplayedVolume(): void {
    this.allPlayerElements.volumeSliderChild.style.height = `${(1 - this._videoWrapper.volume) * 100}%`;
    ApolloVideoPlayer.updateIcon(this.allPlayerElements.volumeButton, iconMapping.muted(this._videoWrapper.muted));
  }

  private hideAdditionalControlContainers(): void {
    this.hideVolumeSliderContainer();
    this.hideSettingsContainer();
  }

  private hideVolumeSliderContainer(): void {
    this.allPlayerElements.volumeSliderContainer.classList.add('d-none');
  }

  private hideSettingsContainer(): void {
    this.allPlayerElements.settingsContainer.classList.add('d-none');
  }

  private static updateIcon(element: HTMLElement, iconName: string): void {
    element.innerText = iconName;
  }

  private static formatTime(time: number): string {
    if (Number.isNaN(time)) {
      return '00:00';
    }

    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time - minutes * 60);
    return [
      this.padWithZeroes(minutes.toString(), 2),
      this.padWithZeroes(seconds.toString(), 2)
    ].join(':');
  }

  private static padWithZeroes(string: string, length: number): string {
    let str = string;
    while (str.length < length) {
      str = `0${str}`;
    }
    return str;
  }
}
