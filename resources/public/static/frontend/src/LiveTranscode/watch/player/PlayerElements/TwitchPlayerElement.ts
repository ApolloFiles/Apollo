import * as CommunicationProtocol from '../../../../../../../../../src/media/watch/sessions/CommunicationProtocol';
import {Media} from '../../../../../../../../../src/media/watch/sessions/CommunicationProtocol';
import SubtitleTrack from '../subtitles/SubtitleTrack';
import PlayerElement, {PlayerEvents} from './PlayerElement';

export default class TwitchPlayerElement extends PlayerElement {
  private static loadedTwitchEmbedApi = false;

  private twitchPlayer?: any;

  constructor(container: HTMLElement) {
    super(container);
  }

  get currentTime(): number {
    return this.twitchPlayer?.getCurrentTime() ?? 0;
  }

  set currentTime(time: number) {
    this.twitchPlayer.seek(time);
  }

  get duration(): number {
    return this.twitchPlayer?.getDuration() ?? 0;
  }

  get playbackRate(): number {
    return 1;
  }

  set playbackRate(playbackRate: number) {
    // noop
  }

  get muted(): boolean {
    return this.twitchPlayer?.getMuted() ?? true;
  }

  set muted(muted: boolean) {
    this.twitchPlayer.setMuted(muted);
  }

  get volume(): number {
    return this.twitchPlayer?.getVolume() ?? 1;
  }

  set volume(volume: number) {
    this.twitchPlayer.setVolume(volume);
  }

  get paused(): boolean {
    return this.twitchPlayer?.isPaused() ?? true;
  }

  async loadMedia(media: CommunicationProtocol.Media): Promise<void> {
    this.destroyPlayer();

    await TwitchPlayerElement.loadTwitchEmbedApi();

    // @ts-ignore
    const TwitchPlayerClass = Twitch.Player;
    this.twitchPlayer = new TwitchPlayerClass(this.container, {
      width: '100%',
      height: '100%',
      channel: media.uri,
      autoplay: true
    });
    (window as any).TWITCH_PLAYER = this.twitchPlayer;
  }

  loadSubtitles(media: Media): void {
    if (media.metadata?.subtitles) {
      // no-op
      console.warn('Unable to load custom subtitles for YouTube player.');
    }
  }

  destroyPlayer(): void {
    this.twitchPlayer?.destroy();
    this.twitchPlayer = undefined;
  }

  async play(): Promise<void> {
    this.twitchPlayer.play();
  }

  pause(): void {
    this.twitchPlayer.pause();
  }

  getSubtitleTracks(): SubtitleTrack[] {
    return [];
  }

  addSubtitleTrack(track: SubtitleTrack): void {
    // no-op
    console.warn('Adding custom subtitles is not supported when using the Twitch player.');
  }

  clearSubtitleTracks(): void {
    // no-op
  }

  getBufferedRanges(): { start: number, end: number }[] {
    return [];
  }

  addPassiveEventListener(event: PlayerEvents, listener: () => void): void {
    let translatedEvent: string;

    switch (event) {
      case 'loadedmetadata':
        // @ts-ignore
        translatedEvent = Twitch.Player.READY;
        break;

      case 'play':
        // @ts-ignore
        translatedEvent = Twitch.Player.PLAY;
        break;
      case 'pause':
        // @ts-ignore
        translatedEvent = Twitch.Player.PAUSE;
        break;
      case 'ended':
        // @ts-ignore
        translatedEvent = Twitch.Player.ENDED;
        break;

      case 'seeking':
      case 'seeked':
        // @ts-ignore
        translatedEvent = Twitch.Player.SEEK;
        break;

      case 'progress':
      case 'timeupdate':
      case 'durationchange':
      case 'volumechange':
      default:
        console.warn('The embedded Twitch player does not support the event:', event);
        return;
    }

    this.twitchPlayer.addEventListener(translatedEvent, listener);
  }

  private static async loadTwitchEmbedApi(): Promise<void> {
    if (this.loadedTwitchEmbedApi) {
      return;
    }

    this.loadedTwitchEmbedApi = true;
    await this.loadJs('https://player.twitch.tv/js/embed/v1.js');
  }
}
