import { z } from 'zod';
import { baseOc } from '../SubContractHelpers.js';

const getAccountCreationInvitation = baseOc
  .input(z.object({ token: z.string() }))
  .output(z.strictObject({
    createdAt: z.date(),
    expiresAt: z.date(),
  }));

export const authContract = {
  accountCreationInvitation: {
    get: getAccountCreationInvitation,
  },
};
