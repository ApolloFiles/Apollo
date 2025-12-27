import type { TMDBApiConfiguration, TMDBMovieDetails, TMDBTvSeriesDetails } from './TMDBApiResponseSchemas.js';

export type ExternalIdSource = 'imdb_id' | 'tvdb_id';
export type FindByExternalIdResult = { type: 'tv', details: TMDBTvSeriesDetails } |
                                     { type: 'movie', details: TMDBMovieDetails } |
                                     null;

export interface TheMovieDbApiClientInterface {
  findMovieById(movieId: number): Promise<TMDBMovieDetails>;

  findTvSeriesById(seriesId: number): Promise<TMDBTvSeriesDetails>;

  findOneByExternalId(externalId: string, externalSource: ExternalIdSource): Promise<FindByExternalIdResult>;

  fetchImage(imagePath: string): Promise<Buffer>;

  fetchApiConfiguration(): Promise<TMDBApiConfiguration>;
}
