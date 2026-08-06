import type { SideBarMenuItem, SideBarMenuItems } from '$lib/components/(new layout)/AppSideBar.svelte';

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
      /** Rendered pinned to the bottom of the sidebar, separated from the regular menu items */
      bottomButton?: SideBarMenuItem,
      topNavAsOverlay?: boolean,
      searchFormAction?: string,
      mainContentType?: 'media-detail',
    }
  },
}
