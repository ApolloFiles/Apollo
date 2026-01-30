import { z } from 'zod';
import { baseOc } from '../SubContractHelpers.js';

export const ORPC_LOGGED_IN_USER_SCHEMA = z.strictObject({
  id: z.string(),
  displayName: z.string(),
  isSuperUser: z.boolean(),
});

const getUser = baseOc
  .input(z.undefined())
  .output(ORPC_LOGGED_IN_USER_SCHEMA);

const updateProfileDisplayName = baseOc
  .input(z.object({ displayName: z.string().trim().nonempty().max(50) }))
  .output(z.undefined());
const updateProfilePicture = baseOc
  .input(z.object({ file: z.instanceof(File).nullable() }))
  .output(z.undefined());

const getSecuritySettingsData = baseOc
  .input(z.undefined())
  .output(z.strictObject({
    loggedInUser: ORPC_LOGGED_IN_USER_SCHEMA,

    sessions: z.strictObject({
      currentId: z.bigint(),
      all: z.array(z.strictObject({
        id: z.bigint(),
        createdAt: z.date(),
        expiresAt: z.date(),
        roughLastActivity: z.date(),
        userAgent: z.string(),
      })),
    }),

    linkedAuthProviders: z.array(z.strictObject({
      identifier: z.string(),
      displayName: z.string(),
      providerUserId: z.string(),
      providerUserDisplayName: z.string().nullable(),
      linkedAt: z.date(),
    })),
    allAuthProviderTypes: z.array(z.strictObject({
      identifier: z.string(),
      displayName: z.string(),
    })),
  }));
const revokeSingleSession = baseOc
  .input(z.object({ sessionId: z.coerce.bigint() }))
  .output(z.undefined());
const revokeAllSessionsExceptCurrent = baseOc
  .input(z.undefined())
  .output(z.undefined());

export const userContract = {
  get: getUser,

  settings: {
    profile: {
      updateDisplayName: updateProfileDisplayName,
      updateProfilePicture: updateProfilePicture,
    },
    security: {
      get: getSecuritySettingsData,
      revokeSingleSession: revokeSingleSession,
      revokeAllSessionsExceptCurrent: revokeAllSessionsExceptCurrent,
    },
  },
};
