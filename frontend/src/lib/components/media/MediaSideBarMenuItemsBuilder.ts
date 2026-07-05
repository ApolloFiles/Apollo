import type { SideBarMenuItem, SideBarMenuItems } from '$lib/components/(new layout)/AppSideBar.svelte';
import { m } from '$lib/paraglide/messages.js';

type LibraryEntry = { id: string, name: string, hideFromSidebar: boolean };
type Libraries = {
  owned: LibraryEntry[],
  sharedWith: LibraryEntry[],
};

// TODO: Drop support for array of Library once all usages are migrated
export function buildMediaSideBarMenuItems(libraries: Libraries): SideBarMenuItems {
  const toMenuItem = (library: LibraryEntry): SideBarMenuItem => ({
    label: library.name,
    href: `/media/${library.id}`,
    icon: 'device-desktop',
  });

  const ownedVisible = libraries.owned.filter(l => !l.hideFromSidebar);
  const sharedVisible = libraries.sharedWith.filter(l => !l.hideFromSidebar);
  const hidden = [
    ...libraries.owned.filter(l => l.hideFromSidebar),
    ...libraries.sharedWith.filter(l => l.hideFromSidebar),
  ];

  const sideBarMenuItems: SideBarMenuItems = [
    { label: m.nav_media_overview(), href: '/media/', icon: 'device-desktop' },
  ];

  for (const library of ownedVisible) {
    sideBarMenuItems.push(toMenuItem(library));
  }

  if (ownedVisible.length > 0 && sharedVisible.length > 0) {
    sideBarMenuItems.push('divider');
  }

  for (const library of sharedVisible) {
    sideBarMenuItems.push(toMenuItem(library));
  }

  if (hidden.length > 0) {
    sideBarMenuItems.push({
      kind: 'group',
      label: m.nav_media_more(),
      items: hidden.map(toMenuItem),
    });
  }

  return sideBarMenuItems;
}
