export type WrapperEvents = 'loadedmetadata'
    | 'play'
    | 'pause'
    | 'ended'

    | 'volumechange'

    | 'timeupdate'
    | 'durationchange'
    | 'progress'
    | 'ratechange'

    | 'seeking'
    | 'seeked';

// TODO: Have (static) method to create a PlayerWrapper or maybe only HTMLElement that another component can add to the DOM when ready/needed
// TODO: Move loading of *src* to PlayerWrapper logic (so HLSPlayerWrapper can init and destroy itself and the requested media (while extending the *native* Wrapper) - Maybe just constructor/static-create-method that takes the src; Not sure)
// TODO: LiveTranscodeWrapper that emits a 'durationchange' event when the duration changes (so the player can update the duration)
//         set duration(duration: number) {
//           const emitEvent = this.durationValue !== duration;
//           this.durationValue = duration;
//           if (emitEvent) {
//             const durationChangeEvent = new Event('durationchange');
//             this.videoElement.dispatchEvent(durationChangeEvent);
//           }
//         }
export default interface PlayerWrapper {
  get currentTime(): number;
  set currentTime(time: number);

  get duration(): number;

  get playbackRate(): number;
  set playbackRate(playbackRate: number);

  get muted(): boolean;
  set muted(muted: boolean);

  get volume(): number;
  set volume(volume: number);

  get paused(): boolean;

  play(): Promise<void>;
  pause(): void;

  getBufferedRanges(): { start: number, end: number }[];

  prepareDestroy(): void;

  addPassiveEventListener(event: WrapperEvents, listener: () => void): void;
}
