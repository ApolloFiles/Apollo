import type { SideBarMenuItems } from '$lib/components/(new layout)/AppSideBar.svelte';

type Library = {
  id: string,
  name: string,
  isOwner: boolean,
};

// TODO: Drop support for array of Library once all usages are migrated
export function buildMediaSideBarMenuItems(libraries: (Library[] | {
  owned: { id: string, name: string, directoryUris: string[] }[],
  sharedWith: { id: string, name: string }[]
})): SideBarMenuItems {
  const sideBarMenuItems: SideBarMenuItems = [
    { label: 'Overview', href: '/media/', icon: 'device-desktop' },
  ];

  if (Array.isArray(libraries)) {
    libraries = {
      owned: libraries.filter(l => l.isOwner).map(l => ({ id: l.id, name: l.name, directoryUris: [] as string[] })),
      sharedWith: libraries.filter(l => !l.isOwner).map(l => ({ id: l.id, name: l.name })),
    };
  }

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
