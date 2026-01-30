import { z } from 'zod';
import { baseOc } from '../SubContractHelpers.js';
import { ORPC_LOGGED_IN_USER_SCHEMA } from './user.js';

const ORPC_LIBRARIES_SCHEMA = z.strictObject({
  owned: z.array(z.strictObject({
    id: z.string(),
    name: z.string(),
    directoryUris: z.array(z.string()),
  })),
  sharedWith: z.array(z.strictObject({
    id: z.string(),
    name: z.string(),
  })),
});
const ORPC_CREATE_LIBRARY_INPUT_SCHEMA = z.object({
  name: z.string().nonempty().max(256).transform(s => s.trim().replaceAll(/\s{2,}/g, ' ')),
  directoryUris: z.array(z.string().nonempty().max(500)),
  sharedWithUserIds: z.array(z.string().trim().nonempty()),
});

const getMediaLibraryOverview = baseOc
  .input(z.object({ libraryId: z.coerce.bigint().optional() }))
  .output(z.strictObject({
    loggedInUser: ORPC_LOGGED_IN_USER_SCHEMA,

    page: z.strictObject({
      libraries: ORPC_LIBRARIES_SCHEMA,
      continueWatching: z.array(z.strictObject({
        title: z.string(),
        watchProgressPercentage: z.number(),
        libraryId: z.string(),
        mediaId: z.string(),
        mediaItemId: z.string(),
        seasonNumber: z.number().optional(),
        episodeNumber: z.number().optional(),
      })),
      recentlyAdded: z.array(z.strictObject({
        title: z.string(),
        libraryId: z.string(),
        mediaId: z.string(),
      })),
    }),
  }));

const getMedia = baseOc
  .input(z.object({ libraryId: z.coerce.bigint(), mediaId: z.coerce.bigint() }))
  .output(z.strictObject({
    loggedInUser: ORPC_LOGGED_IN_USER_SCHEMA,
    page: z.strictObject({
      libraries: ORPC_LIBRARIES_SCHEMA,
      media: z.strictObject({
        id: z.string(),
        type: z.enum(['movie', 'tv_show']),
        title: z.string(),
        synopsis: z.string().nullable(),
        hasClearLogo: z.boolean(),
        genres: z.array(z.string()),
        nextMediaItemToWatch: z.strictObject({
          id: z.string(),
          title: z.string(),
          synopsis: z.string().nullable(),
          episodeNumber: z.number(),
          durationInSeconds: z.number(),
          watchProgress: z.strictObject({
            inSeconds: z.number(),
            asPercentage: z.number(),
          }).nullable(),
        }).nullable(),
        seasons: z.array(z.strictObject({
          seasonNumber: z.number(),
          episodes: z.array(z.strictObject({
            id: z.string(),
            episodeNumber: z.number(),
            title: z.string(),
            synopsis: z.string().nullable(),
            durationInSeconds: z.number(),
            watchProgress: z.strictObject({
              inSeconds: z.number(),
              asPercentage: z.number(),
            }).nullable(),
          })),
        })).optional(),
      }),
    }),
  }));

const getLibraryManagementInfo = baseOc
  .input(z.object({ libraryId: z.coerce.bigint() }))
  .output(z.strictObject({
    loggedInUser: ORPC_LOGGED_IN_USER_SCHEMA,

    library: z.strictObject({
      id: z.string(),
      name: z.string(),
      directoryUris: z.array(z.string()),
      sharedWith: z.array(z.strictObject({
        id: z.string(),
        displayName: z.string(),
      })),
    }),
    libraries: ORPC_LIBRARIES_SCHEMA,
  }));
const getLibraryList = baseOc
  .input(z.undefined())
  .output(z.strictObject({
    loggedInUser: ORPC_LOGGED_IN_USER_SCHEMA,
    libraries: ORPC_LIBRARIES_SCHEMA,
  }));

const deleteLibrary = baseOc
  .input(z.object({ libraryId: z.coerce.bigint() }))
  .output(z.undefined());
const createLibrary = baseOc
  .input(ORPC_CREATE_LIBRARY_INPUT_SCHEMA)
  .output(z.bigint());
const updateLibrary = baseOc
  .input(ORPC_CREATE_LIBRARY_INPUT_SCHEMA.extend({ id: z.coerce.bigint() }))
  .output(z.undefined());

const unshareMyselfFromOtherLibrary = baseOc
  .input(z.object({ libraryId: z.coerce.bigint() }))
  .output(z.undefined());

const searchUserToShareWith = baseOc
  .input(z.object({ searchQuery: z.string().trim().nonempty().max(75) }))
  .output(z.array(z.strictObject({
    id: z.string(),
    displayName: z.string(),
  })));

const getFullReIndexStatus = baseOc
  .input(z.undefined())
  .output(z.boolean());
const startFullReIndex = baseOc
  .input(z.undefined())
  .output(z.undefined());

export const mediaContract = {
  getMediaLibraryOverview: getMediaLibraryOverview,
  getMedia: getMedia,

  management: {
    get: getLibraryManagementInfo,
    list: getLibraryList,

    delete: deleteLibrary,
    createLibrary: createLibrary,
    updateLibrary: updateLibrary,
    unshareMyselfFromOther: unshareMyselfFromOtherLibrary,

    searchUserToShareWith: searchUserToShareWith,

    debug: {
      fullReIndexStatus: getFullReIndexStatus,
      startFullReIndex: startFullReIndex,
    },
  },
};
