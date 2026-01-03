<script lang="ts">
  import type { PageProps } from './$types';

  let { data }: PageProps = $props();
</script>

<div>
  <pre>{JSON.stringify(data.loggedInUser, null, 2)}</pre>

  <a href="/browse/">
    <button>Browse files</button>
  </a>
  <a href="/media/">
    <button>Media library</button>
  </a>
  <a href="/settings">
    <button>Settings</button>
  </a>
  <a href="/logout">
    <button>Log out</button>
  </a>
</div>
