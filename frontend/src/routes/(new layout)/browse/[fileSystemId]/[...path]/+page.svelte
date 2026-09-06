<script lang="ts">
  import TablerIcon from '$lib/components/TablerIcon.svelte';
  import type { PageProps } from './$types';

  let { data }: PageProps = $props();
</script>

<main>
  <header>
    <h1>Browse files of <em>{data.current.fileSystemId}</em></h1>
    <p>Path: {data.current.path}</p>
  </header>

  <main>
    <ul class="file-list">
      {#each data.fileList.files as file (file.path)}
        <li>
          {#if file.isDirectory}
            <!-- FIXME: Properly encode the path in the URL -->
            <a class="directory" href={`/browse/${data.current.fileSystemId}${file.path}`}>
              <TablerIcon icon="folder-filled" />
              {file.name}/
            </a>
          {:else}
            <a class="file" href={`/api/_frontend/file?${new URLSearchParams({ fileSystemId: data.current.fileSystemId, path: file.path }).toString()}`}>
              <TablerIcon icon="file" />
              {file.name}
            </a>
          {/if}
        </li>
      {/each}
    </ul>
  </main>
</main>

<style>
  .file-list {
    list-style: none;
    padding:    0;
    margin:     0;
  }

  .file-list a {
    display:         flex;
    align-items:     center;
    gap:             8px;
    padding:         6px 12px;
    border-radius:   8px;
    text-decoration: none;
    color:           var(--text-primary);
  }

  .file-list a:hover {
    background-color: var(--hover-bg);
  }

  .file-list a.directory :global(svg) {
    color: var(--text-muted);
  }

  h1 {
    font-size: 1.5rem;
  }

  h1 em {
    font-style: normal;
    color:      var(--text-secondary);
  }
</style>
