import type { TablerIconId } from '$lib/components/TablerIcon.svelte';
import { getContext, setContext } from 'svelte';

type SideBarBottomButton = {
  label: string,
  href: string,
  icon: TablerIconId,
};

const CONTEXT_KEY = Symbol('AppSideBarExtras');

export function initAppSideBarExtras(): AppSideBarExtras {
  if (getContext(CONTEXT_KEY) != null) {
    throw new Error('AppSideBarExtras context is already set');
  }

  return setContext(CONTEXT_KEY, new AppSideBarExtras());
}

export function getAppSideBarExtras(): AppSideBarExtras {
  const appSideBarExtras = getContext(CONTEXT_KEY);
  if (appSideBarExtras instanceof AppSideBarExtras) {
    return appSideBarExtras;
  }

  throw new Error('AppSideBarExtras context is not set');
}

class AppSideBarExtras {
  public bottomButton: SideBarBottomButton | null = $state(null);

  setBottomButton(bottomButton: SideBarBottomButton | null): void {
    this.bottomButton = bottomButton;
  }
}
