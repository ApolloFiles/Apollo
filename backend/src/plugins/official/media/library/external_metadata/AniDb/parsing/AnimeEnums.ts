import type { ClassifiedId } from './Anime.js';

export const ANIME_TYPES = ['Movie', 'Music Video', 'Other', 'OVA', 'TV Series', 'TV Special', 'Web'] as const;
export type AnimeType = typeof ANIME_TYPES[number];

export const TITLE_TYPES = ['kanareading', 'main', 'official', 'short', 'synonym', 'titlecard'] as const;
export type TitleType = typeof TITLE_TYPES[number];

export const ANIME_RELATION_TYPES = [
  'Alternative Setting',
  'Full Story',
  'Other',
  'Parent Story',
  'Prequel',
  'Same Setting',
  'Sequel',
  'Side Story',
  'Summary',
] as const;
export type AnimeRelationType = typeof ANIME_RELATION_TYPES[number];

export const RECOMMENDATION_TYPES = ['For Fans', 'Must See', 'Recommended'] as const;
export type RecommendationType = typeof RECOMMENDATION_TYPES[number];

export const CREATOR_TYPES = [
  'Animation Character Design',
  'Animation Work',
  'Avatar Design',
  'Character Design',
  'Chief Animation Direction',
  'Chief Designer',
  'Chief Direction',
  'Direction',
  'Komissa-chan Design',
  'Main Character Design',
  'Model',
  'Music',
  'Original Plan',
  'Original Work',
  'Series Composition',
  'Work',
] as const;
export type CreatorType = typeof CREATOR_TYPES[number];

export const CHARACTER_RELATION_TYPES = ['appears in', 'cameo appearance in', 'main character in', 'secondary cast in'] as const;
export type CharacterRelationType = typeof CHARACTER_RELATION_TYPES[number];

export const CHARACTER_GENDER_TYPES = ['female', 'male', 'intersexual', 'unknown', 'none/does not apply'] as const;
export type CharacterGenderType = typeof CHARACTER_GENDER_TYPES[number];

export const EPISODE_KINDS = {
  1: 'regular',
  2: 'special',
  3: 'opening/ending',
  4: 'trailer/promo/ad',
  5: 'parody/fandub',
  6: 'other',
} as const;
export type EpisodeKind = typeof EPISODE_KINDS[keyof typeof EPISODE_KINDS];

export const CHARACTER_TYPES = {
  1: 'character',
  2: 'mecha',
  3: 'organisation',
  4: 'vehicle',
} as const;
export type CharacterType = typeof CHARACTER_TYPES[keyof typeof CHARACTER_TYPES];

export const EXTERNAL_RESOURCE_TYPES = {
  1: 'AnimeNewsNetwork',
  2: 'MyAnimeList',
  3: 'AnimeNFO',
  4: 'Official Website',
  5: 'Official English Website',
  6: 'English Wikipedia',
  7: 'Japanese Wikipedia',
  8: 'Syoboi',
  9: 'Allcinema',

  10: 'Anison',
  11: 'lain',
  // 12
  // 13
  14: 'Visual Novel Database',
  15: 'Marumegane',
  16: 'Animemorial',
  17: 'TV Animation Museum',
  // 18
  19: 'Korean Wikipedia',

  20: 'Chinese Wikipedia',
  // 21
  22: 'Facebook',
  23: 'Twitter',
  // 24
  // 25
  26: 'YouTube',
  // 27
  28: 'Crunchyroll',
  // 29

  // 30
  31: 'Media Art Database',
  32: 'Amazon Video',
  33: 'Baidu Baike',
  34: 'Official Stream',
  35: 'Official Blog',
  // 36
  // 37
  38: 'bangumi',
  39: 'douban',

  // 40
  41: 'Netflix',
  42: 'HiDive',
  43: 'IMDB',
  44: 'TMDB',
  45: 'Funimation',
  46: 'QQ',
  47: 'BiliBili',
  48: 'Amazon Prime Video',
  // ...
} as const;
export type ExternalResourceType = typeof EXTERNAL_RESOURCE_TYPES[keyof typeof EXTERNAL_RESOURCE_TYPES];

/** @internal */
export function classifyId<Name extends string>(names: Readonly<Partial<Record<number, Name>>>, id: number): ClassifiedId<Name> {
  return { id, name: names[id] ?? null };
}
