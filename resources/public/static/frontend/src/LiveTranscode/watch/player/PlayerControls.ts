import { formatPlaybackTime } from '../PlaybackTimeFormatter';
import PlayerController from './PlayerController';
import PlayerState from './PlayerState';

const iconMapping = {
  paused: (isPaused: boolean) => isPaused ? 'play_arrow' : 'pause',
  muted: (isMuted: boolean) => isMuted ? 'volume_off' : 'volume_up',
  fullscreen: (isFullscreen: boolean) => isFullscreen ? 'fullscreen_exit' : 'fullscreen'
};

export default class PlayerControls {
  private static readonly localStorageKey = 'apollo-video-player-state_wrappers';

  private readonly videoPlayerWrapper: HTMLElement;
  private readonly controlsContainer: HTMLElement;
  private readonly videoPlayerContainer: HTMLElement;
  private readonly playerState: PlayerState;
  private readonly playerController: PlayerController;

  private readonly actualPlayerElementControlsContainer: HTMLElement;

  private readonly playPauseButton: HTMLElement;

  private readonly progressBarTimes: HTMLElement;
  private readonly progressBarContainer: HTMLElement;
  private readonly progressBar: HTMLElement;

  private readonly volumeSliderContainer: HTMLElement;
  private readonly volumeSlider: HTMLElement;
  private readonly volumeSliderChild: HTMLElement;
  private readonly volumeButton: HTMLElement;

  private readonly settingsContainer: HTMLElement;
  private readonly settingsButton: HTMLElement;

  private readonly fullscreenButton: HTMLElement;

  private enabled = true;

  constructor(videoPlayerWrapper: HTMLElement, controlsContainer: HTMLElement, videoPlayerContainer: HTMLElement, playerState: PlayerState, playerController: PlayerController) {
    this.videoPlayerWrapper = videoPlayerWrapper;
    this.controlsContainer = controlsContainer;
    this.videoPlayerContainer = videoPlayerContainer;
    this.playerState = playerState;
    this.playerController = playerController;

    this.actualPlayerElementControlsContainer = this.controlsContainer.querySelector('[data-video-player-element="controls-container"]')!;

    this.playPauseButton = this.controlsContainer.querySelector('[data-video-player-element="button-play"]')!;

    this.progressBarTimes = this.controlsContainer.querySelector('[data-video-player-element="progress-times"]')!;
    this.progressBarContainer = this.controlsContainer.querySelector('[data-video-player-element="progress-bar"]')!;
    this.progressBar = this.progressBarContainer.querySelector('[role="progressbar"]')!;

    this.volumeSliderContainer = this.controlsContainer.querySelector('[data-video-player-element="volume-slider-container"]')!;
    this.volumeSlider = this.controlsContainer.querySelector('[data-video-player-element="volume-slider"]')!;
    this.volumeSliderChild = this.controlsContainer.querySelector('[data-video-player-element="volume-slider-child"]')!;
    this.volumeButton = this.controlsContainer.querySelector('[data-video-player-element="button-volume"]')!;

    this.settingsContainer = this.controlsContainer.querySelector('[data-video-player-element="settings-container"]')!;
    this.settingsButton = this.controlsContainer.querySelector('[data-video-player-element="button-settings"]')!;

    this.fullscreenButton = this.controlsContainer.querySelector('[data-video-player-element="button-fullscreen"]')!;

    this.registerEventListeners();

    this.setEnabled(false);
    this.updateUserInterface();
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;

    if (this.enabled) {
      this.videoPlayerWrapper.style.cursor = '';
      this.controlsContainer.classList.remove('d-none');
      return;
    }

    this.controlsContainer.classList.add('d-none');
    this.videoPlayerWrapper.style.cursor = 'none';
  }

  updateUserInterface(): void {
    this.playPauseButton.innerText = iconMapping.paused(this.playerState.paused);

    this.updateDisplayedTime();
    this.updateDisplayedVolume();
  }

  updateDisplayedTime(): void {
    const currentTime = this.playerState.currentTime;
    const videoDuration = this.playerState.duration;
    const bufferedRange = this.findBufferedRangeToDisplay();

    const bufferedPercentage = bufferedRange ? `${((bufferedRange.end / videoDuration) * 100)}%` : '0%';
    const progressPercentage = `${((currentTime / videoDuration) * 100)}%`;
    this.progressBar.style.background = `linear-gradient(to right, #ea2d63 0%, #ea2d63 ${progressPercentage}, #cecece ${progressPercentage}, #cecece ${bufferedPercentage}, transparent ${bufferedPercentage}, transparent 100%)`;

    const formattedCurrentTime = formatPlaybackTime(currentTime, (videoDuration > 60 * 60));
    const formattedTotalTime = formatPlaybackTime(videoDuration);
    this.progressBarTimes.innerHTML = `<strong>${formattedCurrentTime}</strong> / ${formattedTotalTime}`;

    this.progressBarTimes.title = `Seconds in buffer: ${((bufferedRange?.end ?? currentTime) - currentTime).toFixed(0)}`;
  }

