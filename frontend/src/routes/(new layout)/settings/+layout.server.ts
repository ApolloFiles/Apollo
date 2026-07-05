import { m } from '$lib/paraglide/messages.js';
import type { RenderingLayoutData } from '../types';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = (): RenderingLayoutData => {
  return {
    rendering: {
      layout: {
        sideBarMenuItems: [
          { label: m.nav_settings_profile(), href: '/settings/profile', icon: 'user-filled' },
          { label: m.nav_settings_language(), href: '/settings/language', icon: 'language' },
          { label: m.nav_settings_security(), href: '/settings/security', icon: 'shield-lock' },
        ],
      },
    },
  };
};
