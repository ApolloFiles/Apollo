const DURATION_TAG_REGEX = /^(\d+):([0-5]\d):([0-5]\d(?:\.\d+)?)$/;
const LANGUAGE_SUFFIX_REGEX = /^[a-z]{3}$/;

/** Muxers write these first when a tag exists in multiple languages ('und' = undefined). */
const LANGUAGE_SUFFIX_PREFERENCES = ['eng', 'und'];

/**
 * Helpers for reading ffprobe tag records (`format.tags`, `stream.tags`).
 *
 * Tag keys are case-insensitive and may carry a three-letter language suffix: mkvmerge writes
 * `NUMBER_OF_FRAMES`, while MakeMKV writes the same tag as `NUMBER_OF_FRAMES-eng`.
 */
export default class ProbeTagUtil {
  static getValue(tags: Record<string, string>, key: string): string | null {
    const lowerCaseKey = key.toLowerCase();
    for (const tagKey of Object.keys(tags)) {
      if (tagKey.toLowerCase() === lowerCaseKey) {
        return tags[tagKey];
      }
    }
    return null;
  }

  /** Like {@link getValue}, but falls back to language-suffixed variants of `key`. */
  static getValueIncludingLanguageSuffixed(tags: Record<string, string>, key: string): string | null {
    const exactMatchValue = this.getValue(tags, key);
    if (exactMatchValue != null && exactMatchValue.trim().length > 0) {
      return exactMatchValue.trim();
    }

    const lowerCaseKey = key.toLowerCase();
    const suffixedTagKeys = Object.keys(tags)
      .map(tagKey => tagKey.toLowerCase())
      .filter(tagKey => {
        return tagKey.startsWith(lowerCaseKey + '-')
          && LANGUAGE_SUFFIX_REGEX.test(tagKey.substring(lowerCaseKey.length + 1));
      });

    suffixedTagKeys.sort((a, b) => {
      const languageA = a.substring(lowerCaseKey.length + 1);
      const languageB = b.substring(lowerCaseKey.length + 1);
      const indexA = LANGUAGE_SUFFIX_PREFERENCES.indexOf(languageA);
      const indexB = LANGUAGE_SUFFIX_PREFERENCES.indexOf(languageB);

      if (indexA === -1 && indexB === -1) {
        return languageA.localeCompare(languageB);
      }
      if (indexA === -1) {
        return 1;
      }
      if (indexB === -1) {
        return -1;
      }
      return indexA - indexB;
    });

    for (const suffixedTagKey of suffixedTagKeys) {
      const value = this.getValue(tags, suffixedTagKey);
      if (value != null && value.trim().length > 0) {
        return value.trim();
      }
    }

    return null;
  }

  /** Parses a non-negative integer tag (e.g. `NUMBER_OF_FRAMES`), ignoring anything malformed. */
  static getPositiveIntValue(tags: Record<string, string>, key: string): number | null {
    const rawValue = this.getValueIncludingLanguageSuffixed(tags, key);
    if (rawValue == null || !/^\d+$/.test(rawValue)) {
      return null;
    }

    const parsedValue = parseInt(rawValue, 10);
    return Number.isSafeInteger(parsedValue) ? parsedValue : null;
  }

  /** Parses Matroska's `DURATION` tag (`HH:MM:SS.nnnnnnnnn`) into seconds. */
  static parseDurationTag(rawValue: string | null): number | null {
    const match = rawValue?.trim().match(DURATION_TAG_REGEX);
    if (match == null) {
      return null;
    }

    return (parseInt(match[1], 10) * 3600) + (parseInt(match[2], 10) * 60) + parseFloat(match[3]);
  }
}
