'use strict';
const iconMapping = {
  playing: (isPlaying) => isPlaying ? 'pause' : 'play_arrow',
  muted: (isMuted) => isMuted ? 'volume_off' : 'volume_up',
  fullscreen: (isFullscreen) => isFullscreen ? 'fullscreen_exit' : 'fullscreen'
};

document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('[data-video-player]')
      .forEach((element) => new ApolloVideoPlayer(element));
});

class ApolloVideoPlayer {
  /**
   * @typedef {{
   *    videoElement: HTMLVideoElement,
   *    playerControls: HTMLElement,
   *    controlsContainer: HTMLElement,
   *
   *    playButton: HTMLElement,
   *    volumeButton: HTMLElement,
   *    settingsButton: HTMLElement,
   *    fullscreenButton: HTMLElement,
   *
   *    progressTimes: HTMLElement,
   *    progressBarContainer: HTMLElement,
   *    progressBar: HTMLElement,
   *
   *    volumeSliderContainer: HTMLElement,
   *    volumeSlider: HTMLElement,
   *    volumeSliderChild: HTMLElement,
   *
   *    settingsContainer: HTMLElement
   * }} AllPlayerElements
   */

  /**
   * @type {HTMLElement}
   * @private
   */
  _wrappingElement;

  /**
   * @type {AllPlayerElements}
   * @private
   */
  _allPlayerElements;

  /**
   * @param {HTMLElement} wrappingElement
   */
  constructor(wrappingElement) {
    this._wrappingElement = wrappingElement;

    this._findAllPlayerElements();
    this._initializePlayer();
  }

  togglePause() {
    if (this._allPlayerElements.videoElement.paused || this._allPlayerElements.videoElement.ended) {
      this._allPlayerElements.videoElement.play().catch(console.error);
    } else {
      this._allPlayerElements.videoElement.pause();
    }
  }

  toggleMute() {
    this._allPlayerElements.videoElement.muted = !this._allPlayerElements.videoElement.muted;
  }

  disableAllTextTracks() {
    const videoElement = this._allPlayerElements.videoElement;

    for (let i = 0; i < videoElement.textTracks.length; ++i) {
      videoElement.textTracks[i].mode = 'hidden';
    }
  }

  /** @private */
  _initializePlayer() {
    this._initializePlayerEvents();
    this._initializeProgressSlider();
    this._initializeVolumeSlider();
    this._initializeSettingsButton();

    this._initializeFullscreenCapabilities();
    this._initializePlayerStateStorage();

    this._updateDisplayedVolume();
    this._updateDisplayedProgress();
    this.disableAllTextTracks();

    this._allPlayerElements.videoElement.controls = false;
    this._allPlayerElements.playerControls.classList.remove('d-none');
  }

  /** @private */
  _initializePlayerEvents() {
    const videoElement = this._allPlayerElements.videoElement;

    const togglePauseListener = () => {
      this._hideAdditionalControlContainers();
      this.togglePause();
    };
    videoElement.addEventListener('click', togglePauseListener);
    this._allPlayerElements.playButton.addEventListener('click', togglePauseListener, {passive: true});

    videoElement.addEventListener('durationchange', () => this._updateDisplayedProgress(), {passive: true});
    videoElement.addEventListener('loadedmetadata', () => {
      this._updateDisplayedProgress();
      this.disableAllTextTracks();
    }, {passive: true});
    videoElement.addEventListener('timeupdate', () => this._updateDisplayedProgress(), {passive: true});

    this._allPlayerElements.volumeButton.addEventListener('click', () => this.toggleMute(), {passive: true});
    videoElement.addEventListener('volumechange', () => this._updateDisplayedVolume(), {passive: true});

    videoElement.addEventListener('waiting', () => this._wrappingElement.classList.add('is-loading'), {passive: true});
    videoElement.addEventListener('playing', () => this._wrappingElement.classList.remove('is-loading'), {passive: true});

    videoElement.addEventListener('seeking', () => this._wrappingElement.classList.add('is-loading'), {passive: true});
    videoElement.addEventListener('seeked', () => this._wrappingElement.classList.remove('is-loading'), {passive: true});

    videoElement.addEventListener('play', () => {
      this._wrappingElement.classList.remove('is-paused');
      ApolloVideoPlayer._updateIcon(this._allPlayerElements.playButton, iconMapping.playing(true));
    }, {passive: true});
    videoElement.addEventListener('pause', () => {
      this._wrappingElement.classList.add('is-paused');
      ApolloVideoPlayer._updateIcon(this._allPlayerElements.playButton, iconMapping.playing(false));
    }, {passive: true});
  }

