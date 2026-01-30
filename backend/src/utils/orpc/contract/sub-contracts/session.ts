import { z } from 'zod';
import { baseOc } from '../SubContractHelpers.js';

const getSession = baseOc
  .input(z.undefined())
  .output(
    z.strictObject({
      user: z.strictObject({
        id: z.string(),
        name: z.string(),
        isSuperUser: z.boolean(),
      }),
    })
      .nullable(),
  );

export const sessionContract = {
  get: getSession,
};
