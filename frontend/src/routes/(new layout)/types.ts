import type { SideBarMenuItems } from '$lib/components/(new layout)/AppSideBar.svelte';

export type AuthenticatedPageData = {
  loggedInUser: {
    id: string,
    displayName: string,
  }
}

export type RenderingLayoutData = {
  rendering: {
    layout: {
      sideBarMenuItems: SideBarMenuItems,
      topNavAsOverlay?: boolean,
      searchFormAction?: string,
      mainContentType?: 'media-detail',
    }
  },
}
