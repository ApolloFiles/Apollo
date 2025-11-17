<script lang="ts">
  import type { PageProps } from './$types';

  let { data }: PageProps = $props();
</script>

<div>
  <pre>{JSON.stringify(data.loggedInUser, null, 2)}</pre>

  <a href="/browse/">
    <button>Browse files</button>
  </a>
  <a href="/profile">
    <button>Profile</button>
  </a>
  <a href="/logout" data-sveltekit-reload>
    <button>Log out</button>
  </a>
</div>