  updateDisplayedVolume(): void {
    this.volumeButton.innerText = iconMapping.muted(this.playerState.muted);
    this.volumeSliderChild.style.height = `${(1 - this.playerState.volume) * 100}%`;
  }

  // TODO: rename to PlayerSettings or something to avoid confusion with the 'actual' player state (currentTime, paused, etc.)
  applyVideoPlayerStateFromLocalStorage(): void {
    const storedVideoPlayer = JSON.parse(localStorage.getItem(PlayerControls.localStorageKey) ?? '{}');
    if (!storedVideoPlayer) {
      return;
    }

    if (typeof storedVideoPlayer.volume == 'number' && storedVideoPlayer.volume >= 0 && storedVideoPlayer.volume <= 1) {
      this.playerState.volume = storedVideoPlayer.volume;
    }
    if (typeof storedVideoPlayer.muted == 'boolean') {
      this.playerState.muted = storedVideoPlayer.muted;
    }
  }

  private registerEventListeners(): void {
    this.registerPlayerStateEventListeners();

    this.registerFullscreenEventListeners();
    this.registerSeekEventListeners();
    this.registerSettingsMenuEventListeners();
    this.registerVolumeSliderEventListeners();

    this.registerEventsForControlsVisibility();
  }

  private registerPlayerStateEventListeners(): void {
    this.playerState.on('stateChanged', () => this.updateUserInterface());
    this.playerState.on('timeChanged', () => this.updateDisplayedTime());

    this.playerState.on('volumeChanged', () => {
      this.updateDisplayedVolume();

      if (this.playerState.isNativeReferenceElement()) {
        localStorage.setItem(PlayerControls.localStorageKey, JSON.stringify({
          volume: this.playerState.volume,
          muted: this.playerState.muted
        }));
      }
    });

    this.videoPlayerWrapper.addEventListener('click', () => {
      this.playerController.togglePlay().catch(console.error);
    }, {passive: true});
    this.playPauseButton.addEventListener('click', () => {
      this.playerController.togglePlay().catch(console.error);
    }, {passive: true});

    this.volumeButton.addEventListener('click', () => {
      this.playerState.muted = !this.playerState.muted;
    }, {passive: true});
  }

  private registerFullscreenEventListeners(): void {
    if (!document.fullscreenEnabled) {
      this.fullscreenButton.setAttribute('disabled', '');
      return;
    }

    this.fullscreenButton.addEventListener('click', () => {
      const playerWillBeInFullscreen = document.fullscreenElement === null;
      if (playerWillBeInFullscreen) {
        this.playerState.requestFullscreen().catch(console.error);
        return;
      }

      document.exitFullscreen().catch(console.error);
    }, {passive: true});

    document.addEventListener('fullscreenchange', () => {
      this.fullscreenButton.innerText = iconMapping.fullscreen(!!document.fullscreenElement);
    }, {passive: true});
  }

  private registerSeekEventListeners(): void {
    const progressBarContainer = this.progressBarContainer;
    let draggingProgress = false;

    this.progressBarContainer.addEventListener('click', (event) => {
      const rect = this.progressBarContainer.getBoundingClientRect();
      const pos = (event.clientX - rect.left) / this.progressBarContainer.offsetWidth;

      this.playerController.seek(pos * this.playerState.duration).catch(console.error);
    }, {passive: true});


    document.addEventListener('mouseup', () => draggingProgress = false, {passive: true});

    progressBarContainer.addEventListener('mousedown', () => {
      // this.hideAdditionalControlContainers();
      draggingProgress = true;
    }, {passive: true});

    document.addEventListener('mousemove', (e) => {
      if (!draggingProgress) {
        return;
      }

      const rect = progressBarContainer.getBoundingClientRect();
      const pos = (e.clientX - rect.left) / progressBarContainer.offsetWidth;
      this.playerController.seek(pos * this.playerState.duration).catch(console.error);
    }, {passive: true});
  }

  private registerVolumeSliderEventListeners(): void {
    const volumeSlider = this.volumeSlider;
    let draggingVolume = false;

    this.volumeButton.addEventListener('mouseover', () => {
      this.hideSettingsContainer();
      this.volumeSliderContainer.classList.remove('d-none');
    }, {passive: true});
    this.controlsContainer.addEventListener('mouseleave', () => {
      this.hideVolumeSliderContainer();
    }, {passive: true});

    volumeSlider.addEventListener('click', (event) => {
      this.hideSettingsContainer();

      const rect = volumeSlider.getBoundingClientRect();
      this.playerState.volume = (rect.bottom - event.clientY) / volumeSlider.offsetHeight;
    }, {passive: true});

    document.addEventListener('mouseup', () => draggingVolume = false, {passive: true});

    volumeSlider.addEventListener('mousedown', () => {
      this.hideSettingsContainer();
      draggingVolume = true;
    }, {passive: true});

    document.addEventListener('mousemove', (event) => {
      if (!draggingVolume) {
        return;
      }

      const rect = volumeSlider.getBoundingClientRect();
      const newVolume = (rect.bottom - event.clientY) / volumeSlider.offsetHeight;
      if (newVolume >= 0 && newVolume <= 1) {
        this.playerState.volume = newVolume;
      }
    }, {passive: true});
  }

