import { z } from 'zod';
import { baseOc } from '../SubContractHelpers.js';

const getBackendConfig = baseOc
  .input(z.undefined())
  .output(z.strictObject({
    appBaseUrl: z.string(),
    internalBackendBaseUrl: z.string(),
    auth: z.strictObject({
      providers: z.array(z.strictObject({
        identifier: z.string(),
        displayName: z.string(),
      })),
    }),
  }));

export const tmpBackendContract = {
  getConfig: getBackendConfig,
};
