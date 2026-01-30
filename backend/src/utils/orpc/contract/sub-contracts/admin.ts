import { z } from 'zod';
import { baseOc } from '../SubContractHelpers.js';
import { ORPC_LOGGED_IN_USER_SCHEMA } from './user.js';

const getUserList = baseOc
  .input(z.undefined())
  .output(z.strictObject({
    loggedInUser: ORPC_LOGGED_IN_USER_SCHEMA,
    users: z.array(z.strictObject({
      id: z.string(),
      displayName: z.string(),
      blocked: z.boolean(),
      isSuperUser: z.boolean(),
    })),
  }));
const getUserDetails = baseOc
  .input(z.object({ id: z.string() }))
  .output(z.strictObject({
    loggedInUser: ORPC_LOGGED_IN_USER_SCHEMA,
    user: z.strictObject({
      id: z.string(),
      displayName: z.string(),
      blocked: z.boolean(),
      isSuperUser: z.boolean(),
      createdAt: z.date(),
      lastLoginDate: z.date().nullable(),
      lastActivityDate: z.date().nullable(),
    }),
    linkedAuthProviders: z.array(z.strictObject({
      identifier: z.string(),
      displayName: z.string(),
      providerUserId: z.string(),
      providerUserDisplayName: z.string().nullable(),
      linkedAt: z.date(),
    })),
  }));
const updateUserBlockStatus = baseOc
  .input(z.object({ id: z.string(), block: z.boolean() }))
  .output(z.undefined());
const unlinkAUsersAuthProvider = baseOc
  .input(z.object({ id: z.string(), providerId: z.string() }))
  .output(z.undefined());

const createAccountCreationInvitation = baseOc
  .input(z.undefined())
  .output(z.strictObject({
    inviteToken: z.string(),
  }));

const getAdminDebugInfo = baseOc
  .input(z.undefined())
  .output(z.strictObject({
    ownProcessId: z.number(),
    nvidiaGpuInUse: z.boolean(),
    openFileDescriptors: z.array(z.strictObject({
      fd: z.number(),
      linkTarget: z.string(),
      childProcessPid: z.number().nullable(),
    })),
  }));

export const adminContract = {
  users: {
    list: getUserList,
    get: getUserDetails,
    updateBlock: updateUserBlockStatus,
    unlinkAuthProvider: unlinkAUsersAuthProvider,
  },

  accountCreationInvitation: {
    create: createAccountCreationInvitation,
  },

  debug: {
    collectDebugInfo: getAdminDebugInfo,
  },
};
