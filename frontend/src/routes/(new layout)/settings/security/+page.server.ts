import { rpcClient } from '$lib/oRPC';
import type { PageServerLoad } from '../../../../../.svelte-kit/types/src/routes/(new layout)/media/$types';
import type { AuthenticatedPageData } from '../../types';

export const load: PageServerLoad = async ({ fetch, cookies }) => {
  return (await rpcClient
    .user
    .settings
    .security
    .get(undefined, { context: { cookies, fetch } })) satisfies AuthenticatedPageData;
};
