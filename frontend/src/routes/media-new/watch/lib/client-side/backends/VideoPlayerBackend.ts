import type SubtitleTrack from './subtitles/SubtitleTrack';

export interface BackendOptions {
  backend?: any;

  apollo?: {
    fileUrl: string;   // TODO: Do we still need this?
  };
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

export default abstract class VideoPlayerBackend<T extends BackendOptions = BackendOptions> {
  abstract readonly shouldShowCustomControls: boolean;
  abstract readonly backendOptions: T;

  abstract playbackRate: number;
  abstract volume: number;
  abstract muted: boolean;
  abstract get currentTime(): number;
  abstract get duration(): number;
  abstract get isSeeking(): boolean;

  protected constructor() {
  }

  abstract play(): Promise<void>;
  abstract pause(): void;

  abstract seek(time: number, stillSeeking: boolean): void;
  abstract fastSeek(time: number, stillSeeking: boolean): void;

  abstract getActiveAudioTrackId(): string | null;
  abstract setActiveAudioTrack(id: string): void;
  abstract getAudioTracks(): { id: string, label: string }[];

  abstract getSubtitleTracks(): ReadonlyArray<SubtitleTrack>;
  abstract addSubtitleTrack(subtitleTrack: SubtitleTrack): void;
  abstract getActiveSubtitleTrack(): SubtitleTrack | null;
  abstract setActiveSubtitleTrack(subtitleTrackId: string | null): void;

  abstract getBufferedRanges(): { start: number, end: number }[];
  abstract getRemotelyBufferedRange(): { start: number, end: number } | null;

  abstract addPassiveEventListener(event: PlayerEvent, listener: () => void): void;

  abstract destroy(): void;
  protected abstract waitForPlayerBackendReady(): Promise<void>;
}
