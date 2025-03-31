export interface BackendOptions {
  backend?: any;
}

export type PlayerEvent = 'loadedmetadata'
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

export default abstract class VideoPlayerBackend {
  abstract currentTime: number;
  abstract volume: number;
  abstract muted: boolean;
  abstract get duration(): number;

  protected constructor() {
  }

  abstract play(): Promise<void>;
  abstract pause(): void;

  abstract getAudioTracks(): { id: string, label: string }[];
  abstract getSubtitleTracks(): { id: string, label: string }[];

  abstract getBufferedRanges(): { start: number, end: number }[];
  abstract getRemotelyBufferedRange(): { start: number, end: number } | null;

  abstract addPassiveEventListener(event: PlayerEvent, listener: () => void): void;

  abstract destroy(): void;
  protected abstract waitForPlayerBackendReady(): Promise<void>;
}
