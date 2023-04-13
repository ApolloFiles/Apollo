export type PlayerEvents = 'loadedmetadata'
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

export default abstract class PlayerElement {
  protected readonly container: HTMLElement;

  protected constructor(container: HTMLElement) {
    this.container = container;
  }

  abstract get currentTime(): number;
  abstract set currentTime(time: number);

  abstract get duration(): number;

  abstract get playbackRate(): number;
  abstract set playbackRate(playbackRate: number);

  abstract get muted(): boolean;
  abstract set muted(muted: boolean);

  abstract get volume(): number;
  abstract set volume(volume: number);

  abstract get paused(): boolean;

  abstract loadMedia(src?: string, poster?: string): Promise<void>;

  abstract destroyPlayer(): void;

  abstract play(): Promise<void>;

  abstract pause(): void;

  abstract getTextTracks(): TextTrack[];

  abstract getBufferedRanges(): { start: number, end: number }[];

  abstract addPassiveEventListener(event: PlayerEvents, listener: () => void): void;

  protected static async loadJs(url: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const scriptElement = document.createElement('script');
      scriptElement.setAttribute('src', url);
      scriptElement.addEventListener('load', () => resolve());
      scriptElement.addEventListener('error', () => reject(new Error('Unable to load script: ' + url)));

      document.querySelector('head')!.appendChild(scriptElement);
    });
  }
}
