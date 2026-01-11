export default abstract class SubtitleTrack {
  protected videoStartOffset = 0;

  protected constructor() {
  }

  abstract get id(): string;
  abstract get label(): string;
  abstract get language(): string;
  protected abstract get isActive(): boolean;

  abstract activate(): void;
  abstract deactivate(): void;

  setVideoStatOffset(startOffset: number): void {
    this.videoStartOffset = startOffset;

    if (this.isActive) {
      console.warn('SubtitleTrack#setVideoStatOffset was called, while the subtitle track was active. Restarting subtitle track to apply new offset.');

      this.deactivate();
      this.activate();
    }
  }
}
