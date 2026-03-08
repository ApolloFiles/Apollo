import { z } from 'zod';
import { baseOc } from '../SubContractHelpers.js';

const getFileListForVirtualFileSystem = baseOc
  .input(z.object({ fileSystemId: z.string(), path: z.string() }))
  .output(z.strictObject({
    files: z.array(z.strictObject({
      name: z.string(),
      isDirectory: z.boolean(),
      path: z.string(),
    })),
  }));

export const filesContract = {
  browse: {
    listFilesInVirtualFileSystem: getFileListForVirtualFileSystem,
  },
};
