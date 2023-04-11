import PlayerWrapper, { WrapperEvents } from './PlayerWrapper';

export default class TwitchPlayerWrapper implements PlayerWrapper {
  private readonly twitchPlayer: any;

  constructor(twitchPlayer: any) {
    this.twitchPlayer = twitchPlayer;
  }

  get currentTime(): number {
    return this.twitchPlayer.getCurrentTime();
  }

  set currentTime(time: number) {
    this.twitchPlayer.seek(time);
  }

  get duration(): number {
    return this.twitchPlayer.getDuration();
  }

  get playbackRate(): number {
    return 1;
  }

  set playbackRate(playbackRate: number) {
    // noop
  }

  get muted(): boolean {
    return this.twitchPlayer.getMuted();
  }

  set muted(muted: boolean) {
    this.twitchPlayer.setMuted(muted);
  }

  get volume(): number {
    return this.twitchPlayer.getVolume();
  }

  set volume(volume: number) {
    this.twitchPlayer.setVolume(volume);
  }

  get paused(): boolean {
    return this.twitchPlayer.isPaused();
  }

  async play(): Promise<void> {
    this.twitchPlayer.play();
  }

  pause(): void {
    this.twitchPlayer.pause();
  }

  getBufferedRanges(): { start: number; end: number }[] {
    return [];
  }

  prepareDestroy(): void {
    // nothing to do
  }

  addPassiveEventListener(event: WrapperEvents, listener: () => void): void {
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
}
