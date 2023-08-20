import JASSUB from 'jassub';
import SubtitleTrack from './SubtitleTrack';

export default class AssSubtitleTrack extends SubtitleTrack {
  private subtitleInstance?: JASSUB;

  activate(): void {
    this.subtitleInstance = new JASSUB({
      video: this.videoPlayer._videoPlayerWrapper.querySelector<HTMLVideoElement>('video')!,
      subUrl: new URL(this.subtitle.uri, window.location.href).href,
      fonts: this.mediaMetadata?.fonts?.map(a => new URL(a.uri, window.location.href).href),
      workerUrl: '/frontend/dist/third-party/jassub/jassub-worker.js',
      wasmUrl: '/frontend/dist/third-party/jassub/jassub-worker.wasm',
      offscreenRender: false  // Inconsistent performance on some systems (e.g., occasional 1 second render times)
    });
  }

  deactivate(): void {
    this.subtitleInstance?.destroy();
    this.subtitleInstance = undefined;
  }
}
