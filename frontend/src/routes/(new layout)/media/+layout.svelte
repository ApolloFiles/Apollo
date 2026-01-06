<script lang="ts">
  import { getAppSideBarExtras } from '$lib/stores/AppSideBarExtrasStore.svelte';
  import { onDestroy } from 'svelte';
  import { goto } from '$app/navigation';

  const { children } = $props();

  const appSideBarExtras = getAppSideBarExtras();

  appSideBarExtras.setBottomButton({
    label: 'Manage Media',
    href: '/media/manage',
    icon: 'settings',
  });

  onDestroy(() => {
    appSideBarExtras.setBottomButton(null);
  });
</script>

{@render children()}
