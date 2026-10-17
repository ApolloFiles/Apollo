import { TMDB_CONFIGURATION_SCHEMA } from '#src/plugins/official/media/library/external_metadata/tmdb/schema/ConfigurationSchema.js';

function createConfiguration(posterSizes: string[]): unknown {
  return {
    change_keys: ['adult', 'air_date', 'also_known_as', 'alternative_titles', 'images', 'translations'],
    images: {
      base_url: 'http://image.tmdb.org/t/p/',
      secure_base_url: 'https://image.tmdb.org/t/p/',
      backdrop_sizes: ['w300', 'w780', 'w1280', 'original'],
      logo_sizes: ['w45', 'w92', 'w154', 'w185', 'w300', 'w500', 'original'],
      poster_sizes: posterSizes,
      profile_sizes: ['w45', 'w185', 'h632', 'original'],
      still_sizes: ['w92', 'w185', 'w300', 'original'],
    },
  };
}

describe('TMDB_CONFIGURATION_SCHEMA', () => {
  test('Accepts the configuration TMDB currently responds with', () => {
    const configuration = createConfiguration(['w92', 'w154', 'w185', 'w342', 'w500', 'w780', 'original']);

    expect(TMDB_CONFIGURATION_SCHEMA.safeParse(configuration).success).toBe(true);
  });

  test('Rejects image sizes without the original size', () => {
    const configuration = createConfiguration(['w92', 'w154', 'w185', 'w342', 'w500', 'w780']);

    expect(() => TMDB_CONFIGURATION_SCHEMA.parse(configuration)).toThrow('Expected the image sizes to include \'original\'');
  });
});
