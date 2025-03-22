<style>
  .sidebar {
    min-width:  200px;
    overflow-y: auto;
  }
</style>

<script lang="ts">
  import type {MediaOverviewPageData} from '../../../../../src/frontend/FrontendRenderingDataAccess';

  const {pageData}: { pageData: Pick<MediaOverviewPageData['pageData'], 'libraries' | 'sharedLibraries'> } = $props();
</script>

<!-- TODO: Statt die sidebar zu verstecken, irwie in einen Button wandeln, der das ding dann ein und aus blendet -->
<!-- TODO: Im Grunde soll es eine Art "Startseite" geben und eine Liste von Bibliotheken, um "Filtern" zu können -->
<!-- TODO: Das sollt eher wie Buttons aussehen oder so statt so billo links -->
<!-- TODO: Highlight the current page -->
<aside class="sidebar border-end d-none d-md-block">
  <div class="p-3">
    <h6>Special Links<!--TODO: Bessere Überschrift; vllt. auch keine für diesen Block hier --></h6>
    <ul class="list-unstyled">
      <li><a href="/media-new" class="text-decoration-none">Overview<!-- Startseite --></a></li>
      <!-- TODO: <--- This is the default/start page -->
      <li><a href="#" class="text-decoration-none">Favorites</a></li>
      <li><a href="#" class="text-decoration-none">Watch list</a></li>
    </ul>

    <!-- TODO: Irgendwo auf der Seite muss es einen Add und Edit Button für Bibliotheken geben -->
    <h6>My libraries</h6>
    {#if pageData.libraries.length > 0}
      <ul class="list-unstyled">
        {#each pageData.libraries as library}
          <li><a href={`/media-new/${library.id}`} class="text-decoration-none">{library.displayName}</a>
          </li>
        {/each}
      </ul>
    {:else}
      <p class="text-muted">No libraries yet</p>
    {/if}

    <h6>Shared libraries</h6>
    {#if pageData.sharedLibraries.length > 0}
      <ul class="list-unstyled">
        {#each pageData.sharedLibraries as sharedLib}
          <li><a href={`/media-new/${sharedLib.id}`}
                 class="text-decoration-none">{sharedLib.displayName}</a></li>
        {/each}
      </ul>
    {:else}
      <p class="text-muted">No shared libraries yet</p>
    {/if}
  </div>
</aside>
