import { dev } from '$app/environment';
import type { LoginPageData } from '../../../../src/frontend/FrontendRenderingDataAccess';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }): Promise<LoginPageData> => {
  if (!dev) {
    return locals.apollo.frontendRenderingDataAccess.getLoginData();
  }

  function createProvider(name: string) {
    return { id: name.toLowerCase(), displayName: name, href: '' };
  }

  return {
    loggedInUser: null,
    pageData: {
      oAuthProvider: [
        createProvider('Apple'),
        createProvider('Bluesky'),
        createProvider('Discord'),
        createProvider('Facebook'),
        createProvider('GitHub'),
        createProvider('GitLab'),
        createProvider('Google'),
        createProvider('Mastodon'),
        createProvider('Microsoft'),
        createProvider('Reddit'),
        createProvider('Telegram'),
        {
          id: 'x',
          displayName: 'X (Twitter)',
          href: '',
        },
        createProvider('Generic OpenID Connect'),
      ],
    },
  };
};