  private registerEventsForControlsVisibility(): void {
    const controlsContainer = this.controlsContainer;
    const actualPlayerElementControlsContainer = this.actualPlayerElementControlsContainer;
    const videoPlayerWrapper = this.videoPlayerWrapper;

    let controlsVisible = true;
    let controlsTimeout: number | null = null;

    const areControlsEnabled = this.isEnabled.bind(this);

    function showControls(): void {
      if (controlsVisible || !areControlsEnabled()) {
        return;
      }

      controlsVisible = true;
      videoPlayerWrapper.style.cursor = '';
      controlsContainer.classList.remove('d-none');
    }

    const playerState = this.playerState;
    const hideAdditionalControlContainers = this.hideAdditionalControlContainers.bind(this);

    // const isPlayerLoading = () => this.videoPlayerWrapper.classList.contains('is-loading');

    function hideControls(mousePosition: { x: number, y: number }): void {
      if (!controlsVisible) {
        return;
      }
      if (playerState.paused /* || playerState.ended || isPlayerLoading() */) {
        return;
      }

      const controlsContainerRect = actualPlayerElementControlsContainer.getBoundingClientRect();
      const clientX = mousePosition.x;
      const clientY = mousePosition.y;

      const isMouseInsideControlsContainer = clientX >= controlsContainerRect.left &&
          clientX <= controlsContainerRect.right &&
          clientY >= controlsContainerRect.top &&
          clientY <= controlsContainerRect.bottom;
      if (isMouseInsideControlsContainer) {
        return;
      }

      controlsVisible = false;
      videoPlayerWrapper.style.cursor = 'none';
      controlsContainer.classList.add('d-none');
      hideAdditionalControlContainers();
    }

    function resetControlsTimeout(mousePosition: { x: number, y: number }): void {
      if (controlsTimeout != null) {
        clearTimeout(controlsTimeout);
      }
      controlsTimeout = window.setTimeout(() => hideControls(mousePosition), 2000);
    }

    this.videoPlayerContainer.addEventListener('mousemove', (event) => {
      showControls();
      resetControlsTimeout({x: event.clientX, y: event.clientY});
    });

    this.videoPlayerContainer.addEventListener('mouseleave', (event) => {
      hideControls({x: event.clientX, y: event.clientY});
    });

    this.videoPlayerContainer.addEventListener('click', (event) => {
      showControls();
      resetControlsTimeout({x: event.clientX, y: event.clientY});
    });

    this.playerState.on('pauseChanged', () => {
      showControls();
      resetControlsTimeout({x: 0, y: 0});
    });
    this.playerState.on('seek', () => {
      showControls();
      resetControlsTimeout({x: 0, y: 0});
    });
  }

  private registerSettingsMenuEventListeners(): void {
    const settingsContainer = this.settingsContainer;

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

    this.settingsButton.addEventListener('click', () => {
      const containerHidden = settingsContainer.classList.toggle('d-none');
      if (containerHidden) {
        return;
      }

      this.hideVolumeSliderContainer();

      const textTracks = this.playerState.getTextTracks();
      const disableAllTextTracks = () => {
        for (const textTrack of textTracks) {
          textTrack.mode = 'disabled';
        }
      };

      const availableSubtitles: { [label: string]: () => void } = {};
      for (const textTrack of textTracks) {
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
          disableAllTextTracks();
          textTrack.mode = 'showing';
        };
      }

      if (Object.keys(availableSubtitles).length > 0) {
        availableSubtitles['None'] = () => disableAllTextTracks();
      }

      const availableOptions = {
        'Quality': {
          'Quelle': () => console.log('Quelle')
        },
        'Audio': {},
        'Subtitles': availableSubtitles,
        'Speed': {
          '0.5x': () => this.playerController.playbackRate = 0.5,
          '0.75x': () => this.playerController.playbackRate = 0.75,
          '1.0x': () => this.playerController.playbackRate = 1.0,
          '1.25x': () => this.playerController.playbackRate = 1.25,
          '1.50x': () => this.playerController.playbackRate = 1.5,
          '2.00x': () => this.playerController.playbackRate = 2.0
        }
      };

      renderSettingsMenu(availableOptions);
    });
  }

  private hideAdditionalControlContainers(): void {
    this.hideVolumeSliderContainer();
    this.hideSettingsContainer();
  }

  private hideVolumeSliderContainer(): void {
    this.volumeSliderContainer.classList.add('d-none');
  }

  private hideSettingsContainer(): void {
    this.settingsContainer.classList.add('d-none');
  }

  private findBufferedRangeToDisplay(): { start: number, end: number } | null {
    const currentTime = this.playerState.currentTime;
    const bufferedRanges = this.playerState.getBufferedRanges();

    for (const {start, end} of bufferedRanges) {
      if (currentTime >= start && currentTime <= end) {
        return {start, end};
      }
    }
    return null;
  }
}
