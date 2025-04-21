export type SeekThumbnail = {
  uri: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
};

type ParsedCue = {
  startMillis: number;
  endMillis: number;
  image: SeekThumbnail;
}

export default class SeekThumbnails {
  private cues: ParsedCue[] = [];
  private loaded = false;
  private error = false;

  private readonly imageBlobUrls = new Map<string, string>();

  constructor(url: string) {
    SeekThumbnails.fetchFromUrl(url)
      .then((webVttData) => {
        if (webVttData != null) {
          this.cues = SeekThumbnails.parse(webVttData, new URL(url, window.location.href));

          this.preloadImages().catch(console.error);
        }
        this.loaded = true;
      })
      .catch(() => this.loaded = this.error = true);
  }

  isLoading(): boolean {
    return !this.loaded;
  }

  hasError(): boolean {
    return this.error;
  }

  getCue(timeInSeconds: number): SeekThumbnail | null {
    if (!this.loaded) {
      return null;
    }

    for (const cue of this.cues) {
      if (cue.startMillis <= timeInSeconds * 1000 && timeInSeconds * 1000 < cue.endMillis) {
        return {
          ...cue.image,
          uri: this.imageBlobUrls.get(cue.image.uri) ?? cue.image.uri,
        };
      }
    }

    return null;
  }

  destroyPreloadedImages(): void {
    for (const objectUrl of this.imageBlobUrls.values()) {
      URL.revokeObjectURL(objectUrl);
    }
    this.imageBlobUrls.clear();
  }

  private async preloadImages(): Promise<void> {
    for (const cue of this.cues) {
      if (this.imageBlobUrls.has(cue.image.uri)) {
        continue;
      }

      const imageBlob = await (await fetch(cue.image.uri)).blob();
      this.imageBlobUrls.set(cue.image.uri, URL.createObjectURL(imageBlob));
    }
  }

  private static parse(data: string, vttFileUrl: URL): ParsedCue[] {
    const result: ParsedCue[] = [];

    const lines = data.split(/\r?\n/);
    lines.shift();

    let startMillis = 0;
    let endMillis = 0;
    let image = '';
    for (let i = 0; i < lines.length; ++i) {
      const line = lines[i];
      if (line.includes('-->')) {
        const times = line.split(' --> ');
        startMillis = this.parseTime(times[0]);
        endMillis = this.parseTime(times[1]);
      } else if (line.trim() !== '') {
        image = line;

        const anchorIndex = image.indexOf('#xywh=');
        if (anchorIndex !== -1) {
          const uri = image.substring(0, anchorIndex);
          const xywh = image.substring(anchorIndex + 6);
          const parts = xywh.split(',');
          const x = parseInt(parts[0]);
          const y = parseInt(parts[1]);
          const width = parseInt(parts[2]);
          const height = parseInt(parts[3]);
          result.push({
            startMillis,
            endMillis,
            image: {
              uri: new URL(uri, vttFileUrl.href).href,
              x,
              y,
              width,
              height,
            },
          });
          continue;
        }

        const uri = image;
        result.push({ startMillis, endMillis, image: { uri } });
      }
    }

    return result;
  }

  private static async fetchFromUrl(url: string): Promise<string | null> {
    let response = await fetch(url);
    let timeLeft = 5 * 60 * 1000; // 5 minutes
    while (timeLeft > 0 && response.status === 202) {
      await this.sleep(1500);
      response = await fetch(url);
      timeLeft -= 1500;
    }
    if (timeLeft <= 0) {
      console.error('Failed to fetch WebVttThumbnails: Timeout');
      return null;
    }

    if (!response.ok) {
      console.error('Failed to fetch WebVttThumbnails:', response.status, response.statusText);
      return null;
    }

    return await response.text();
  }

  private static parseTime(time: string): number {
    const parts = time.split(':');
    const hours = parseInt(parts[0]);
    const minutes = parseInt(parts[1]);
    const seconds = parseFloat(parts[2]);
    return (hours * 60 * 60 + minutes * 60 + seconds) * 1000;
  }

  private static async sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
