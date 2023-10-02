import {EventEmitter} from 'events';
import NativePlayerElement from './PlayerElements/NativePlayerElement';
import PlayerElement, {AudioTrack, PlayerEvents} from './PlayerElements/PlayerElement';
import SubtitleTrack from './subtitles/SubtitleTrack';

export default class PlayerState extends EventEmitter {
  private readonly playerWithControlsContainer: HTMLElement;

  private referenceElement: PlayerElement | null = null;

  constructor(playerWithControlsContainer: HTMLElement) {
    super();

    this.playerWithControlsContainer = playerWithControlsContainer;
  }

  get currentTime(): number {
    if (this.referenceElement == null) {
      return 0;
    }
    return this._getReferenceElement().currentTime;
  }

  get duration(): number {
    if (this.referenceElement == null) {
      return 0;
    }
    return this._getReferenceElement().duration;
  }

  get playbackRate(): number {
    if (this.referenceElement == null) {
      return 1;
    }
    return this._getReferenceElement().playbackRate;
  }

  set playbackRate(playbackRate: number) {
    if (this.referenceElement == null) {
      return;
    }
    this._getReferenceElement().playbackRate = playbackRate;
  }

  get paused(): boolean {
    if (this.referenceElement == null) {
      return true;
    }
    return this._getReferenceElement().paused;
  }

  get muted(): boolean {
    if (this.referenceElement == null) {
      return true;
    }
    return this._getReferenceElement().muted;
  }

  set muted(muted: boolean) {
    if (this.referenceElement == null) {
      return;
    }
    this._getReferenceElement().muted = muted;
  }

  get volume(): number {
    if (this.referenceElement == null) {
      return 1;
    }

    return this._getReferenceElement().volume;
  }

  set volume(volume: number) {
    if (this.referenceElement == null) {
      return;
    }
    this._getReferenceElement().volume = volume;
  }

  async play(): Promise<void> {
    await this._getReferenceElement().play();
  }

  pause(): void {
    this._getReferenceElement().pause();
  }

  async togglePlay(): Promise<void> {
    if (this.paused) {
      await this.play();
    } else {
      this.pause();
    }
  }

  async seek(time: number): Promise<void> {
    this._getReferenceElement().currentTime = time;
  }

  getAudioTracks(): AudioTrack[] {
    return this.referenceElement?.getAudioTracks() ?? [];
  }

  setAudioTrack(track: AudioTrack): void {
    this.referenceElement?.setAudioTrack(track);
  }

  getSubtitleTracks(): SubtitleTrack[] {
    return this.referenceElement?.getSubtitleTracks() ?? [];
  }

  getBufferedRanges(): { start: number, end: number }[] {
    return this.referenceElement?.getBufferedRanges() ?? [];
  }

  requestFullscreen(): Promise<void> {
    return this.playerWithControlsContainer.requestFullscreen();
  }

  toggleFullscreen(): Promise<void> {
    if (document.fullscreenElement == null) {
      return this.requestFullscreen();
    } else {
      return document.exitFullscreen();
    }
  }

  on(event: 'pauseChanged' | 'stateChanged' | 'timeChanged' | 'volumeChanged' | 'seek', listener: () => void): this {
    return super.on(event, listener);
  }

  _setReferenceElement(referenceElement: PlayerElement | null) {
    this.referenceElement = referenceElement;
    this.emitStateChanged();

    this.registerEventsOnReferenceElement();
  }

  _prepareDestroyOfReferenceElement(): void {
    this.referenceElement?.destroyPlayer();
  }

  private registerEventsOnReferenceElement(): void {
    if (this.referenceElement == null) {
      return;
    }

    const eventsToEmitPauseChanged: PlayerEvents[] = ['play', 'pause'];
    for (const event of eventsToEmitPauseChanged) {
      this.referenceElement.addPassiveEventListener(event, () => this.emit('pauseChanged'));
    }

    const eventsToEmitStateChanged: PlayerEvents[] = [
      'play',
      'pause',
      'loadedmetadata',
      'ended',
      'volumechange',
      'ratechange'
    ];
    for (const event of eventsToEmitStateChanged) {
      this.referenceElement.addPassiveEventListener(event, () => this.emitStateChanged());
    }

    const eventsToEmitTimeChanged: PlayerEvents[] = [
      'timeupdate',
      'durationchange',
      'progress',
      'seeking',
      'seeked'
    ];
    for (const event of eventsToEmitTimeChanged) {
      this.referenceElement.addPassiveEventListener(event, () => this.emit('timeChanged'));
    }

    const eventsToEmitSeeked: PlayerEvents[] = [
      'seeking',
      'seeked'
    ];
    for (const event of eventsToEmitSeeked) {
      this.referenceElement.addPassiveEventListener(event, () => this.emit('seek'));
    }

    this.referenceElement.addPassiveEventListener('volumechange', () => this.emit('volumeChanged'));
  }

  _getReferenceElement(): PlayerElement {
    if (this.referenceElement == null) {
      throw new Error('No reference element available right now');
    }

    return this.referenceElement;
  }

  isNativeReferenceElement(): boolean {
    return this.referenceElement instanceof NativePlayerElement;
  }

  private emitStateChanged(): void {
    this.emit('stateChanged');
  }
}
