import { EventEmitter } from 'events';
import PlayerWrapper, { WrapperEvents } from './state_wrappers/PlayerWrapper';

export default class PlayerState extends EventEmitter {
  private readonly playerWithControlsContainer: HTMLElement;

  private referenceElement: PlayerWrapper | null = null;

  constructor(playerWithControlsContainer: HTMLElement) {
    super();

    this.playerWithControlsContainer = playerWithControlsContainer;
  }

  get currentTime(): number {
    if (this.referenceElement == null) {
      return 0;
    }
    return this.getReferenceElement().currentTime;
  }

  get duration(): number {
    if (this.referenceElement == null) {
      return 0;
    }
    return this.getReferenceElement().duration;
  }

  get playbackRate(): number {
    if (this.referenceElement == null) {
      return 1;
    }
    return this.getReferenceElement().playbackRate;
  }

  set playbackRate(playbackRate: number) {
    if (this.referenceElement == null) {
      return;
    }
    this.getReferenceElement().playbackRate = playbackRate;
  }

  get paused(): boolean {
    if (this.referenceElement == null) {
      return true;
    }
    return this.getReferenceElement().paused;
  }

  get muted(): boolean {
    if (this.referenceElement == null) {
      return true;
    }
    return this.getReferenceElement().muted;
  }

  set muted(muted: boolean) {
    if (this.referenceElement == null) {
      return;
    }
    this.getReferenceElement().muted = muted;
  }

  get volume(): number {
    if (this.referenceElement == null) {
      return 1;
    }

    return this.getReferenceElement().volume;
  }

  set volume(volume: number) {
    if (this.referenceElement == null) {
      return;
    }
    this.getReferenceElement().volume = volume;
  }

  async play(): Promise<void> {
    await this.getReferenceElement().play();
  }

  pause(): void {
    this.getReferenceElement().pause();
  }

  async togglePlay(): Promise<void> {
    if (this.paused) {
      await this.play();
    } else {
      this.pause();
    }
  }

  async seek(time: number): Promise<void> {
    this.getReferenceElement().currentTime = time;
  }

  getBufferedRanges(): { start: number, end: number }[] {
    return this.referenceElement?.getBufferedRanges() ?? [];
  }

  requestFullscreen(): Promise<void> {
    return this.playerWithControlsContainer.requestFullscreen();
  }

  on(event: 'stateChanged' | 'timeChanged' | 'volumeChanged', listener: () => void): this {
    return super.on(event, listener);
  }

  _setReferenceElement(referenceElement: PlayerWrapper | null) {
    this.referenceElement = referenceElement;
    this.emitStateChanged();

    this.registerEventsOnReferenceElement();
  }

  _prepareDestroyOfReferenceElement(): void {
    this.referenceElement?.prepareDestroy();
  }

  private registerEventsOnReferenceElement(): void {
    if (this.referenceElement == null) {
      return;
    }

    const eventsToEmitStateChanged: WrapperEvents[] = [
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

    const eventsToEmitTimeChanged: WrapperEvents[] = [
      'timeupdate',
      'durationchange',
      'progress',
      'seeking',
      'seeked'
    ];
    for (const event of eventsToEmitTimeChanged) {
      this.referenceElement.addPassiveEventListener(event, () => this.emit('timeChanged'));
    }

    this.referenceElement.addPassiveEventListener('volumechange', () => this.emit('volumeChanged'));
  }

  private getReferenceElement(): PlayerWrapper {
    if (this.referenceElement == null) {
      throw new Error('No reference element available right now');
    }

    return this.referenceElement;
  }

  private emitStateChanged(): void {
    this.emit('stateChanged');
  }
}
