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
  .input(z.object({ startUri: z.string().optional() }).optional())
  .output(z.strictObject({
    /** The file to pre-select on open (set when `startUri` pointed at a file), or `null`. */
    selectedUri: z.string().nullable(),

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
        lastModified: z.number(),
        sizeBytes: z.number(),
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
        lastModified: z.number(),
        sizeBytes: z.number(),
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
