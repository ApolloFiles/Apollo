<script lang="ts">
  import TablerIcon from '$lib/components/TablerIcon.svelte';
  import { m } from '$lib/paraglide/messages.js';
</script>

<ul class="file-system-list">
  <li>
    <a href="/browse/_/">
      <TablerIcon icon="folder-open" />
      {m.nav_files_default_file_system()}
    </a>
  </li>
</ul>

<style>
  .file-system-list {
    list-style: none;
    padding:    0;
    margin:     0;
  }

  .file-system-list a {
    display:         flex;
    align-items:     center;
    gap:             8px;
    color:           var(--text-primary);
    text-decoration: none;
    padding:         8px 12px;
    border-radius:   8px;
  }

  .file-system-list a:hover {
    background-color: var(--hover-bg);
  }
</style>
