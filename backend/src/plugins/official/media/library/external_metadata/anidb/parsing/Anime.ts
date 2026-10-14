import type { DeepReadonly, LiteralUnion } from '../../../../../../../utils/types.js';
import type {
  AnimeRelationType,
  AnimeType,
  CharacterGenderType,
  CharacterRelationType,
  CharacterType,
  CreatorType,
  EpisodeKind,
  ExternalResourceType,
  RecommendationType,
  TitleType,
} from './AnimeEnums.js';

export type ClassifiedId<T extends string> = { id: number, name: T | null };
export type NormalizedLanguage = { raw: string, bcp47: string | null };

export type Rating = { count: number, score: number };
export type VoteRating = { votes: number, score: number };

export type SimpleDate = { year: number, month: number, day: number };
export type PartialSimpleDate = { year: number, month: number | null, day: number | null };

export type ExternalResource =
  | { kind: ClassifiedId<ExternalResourceType>, identifiers: string[] }
  | { kind: ClassifiedId<ExternalResourceType>, urls: string[] };
export type Resources = { external: ExternalResource[] };

export type ReadonlyAniDbAnime = DeepReadonly<AniDbAnime>;
export type AniDbAnime = {
  id: number,
  restricted: boolean,
  type: LiteralUnion<AnimeType>,
  startDate: PartialSimpleDate | null,
  endDate: PartialSimpleDate | null,
  url: string | null,
  pictureFileName: string | null,
  description: string | null, // TODO: contains pseudo AniDB markup; check whether we want to do something with it or rename the property
  episodeCount: number,
  titles: {
    type: LiteralUnion<TitleType>,
    lang: NormalizedLanguage,
    title: string,
  }[],
  relatedAnime: {
    relationType: LiteralUnion<AnimeRelationType>,
    id: number,
    title: string,
  }[],
  similarAnime: {
    id: number,
    title: string,
    votes: {
      total: number,
      approval: number,
    }
  }[],
  recommendations: {
    total: number,
    items: {
      type: LiteralUnion<RecommendationType>,
      userId: number,
      text: string, // TODO: contains pseudo AniDB markup; check whether we want to do something with it or rename the property
    }[],
  },
  creators: {
    type: LiteralUnion<CreatorType>,
    id: number,
    name: string,
  }[],
  ratings: {
    permanent: Rating,
    temporary: Rating | null,
    review: Rating | null,
  } | null,
  resources: Resources,
  characters: {
    relationType: LiteralUnion<CharacterRelationType>,
    id: number,
    updatedAt: SimpleDate,
    name: string,
    gender: LiteralUnion<CharacterGenderType>,
    description: string | null,
    pictureFileName: string | null,

    rating: VoteRating | null,
    characterType: {
      kind: ClassifiedId<CharacterType>,
      label: string,
    },
    seiyuu: {
      id: number,
      name: string,
      pictureFileName: string | null,
    }[],
  }[],
  episodes: {
    id: number,
    updatedAt: SimpleDate,
    episodeNumber: {
      kind: ClassifiedId<EpisodeKind>,
      label: string,
    },
    playLengthMinutes: number,
    airdate: SimpleDate | null,
    recap: boolean,
    rating: VoteRating | null,
    titles: {
      lang: NormalizedLanguage,
      title: string,
    }[],
    summary: string | null,
    resources: Resources,
  }[],
  tags: {
    id: number,
    parentId: number | null,
    weight: number,
    infobox: boolean,
    localSpoiler: boolean,
    globalSpoiler: boolean,
    verified: boolean,
    updatedAt: SimpleDate | null,

    name: string,
    description: string | null,
    pictureFileName: string | null,

    resources: Resources,
  }[],
};
