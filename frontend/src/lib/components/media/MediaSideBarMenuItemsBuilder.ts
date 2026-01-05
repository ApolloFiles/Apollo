import type { SideBarMenuItems } from '$lib/components/(new layout)/AppSideBar.svelte';

type Library = {
  id: string,
  name: string,
  isOwner: boolean,
};

export function buildMediaSideBarMenuItems(libraries: Library[]): SideBarMenuItems {
  const sideBarMenuItems: SideBarMenuItems = [
    { label: 'Overview', href: '/media/', icon: 'device-desktop' },
  ];

  const ownedLibraries = libraries.filter(l => l.isOwner);
  const sharedLibraries = libraries.filter(l => !l.isOwner);

  for (const library of ownedLibraries) {
    sideBarMenuItems.push({
      label: library.name,
      href: `/media/${library.id}`,
      icon: 'device-desktop',
    });
  }

  if (ownedLibraries.length > 0 && sharedLibraries.length > 0) {
    sideBarMenuItems.push('divider');
  }

  for (const library of sharedLibraries) {
    sideBarMenuItems.push({
      label: library.name,
      href: `/media/${library.id}`,
      icon: 'device-desktop',
    });
  }

  return sideBarMenuItems;
}
