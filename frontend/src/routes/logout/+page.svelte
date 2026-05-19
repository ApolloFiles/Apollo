<script lang="ts">
  import TablerIcon from '$lib/components/TablerIcon.svelte';
  import type { PageProps } from './$types';

  let { data }: PageProps = $props();
</script>

<svelte:head>
  <title>Log out</title>
</svelte:head>

<div class="container logout-container">
  <div class="text-center">
    <img src="/logo.svg" alt="Apollo-Logo" width="764" height="764" style="height: 6rem; width: auto">
    <h1>Log out of Apollo</h1>

    <p>Are you sure you want to log out, <strong>{data.loggedInUser.displayName}</strong>?</p>
  </div>

  <div class="actions d-flex flex-column gap-2">
    <form action="/api/_auth/logout" method="POST" enctype="application/x-www-form-urlencoded">
      <input type="hidden" name="csrfToken" value={data.loggedInUser.csrfToken} />
      <button
        type="submit"
        class="btn btn-danger w-100 d-inline-flex align-items-center justify-content-center gap-2"
      >
        <TablerIcon icon="logout" />
        Yes, log me out
      </button>
    </form>

    <a class="btn btn-outline-secondary w-100" href="/">Cancel</a>
  </div>
</div>

<style>
  .logout-container {
    max-width:  420px;
    margin:     0 auto;
    padding:    4rem 1rem;
  }

  .actions {
    margin-top: 2rem;
  }
</style>
