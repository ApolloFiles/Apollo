import SubtitleTrack from './SubtitleTrack';

export default class NativeSubtitleTrack extends SubtitleTrack {
  private trackElement?: HTMLTrackElement;

  constructor(
    public readonly id: string,
    public readonly label: string,
    public readonly language: string,
    private readonly uri: string,
    private readonly videoElement: HTMLVideoElement,
  ) {
    super();
  }

  activate(): void {
    this.trackElement = this.createTrackElement();
    this.videoElement.appendChild(this.trackElement);
  }

  deactivate(): void {
    this.trackElement?.remove();
    this.trackElement = undefined;
  }

  private createTrackElement(): HTMLTrackElement {
    const trackElement = document.createElement('track');
    trackElement.kind = 'subtitles';
    trackElement.label = this.label;
    trackElement.srclang = this.language;
    trackElement.src = this.uri;

    trackElement.addEventListener('load', () => {
      trackElement.track.mode = 'showing';
    });

    return trackElement;
  }
}
