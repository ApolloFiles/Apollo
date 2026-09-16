import Hls, { type ErrorData, type HlsConfig, type InFlightFragments } from 'hls.js';
import HtmlVideoPlayerBackend, { type HtmlVideoPlayerBackendOptions } from './HtmlVideoPlayerBackend';
import HlsSubtitleTrack from './subtitles/HlsSubtitleTrack';
import type { AudioTrackInfo, PlaybackConnectionState } from './VideoPlayerBackend';

export interface HlsVideoBackendOptions extends HtmlVideoPlayerBackendOptions {
  backend: HtmlVideoPlayerBackendOptions['backend'] & {
    hlsConfig?: Partial<HlsConfig>,

    /** ISO-639 language to start playback with; ignored when no audio track matches it. */
    preferredAudioLanguage?: string,
  };
}

type PlaybackIssue = {
  timestamp: string,
  lastTimestamp: string,
  count: number,
  type: string,
  details: string,
  fatal: boolean,
  info: Record<string, unknown>,
};

export default class HlsVideoBackend<T extends HlsVideoBackendOptions = HlsVideoBackendOptions> extends HtmlVideoPlayerBackend<T> {
  private static readonly MAX_REMEMBERED_ISSUES = 25;
  private static readonly STALL_TOLERANCE_IN_MILLIS = 15_000;
  private static readonly MEDIA_ERROR_RECOVERY_COOLDOWN_IN_MILLIS = 5_000;
  private static readonly MAX_MEDIA_ERROR_RECOVERIES = 5;
  private static readonly RECONNECT_BASE_DELAY_IN_MILLIS = 1_000;
  private static readonly RECONNECT_MAX_DELAY_IN_MILLIS = 30_000;

  protected readonly hls: Hls;
  private waitForAudioBufferFlush = false;

  private readonly playbackIssues: PlaybackIssue[] = [];
  private readonly stallWatchdogIntervalId: number;
  private readonly onBrowserBackOnline = () => this.retryNow();
  private lastObservedTime = -1;
  private lastTimeAdvancedAt = performance.now();
  private stallReported = false;
  private lastMediaErrorRecoveryAt: number | null = null;
  private mediaErrorRecoveries = 0;

  private currentConnectionState: PlaybackConnectionState = 'connected';
  private unrecoverableReason: string | null = null;
  private reconnectTimeoutId: number | null = null;
  private reconnectAttempts = 0;
  private lastFragmentLoadedAt = performance.now();

  protected constructor(container: HTMLDivElement, options: T) {
    super(container, options);

    const hlsConfig: Partial<HlsConfig> = { ...options.backend.hlsConfig };
    if (options.backend.preferredAudioLanguage != null) {
      hlsConfig.audioPreference = { lang: options.backend.preferredAudioLanguage };
    }

    this.hls = new Hls(hlsConfig);
    this.hls.attachMedia(this.videoElement);

    this.hls.on(Hls.Events.ERROR, (_event, data) => this.onHlsError(data));
    this.hls.on(Hls.Events.FRAG_LOADED, () => this.onFragmentLoaded());
    this.hls.on(Hls.Events.AUDIO_TRACK_SWITCHED, () => this.onAudioTrackSwitched());
    this.hls.once(Hls.Events.MANIFEST_LOADED, () => {
      this.hls.startLoad(this.initialStreamPosition);
    });
    this.hls.once(Hls.Events.SUBTITLE_TRACKS_UPDATED, () => {
      for (const track of this.hls.subtitleTracks) {
        const label = track.name || `${track.type.toLowerCase()}${track.lang ? ` (${track.lang})` : ''}`;
        this.addSubtitleTrack(new HlsSubtitleTrack(track.id, label, track.lang ?? 'und', this.hls));
      }
    });

    this.stallWatchdogIntervalId = window.setInterval(() => this.checkForStall(), 1000);
    window.addEventListener('online', this.onBrowserBackOnline);

    this.hls.loadSource(options.backend.src);
  }

  /** Position within the HLS stream to start loading at, in stream-local seconds. */
  protected get initialStreamPosition(): number {
    return 0;
  }

  override get connectionState(): PlaybackConnectionState {
    return this.currentConnectionState;
  }

  getActiveAudioTrackId(): string | null {
    return this.hls.audioTrack.toString();
  }

  setActiveAudioTrack(id: string): void {
    const newAudioTrackId = parseInt(id, 10);
    if (this.hls.audioTrack == newAudioTrackId) {
      return;
    }

    this.waitForAudioBufferFlush = true;
    this.hls.audioTrack = newAudioTrackId;
  }

  getAudioTracks(): AudioTrackInfo[] {
    return this.hls.audioTracks
      .map((track) => ({
        id: track.id.toString(),
        label: track.name || `${track.type.toLowerCase()}${track.lang ? ` (${track.lang})` : ''}`,
        language: track.lang ?? 'und',
      }));
  }

  override getDiagnostics(): Record<string, unknown> {
    return {
      ...this.currentState(),
      recentIssues: [...this.playbackIssues],
    };
  }

