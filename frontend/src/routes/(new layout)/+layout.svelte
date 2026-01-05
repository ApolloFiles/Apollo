<script lang="ts">
  import { page } from '$app/state';
  import AppLayout from '$lib/components/(new layout)/AppLayout.svelte';
  import type { RenderingLayoutData } from './types';

  const { children } = $props();

  const renderingConfig: RenderingLayoutData['rendering'] | null = $derived.by(() => {
    const sideBarMenuitems = page.data.rendering?.layout?.sideBarMenuItems;
    if (Array.isArray(sideBarMenuitems)) {
      return page.data.rendering;
    }

    console.warn('page.data.rendering.layout.sideBarMenuItems should be configured explicitly on', page.url.pathname);
    return null;
  });
</script>

<AppLayout
  sideBarMenuItems={renderingConfig?.layout.sideBarMenuItems ?? []}
  topBarRenderAsOverlay={renderingConfig?.layout.topNavAsOverlay}
  topBarSearchFormAction={renderingConfig?.layout.searchFormAction}
  mainContentType={renderingConfig?.layout.mainContentType}
>
  {@render children()}
</AppLayout>
