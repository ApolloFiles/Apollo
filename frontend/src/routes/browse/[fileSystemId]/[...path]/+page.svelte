<script lang="ts">
  import type { PageProps } from './$types';

  let { data }: PageProps = $props();
</script>

<main>
  <header>
    <h1>Browse files of <em>{data.current.fileSystemId}</em></h1>
    <p>Path: {data.current.path}</p>
  </header>

  <main>
    <ul>
      {#each data.fileList.files as file}
        <li>
          {#if file.isDirectory}
            <!-- FIXME: Properly encode the path in the URL -->
            📁 <a href={`/browse/${data.current.fileSystemId}${file.path}`}>{file.name}/</a>
          {:else}
            📄 <a href={`/api/_frontend/file?${new URLSearchParams({ fileSystemId: data.current.fileSystemId, path: file.path }).toString()}`}>{file.name}</a>
          {/if}
        </li>
      {/each}
    </ul>
  </main>
</main>
