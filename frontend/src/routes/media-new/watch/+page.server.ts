import { dev } from '$app/environment';
import type { AuthenticatedPageRequestData } from '../../../../../src/frontend/FrontendRenderingDataAccess';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, request }): Promise<AuthenticatedPageRequestData> => { // FIXME: return type
  if (!dev) {
    const loggedInUser = await locals.apollo.frontendRenderingDataAccess.getLoggedInUser(request);
    return {
      loggedInUser: loggedInUser,
      pageData: {},
    };
  }

  return {
    loggedInUser: {
      id: '22',
      displayName: 'Dev-User',
    },
    pageData: {},
  };
};
