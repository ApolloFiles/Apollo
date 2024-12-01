import Path from 'node:path';
import { getConfig } from '../Constants';
import ApolloUserStorage from '../user/ApolloUserStorage';
import { LoginTemplateData } from './LoginTemplate';

export type LoginPageData = {
  oAuthProvider: { id: string, displayName: string, href: string }[];
};

export default class FrontendRenderingDataAccess {
  async getLoggedInUser(currentUrl: URL) {
    const userId = currentUrl.searchParams.get('_apollo_logged_in_user_id');
    if (userId == null) {
      return null;
    }

    const user = await new ApolloUserStorage().findById(BigInt(userId));
    if (user == null) {
      return null;
    }

    return {
      id: user.id.toString(),
      displayName: user.displayName
    };
  }

  getLoginData(): LoginPageData {
    const oAuthProvider: LoginTemplateData['oAuthProvider'] = [];

    for (const thirdPartyKey in getConfig().data.login.thirdParty) {
      const thirdParty = getConfig().data.login.thirdParty[thirdPartyKey];

      if (!thirdParty.enabled) {
        continue;
      }

      oAuthProvider.push({
        id: thirdPartyKey,
        displayName: thirdParty.displayName ?? thirdPartyKey,
        //        href: `${Path.join('/login/third-party/', thirdPartyKey)}?returnTo=${encodeURIComponent(extractReturnTo(req))}`
        href: `${Path.join('/login/third-party/', thirdPartyKey)}`
      });
    }

    return { oAuthProvider };
  }
}