  /** @private */
  _initializeFullscreenCapabilities() {
    if (document.fullscreenEnabled !== true) {
      this._allPlayerElements.fullscreenButton.setAttribute('disabled', '');
      return;
    }

    this._allPlayerElements.fullscreenButton.addEventListener('click', () => {
      this._hideAdditionalControlContainers();

      const playerWillBeInFullscreen = document.fullscreenElement === null;
      if (playerWillBeInFullscreen) {
        this._wrappingElement.requestFullscreen().catch(console.error);
      } else {
        document.exitFullscreen().catch(console.error);
      }

      ApolloVideoPlayer._updateIcon(this._allPlayerElements.fullscreenButton, iconMapping.fullscreen(playerWillBeInFullscreen));
    }, {passive: true});

    document.addEventListener('fullscreenchange', () => {
      this._hideAdditionalControlContainers();
      ApolloVideoPlayer._updateIcon(this._allPlayerElements.fullscreenButton, iconMapping.fullscreen(!!document.fullscreenElement));
    }, {passive: true});
  }

  /** @private */
  _initializeProgressSlider() {
    const videoElement = this._allPlayerElements.videoElement;
    const progressBarContainer = this._allPlayerElements.progressBarContainer;
    let draggingProgress = false;

    progressBarContainer.addEventListener('click', (e) => {
      this._hideAdditionalControlContainers();

      const rect = progressBarContainer.getBoundingClientRect();
      const pos = (e.clientX - rect.left) / progressBarContainer.offsetWidth;
      videoElement.currentTime = pos * videoElement.duration;
    }, {passive: true});

    document.addEventListener('mouseup', () => draggingProgress = false, {passive: true});

    progressBarContainer.addEventListener('mousedown', () => {
      this._hideAdditionalControlContainers();
      draggingProgress = true;
    }, {passive: true});

    document.addEventListener('mousemove', (e) => {
      if (!draggingProgress) {
        return;
      }

      const rect = progressBarContainer.getBoundingClientRect();
      const pos = (e.clientX - rect.left) / progressBarContainer.offsetWidth;
      videoElement.currentTime = pos * videoElement.duration;
    }, {passive: true});
  }

  /** @private */
  _initializeVolumeSlider() {
    const videoElement = this._allPlayerElements.videoElement;
    const volumeSlider = this._allPlayerElements.volumeSlider;
    let draggingVolume = false;

    this._allPlayerElements.volumeButton.addEventListener('mouseover', () => {
      this._allPlayerElements.volumeSliderContainer.classList.remove('d-none');
    }, {passive: true});
    this._allPlayerElements.controlsContainer.addEventListener('mouseleave', () => {
      this._allPlayerElements.volumeSliderContainer.classList.add('d-none');
    }, {passive: true});

    volumeSlider.addEventListener('click', (e) => {
      this._hideSettingsContainer();

      const rect = volumeSlider.getBoundingClientRect();
      videoElement.volume = (rect.bottom - e.clientY) / volumeSlider.offsetHeight;
    }, {passive: true});

    document.addEventListener('mouseup', () => draggingVolume = false, {passive: true});

    volumeSlider.addEventListener('mousedown', () => {
      this._hideSettingsContainer();
      draggingVolume = true;
    }, {passive: true});

    document.addEventListener('mousemove', (e) => {
      if (!draggingVolume) {
        return;
      }

      const rect = volumeSlider.getBoundingClientRect();
      videoElement.volume = (rect.bottom - e.clientY) / volumeSlider.offsetHeight;
    }, {passive: true});
  }

  /** @private */
  _initializeSettingsButton() {
    const videoElement = this._allPlayerElements.videoElement;
    const settingsContainer = this._allPlayerElements.settingsContainer;

    function removeAllChildren(element) {
      while (element.firstChild) {
        element.removeChild(element.firstChild);
      }
    }

    function createEntryElement(label, passiveClickListener) {
      const option = document.createElement('span');
      option.setAttribute('role', 'button');
      option.classList.add('d-block');
      option.innerText = label.replace(' ', '\u00A0');

      if (passiveClickListener != null) {
        option.addEventListener('click', passiveClickListener, {passive: true});
      }

      return option;
    }

    function renderSettingsMenu(options) {
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

    this._allPlayerElements.settingsButton.addEventListener('click', () => {
      const containerHidden = settingsContainer.classList.toggle('d-none');
      if (containerHidden) {
        return;
      }

      this._hideVolumeSliderContainer();

      const availableSubtitles = {};
      for (let i = 0; i < videoElement.textTracks.length; ++i) {
        const textTrack = videoElement.textTracks[i];
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
          '0.5x': () => videoElement.playbackRate = 0.5,
          '0.75x': () => videoElement.playbackRate = 0.75,
          '1.0x': () => videoElement.playbackRate = 1.0,
          '1.25x': () => videoElement.playbackRate = 1.25,
          '1.50x': () => videoElement.playbackRate = 1.5,
          '2.00x': () => videoElement.playbackRate = 2.0
        }
      };

      renderSettingsMenu(availableOptions);
    });
  }

