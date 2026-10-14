import { singleton } from 'tsyringe';
import type { ReadonlyAniDbAnime } from '../Anime.js';
import {
  ANIME_RELATION_TYPES,
  ANIME_TYPES,
  CHARACTER_GENDER_TYPES,
  CHARACTER_RELATION_TYPES,
  CREATOR_TYPES,
  RECOMMENDATION_TYPES,
  TITLE_TYPES,
} from '../AnimeEnums.js';
import type { IssueCollector } from './IssueCollector.js';

/** @internal */
@singleton()
export class AnimeValidator {
  validate(anime: ReadonlyAniDbAnime, issueCollector: IssueCollector): void {
    issueCollector.checkValue('type', ANIME_TYPES, anime.type);

    this.checkTitles(issueCollector, anime.titles);
    this.checkRelatedAnime(issueCollector, anime.relatedAnime);
    this.checkRecommendations(issueCollector, anime.recommendations);
    this.checkCreators(issueCollector, anime.creators);
    this.checkResources(issueCollector, 'resources', anime.resources);
    this.checkCharacters(issueCollector, anime.characters);
    this.checkEpisodes(issueCollector, anime.episodes);
    this.checkTags(issueCollector, anime.tags);
  }

  private checkTitles(issueCollector: IssueCollector, titles: ReadonlyAniDbAnime['titles']): void {
    for (const title of titles) {
      issueCollector.checkValue('titles[].type', TITLE_TYPES, title.type);
      issueCollector.checkLanguage('titles[].lang', title.lang);
    }
  }

  private checkRelatedAnime(issueCollector: IssueCollector, relatedAnime: ReadonlyAniDbAnime['relatedAnime']): void {
    for (const anime of relatedAnime) {
      issueCollector.checkValue('relatedAnime[].relationType', ANIME_RELATION_TYPES, anime.relationType);
    }
  }

  private checkRecommendations(issueCollector: IssueCollector, recommendations: ReadonlyAniDbAnime['recommendations']): void {
    for (const recommendation of recommendations.items) {
      issueCollector.checkValue('recommendations.items[].type', RECOMMENDATION_TYPES, recommendation.type);
    }
  }

  private checkCreators(issueCollector: IssueCollector, creators: ReadonlyAniDbAnime['creators']): void {
    for (const creator of creators) {
      issueCollector.checkValue('creators[].type', CREATOR_TYPES, creator.type);
    }
  }

  private checkResources(issueCollector: IssueCollector, path: string, resources: ReadonlyAniDbAnime['resources']): void {
    for (const resource of resources.external) {
      issueCollector.checkClassified(`${path}.external[].kind`, resource.kind);
    }
  }

  private checkCharacters(issueCollector: IssueCollector, characters: ReadonlyAniDbAnime['characters']): void {
    for (const character of characters) {
      issueCollector.checkClassified('characters[].characterType.kind', character.characterType.kind);
      issueCollector.checkValue('characters[].relationType', CHARACTER_RELATION_TYPES, character.relationType);
      issueCollector.checkValue('characters[].gender', CHARACTER_GENDER_TYPES, character.gender);
    }
  }

  private checkEpisodes(issueCollector: IssueCollector, episodes: ReadonlyAniDbAnime['episodes']): void {
    for (const episode of episodes) {
      issueCollector.checkClassified('episodes[].episodeNumber.kind', episode.episodeNumber.kind);
      this.checkResources(issueCollector, 'episodes[].resources', episode.resources);

      for (const title of episode.titles) {
        issueCollector.checkLanguage('episodes[].titles[].lang', title.lang);
      }
    }
  }

  private checkTags(issueCollector: IssueCollector, tags: ReadonlyAniDbAnime['tags']): void {
    for (const tag of tags) {
      this.checkResources(issueCollector, 'tags[].resources', tag.resources);
    }
  }
}
