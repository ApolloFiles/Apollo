import type { RenderingLayoutData } from '../types';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = (): RenderingLayoutData => {
  return {
    rendering: {
      layout: {
        sideBarMenuItems: [
          { label: 'Profile', href: '/settings/profile', icon: 'user-filled' },
          { label: 'Language', href: '/settings/language', icon: 'language' },
          { label: 'Security', href: '/settings/security', icon: 'shield-lock' },
        ],
      },
    },
  };
};