  /** @private */
  _initializePlayerStateStorage() {
    const videoElement = this._allPlayerElements.videoElement;

    function storePlayerState() {
      localStorage.setItem('playerState', JSON.stringify({
        volume: videoElement.volume,
        muted: videoElement.muted
      }));
    }

    function restorePlayerState() {
      const playerState = JSON.parse(localStorage.getItem('playerState'));
      if (!playerState) {
        return;
      }

      if (typeof playerState.volume == 'number' && playerState.volume >= 0 && playerState.volume <= 1) {
        videoElement.volume = playerState.volume;
      }
      if (typeof playerState.muted == 'boolean') {
        videoElement.muted = playerState.muted;
      }
    }

    videoElement.addEventListener('volumechange', () => storePlayerState(), {passive: true});
    restorePlayerState();
  }

  /** @private */
  _findAllPlayerElements() {
    const allPlayerElements = {
      videoElement: this._wrappingElement.querySelector('video'),
      playerControls: this._wrappingElement.querySelector('[data-video-player-element="player-controls"]'),
      controlsContainer: this._wrappingElement.querySelector('[data-video-player-element="controls-container"]'),

      playButton: this._wrappingElement.querySelector('[data-video-player-element="button-play"]'),
      volumeButton: this._wrappingElement.querySelector('[data-video-player-element="button-volume"]'),
      settingsButton: this._wrappingElement.querySelector('[data-video-player-element="button-settings"]'),
      fullscreenButton: this._wrappingElement.querySelector('[data-video-player-element="button-fullscreen"]'),

      progressTimes: this._wrappingElement.querySelector('[data-video-player-element="progress-times"]'),
      progressBarContainer: this._wrappingElement.querySelector('[data-video-player-element="progress-bar"]'),
      progressBar: this._wrappingElement.querySelector('[data-video-player-element="progress-bar"] [role="progressbar"]'),

      volumeSliderContainer: this._wrappingElement.querySelector('[data-video-player-element="volume-slider-container"]'),
      volumeSlider: this._wrappingElement.querySelector('[data-video-player-element="volume-slider"]'),
      volumeSliderChild: this._wrappingElement.querySelector('[data-video-player-element="volume-slider-child"]'),

      settingsContainer: this._wrappingElement.querySelector('[data-video-player-element="settings-container"]')
    };

    for (const key in allPlayerElements) {
      if (!allPlayerElements.hasOwnProperty(key)) {
        continue;
      }

      if (!(allPlayerElements[key] instanceof HTMLElement)) {
        throw new Error(`Could not find required element '${key}'`);
      }
    }

    this._allPlayerElements = allPlayerElements;
  }

  /** @private */
  _updateDisplayedProgress() {
    const videoElement = this._allPlayerElements.videoElement;

    this._allPlayerElements.progressBar.style.width = `${(videoElement.currentTime / videoElement.duration) * 100}%`;

    const formattedCurrentTime = ApolloVideoPlayer._formatTime(videoElement.currentTime);
    const formattedTotalTime = ApolloVideoPlayer._formatTime(videoElement.duration);
    this._allPlayerElements.progressTimes.innerHTML = `<strong>${formattedCurrentTime}</strong> / ${formattedTotalTime}`;
  }

  /** @private */
  _updateDisplayedVolume() {
    const videoElement = this._allPlayerElements.videoElement;

    this._allPlayerElements.volumeSliderChild.style.height = `${(1 - videoElement.volume) * 100}%`;
    ApolloVideoPlayer._updateIcon(this._allPlayerElements.volumeButton, iconMapping.muted(videoElement.muted));
  }

  /** @private */
  _hideAdditionalControlContainers() {
    this._hideVolumeSliderContainer();
    this._hideSettingsContainer();
  }

  /** @private */
  _hideVolumeSliderContainer() {
    this._allPlayerElements.volumeSliderContainer.classList.add('d-none');
  }

  /** @private */
  _hideSettingsContainer() {
    this._allPlayerElements.settingsContainer.classList.add('d-none');
  }

  /**
   * @param {HTMLElement} element
   * @param {string} iconName
   * @private
   */
  static _updateIcon(element, iconName) {
    element.innerText = iconName;
  }

  /**
   * @param {number} time
   * @return {string}
   * @private
   */
  static _formatTime(time) {
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time - minutes * 60);
    return [
      this._pad(minutes.toString(), 2),
      this._pad(seconds.toString(), 2)
    ].join(':');
  }

  /**
   * @param {string} string
   * @param {number} length
   * @return {string}
   * @private
   */
  static _pad(string, length) {
    let str = string;
    while (str.length < length) {
      str = `0${str}`;
    }
    return str;
  }
}
