type TagInfo = {
  info: string,
  refLink?: string,
}

const MKV_TAG_INFO_MAP: Record<string, TagInfo> = {
  TITLE: {
    info: 'The title of this item. For example, for music you might label this “Canon in D”, or for video’s audio track you might use “English 5.1” This is akin to the “TIT2” tag in [@!ID3v2].',
  },
  SUBTITLE: {
    info: 'Sub Title of the entity.',
  },
  ORIGINAL_MEDIA_TYPE: {
    info: 'Describes the original type of the media, such as, \'Blu-ray Disc\', \'DVD\', \'cassette\', \'radio broadcast\', etc.. This is akin to the “TMED” tag in [@!ID3v2].',
  },
  DESCRIPTION: {
    info: 'A short description of the content, such as \'Two birds flying.\'',
  },
  SYNOPSIS: {
    info: 'A description of the story line of the item.',
  },
  CONTENT_TYPE: {
    info: 'The type of the item. e.g., Documentary, Feature Film, Cartoon, Music Video, Music, Sound FX, …',
  },
  COUNTRY: {
    info: 'The name of the country that is meant to have other tags inside (using nested tags) to country specific information about the item, in the Matroska countries form, i.e. [@!BCP47] two-letter region subtag, without the UK exception. All tags in this list can be used “under” the COUNTRY_SPECIFIC tag like LABEL, PUBLISH_RATING, etc.',
  },
  LAW_RATING: {
    info: 'Depending on the COUNTRY it’s the format of the rating of a movie (P, R, X in the USA, an age in other countries or a URI defining a logo).',
  },
  TOTAL_PARTS: {
    info: 'Total number of parts defined at the first lower level. (e.g., if TargetType is ALBUM, the total number of tracks of an audio CD)',
  },
  PART_NUMBER: {
    info: 'Number of the current part of the current level. (e.g., if TargetType is TRACK, the track number of an audio CD)',
  },
  PART_OFFSET: {
    info: 'A number to add to PART_NUMBER, when the parts at that level don’t start at 1. (e.g., if TargetType is TRACK, the track number of the second audio CD)',
  },
  DATE_RELEASED: {
    info: 'The time that the item was originally released. This is akin to the “TDRL” tag in [@!ID3v2].',
  },
  DATE_ENCODED: {
    info: 'The time that the encoding of this item was completed began. This is akin to the “TDEN” tag in [@!ID3v2].',
  },
  DATE_TAGGED: {
    info: 'The time that the tags were done for this item. This is akin to the “TDTG” tag in [@!ID3v2].',
  },
  DATE_DIGITIZED: {
    info: 'The time that the item was transferred to a digital medium. This is akin to the “IDIT” tag in [@?RIFF.tags].',
  },
  IMDB: {
    info: 'Internet Movie Database [@!IMDb] identifier. “tt” followed by at least 7 digits for Movies, TV Shows, and Episodes.',
    refLink: 'https://www.imdb.com/',
  },
  TMDB: {
    info: 'The Movie DB “movie_id” or “tv_id” identifier for movies/TV shows [@!MovieDB]. The variable length digits string MUST be prefixed with either “movie/” or “tv/”.',
    refLink: 'https://www.themoviedb.org/',
  },
  TVDB2: {
    info: 'The TV Database [@!TheTVDB] tag which can include movies. The variable length digits string representing a “Series ID”, “Episode ID” or “Movie ID” identifier MUST be prefixed with “series/”, “episodes/” or “movies/” respectively.',
    refLink: 'https://www.thetvdb.com/',
  },
  MYANIMELIST: {
    info: 'Hab ich mir einfach ausgedacht – Die ID aus der URL nutzen',
    refLink: 'https://myanimelist.net/',
  },
  ANIDB: {
    info: 'Hab ich mir einfach ausgedacht – Die ID aus der URL nutzen',
    refLink: 'https://anidb.net/',
  },
  COMMENT: {
    info: 'Any comment related to the content.',
  },
  ENCODER_SETTINGS: {
    info: 'A list of the settings used for encoding this item. No specific format.',
  },
  COPYRIGHT: {
    info: 'The copyright information as per the copyright holder. This is akin to the “TCOP” tag in [@!ID3v2].',
  },
  LICENSE: {
    info: 'The license applied to the content (like Creative Commons variants).',
  },
  TERMS_OF_USE: {
    info: 'The terms of use for this item. This is akin to the “USER” tag in [@!ID3v2].',
  },
  LANGUAGE: {
    info: 'ISO639-2 (z.B. eng, deu, jpn=Japanisch, und=undefined); Muss ignoriert werden, wenn LanguageBCP47-Tag vorhanden',
    refLink: 'https://www.loc.gov/standards/iso639-2/php/code_list.php',
  },
  LANGUAGEBCP47: {
    info: 'BCP47 (z.B. en, en-US, de, de-DE, ja); Wenn vorhanden muss ein Language-Tag ignoriert werden',
    refLink: 'https://www.iana.org/assignments/language-subtag-registry/language-subtag-registry',
  },
};

export function getMkvTagInfo(tagKey: string): TagInfo | undefined {
  return MKV_TAG_INFO_MAP[normalizeMkvTagKey(tagKey)];
}

export function hasMkvTagInfo(tagKey: string): boolean {
  return normalizeMkvTagKey(tagKey) in MKV_TAG_INFO_MAP;
}

function normalizeMkvTagKey(tagKey: string): string {
  // Turn 'TITLE-eng' into 'TITLE'
  if (/-\w{3}$/.test(tagKey)) {
    tagKey = tagKey.substring(0, tagKey.length - 4);
  }

  return tagKey.toUpperCase();
}
