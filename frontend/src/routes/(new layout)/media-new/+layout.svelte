<script lang="ts">
  import 'inter-ui/inter.css';

  import { page } from '$app/state';
  import Sidebar from '$lib/components/media/layout/Sidebar.svelte';
  import TopNavbar from '$lib/components/media/layout/TopNavbar.svelte';

  const { children } = $props();

  // TODO: Proper type hint that is also used by the page load functions
  let libraryData: { id: string, name: string, isOwner: boolean }[] = $derived(page.data.page.libraries);
  let activeLibraryId: string | null = $derived(page.params.libraryId ?? null);

  let sidebarRef: Sidebar | null = null;

  function toggleSidebar(): void {
    if (sidebarRef) {
      sidebarRef.toggleSidebar();
    }
  }
</script>

<!-- FIXME: Get rid of these external styles -->
<svelte:head>
  <!-- Font Awesome -->
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/7.0.1/css/all.min.css"
        integrity="sha512-2SwdPD6INVrV/lHTZbO2nodKhrnDdJK9/kg2XD1r9uGqPo1cUbujc+IYdlYdEErWNu69gVcYgdxlmVmzTWnetw=="
        crossorigin="anonymous" referrerpolicy="no-referrer" />
</svelte:head>

<Sidebar
  bind:this={sidebarRef}
  libraries={libraryData}
  activeLibraryId={activeLibraryId}
/>

<main class="main-content" class:details-view={page.data.rendering?.mainContentType === 'detail-page'}>
  <TopNavbar
    onSidebarToggleClicked={toggleSidebar}
    renderAsOverlay={page.data.rendering?.topBarOverlay ?? false}
  />
  {@render children()}
</main>

<style>
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
  }

  /* Main Content */
  .main-content {
    margin-left: var(--sidebar-width);
    padding:     20px 40px;
    transition:  margin-left 0.3s ease;
  }

  .main-content.details-view {
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
