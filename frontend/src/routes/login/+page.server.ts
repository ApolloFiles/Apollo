import { dev } from '$app/environment';
import type { LoginPageData } from '../../../../src/frontend/FrontendRenderingDataAccess';
import type { PageServerLoad } from './$types';


export const load: PageServerLoad = async ({ locals }): Promise<LoginPageData> => {
  if (dev) {
    return {
      oAuthProvider: [
        {
          id: 'microsoft',
          displayName: 'Microsoft',
          href: 'https://login.microsoftonline.com/consumers/oauth2/v2.0/authorize'
        },
        {
          id: 'github',
          displayName: 'GitHub',
          href: 'https://github.com/login/oauth/authorize'
        }
      ]
    };
  }

  return locals.apollo.frontendRenderingDataAccess.getLoginData();
};
