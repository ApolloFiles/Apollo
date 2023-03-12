import HlsVideoWrapper from './HlsVideoWrapper';

export default class LiveTranscodeVideoWrapper extends HlsVideoWrapper {
  protected durationValue: number | null = null;

  get duration(): number {
    if (this.durationValue !== null) {
      return this.durationValue;
    }
    return this.currentTime;
  }

  set duration(duration: number) {
    const emitEvent = this.durationValue !== duration;

    this.durationValue = duration;
    if (emitEvent) {
      const durationChangeEvent = new Event('durationchange');
      this.videoElement.dispatchEvent(durationChangeEvent);
    }
  }
}
