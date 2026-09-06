import type { SideBarMenuItems } from '$lib/components/(new layout)/AppSideBar.svelte';
import { rpcClient } from '$lib/oRPC';
import { m } from '$lib/paraglide/messages.js';
import type { RenderingLayoutData } from '../types';
import type { LayoutServerLoad } from './$types';

const sideBarMenuItems: SideBarMenuItems = [
  { label: m.nav_files_default_file_system(), href: '/browse/_/', icon: 'folder-open' },
];

export const load: LayoutServerLoad = async ({ fetch, cookies }) => {
  const loggedInUser = await rpcClient.user.get(undefined, { context: { cookies, fetch } });

  return {
    loggedInUser,
    rendering: {
      layout: {
        sideBarMenuItems,
      },
    },
  } satisfies RenderingLayoutData & { loggedInUser: typeof loggedInUser };
};
