import type { SideBarMenuItems } from '$lib/components/(new layout)/AppSideBar.svelte';

type Libraries = {
  owned: { id: string, name: string }[],
  sharedWith: { id: string, name: string }[],
};

// TODO: Drop support for array of Library once all usages are migrated
export function buildMediaSideBarMenuItems(libraries: Libraries): SideBarMenuItems {
  const sideBarMenuItems: SideBarMenuItems = [
    { label: 'Overview', href: '/media/', icon: 'device-desktop' },
  ];

  for (const library of libraries.owned) {
    sideBarMenuItems.push({
      label: library.name,
      href: `/media/${library.id}`,
      icon: 'device-desktop',
    });
  }

  if (libraries.owned.length > 0 && libraries.sharedWith.length > 0) {
    sideBarMenuItems.push('divider');
  }

  for (const library of libraries.sharedWith) {
    sideBarMenuItems.push({
      label: library.name,
      href: `/media/${library.id}`,
      icon: 'device-desktop',
    });
  }

  return sideBarMenuItems;
}
