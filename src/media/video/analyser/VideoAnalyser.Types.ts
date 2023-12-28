export type ExtendedVideoAnalysis = VideoFileAnalysis & VideoChapterAnalysis & VideoStreamAnalysis;

export interface VideoChapterAnalysis {
  readonly chapters: Chapter[];
}

export interface Chapter {
  readonly  id: number;

  readonly timeBase: string;

  readonly start: number;
  readonly startTime: string;

  readonly end: number;
  readonly endTime: string;

  readonly tags: {
    readonly [key: string]: string;

    readonly title: string;
  };
}

export interface VideoStreamAnalysis {
  readonly streams: Stream[];
}

export interface VideoFileAnalysis {
  readonly file: {
    readonly fileName: string;

    readonly streamCount: number;
    readonly programCount: number;

    readonly formatName: string;
    readonly formatNameLong: string;

    readonly startTime: string;
    readonly duration: string;

    readonly size: string;
    readonly bitRate: string;
    readonly probeScore: number;

    readonly tags: { readonly [key: string]: string };
  };
}

export interface Stream {
  readonly index: number;

  readonly codecType: 'video' | 'audio' | 'subtitle' | 'attachment';
  readonly codecName: string;
  readonly codecNameLong: string;
  readonly codecTagString: string;
  readonly codecTag: string;

  readonly rFrameRate: string;
  readonly avgFrameRate: string;

  readonly timeBase: string;
  readonly startPts: number;
  readonly startTime: string;
  readonly durationTs?: number;
  readonly duration?: string;

  readonly extraDataSize: number;

  readonly tags: { readonly [key: string]: string };
  readonly disposition?: { readonly [key: string]: 0 | 1 };
}

export interface VideoStream extends Stream {
  readonly codecType: 'video';

  readonly profile: string;

  readonly width: number;
  readonly height: number;
  readonly codedWidth: number;
  readonly codedHeight: number;

  readonly closedCaptions: number;
  readonly filmGrain: number;
  readonly hasBFrames: number;
  readonly sampleAspectRatio: string;
  readonly displayAspectRatio: string;
  readonly pixFmt: string;
  readonly level: number;
  readonly colorRange: string;
  readonly chromaLocation: string;
  readonly refs: number;

  readonly disposition: { readonly [key: string]: 0 | 1 };
}

export interface AudioStream extends Stream {
  readonly codecType: 'audio';

  readonly sampleFmt: string;
  readonly sampleRate: string;

  readonly channels: number;
  readonly channelLayout: string;

  readonly bitsPerSample: number;

  readonly disposition: { readonly [key: string]: 0 | 1 };
}

export interface SubtitleStream extends Stream {
  readonly codecType: 'subtitle';
}

export interface AttachmentStream extends Stream {
  readonly codecType: 'attachment';

  readonly tags: Stream['tags'] & { filename?: string, mimetype?: string };
}
