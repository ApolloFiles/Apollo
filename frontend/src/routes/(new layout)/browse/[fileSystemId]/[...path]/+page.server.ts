import { rpcClient } from '$lib/oRPC';
import { isDefinedError, safe } from '@orpc/client';
import { error } from '@sveltejs/kit';

export async function load({ cookies, fetch, params }) {
  const requestedFilePath = params.path.startsWith('/') ? params.path : `/${params.path}`;

  const fileListResult = await safe(rpcClient.files.browse.listFilesInVirtualFileSystem(
    {
      fileSystemId: params.fileSystemId,
      path: requestedFilePath,
    },
    { context: { cookies, fetch } },
  ));

  if (isDefinedError(fileListResult.error) && fileListResult.error.code === 'REQUESTED_ENTITY_NOT_FOUND') {
    error(404, 'File system or path not found');
  } else if (fileListResult.error) {
    throw fileListResult.error;
  }

  return {
    current: {
      fileSystemId: params.fileSystemId,
      path: requestedFilePath,
    },
    fileList: fileListResult.data,
  };
}
