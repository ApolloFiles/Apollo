import { m } from '$lib/paraglide/messages.js';
import type { RenderingLayoutData } from '../types';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = (): RenderingLayoutData => {
  return {
    rendering: {
      layout: {
        sideBarMenuItems: [
          { label: m.nav_admin_users(), href: '/admin/users', icon: 'users' },
          'divider',
          { label: 'Debug (legacy)', href: '/admin/debug', icon: 'bug' },
        ],
      },
    },
  };
};
