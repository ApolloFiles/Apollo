import { singleton } from 'tsyringe';
import type { AniDbAnime, ExternalResource, Rating, Resources, VoteRating } from '../Anime.js';
import { CHARACTER_TYPES, classifyId, EPISODE_KINDS, EXTERNAL_RESOURCE_TYPES } from '../AnimeEnums.js';
import type { AnimeResources, NormalizedAnimeXml } from '../AnimeSchemas.js';
import { LanguageNormalizer } from './LanguageNormalizer.js';

type CharacterSeiyuuXml = NonNullable<NormalizedAnimeXml['anime']['characters']>['character'][number]['seiyuu'];
type EpisodeTitlesXml = NonNullable<NormalizedAnimeXml['anime']['episodes']>['episode'][number]['title'];
type RatingXml = NonNullable<NormalizedAnimeXml['anime']['ratings']>['permanent'];
type VoteRatingXml = NonNullable<NonNullable<NormalizedAnimeXml['anime']['episodes']>['episode'][number]['rating']>;

/** @internal */
@singleton()
export class AnimeMapper {
  constructor(
    private readonly languageNormalizer: LanguageNormalizer,
  ) {
  }

  map({ anime: animeXml }: NormalizedAnimeXml): AniDbAnime {
    return {
      id: animeXml['@_id'],
      restricted: animeXml['@_restricted'],
      type: animeXml.type,
      startDate: animeXml.startdate ?? null,
      endDate: animeXml.enddate ?? null,
      url: animeXml.url ?? null,
      pictureFileName: animeXml.picture ?? null,
      description: animeXml.description ?? null,
      episodeCount: animeXml.episodecount,

      titles: this.mapTitles(animeXml.titles),
      relatedAnime: this.mapRelatedAnime(animeXml.relatedanime),
      similarAnime: this.mapSimilarAnime(animeXml.similaranime),
      recommendations: this.mapRecommendations(animeXml.recommendations),
      creators: this.mapCreators(animeXml.creators),
      ratings: this.mapRatings(animeXml.ratings),
      resources: this.mapResources(animeXml.resources),
      characters: this.mapCharacters(animeXml.characters),
      episodes: this.mapEpisodes(animeXml.episodes),
      tags: this.mapTags(animeXml.tags),
    };
  }

  private mapTitles(titles: NormalizedAnimeXml['anime']['titles']): AniDbAnime['titles'] {
    return titles.title.map(title => ({
      type: title['@_type'],
      lang: this.languageNormalizer.normalize(title['@_xml:lang']),
      title: title['#text'],
    }));
  }

  private mapRelatedAnime(relatedAnime: NormalizedAnimeXml['anime']['relatedanime']): AniDbAnime['relatedAnime'] {
    return relatedAnime?.anime.map(anime => ({
      relationType: anime['@_type'],
      id: anime['@_id'],
      title: anime['#text'],
    })) ?? [];
  }

  private mapSimilarAnime(similarAnime: NormalizedAnimeXml['anime']['similaranime']): AniDbAnime['similarAnime'] {
    return similarAnime?.anime.map(anime => ({
      id: anime['@_id'],
      title: anime['#text'],
      votes: {
        total: anime['@_total'],
        approval: anime['@_approval'],
      },
    })) ?? [];
  }

  private mapRecommendations(recommendations: NormalizedAnimeXml['anime']['recommendations']): AniDbAnime['recommendations'] {
    if (recommendations == null) {
      return { total: 0, items: [] };
    }

    return {
      total: recommendations['@_total'],
      items: recommendations.recommendation.map(recommendation => ({
        type: recommendation['@_type'],
        userId: recommendation['@_uid'],
        text: recommendation['#text'],
      })),
    };
  }

  private mapCreators(creators: NormalizedAnimeXml['anime']['creators']): AniDbAnime['creators'] {
    return creators?.name.map(creator => ({
      type: creator['@_type'],
      id: creator['@_id'],
      name: creator['#text'],
    })) ?? [];
  }

