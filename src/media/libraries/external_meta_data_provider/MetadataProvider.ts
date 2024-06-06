import { MetaProvider } from '../scan/analyser/DirectoryAnalyser';

export type TitleMetaData = {
  id: number | string;
  title: string;
  synopsis: string | null;

  hasPosterImage: boolean;
  fetchPosterImage(): Promise<Buffer | null>;

  year: number | null;
  genres: string[];
};

export default abstract class MetadataProvider {
  abstract isAvailable(): boolean;

  abstract fetchByMetaProvider(metaProvider: MetaProvider): Promise<TitleMetaData | null>;
}
