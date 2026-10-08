import { singleton } from 'tsyringe';
import { z } from 'zod';
import { AniDbXmlReader } from '../xml/AniDbXmlReader.js';
import type { AniDbAnime } from './Anime.js';
import { type NormalizedAnimeXml, NORMALIZING_ANIME_XML_SCHEMA } from './AnimeSchemas.js';
import { AnimeMapper } from './mapper/AnimeMapper.js';
import { AnimeValidator } from './validator/AnimeValidator.js';
import { IssueCollector, type ParseIssue } from './validator/IssueCollector.js';

/** @internal */
export type ParseResult = {
  /** @see AnimeParser#PARSER_VERSION */
  parserVersion: number,
  anime: AniDbAnime,
  issues: ParseIssue[],
};

// TODO: Consider adding a caching layer for already parsed anime data. Parsing One Piece can take over 200 ms and block the event loop
/** @internal */
@singleton()
export class AnimeParser {
  /**
   * When the parser's implementation changes in a way, that it produces different output for the same input,
   * this version has to be incremented.
   * This can for example be used for cache invalidation.
   */
  public static readonly PARSER_VERSION = 1;

  constructor(
    private readonly xmlReader: AniDbXmlReader,
    private readonly animeMapper: AnimeMapper,
    private readonly animeValidator: AnimeValidator,
  ) {
  }

  parse(animeXml: string): ParseResult {
    const issueCollector = new IssueCollector();

    const normalizedXml = this.parseXml(this.xmlReader.read(animeXml), issueCollector);
    const anime = this.animeMapper.map(normalizedXml);
    this.animeValidator.validate(anime, issueCollector);

    return {
      parserVersion: AnimeParser.PARSER_VERSION,
      anime,
      issues: issueCollector.toArray(),
    };
  }

  private parseXml(rawXml: unknown, issueCollector: IssueCollector): NormalizedAnimeXml {
    const result = NORMALIZING_ANIME_XML_SCHEMA.safeParse(rawXml);
    if (result.success) {
      return result.data;
    }

    const unknownKeys = result.error.issues.filter(AnimeParser.isUnknownKeysIssue);
    if (unknownKeys.length !== result.error.issues.length) {
      throw result.error;
    }

    for (const issue of unknownKeys) {
      this.deleteKeys(rawXml, issue.path, issue.keys);

      const path = this.formatIssuePath(issue.path);
      for (const key of issue.keys) {
        issueCollector.addUnknownKey(path, key);
      }
    }

    return NORMALIZING_ANIME_XML_SCHEMA.parse(rawXml);
  }

  private deleteKeys(rawXml: unknown, path: PropertyKey[], keys: string[]): void {
    let target = rawXml as Record<PropertyKey, unknown>;
    for (const segment of path) {
      // xmlArray() wraps single elements, so zod reports an index the raw XML doesn't have
      if (typeof segment === 'number' && !Array.isArray(target)) {
        continue;
      }
      target = target[segment] as Record<PropertyKey, unknown>;
    }

    for (const key of keys) {
      delete target[key];
    }
  }

  private formatIssuePath(path: PropertyKey[]): string {
    return path
      .map((segment) => typeof segment === 'number' ? '[]' : String(segment))
      .join('.')
      .replaceAll('.[]', '[]');
  }

  private static isUnknownKeysIssue(issue: z.core.$ZodIssue): issue is z.core.$ZodIssueUnrecognizedKeys {
    return issue.code === 'unrecognized_keys';
  }
}
