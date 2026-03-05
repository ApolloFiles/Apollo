<script lang="ts">
  import { page } from '$app/state';
  import AppSideBar, { type SideBarMenuItems } from '$lib/components/(new layout)/AppSideBar.svelte';
  import AppTopNav from '$lib/components/(new layout)/AppTopNav.svelte';
  import { setUserProfileContext } from '$lib/stores/UserProfileStore.svelte';
  import type { Snippet } from 'svelte';

  const {
    children,
    sideBarMenuItems,
    topBarRenderAsOverlay = false,
    topBarSearchFormAction,
    mainContentType,
  }: {
    children: Snippet,
    sideBarMenuItems: SideBarMenuItems,
    topBarRenderAsOverlay?: boolean,
    topBarSearchFormAction?: string,
    mainContentType?: 'media-detail',
  } = $props();
  setUserProfileContext(() => page.data);

  let appSideBarRef: AppSideBar | null = $state(null);
</script>

<AppSideBar
  bind:this={appSideBarRef}
  menuItems={sideBarMenuItems}
/>

<main
  class="main-content"
  class:media-detail-view={mainContentType === 'media-detail'}
>
  <AppTopNav
    appSideBarRef={appSideBarRef}
    renderAsOverlay={topBarRenderAsOverlay}
    searchFormAction={topBarSearchFormAction}
  />

  {@render children()}
</main>

<style>
  /* FIXME: Get rid of all the :global in here, it messes with pages using another layout */
  :global(:root) {
    /* Core Colors */
    --primary-bg:             #0f1014;
    --secondary-bg:           #1a1c23;
    --accent-color:           #e50914;
    --text-primary:           #fff;
    --text-secondary:         #a3a3a3;
    --text-muted:             #ccc;
    --text-inverse:           #000;

    /* UI Elements */
    --scrollbar-track:        var(--primary-bg);
    --scrollbar-thumb:        #333;
    --scrollbar-thumb-hover:  #555;

    --hover-bg:               rgba(255, 255, 255, 0.1);
    --active-bg:              rgba(255, 255, 255, 0.1);
    --border-color:           rgba(255, 255, 255, 0.1);

    --input-bg:               var(--secondary-bg);
    --input-focus-bg:         #2a2d35;
    --input-focus-border:     rgba(255, 255, 255, 0.1);

    --card-shadow:            rgba(0, 0, 0, 0.5);
    --overlay-gradient-start: rgba(0, 0, 0, 0.9);

    --hero-overlay-mid:       rgba(15, 16, 20, 0.8);
    --hero-overlay-end:       rgba(15, 16, 20, 0.2);

    --btn-secondary-bg:       rgba(255, 255, 255, 0.2);
    --btn-secondary-hover:    rgba(255, 255, 255, 0.3);

    --sidebar-width:          250px;
    --card-hover-scale:       1.05;
  }

  :global(body) {
    background-color: var(--primary-bg);
    color:            var(--text-primary);
    font-family:      'Inter', sans-serif;
    overflow-x:       hidden;
    margin:           0;
  }

  /* TODO: Remove .icon as soon as TablerIcon-Component is used everywhere */
  :global(.icon) {
    vertical-align: text-top;
  }

  :global(*) {
    font-variant-ligatures: none;
  }

  /* Main Content */
  .main-content {
    margin-left: var(--sidebar-width);
    padding:     20px 40px;
    transition:  margin-left 0.3s ease;
  }

  .main-content.media-detail-view {
    padding:  0;
    position: relative;
  }

  @media (max-width: 768px) {
    .main-content {
      margin-left: 0;
      padding:     15px;
    }
  }
</style>
