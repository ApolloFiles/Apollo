import z from 'zod';
import {
  multilineText,
  partialSimpleDate,
  simpleDate,
  xmlArray,
  xmlBool,
  xmlInt,
  xmlNumber,
  xmlText,
} from '../xml/XmlSchemaHelpers.js';

/** @internal */
export type NormalizedAnimeXml = z.infer<typeof NORMALIZING_ANIME_XML_SCHEMA>;
/** @internal */
export type AnimeResources = z.infer<typeof SCHEMA_RESOURCES>;

const SCHEMA_RATING = z.strictObject({
  '#text': xmlNumber,
  '@_count': xmlInt,
});

const SCHEMA_VOTE_RATING = z.strictObject({
  '#text': xmlNumber,
  '@_votes': xmlInt,
});

const SCHEMA_EXTERNAL_ENTITY = z
  .strictObject({
    identifier: xmlArray(xmlText),
    url: xmlText.optional(),
  })
  .refine((entity) => (entity.identifier.length > 0) !== (entity.url != null), 'An external entity has to have either identifiers or a url')
  .transform((entity): { identifier: string[] } | { url: string } => {
    return entity.url != null ? { url: entity.url } : { identifier: entity.identifier };
  });

const SCHEMA_RESOURCES = z.strictObject({
  resource: xmlArray(
    z
      .strictObject({
        '@_type': xmlInt,
        externalentity: xmlArray(SCHEMA_EXTERNAL_ENTITY),
      })
      .refine((resource) => new Set(resource.externalentity.map((entity) => 'url' in entity)).size <= 1, 'A resource cannot mix identifiers and urls'),
  ),
});

/** @internal */
export const NORMALIZING_ANIME_XML_SCHEMA = z.strictObject({
  '?xml': z.strictObject({
    '@_version': z.literal('1.0'),
    '@_encoding': z.string().refine(x => x.toLowerCase() === 'utf-8'),
    '#text': z.literal('').optional(),
  }),

  anime: z.strictObject({
    '@_id': xmlInt,
    type: xmlText,
    '@_restricted': xmlBool,
    episodecount: xmlText.pipe(xmlInt),
    startdate: xmlText.pipe(partialSimpleDate).optional(),
    enddate: xmlText.pipe(partialSimpleDate).optional(),
    url: xmlText.optional(),
    description: xmlText.pipe(multilineText).optional(),
    picture: xmlText.optional(),

    titles: z.strictObject({
      title: xmlArray(
        z.strictObject({
          '#text': z.string(),
          '@_xml:lang': z.string(),
          '@_type': z.string(),
        }),
      ),
    }),

    tags: z.strictObject({
      tag: xmlArray(z.strictObject({
        name: xmlText,
        description: xmlText.pipe(multilineText).optional(),
        picurl: xmlText.optional(),
        resources: SCHEMA_RESOURCES.optional(),
        '@_id': xmlInt,
        '@_parentid': xmlInt.optional(),
        '@_infobox': xmlBool.optional(),
        '@_weight': xmlInt,
        '@_localspoiler': xmlBool,
        '@_globalspoiler': xmlBool,
        '@_verified': xmlBool,
        '@_update': simpleDate.optional(),
      })),
    }).optional(),
    resources: SCHEMA_RESOURCES.optional(),
    episodes: z.strictObject({
      episode: xmlArray(z.strictObject({
        epno: z.strictObject({
          '@_type': xmlInt,
          '#text': z.string(),
        }),
        length: z.strictObject({
          '#text': xmlInt,
        }),
        airdate: xmlText.pipe(simpleDate).optional(),
        rating: SCHEMA_VOTE_RATING.optional(),
        title: xmlArray(z.strictObject({
          '#text': z.string(),
          '@_xml:lang': z.string(),
        })),
        summary: xmlText.pipe(multilineText).optional(),
        resources: SCHEMA_RESOURCES.optional(),
        '@_id': xmlInt,
        '@_update': simpleDate,
        '@_recap': xmlBool.optional(),
      })),
    }).optional(),

    characters: z.strictObject({
      character: xmlArray(z.strictObject({
        rating: SCHEMA_VOTE_RATING.optional(),
        name: xmlText,
        gender: xmlText,
        charactertype: z.strictObject({
          '#text': z.string(),
          '@_id': xmlInt,
        }),
        description: xmlText.pipe(multilineText).optional(),
        picture: xmlText.optional(),
        seiyuu: xmlArray(z.strictObject({
          '#text': z.string(),
          '@_id': xmlInt,
          '@_picture': z.string().optional(),
        })).optional(),
        '@_id': xmlInt,
        '@_type': z.string(),
        '@_update': simpleDate,
      })),
    }).optional(),
    creators: z.strictObject({
      name: xmlArray(z.strictObject({
        '@_id': xmlInt,
        '#text': z.string(),
        '@_type': z.string(),
      })),
    }).optional(),

    relatedanime: z.strictObject({
      anime: xmlArray(z.strictObject({
        '#text': z.string(),
        '@_id': xmlInt,
        '@_type': z.string(),
      })),
    }).optional(),
    similaranime: z.strictObject({
      anime: xmlArray(z.strictObject({
        '#text': z.string(),
        '@_id': xmlInt,
        '@_approval': xmlInt,
        '@_total': xmlInt,
      })),
    }).optional(),
    recommendations: z.strictObject({
      recommendation: xmlArray(z.strictObject({
        '@_uid': xmlInt,
        '#text': multilineText,
        '@_type': z.string(),
      })),
      '@_total': xmlInt,
      '#text': z.literal('').optional(),
    }).optional(),

    ratings: z.strictObject({
      permanent: SCHEMA_RATING,
      temporary: SCHEMA_RATING.optional(),
      review: SCHEMA_RATING.optional(),
    }).optional(),
  }),
});
