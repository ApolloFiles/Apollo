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

const filePickerStart = baseOc
  .input(z.undefined())
  .output(z.strictObject({
    allFileSystems: z.array(z.strictObject({
      displayName: z.string(),
      uri: z.string(),
      isLocalFileSystem: z.boolean(),
    })),

    currentFileSystem: z.strictObject({
      displayName: z.string(),
      uri: z.string(),
      isLocalFileSystem: z.boolean(),

      directoriesAtRoot: z.array(z.strictObject({
        name: z.string(),
        uri: z.string(),
        isDirectory: z.literal(true),
      })),
    }),

    currentDirectory: z.strictObject({
      name: z.string(),
      uri: z.string(),

      breadcrumbs: z.array(z.strictObject({
        name: z.string(),
        uri: z.string(),
        isDirectory: z.literal(true),
      })),

      files: z.array(z.strictObject({
        name: z.string(),
        uri: z.string(),
        isDirectory: z.boolean(),
      })),
    }),
  }));

const filePickerOpenDirectory = baseOc
  .input(z.object({
    uri: z.string(),
  }))
  .output(z.strictObject({
    currentFileSystem: z.strictObject({
      displayName: z.string(),
      uri: z.string(),
      isLocalFileSystem: z.boolean(),

      directoriesAtRoot: z.array(z.strictObject({
        name: z.string(),
        uri: z.string(),
        isDirectory: z.literal(true),
      })),
    }),

    currentDirectory: z.strictObject({
      name: z.string(),
      uri: z.string(),

      breadcrumbs: z.array(z.strictObject({
        name: z.string(),
        uri: z.string(),
        isDirectory: z.literal(true),
      })),

      files: z.array(z.strictObject({
        name: z.string(),
        uri: z.string(),
        isDirectory: z.boolean(),
      })),
    }),
  }));

export const filesContract = {
  browse: {
    listFilesInVirtualFileSystem: getFileListForVirtualFileSystem,
  },

  filePicker: {
    start: filePickerStart,
    openDirectory: filePickerOpenDirectory,
  },
};
