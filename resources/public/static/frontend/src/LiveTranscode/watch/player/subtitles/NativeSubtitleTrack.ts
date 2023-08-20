import SubtitleTrack from './SubtitleTrack';

export default class NativeSubtitleTrack extends SubtitleTrack {
  private trackElement?: HTMLTrackElement;

  activate(): void {
    this.trackElement = this.createTrackElement();

    const videoElement = this.videoPlayer._videoPlayerWrapper.querySelector('video')!;
    videoElement.appendChild(this.trackElement);
  }

  deactivate(): void {
    this.trackElement?.remove();
    this.trackElement = undefined;
  }

  private createTrackElement(): HTMLTrackElement {
    const trackElement = document.createElement('track');
    trackElement.kind = 'subtitles';
    trackElement.label = this.subtitle.title;
    trackElement.srclang = this.subtitle.language;
    trackElement.src = this.subtitle.uri;

    trackElement.addEventListener('load', () => {
      trackElement.track.mode = 'showing';
    });

    return trackElement;
  }
}
