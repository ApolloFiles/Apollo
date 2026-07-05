<script lang="ts">
  import { m } from '$lib/paraglide/messages.js';
  import { getAppSideBarExtras } from '$lib/stores/AppSideBarExtrasStore.svelte';
  import { onDestroy } from 'svelte';
  import { goto } from '$app/navigation';

  const { children } = $props();

  const appSideBarExtras = getAppSideBarExtras();

  appSideBarExtras.setBottomButton({
    label: m.nav_media_manage(),
    href: '/media/manage',
    icon: 'settings',
  });

  onDestroy(() => {
    appSideBarExtras.setBottomButton(null);
  });
</script>

{@render children()}