  private currentState(): Record<string, unknown> {
    const playlist = this.hls.latestLevelDetails;

    return {
      ...super.getDiagnostics(),
      connection: {
        state: this.currentConnectionState,
        unrecoverableReason: this.unrecoverableReason,
        reconnectAttempts: this.reconnectAttempts,
        reconnectScheduled: this.reconnectTimeoutId != null,
        browserReportsOnline: navigator.onLine,
        secondsSinceLastFragmentLoaded: (performance.now() - this.lastFragmentLoadedAt) / 1000,
        estimatedBandwidthInBitsPerSecond: Math.round(this.hls.bandwidthEstimate),
      },
      hls: {
        loadingEnabled: this.hls.loadingEnabled,
        bufferingEnabled: this.hls.bufferingEnabled,
        hasEnoughToStart: this.hls.hasEnoughToStart,
        currentLevel: this.hls.currentLevel,
        audioTrack: this.hls.audioTrack,
        inFlight: HlsVideoBackend.describeInFlightFragments(this.hls.inFlightFragments),
        playlist: playlist == null ? null : {
          live: playlist.live,
          type: playlist.type,
          targetDuration: playlist.targetduration,
          totalDuration: playlist.totalduration,
          edge: playlist.edge,
          fragmentCount: playlist.fragments.length,
          startSN: playlist.startSN,
          endSN: playlist.endSN,
          ageInSeconds: playlist.age,
          updatedOnLastReload: playlist.updated,
        },
      },
    };
  }

  destroy(): void {
    window.clearInterval(this.stallWatchdogIntervalId);
    window.removeEventListener('online', this.onBrowserBackOnline);
    this.cancelScheduledReconnect();
    this.hls.destroy();
    super.destroy();
  }

  private onAudioTrackSwitched(): void {
    if (!this.waitForAudioBufferFlush) {
      return;
    }

    this.waitForAudioBufferFlush = false;

    // Seeking is required to flush the low-level playback buffers
    if (this.currentTime < 1) {
      this.seek(this.currentTime - 0.001, false);
      this.seek(this.currentTime + 0.001, false);
    } else {
      this.seek(this.currentTime + 0.001, false);
      this.seek(this.currentTime - 0.001, false);
    }
  }

  /**
   * hls.js recovers from non-fatal errors on its own but leaves fatal ones to the application:
   * without this, playback just stops – no error on the video element, nothing logged (hls.js only
   * logs with `debug: true`), leaving a bug report with nothing to go on but "it stopped".
   */
  private onHlsError(data: ErrorData): void {
    this.rememberIssue(data.type, data.details, data.fatal, {
      reason: data.reason,
      error: data.error?.message,
      url: data.url ?? data.frag?.url ?? data.context?.url,
      httpStatus: data.response?.code,
      fragmentSN: data.frag?.sn,
      fragmentStart: data.frag?.start,
      parent: data.parent,
      sourceBuffer: data.sourceBufferName,
    });

    if (!data.fatal) {
      console.warn(`hls.js reported a non-fatal ${data.type} (${data.details}):`, data.error?.message ?? data.reason);
      return;
    }

    // console.error, because that is what ends up in the client error log attached to bug reports
    console.error(`hls.js reported a fatal ${data.type} (${data.details}):`, data.error?.message ?? data.reason, this.currentState());
    this.recoverFromFatalError(data);
  }

  private recoverFromFatalError(data: ErrorData): void {
    if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
      const httpStatus = data.response?.code;
      if (httpStatus != null && HlsVideoBackend.meansTheStreamIsGone(httpStatus)) {
        this.giveUp(`the server answered ${httpStatus} for ${data.url ?? data.frag?.url ?? 'the stream'}`);
        return;
      }

      this.scheduleReconnect();
      return;
    }

    if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
      if (this.mediaErrorRecoveries >= HlsVideoBackend.MAX_MEDIA_ERROR_RECOVERIES) {
        this.giveUp(`hls.js kept reporting media errors (${data.details}) after ${this.mediaErrorRecoveries} recovery attempts`);
        return;
      }
      ++this.mediaErrorRecoveries;

      const previousRecovery = this.lastMediaErrorRecoveryAt;
      this.lastMediaErrorRecoveryAt = performance.now();

