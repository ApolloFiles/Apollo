export type MetaProvider = {
  providerId: string;
  mediaId: string;
};

export interface MediaVariant {
  name?: string;
  filePath: string;
}

export interface ExtraMedia extends MediaVariant {
  type?: 'trailer' | 'interview' | 'poster' | 'backdrop' | 'logo';
}

export type MediaAnalysis = {
  name: string;
  year?: number;
  metaProviders: MetaProvider[];

  variants: MediaVariant[];
  extras?: ExtraMedia[];
};

export default interface IMediaDirectoryAnalyser {
  /**
   * The given directoryPath is expected to be the directory containing the media for one movie/tv show/etc.
   *
   * The analysis should identify one movie/tv show/etc. and should only check subdirectories for additional media files (e.g. trailers, posters, etc.).
   */
  analyze(directoryPath: string): Promise<MediaAnalysis | null>;
}
