<script lang="ts">
  import type { MediaOverviewPageData } from '../../../../../src/frontend/FrontendRenderingDataAccess';
  import MediaItem from './scroll-box/MediaItem.svelte';
  import ScrollBox from './scroll-box/ScrollBox.svelte';
  import ScrollBoxVideoItem from './scroll-box/ScrollBoxVideoItem.svelte';

  const { pageData, h1 }: { pageData: MediaOverviewPageData['pageData'], h1: string } = $props();
</script>

<h1 class="pb-1">{h1}</h1>

{#if pageData.continueWatching.length > 0}
  <div class="container-fluid flex-grow-1">
    <h2>Continue Watching</h2>
    <ScrollBox>
      {#each pageData.continueWatching as mediaItem}
        <!-- FIXME: width and height -->
        <ScrollBoxVideoItem
          videoHeading={mediaItem.displayName}
          videoSubheading={mediaItem.subheading}
          videoWatchProgressPercentage={mediaItem.watchProgress * 100}
          videoThumbnailSrc={mediaItem.thumbnailImageUrl}
          videoThumbnailWidth="500"
          videoThumbnailHeight="270"
        />
      {/each}
    </ScrollBox>
  </div>
{/if}

{#if pageData.recentlyAdded.length > 0}
  <div class="container-fluid flex-grow-1 pt-3">
    <h2>Recently added</h2>
    <ScrollBox>
      {#each pageData.recentlyAdded as mediaItem}
        <!-- FIXME: width and height -->
        <ScrollBoxVideoItem
          videoHeading={mediaItem.displayName}
          videoSubheading={mediaItem.subheading}
          videoWatchProgressPercentage={mediaItem.watchProgress}
          videoThumbnailSrc={mediaItem.thumbnailImageUrl}
          videoThumbnailWidth="500"
          videoThumbnailHeight="270"
        />
      {/each}
    </ScrollBox>
  </div>
{/if}

<div class="container-fluid flex-grow-1 pt-3">
  <h2>Everything</h2>
  {#if pageData.everything.length > 0}
    <div>
      {#each pageData.everything as everythingItem}
        <a href={`/media-new/${everythingItem.library.id}/${everythingItem.id}`}>
          <MediaItem
            mediaHeading={everythingItem.displayName}
            mediaSubheading={everythingItem.library.displayName}
            mediaThumbnailSrc={everythingItem.coverImage.url}
            mediaThumbnailWidth={everythingItem.coverImage.width}
            mediaThumbnailHeight={everythingItem.coverImage.height}
          />
        </a>
      {/each}
    </div>
  {:else}
    <p>No media could be found</p>
  {/if}
</div>
