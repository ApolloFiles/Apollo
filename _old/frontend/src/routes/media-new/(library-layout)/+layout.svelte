<script>
  const { children } = $props();
</script>

<header class="py-3 border-bottom">
  <div class="d-flex align-items-center justify-content-between px-5">
    <!-- Left Section: Logo and Title -->
    <div class="d-flex align-items-center me-2">
      <img src="/logo.svg" alt="Logo" class="me-2" style="width: 40px; height: 40px;">
      <h1 class="h5 m-0 text-nowrap d-none d-sm-block">Apollo Media</h1>
    </div>

    <!-- Center Section: Search Bar -->
    <form class="d-flex justify-content-center w-100" role="search">
      <input class="form-control form-control-md rounded-pill" style="max-width: 500px;" type="search"
             placeholder="Search..." aria-label="Search">
    </form>

    <!-- Right Section: Profile Picture and Dropdown -->
    <div class="dropdown ms-2">
      <button class="btn p-0 border-0"
              id="profileDropdown"
              data-bs-toggle="dropdown"
              aria-expanded="false">
        <img src="https://github.com/SpraxDev.png"
             alt="Profile"
             class="rounded-circle profile-picture-img">
      </button>
      <ul class="dropdown-menu dropdown-menu-end" aria-labelledby="profileDropdown">
        <li><a class="dropdown-item" href="/logout">Logout</a></li>
      </ul>
    </div>
  </div>
</header>

{@render children()}

<style>
  .profile-picture-img {
    background: linear-gradient(135deg, #f34d55 0%, #e7bc0d 100%) no-repeat;
    width:      40px;
    height:     40px;
    padding:    2px;
    box-sizing: border-box;
  }

  header {
    height: 4.75rem;
  }
</style>
