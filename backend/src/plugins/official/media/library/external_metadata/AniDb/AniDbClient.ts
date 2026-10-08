import { singleton } from 'tsyringe';
import { InFlightRequestTracker } from '../../../../../../utils/InFlightRequestTracker.js';
import { AniDbError } from './errors/AniDbError.js';
import { AniDbParseError } from './errors/AniDbParseError.js';
import { AnimeXmlFetcher } from './fetching/AnimeXmlFetcher.js';
import type { ReadonlyAniDbAnime } from './parsing/Anime.js';
import { AnimeParser, type ParseResult } from './parsing/AnimeParser.js';
import type { ParseIssue } from './parsing/validator/IssueCollector.js';

@singleton()
export class AniDbClient {
  private readonly inFlightAnimeRequests = new InFlightRequestTracker<ReadonlyAniDbAnime | null>();

  constructor(
    private readonly animeXmlFetcher: AnimeXmlFetcher,
    private readonly animeParser: AnimeParser,
  ) {
  }

  async fetchAnime(animeId: number): Promise<ReadonlyAniDbAnime | null> {
    if (!Number.isInteger(animeId) || animeId <= 0) {
      throw new AniDbError(`The animeId has to be positive, got ${animeId}`);
    }

    return this.inFlightAnimeRequests.run(animeId.toString(), () => this.fetchAndParseAnime(animeId));
  }

  private async fetchAndParseAnime(animeId: number): Promise<ReadonlyAniDbAnime | null> {
    const animeXml = await this.animeXmlFetcher.fetchXml(animeId);
    if (animeXml == null) {
      return null;
    }

    const parseResult = this.parseAnime(animeId, animeXml);
    this.logIssues(animeId, parseResult.issues);
    return parseResult.anime;
  }

  private parseAnime(animeId: number, animeXml: string): ParseResult {
    try {
      return this.animeParser.parse(animeXml);
    } catch (err) {
      throw AniDbParseError.createForAnime(animeId, err);
    }
  }

  private logIssues(animeId: number, issues: ParseIssue[]): void {
    if (issues.length === 0) {
      return;
    }

    const formattedIssues = issues
      .map((issue) => `${issue.kind} ${issue.path}=${JSON.stringify(issue.value)}`)
      .join(', ');
    console.warn(`[AniDB] Anime ${animeId} contains ${issues.length} keys or values the parser does not know yet: ${formattedIssues}`);
  }
}