      // A second media error right after recovering usually means the audio codec is the one we cannot play
      if (previousRecovery != null && this.lastMediaErrorRecoveryAt - previousRecovery < HlsVideoBackend.MEDIA_ERROR_RECOVERY_COOLDOWN_IN_MILLIS) {
        this.hls.swapAudioCodec();
      }
      this.hls.recoverMediaError();
      return;
    }

    this.giveUp(`hls.js reported a fatal ${data.type} (${data.details}) that cannot be recovered from`);
  }

  /**
   * A dropped connection is the normal case here, not an exceptional one: this instance is reached over a
   * home uplink and an SSH tunnel that reconnect every now and then. So reconnecting never stops on its own –
   * it only backs off. Giving up after a fixed number of tries left the player dead for good once the outage
   * outlasted the budget, which is the "it just stopped and never came back" every bug report so far described.
   */
  private scheduleReconnect(): void {
    if (this.reconnectTimeoutId != null || this.currentConnectionState === 'unrecoverable') {
      return;
    }

    this.currentConnectionState = 'reconnecting';

    const delayInMillis = Math.min(
      HlsVideoBackend.RECONNECT_BASE_DELAY_IN_MILLIS * (2 ** this.reconnectAttempts),
      HlsVideoBackend.RECONNECT_MAX_DELAY_IN_MILLIS,
    );
    ++this.reconnectAttempts;

    this.reconnectTimeoutId = window.setTimeout(() => {
      this.reconnectTimeoutId = null;
      this.hls.startLoad(this.videoElement.currentTime);
    }, delayInMillis);
  }

  /** Reconnects without waiting out the backoff – the browser telling us it is online again is better news than a timer. */
  private retryNow(): void {
    if (this.currentConnectionState !== 'reconnecting') {
      return;
    }

    this.cancelScheduledReconnect();
    this.reconnectAttempts = 0;
    this.hls.startLoad(this.videoElement.currentTime);
  }

  private cancelScheduledReconnect(): void {
    if (this.reconnectTimeoutId == null) {
      return;
    }

    window.clearTimeout(this.reconnectTimeoutId);
    this.reconnectTimeoutId = null;
  }

  private onFragmentLoaded(): void {
    this.lastFragmentLoadedAt = performance.now();
    this.reconnectAttempts = 0;
    this.mediaErrorRecoveries = 0;
    this.cancelScheduledReconnect();

    if (this.currentConnectionState === 'reconnecting') {
      this.currentConnectionState = 'connected';
    }
  }

  private giveUp(reason: string): void {
    this.cancelScheduledReconnect();
    this.currentConnectionState = 'unrecoverable';
    this.unrecoverableReason = reason;

    this.rememberIssue('playback', 'gaveUpRecovering', true, { reason });
    console.error(`Playback stopped for good: ${reason}`);
  }

  /** Catches a player that stopped without any error being reported – the shape most bug reports about this have. */
  private checkForStall(): void {
    if (this.videoElement.currentTime !== this.lastObservedTime) {
      this.lastObservedTime = this.videoElement.currentTime;
      this.lastTimeAdvancedAt = performance.now();
      this.stallReported = false;
      return;
    }

    // `seeking` is deliberately not excluded: a seek that never finishes is exactly the stall we are looking for
    const playbackShouldAdvance = !this.videoElement.paused && !this.videoElement.ended && this.videoElement.playbackRate > 0;
    if (!playbackShouldAdvance) {
      this.lastTimeAdvancedAt = performance.now();
      return;
    }

    const stalledForInMillis = performance.now() - this.lastTimeAdvancedAt;
    if (stalledForInMillis < HlsVideoBackend.STALL_TOLERANCE_IN_MILLIS) {
      return;
    }
    this.lastTimeAdvancedAt = performance.now();  // re-arm, so a nudge that did not help is repeated

    if (this.reconnectTimeoutId != null || this.currentConnectionState === 'unrecoverable') {
      return;
    }

    if (!this.stallReported) {
      this.stallReported = true;

      const state = this.currentState();
      this.rememberIssue('stall', 'playbackStalledWithoutError', false, { stalledForInMillis, ...state });
      console.error(`Playback has not advanced for ${Math.round(stalledForInMillis / 1000)}s – asking hls.js to load again`, state);
    }

    this.hls.startLoad(this.videoElement.currentTime);
  }

  /**
   * Repeats collapse into one entry: an outage produces a timeout per fragment per retry, which used to push
   * everything that happened before it out of the list long before anyone got around to reporting the problem.
   */
  private rememberIssue(type: string, details: string, fatal: boolean, info: Record<string, unknown>): void {
    const timestamp = new Date().toISOString();
    const alreadySeenIndex = this.playbackIssues.findIndex((issue) => issue.type === type && issue.details === details);

    if (alreadySeenIndex !== -1) {
      const [alreadySeen] = this.playbackIssues.splice(alreadySeenIndex, 1);
      this.playbackIssues.push({ ...alreadySeen, lastTimestamp: timestamp, count: alreadySeen.count + 1, fatal, info });
      return;
    }

    this.playbackIssues.push({ timestamp, lastTimestamp: timestamp, count: 1, type, details, fatal, info });

    if (this.playbackIssues.length > HlsVideoBackend.MAX_REMEMBERED_ISSUES) {
      this.playbackIssues.shift();
    }
  }

  private static meansTheStreamIsGone(httpStatus: number): boolean {
    return httpStatus === 401 || httpStatus === 403 || httpStatus === 404 || httpStatus === 410;
  }

  private static describeInFlightFragments(inFlightFragments: InFlightFragments): Record<string, unknown> {
    const description: Record<string, unknown> = {};
    for (const [playlistType, inFlight] of Object.entries(inFlightFragments)) {
      description[playlistType] = {
        state: inFlight.state,
        fragmentSN: inFlight.frag?.sn ?? null,
        fragmentStart: inFlight.frag?.start ?? null,
      };
    }
    return description;
  }

  static async create(container: HTMLDivElement, options: HlsVideoBackendOptions): Promise<HlsVideoBackend> {
    return new HlsVideoBackend(container, options);
  }
}
