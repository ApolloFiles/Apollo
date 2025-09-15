export type VideoAnalysisApiResponse = {
  files: VideoAnalysisResult[];
}

export type WriteVideoTagsApiResponse = {
  success: true;
  newVideoAnalysis: VideoAnalysisResult;
}

export type VideoAnalysisResult = {
  filePath: string;
  fileName: string;
  formatNameLong: string;
  probeScore: number;
  duration: string;

  tags: { [key: string]: string };
  chapters: {
    start: number, end: number;
    tags: { [key: string]: string };
  }[];
  streams: {
    index: number;
    codecType: string;
    codecNameLong: string;
    tags: { [key: string]: string };
    disposition: { [key: string]: 0 | 1 };
  }[];
}
