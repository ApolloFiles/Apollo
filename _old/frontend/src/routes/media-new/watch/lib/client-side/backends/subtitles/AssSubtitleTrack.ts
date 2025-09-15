import JASSUB from 'jassub';
import jasSubDefaultFontUrl from 'jassub/dist/default.woff2?url';
import jasSubWorkerUrl from 'jassub/dist/jassub-worker.js?url';
import jasSubWasmUrl from 'jassub/dist/jassub-worker.wasm?url';
import SubtitleTrack from './SubtitleTrack';

export default class AssSubtitleTrack extends SubtitleTrack {
  private subtitleInstance?: JASSUB;
  private subtitleCanvasContainer?: HTMLDivElement;

  constructor(
    public readonly id: string,
    public readonly label: string,
    public readonly language: string,
    private readonly uri: string,
    private readonly fonts: { uri: string }[],
    private readonly videoElement: HTMLVideoElement,
  ) {
    super();
  }

  activate(): void {
    this.subtitleCanvasContainer = document.createElement('div');
    this.subtitleCanvasContainer.style.position = 'absolute';
    this.subtitleCanvasContainer.style.display = 'inline-flex';
    this.subtitleCanvasContainer.style.pointerEvents = 'none';

    const subtitleCanvas = document.createElement('canvas');
    this.subtitleCanvasContainer.appendChild(subtitleCanvas);

    this.videoElement.after(this.subtitleCanvasContainer);

    this.subtitleInstance = new JASSUB({
      video: this.videoElement,
      canvas: subtitleCanvas,
      subUrl: new URL(this.uri, window.location.href).href,
      fonts: this.fonts.map(a => new URL(a.uri, window.location.href).href),
      availableFonts: { 'liberation sans': jasSubDefaultFontUrl },
      fallbackFont: 'liberation sans',
      workerUrl: jasSubWorkerUrl,
      wasmUrl: jasSubWasmUrl,
      offscreenRender: false,  // Inconsistent performance on some systems (e.g., occasional 1-second render times) (+ buggy on some Browsers and systems)
    });
  }

  deactivate(): void {
    this.subtitleInstance?.destroy();
    this.subtitleInstance = undefined;

    this.subtitleCanvasContainer?.remove();
    this.subtitleCanvasContainer = undefined;
  }
}
