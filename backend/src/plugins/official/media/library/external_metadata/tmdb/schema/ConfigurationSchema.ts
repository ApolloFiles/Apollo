import { z } from 'zod';

/** @internal */
export type ApiConfiguration = z.infer<typeof TMDB_CONFIGURATION_SCHEMA>;

const IMAGE_SIZES_SCHEMA = z.array(z.string().nonempty())
  .refine((sizes) => sizes.includes('original'), { error: 'Expected the image sizes to include \'original\'' });

/** @internal */
export const TMDB_CONFIGURATION_SCHEMA = z.object({
  change_keys: z.array(z.string()),
  images: z.object({
    base_url: z.string().endsWith('/'),
    secure_base_url: z.string().endsWith('/'),
    backdrop_sizes: IMAGE_SIZES_SCHEMA,
    logo_sizes: IMAGE_SIZES_SCHEMA,
    poster_sizes: IMAGE_SIZES_SCHEMA,
    profile_sizes: IMAGE_SIZES_SCHEMA,
    still_sizes: IMAGE_SIZES_SCHEMA,
  }),
});
