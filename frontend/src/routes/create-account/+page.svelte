<script lang="ts">
  import AuthProviderIcon from '$lib/components/auth/AuthProviderIcon.svelte';
  import type { PageProps } from './$types';

  let { data }: PageProps = $props();

  // FIXME: This page shares a lot with the /login page
</script>

<svelte:head>
  <title>Create Account</title>
</svelte:head>

<div class="container">
  <div class="text-center">
    <img src="/logo.svg" alt="Apollo-Logo" width="764" height="764" style="height: 6rem; width: auto">
    <h1>Create an Apollo account</h1>

    <p>You have been invited to this Apollo instance!</p>
  </div>

  <div class="third-party-login-container">
      <h2 class="h6 text-muted">Create account using</h2>

      <div class="d-flex flex-wrap">
        {#each data.availableLoginProviders as provider}
          <a
            class="btn btn-outline-secondary p-2 text-white"
            href="/api/_auth/sign-up/{provider.identifier}?token={data.inviteToken}"
          >
            <AuthProviderIcon identifier={provider.identifier} />
            {provider.displayName}
          </a>
        {/each}
      </div>
    </div>
</div>

<style>
  .third-party-login-container .btn {
    flex:          calc(50% - .25rem);
    margin-bottom: .25rem;
  }

  /* To have it symmetric, evenly apply the margin to the left and right of the even/odd elements */
  .third-party-login-container a:nth-child(even) {
    margin-left: .25rem;
  }

  .third-party-login-container a:nth-child(odd) {
    margin-right: .25rem;
  }

  /* Last item should be full width */
  .third-party-login-container a:last-child:nth-child(odd) {
    flex:   50%;
    margin: unset;
  }
</style>
