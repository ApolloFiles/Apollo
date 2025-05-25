<svelte:head>
  <title>{data.pageData.mediaTitle.displayName} | {data.pageData.mediaTitle.library.displayName}</title>
</svelte:head>

<script lang="ts">
  import IconPlay from 'virtual:icons/tabler/player-play-filled';
  import type { MediaTitlePageData } from '../../../../../../../src/frontend/FrontendRenderingDataAccess';
  import MediaPageLayout from '../../../lib/MediaPageLayout.svelte';

  const { data }: { data: MediaTitlePageData } = $props();
</script>

<!-- TODO: Add Breadcrumbs -->
<MediaPageLayout pageData={data.pageData}>
  <div class="container">
    <div class="row">
      <!--
      TODO: Make image smaller and cut the synopsis if it is too long with a 'expand' or 'show more' button
            Seasons/Episodes have too little space which are pretty important
      -->
      <div class="col video-thumbnail">
        <img src={data.pageData.mediaTitle.thumbnailImageUrl} width="500" height="416" alt="">
      </div>
      <div class="col">
        <h1>{data.pageData.mediaTitle.displayName}</h1>
        {#if data.pageData.mediaTitle.mediaContent.type === 'series'}
          <small>{data.pageData.mediaTitle.mediaContent.seasons.length} Seasons · {data.pageData.mediaTitle.mediaContent.seasons.reduce((sum, season) => sum + season.episodes.length, 0)} Episodes</small>
        {/if}

        {#if data.pageData.mediaTitle.synopsis != null}
          <p style="white-space: pre-line">{data.pageData.mediaTitle.synopsis}</p>
        {:else}
          <p><em>No Synopsis available</em></p>
        {/if}
      </div>
    </div>
  </div>

  <div class="pb-3"></div>

  {#if data.pageData.mediaTitle.mediaContent.type === 'series'}
    <div class="container pt-3">
      <ul class="nav nav-tabs" id="season-selector" role="tablist">
        {#each data.pageData.mediaTitle.mediaContent.seasons as season, seasonIndex}
          <li class="nav-item" role="presentation">
            <button class="nav-link{ seasonIndex === 0 ? ' active' : ''}"
                    id="season-selector-tab-{season.counter}"
                    data-bs-toggle="tab"
                    data-bs-target="#season-selector-{season.counter}"
                    type="button"
                    role="tab"
                    aria-controls="season-selector-{season.counter}"
                    aria-selected={seasonIndex === 0}
            >
              Season {season.counter}
            </button>
          </li>
        {/each}
      </ul>
      <div class="tab-content" id="season-selector-content">
        {#each data.pageData.mediaTitle.mediaContent.seasons as season, seasonIndex}
          <div class="tab-pane show{ seasonIndex === 0 ? ' active' : ''}"
               id="season-selector-{season.counter}"
               role="tabpanel"
               aria-labelledby="season-selector-tab-{season.counter}"
               tabindex="0"
          >
            <ul class="list-group">
              {#each season.episodes as episode, episodeIndex}
                <li class="list-group-item">
                  <div class="row">
                    <div class="col-auto d-flex align-items-center">{episodeIndex != null ? episodeIndex + 1 : '?'}</div>
                    <div class="col-2 video-thumbnail"><img src={episode.thumbnailImageUrl} width="500" height="416" loading="lazy" alt=""></div>
                    <div class="col">
                      <h2>{episode.displayName}</h2>
                      {#if episode.synopsis != null}<p>{episode.synopsis}</p>{/if}
                    </div>
                    <div class="col-auto d-flex align-items-center gap-2 ps-5 pe-5">
                      <a href="/api/v0/media/player-session/start-watching?mediaItem={episode.id}&startOffset=0" title="Play this episode/movie"><IconPlay style="font-size: 28px" role="presentation" /></a>
                    </div>
                    <div class="col-auto text-end">
                      {episode.durationInSec <= 60 ? `${episode.durationInSec} sec.` : `${(episode.durationInSec / 60).toFixed(0)} min.`}
                      <!-- TODO: introduce badges to show special meta data or dub/sub languages -->
                      <!-- <br> -->
                      <!-- <span class="badge bg-primary">4K</span> -->
                      <!-- <span class="badge bg-primary">CC</span> -->
                    </div>
                  </div>
                </li>
              {/each}
            </ul>
          </div>
        {/each}
      </div>
    </div>
  {:else}
    <strong><em>// FIXME: The mediaContent.type of this media is not supported yet</em></strong>
  {/if}
</MediaPageLayout>

<style>
  .video-thumbnail img {
    border-radius: 10px;
    height:        inherit;
    aspect-ratio:  16/9;
    object-fit:    cover;
    width:         100%;
  }
</style>
