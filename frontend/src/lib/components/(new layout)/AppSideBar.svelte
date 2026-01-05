<script lang="ts">
  import { page } from '$app/state';
  import TablerIcon, { type TablerIconId } from '$lib/components/TablerIcon.svelte';

  export type SideBarMenuItems = ({
                                    label: string,
                                    href: string,
                                    icon: TablerIconId,
                                  } | 'divider')[];

  const apolloSubApps: {
    label: string,
    href: string,
    icon: TablerIconId,
  }[] = [
    {
      label: 'File Browser',
      href: '/browse/',
      icon: 'folder-filled',
    },
    {
      label: 'Media',
      href: '/media/',
      icon: 'circle-caret-right',
    },
  ];

  let { menuItems }: { menuItems: SideBarMenuItems } = $props();

  let sidebarActive = $state(false);

  const currentPath = $derived(page.url.pathname);
  const activeSubApp = $derived.by(() => {
    const path = page.url.pathname;
    return apolloSubApps.find((app) => path.startsWith(app.href));
  });

  //noinspection JSUnusedGlobalSymbols
  export function toggleSidebar(): void {
    sidebarActive = !sidebarActive;
  }
</script>

<nav class="sidebar" class:active={sidebarActive}>
  <div class="sidebar-brand dropdown mb-4">
    <button
      type="button"
      class="d-flex align-items-center text-white dropdown-toggle no-caret"
      id="appDropdown"
      data-bs-toggle="dropdown"
      aria-expanded="false"
      aria-label="Switch App Section"
    >
      <img
        src="/logo.svg"
        height="40"
        width="40"
        style="height: 40px; margin-right: 10px"
        alt=""
        role="presentation"
      >

      <span>
        <span class="fw-bold d-block">Apollo</span>
        <small
          class="text-secondary d-block"
          style="font-size: 0.8rem">{activeSubApp?.label ?? 'Select App'}&nbsp;<TablerIcon icon="chevron-down"
                                                                                           class="ms-1 w-25 h-25" /></small>
      </span>
    </button>
    <ul
      class="dropdown-menu dropdown-menu-dark shadow"
      aria-labelledby="appDropdown"
    >
      {#each apolloSubApps as subApp}
        <li>
          <a href={subApp.href}
             class="dropdown-item"
             class:active={activeSubApp != null && subApp.href === activeSubApp.href}
          >
            <TablerIcon icon={subApp.icon} class="me-2" />
            {subApp.label}
          </a>
        </li>
      {/each}
    </ul>
  </div>

  <div class="nav flex-column">
    {#each menuItems as menuItem}
      {#if menuItem === 'divider'}
        <hr class="border-secondary my-3">
      {:else}
        <a
          href={menuItem.href}
          class="nav-link"
          class:active={currentPath === menuItem.href}
        >
          <TablerIcon icon={menuItem.icon} class="me-2" />
          {menuItem.label}
        </a>
      {/if}
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
    border-right:     1px solid var(--border-color);
  }

  .sidebar-brand button {
    padding:          10px 15px;
    border-radius:    8px;
    transition:       background-color 0.2s;
    width:            100%;
    background-color: transparent;
    border:           none;
    cursor:           pointer;
    text-align:       left;
    color:            inherit;
  }

  .sidebar-brand button:hover {
    background-color: var(--hover-bg);
  }

  .nav-link {
    color:           var(--text-secondary);
    padding:         10px 15px;
    border-radius:   8px;
    margin-bottom:   5px;
    transition:      all 0.2s ease;
    text-decoration: none;
    display:         flex;
    align-items:     center;
  }

  .nav-link:hover,
  .nav-link.active {
    color:            var(--text-primary);
    background-color: var(--hover-bg);
  }

  /* Dropdown Tweaks */
  .dropdown-toggle.no-caret::after {
    display: none;
  }

  .dropdown-menu-dark {
    background-color: var(--secondary-bg);
    border:           1px solid var(--border-color);
  }

  .dropdown-item {
    color:       var(--text-secondary);
    display:     flex;
    align-items: center;
  }

  .dropdown-item:hover,
  .dropdown-item:focus {
    background-color: var(--hover-bg);
    color:            var(--text-primary);
  }

  .dropdown-item.active {
    background-color: var(--accent-color);
    color:            white;
  }

  @media (max-width: 768px) {
    .sidebar {
      transform: translateX(-100%);
    }

    .sidebar.active {
      transform: translateX(0);
    }
  }
</style>
