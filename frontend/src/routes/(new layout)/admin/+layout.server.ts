import type { RenderingLayoutData } from '../types';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = (): RenderingLayoutData => {
  return {
    rendering: {
      layout: {
        sideBarMenuItems: [
          { label: 'Users', href: '/admin/users', icon: 'users' },
          'divider',
          { label: 'Debug (legacy)', href: '/admin/debug', icon: 'bug' },
        ],
      },
    },
  };
};
