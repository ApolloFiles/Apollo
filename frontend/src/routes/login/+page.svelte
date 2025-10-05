<script lang="ts">
  import { authClient } from '$lib/auth-client';
  import type { PageProps } from './$types';

  let { data }: PageProps = $props();
</script>

{#if data.availableLoginProviders.length > 0}
  {#each data.availableLoginProviders as provider}
    <button
      onclick={() => authClient.signIn.social({ provider, callbackURL: data.appBaseUrl })}
    >
      Continue with {provider}
    </button>
  {/each}
{:else}
  <strong>Login not configured yet</strong>
{/if}
