<script lang="ts">
  let { onSidebarToggleClicked, renderAsOverlay }: {
    onSidebarToggleClicked: () => void,
    renderAsOverlay: boolean
  } = $props();
</script>

<header class="top-navbar" class:overlay={renderAsOverlay}>
  <button class="btn btn-dark d-md-none"
          aria-label="Toggle sidebar menu"
          onclick={onSidebarToggleClicked}
          data-sidebar-toggle><i class="fas fa-bars"></i></button>

  <div class="search-bar">
    <i class="fas fa-search"></i>
    <input type="text" placeholder="Search for movies, TV shows...">
  </div>

  <div class="user-profile dropdown">
    <button
       class="d-flex align-items-center gap-2 dropdown-toggle no-caret"
       id="profileDropdown"
       data-bs-toggle="dropdown"
       aria-expanded="false"
       aria-label="User Profile Menu"
       type="button">
      <img src="/img/neutral-avatar.svg" alt="" class="bg-info" width="512" height="512">
      <i class="fas fa-chevron-down text-secondary fs-6"></i>
    </button>
    <ul class="dropdown-menu dropdown-menu-end dropdown-menu-dark" aria-labelledby="profileDropdown">
      <li><a class="dropdown-item" href="/profile"><i class="fas fa-user me-2"></i> Profile</a></li>
      <!--      <li><a class="dropdown-item" href="/profile"><i class="fas fa-cog me-2"></i> Settings</a></li>-->

      <!--
      <li>
        <hr class="dropdown-divider">
      </li>

      <li><h6 class="dropdown-header">Theme</h6></li>
      <li><a class="dropdown-item" href="#" data-theme-option="auto"><i class="fas fa-adjust me-2"></i>Auto</a></li>
      <li><a class="dropdown-item" href="#" data-theme-option="dark"><i class="fas fa-moon me-2"></i>Dark</a></li>
      <li><a class="dropdown-item" href="#" data-theme-option="light"><i class="fas fa-sun me-2"></i>Light</a></li>
      -->

      <li>
        <hr class="dropdown-divider">
      </li>

      <li><a class="dropdown-item text-danger" href="/logout" data-sveltekit-reload><i class="fas fa-sign-out-alt me-2"></i>Logout</a></li>
    </ul>
  </div>
</header>

<style>
  /* Navbar */
  .top-navbar {
    display:         flex;
    justify-content: space-between;
    align-items:     center;
    margin-bottom:   30px;
    padding-top:     10px;
  }

  .top-navbar.overlay {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    z-index: 100;
    padding: 20px 40px;
    background: linear-gradient(to bottom, rgba(0, 0, 0, 0.8) 0%, transparent 100%);
  }

  .search-bar {
    position: relative;
    width:    400px;
  }

  @media (max-width: 768px) {
    .search-bar {
      margin-left:  15px;
      margin-right: 15px;
    }
  }

  .search-bar input {
    width:            100%;
    background-color: var(--secondary-bg);
    border:           1px solid transparent;
    border-radius:    20px;
    padding:          10px 20px 10px 40px;
    color:            var(--text-primary);
    transition:       all 0.3s ease;
  }

  .search-bar input:focus {
    background-color: var(--input-focus-bg);
    border-color:     var(--input-focus-border);
    outline:          none;
    box-shadow:       0 0 0 2px rgba(255, 255, 255, 0.05);
  }

  .search-bar i {
    position:  absolute;
    left:      15px;
    top:       50%;
    transform: translateY(-50%);
    color:     var(--text-secondary);
  }

  .user-profile img {
    width:         40px;
    height:        40px;
    border-radius: 50%;
    object-fit:    cover;
    border:        2px solid transparent;
    transition:    border-color 0.2s;
  }

  /* Unified Profile Hover */
  .user-profile button {
    background: none;
    border: none;
    padding: 0;
    cursor: pointer;
    transition: opacity 0.2s;
    color: inherit;
    text-decoration: none;
  }

  .user-profile button:hover img {
    border-color: var(--text-primary);
  }

  .user-profile button:hover i {
    color: var(--text-primary) !important;
    /* Override text-secondary */
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
    color: var(--text-secondary);
  }

  .dropdown-item:hover,
  .dropdown-item:focus {
    background-color: var(--hover-bg);
    color:            var(--text-primary);
  }

  /*
  .dropdown-item.active,
  .dropdown-item:active {
    background-color: var(--accent-color);
    color:            white;
  }
  */
</style>