  private mapRatings(ratings: NormalizedAnimeXml['anime']['ratings']): AniDbAnime['ratings'] {
    if (ratings == null) {
      return null;
    }

    return {
      permanent: this.mapRating(ratings.permanent),
      temporary: ratings.temporary != null ? this.mapRating(ratings.temporary) : null,
      review: ratings.review != null ? this.mapRating(ratings.review) : null,
    };
  }

  private mapRating(rating: RatingXml): Rating {
    return { count: rating['@_count'], score: rating['#text'] };
  }

  private mapVoteRating(voteRating: VoteRatingXml): VoteRating {
    return { votes: voteRating['@_votes'], score: voteRating['#text'] };
  }

  private mapResources(resources: AnimeResources | undefined): Resources {
    if (resources == null) {
      return { external: [] };
    }

    return {
      external: resources.resource.map((resource) => this.mapResource(resource)),
    };
  }

  private mapResource(resource: AnimeResources['resource'][number]): ExternalResource {
    const kind = classifyId(EXTERNAL_RESOURCE_TYPES, resource['@_type']);

    const urls = resource.externalentity.flatMap((entity) => 'url' in entity ? [entity.url] : []);
    if (urls.length > 0) {
      return { kind, urls };
    }

    return {
      kind,
      identifiers: resource.externalentity.flatMap((entity) => 'identifier' in entity ? entity.identifier : []),
    };
  }

  private mapCharacters(characters: NormalizedAnimeXml['anime']['characters']): AniDbAnime['characters'] {
    return characters?.character.map(character => ({
      relationType: character['@_type'],
      id: character['@_id'],
      updatedAt: character['@_update'],
      name: character.name,
      gender: character.gender,
      description: character.description ?? null,
      pictureFileName: character['picture'] ?? null,

      rating: character.rating != null ? this.mapVoteRating(character.rating) : null,

      characterType: {
        kind: classifyId(CHARACTER_TYPES, character.charactertype['@_id']),
        label: character.charactertype['#text'],
      },

      seiyuu: this.mapSeiyuu(character.seiyuu),
    })) ?? [];
  }

  private mapSeiyuu(seiyuu: CharacterSeiyuuXml): AniDbAnime['characters'][number]['seiyuu'] {
    return seiyuu?.map(item => ({
      id: item['@_id'],
      name: item['#text'],
      pictureFileName: item['@_picture'] ?? null,
    })) ?? [];
  }

  private mapEpisodes(episodes: NormalizedAnimeXml['anime']['episodes']): AniDbAnime['episodes'] {
    return episodes?.episode.map(episode => ({
      id: episode['@_id'],
      updatedAt: episode['@_update'],
      episodeNumber: {
        kind: classifyId(EPISODE_KINDS, episode.epno['@_type']),
        label: episode.epno['#text'],
      },
      playLengthMinutes: episode.length['#text'],
      airdate: episode['airdate'] ?? null,
      recap: episode['@_recap'] ?? false,
      rating: episode.rating != null ? this.mapVoteRating(episode.rating) : null,
      titles: this.mapEpisodeTitles(episode.title),
      summary: episode.summary ?? null,
      resources: this.mapResources(episode.resources),
    })) ?? [];
  }

  private mapEpisodeTitles(titles: EpisodeTitlesXml): AniDbAnime['episodes'][number]['titles'] {
    return titles.map(title => ({
      lang: this.languageNormalizer.normalize(title['@_xml:lang']),
      title: title['#text'],
    }));
  }

  private mapTags(tags: NormalizedAnimeXml['anime']['tags']): AniDbAnime['tags'] {
    return tags?.tag.map(tag => ({
      id: tag['@_id'],
      parentId: tag['@_parentid'] ?? null,
      weight: tag['@_weight'],
      infobox: tag['@_infobox'] ?? false,
      localSpoiler: tag['@_localspoiler'],
      globalSpoiler: tag['@_globalspoiler'],
      verified: tag['@_verified'],
      updatedAt: tag['@_update'] ?? null,

      name: tag['name'],
      description: tag['description'] ?? null,
      pictureFileName: tag['picurl'] ?? null,

      resources: this.mapResources(tag['resources']),
    })) ?? [];
  }
}
