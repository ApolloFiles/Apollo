<script lang="ts">
  import { onMount } from 'svelte';
  import IconChevronDown from 'virtual:icons/tabler/chevron-down';
  import IconFolder from 'virtual:icons/tabler/folder-filled';
  import IconCircleCaretRight from 'virtual:icons/tabler/circle-caret-right';
  import IconHome from 'virtual:icons/tabler/home-filled';
  import IconDeviceDesktop from 'virtual:icons/tabler/device-desktop';

  let { libraries, activeLibraryId }: {
    libraries: { id: string, name: string, isOwner: boolean }[],
    activeLibraryId: string | null,
  } = $props();
  let ownedLibraries = $derived(libraries.filter(l => l.isOwner));
  let sharedLibraries = $derived(libraries.filter(l => !l.isOwner));

  let sidebarRef: HTMLElement | null = null;
  let sidebarActive = $state(false);

  export function toggleSidebar(): void {
    sidebarActive = !sidebarActive;
  }

  onMount(() => {
    function closeSidebarOnMobileWhenClickingOutside(event: MouseEvent): void {
      if (sidebarRef == null || !(event.target instanceof Node)) {
        return;
      }

      const isClickInsideSidebar = sidebarRef?.contains(event.target);
      const isClickOnToggle = event.target instanceof Element ? event.target.closest('[data-sidebar-toggle]') : false;

      if (!isClickInsideSidebar && !isClickOnToggle && window.innerWidth <= 768) {
        sidebarActive = false;
      }
    }

    document.addEventListener('click', closeSidebarOnMobileWhenClickingOutside, { passive: true });
    return () => {
      document.removeEventListener('click', closeSidebarOnMobileWhenClickingOutside);
    };
  });
</script>

<nav class="sidebar" bind:this={sidebarRef} class:active={sidebarActive}>
  <div class="sidebar-brand dropdown mb-4">
    <button
       type="button"
       class="d-flex align-items-center text-white dropdown-toggle no-caret"
       id="appDropdown"
       data-bs-toggle="dropdown"
       aria-expanded="false"
       aria-label="Switch App Section">
      <img src="/logo.svg"
           height="40"
           width="40"
           style="height: 40px; margin-right: 10px"
           alt=""
           role="presentation"
      >
      <span>
        <span class="fw-bold d-block">Apollo</span>
        <small class="text-secondary d-block" style="font-size: 0.8rem">Media&nbsp;<IconChevronDown class="icon ms-1 w-25 h-25" role="presentation" /></small>
      </span>
    </button>
    <ul class="dropdown-menu dropdown-menu-dark shadow" aria-labelledby="appDropdown">
      <li><a class="dropdown-item" href="/browse/"><IconFolder class="icon me-2" role="presentation" />File Browser</a></li>
      <li><a class="dropdown-item active" href="/media/"><IconCircleCaretRight class="icon me-2" role="presentation" />Media</a></li>
    </ul>
  </div>

  <div class="nav flex-column">
    <a href="/media/"
       class="nav-link"
       class:active={activeLibraryId == null}
    ><IconHome class="icon me-2" role="presentation" />Übersicht</a>

    {#each ownedLibraries as library}
      <a href="/media/{library.id}"
         class="nav-link"
         class:active={activeLibraryId === library.id}>
        <IconDeviceDesktop class="icon me-2" role="presentation" />{library.name}
      </a>
    {/each}

    {#if ownedLibraries.length > 0 && sharedLibraries.length > 0}
      <hr class="border-secondary my-3">
    {/if}

    {#each sharedLibraries as library}
      <a href="/media/{library.id}"
         class="nav-link"
         class:active={activeLibraryId === library.id}>
        <IconDeviceDesktop class="icon me-2" role="presentation" />{library.name}
      </a>
    {/each}
  </div>
</nav>

<style>
  /* Sidebar */
  .sidebar {
    position:         fixed;
    top:              0;
    left:             0;
    height:           100vh;
    width:            var(--sidebar-width);
    background-color: var(--secondary-bg);
    padding:          20px;
    z-index:          1000;
    transition:       transform 0.3s ease;
  }

  .sidebar-brand {
    display:       flex;
    align-items:   center;
    margin-bottom: 40px;
  }

  .sidebar-brand img {
    height:       40px;
    margin-right: 10px;
  }

  .nav-link {
    color:         var(--text-secondary);
    padding:       10px 15px;
    border-radius: 8px;
    margin-bottom: 5px;
    transition:    all 0.2s ease;
  }

  .nav-link:hover,
  .nav-link.active {
    color:            var(--text-primary);
    background-color: var(--hover-bg);
  }

  /* Sidebar Dropdown Hover */
  .sidebar-brand button {
    padding:            10px 15px;
    /* Match nav-link padding */
    border-radius:      8px;
    transition:         background-color 0.2s;
    width:              100%;
    /* Ensure full width */
    margin-left:        0;
    /* Reset margin */
    background-color:   transparent;
    border:             none;
    cursor:             pointer;
    text-align:         left;
    color:              inherit;
  }

  .sidebar-brand button:hover {
    background-color: var(--hover-bg);
  }

  .sidebar-brand button:hover .text-secondary {
    color: var(--text-primary) !important;
  }

  /* Dropdown Tweaks */
  .dropdown-toggle.no-caret::after {
    display: none;
  }

  .sidebar-brand .dropdown-menu {
    min-width: 100%;
    position: absolute;
    left: 20px;
    right: 20px;
    width: auto;
  }

  .dropdown-menu-dark {
    background-color: var(--secondary-bg);
    border:           1px solid var(--border-color);
  }

  .dropdown-item {
    color: var(--text-secondary);
  }

  .dropdown-item:hover,
  .dropdown-item:focus {
    background-color: var(--hover-bg);
    color:            var(--text-primary);
  }

  .dropdown-item.active,
  .dropdown-item:active {
    background-color: var(--accent-color);
    color:            white;
  }

  /* Mobile Responsiveness */
  @media (max-width: 768px) {
    .sidebar {
      transform: translateX(-100%);
    }

    .sidebar.active {
      transform: translateX(0);
    }
  }
</style>
