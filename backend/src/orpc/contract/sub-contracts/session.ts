import { z } from 'zod';
import { baseOc } from '../SubContractHelpers.js';
import { UI_LANGUAGE_SCHEMA } from './user.js';

const getSession = baseOc
  .input(z.undefined())
  .output(
    z.strictObject({
      user: z.strictObject({
        id: z.string(),
        name: z.string(),
        isSuperUser: z.boolean(),
        uiLanguage: UI_LANGUAGE_SCHEMA,
      }),
    })
      .nullable(),
  );

export const sessionContract = {
  get: getSession,
};
