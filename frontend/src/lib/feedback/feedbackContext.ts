import { browser } from '$app/environment';
import { ORpcContract } from '$lib/ORpcHelper';
import type { InferContractRouterInputs } from '@orpc/contract';
import { getClientErrorLog } from './clientErrorLog';

type FeedbackSubmitInput = InferContractRouterInputs<typeof ORpcContract>['feedback']['submit'];

export type FeedbackContext = NonNullable<FeedbackSubmitInput['context']>;
export type FeedbackPageContext = NonNullable<FeedbackContext['page']>;
export type FeedbackPageContextProvider = () => FeedbackPageContext | Promise<FeedbackPageContext>;

let pageContextProvider: FeedbackPageContextProvider | null = null;

/**
 * Pages can register a provider to attach page-specific data (e.g. video player state)
 * to feedback reports. Returns an unregister function (call it on page destroy).
 */
export function registerFeedbackPageContextProvider(provider: FeedbackPageContextProvider): () => void {
  if (!browser) {
    // This module holds module-level state, which would be shared between all requests/users on the server
    throw new Error('registerFeedbackPageContextProvider must only be called in the browser (e.g. inside onMount)');
  }

  pageContextProvider = provider;

  return () => {
    if (pageContextProvider === provider) {
      pageContextProvider = null;
    }
  };
}

export async function collectFeedbackContext(): Promise<FeedbackContext> {
  let page: FeedbackPageContext | null = null;
  if (pageContextProvider != null) {
    try {
      page = await pageContextProvider();
    } catch (err) {
      page = { collectError: err instanceof Error ? `${err.name}: ${err.message}` : String(err) };
    }
  }

  return {
    url: window.location.pathname + window.location.search,
    userAgent: navigator.userAgent,
    viewport: {
      width: window.innerWidth,
      height: window.innerHeight,
    },
    clientErrors: [...getClientErrorLog()],
    page,
  };
}
