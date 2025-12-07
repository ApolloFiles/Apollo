export default abstract class SubtitleTrack {
  protected constructor() {
  }

  abstract get id(): string;
  abstract get label(): string;
  abstract get language(): string;

  abstract activate(): void;
  abstract deactivate(): void;
}
