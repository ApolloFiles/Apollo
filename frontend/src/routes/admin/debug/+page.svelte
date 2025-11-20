<script lang="ts">
  import type { PageProps } from './$types';

  let { data }: PageProps = $props();
</script>

<svelte:head>
  <title>Debug Info | Admin</title>
</svelte:head>

<h1>Debug Info</h1>

{#await data.debugInfo}
  <p><strong>Collecting debug info...</strong></p>
{:then debugInfo}
  <p><strong>Process ID:</strong>&nbsp;{debugInfo.ownProcessId}</p>
  <p><strong>NVIDIA GPU in use:</strong>&nbsp;{debugInfo.nvidiaGpuInUse ? 'Yes' : 'No'}</p>

  <hr>

  {#if debugInfo.openFileDescriptors.length > 0}
    <ul>
      {#each debugInfo.openFileDescriptors as fd}
        <li>{fd.fd}{fd.childProcessPid != null ? ` (child process ${fd.childProcessPid})` : ''}: {fd.linkTarget}</li>
      {/each}
    </ul>
  {:else}
    <p><em>No open file descriptors found</em></p>
  {/if}
{:catch err}
  <p><em>Error loading debug info: {err.message}</em></p>
{/await}
