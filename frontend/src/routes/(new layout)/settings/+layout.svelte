<script lang="ts">
  import 'inter-ui/inter.css';
  import { page } from '$app/state';
  import { setUserProfileContext } from '$lib/stores/UserProfileStore.svelte';
  import IconChevronDown from 'virtual:icons/tabler/chevron-down';
  import IconCircleCaretRight from 'virtual:icons/tabler/circle-caret-right';
  import IconFolder from 'virtual:icons/tabler/folder-filled';
  import IconLogout from 'virtual:icons/tabler/logout';
  import IconMenu from 'virtual:icons/tabler/menu-2';
  import IconShieldLock from 'virtual:icons/tabler/shield-lock';
  import IconUser from 'virtual:icons/tabler/user-filled';

  const { children } = $props();
  const userProfile = setUserProfileContext(() => page.data);

  let sidebarActive = $state(false);

  function toggleSidebar(): void {
    sidebarActive = !sidebarActive;
  }

  const currentPath = $derived(page.url.pathname);
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
      />
      <span>
                <span class="fw-bold d-block">Apollo</span>
                <small class="text-secondary d-block" style="font-size: 0.8rem"
                >Select App&nbsp;<IconChevronDown
                  class="icon ms-1 w-25 h-25"
                  role="presentation"
                /></small
                >
            </span>
    </button>
    <ul
      class="dropdown-menu dropdown-menu-dark shadow"
      aria-labelledby="appDropdown"
    >
      <li>
        <a class="dropdown-item" href="/browse/"
        >
          <IconFolder class="icon me-2" role="presentation" />
          File
          Browser</a
        >
      </li>
      <li>
        <a class="dropdown-item" href="/media/"
        >
          <IconCircleCaretRight
            class="icon me-2"
            role="presentation"
          />
          Media</a
        >
      </li>
      <li>
        <hr class="dropdown-divider" />
      </li>
      <li>
        <a class="dropdown-item active" href="/settings/profile/"
        >
          <IconUser
            class="icon me-2"
            role="presentation"
          />
          Settings</a
        >
      </li>
    </ul>
  </div>

  <div class="nav flex-column">
    <a
      href="/settings/profile"
      class="nav-link"
      class:active={currentPath === "/settings/profile"}
    >
      <IconUser class="icon me-2" role="presentation" />
      Profile</a
    >

    <a
      href="/settings/security"
      class="nav-link"
      class:active={currentPath === "/settings/security"}
    >
      <IconShieldLock class="icon me-2" role="presentation" />
      Security</a
    >
  </div>
</nav>

<main class="main-content">
  <header class="top-navbar">
    <button
      class="btn btn-dark d-md-none"
      aria-label="Toggle sidebar menu"
      onclick={toggleSidebar}
    >
      <IconMenu class="icon" role="presentation" />
    </button>

    <div class="ms-auto user-profile dropdown">
      <button
        class="d-flex align-items-center gap-2 dropdown-toggle no-caret"
        id="profileDropdown"
        data-bs-toggle="dropdown"
        aria-expanded="false"
        aria-label="User Profile Menu"
        type="button"
      >
        <img
          src={userProfile.profilePictureUri}
          alt=""
          class="bg-info"
        />
        <IconChevronDown
          class="icon text-secondary w-75 h-75"
          role="presentation"
        />
      </button>
      <ul
        class="dropdown-menu dropdown-menu-end dropdown-menu-dark"
        aria-labelledby="profileDropdown"
      >
        <li>
          <a class="dropdown-item" href="/settings/profile">
            <IconUser class="icon me-2" role="presentation" />
            Profile
          </a>
        </li>
        <li>
          <hr class="dropdown-divider" />
        </li>
        <li>
          <a class="dropdown-item text-danger" href="/logout">
            <IconLogout class="icon me-2" role="presentation" />
            Logout
          </a>
        </li>
      </ul>
    </div>
  </header>

  {@render children()}
</main>

<style>
  :global(:root) {
    /* Core Colors */
    --primary-bg:            #0f1014;
    --secondary-bg:          #1a1c23;
    --accent-color:          #e50914;
    --text-primary:          #fff;
    --text-secondary:        #a3a3a3;
    --text-muted:            #ccc;
    --text-inverse:          #000;

    /* UI Elements */
    --scrollbar-track:       var(--primary-bg);
    --scrollbar-thumb:       #333;
    --scrollbar-thumb-hover: #555;

    --hover-bg:              rgba(255, 255, 255, 0.1);
    --active-bg:             rgba(255, 255, 255, 0.1);
    --border-color:          rgba(255, 255, 255, 0.1);

    --input-bg:              var(--secondary-bg);
    --input-focus-bg:        #2a2d35;
    --input-focus-border:    rgba(255, 255, 255, 0.1);

    --card-shadow:           rgba(0, 0, 0, 0.5);

    --sidebar-width:         250px;
  }

  :global(body) {
    background-color: var(--primary-bg);
    color:            var(--text-primary);
    font-family:      'Inter', sans-serif;
    overflow-x:       hidden;
    margin:           0;
  }

  :global(.icon) {
    vertical-align: text-top;
  }

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

  /* Main Content */
  .main-content {
    margin-left: var(--sidebar-width);
    padding:     20px 40px;
    transition:  margin-left 0.3s ease;
    min-height:  100vh;
  }

  /* Navbar */
  .top-navbar {
    display:         flex;
    justify-content: space-between;
    align-items:     center;
    margin-bottom:   30px;
    padding:         10px 0;
  }

  .user-profile img {
    width:         40px;
    height:        40px;
    border-radius: 50%;
    object-fit:    cover;
    border:        2px solid transparent;
    transition:    border-color 0.2s;
  }

  .user-profile button {
    background: none;
    border:     none;
    padding:    0;
    cursor:     pointer;
    transition: opacity 0.2s;
    color:      inherit;
  }

  .user-profile button:hover img {
    border-color: var(--text-primary);
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

    .main-content {
      margin-left: 0;
      padding:     15px;
    }
  }
</style>
