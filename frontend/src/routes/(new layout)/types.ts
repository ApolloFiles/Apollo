import type { SideBarMenuItems } from '$lib/components/(new layout)/AppSideBar.svelte';

/** Data provided by the group's root +layout.server.ts to all pages rendered inside AppLayout */
export type GlobalLayoutData = {
  feedback: {
    enabled: boolean,
  },
}

export type AuthenticatedPageData = {
  loggedInUser: {
    id: string,
    displayName: string,
    isSuperUser: boolean,
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
