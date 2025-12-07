<script lang="ts">
  import HeroSection from '$lib/components/media/media/HeroSection.svelte';
  import EpisodeList from '$lib/components/media/media/EpisodeList.svelte';
  import type { PageProps } from './$types';

  // TODO: Remove default values and get real data from the backend
  let {
    data,
    params,
    audioLanguages = [{ language: 'English', original: true }, { language: 'German', original: false }],
    subtitleLanguages = [{ language: 'English' }, { language: 'German' }],
  }: PageProps & {
    audioLanguages: { language: string, original: boolean }[],
    subtitleLanguages: { language: string }[],
  } = $props();

  let nextEpisodeIdToWatchForEpisodeList: string | null = $derived.by(() => {
    if (data.page.media.nextMediaItemToWatch != null && (data.page.media.nextMediaItemToWatch.watchProgress?.inSeconds ?? 0) > 0) {
      return data.page.media.nextMediaItemToWatch.id;
    }
    return null;
  });
</script>

<svelte:head>
  <title>{data.page.media.title} | Apollo Media</title>
</svelte:head>

<HeroSection
  libraryId={params.libraryId}
  mediaId={data.page.media.id}
  title={data.page.media.title}
  synopsis={data.page.media.synopsis}
  nextMediaItem={data.page.media.nextMediaItemToWatch}
/>

<div class="container-fluid px-5 py-4">
  <div class="row">
    <div class="col-md-8">
      <EpisodeList
        libraryId={params.libraryId}
        mediaId={data.page.media.id}
        nextEpisodeIdToWatch={nextEpisodeIdToWatchForEpisodeList}
        seasons={data.page.media.seasons ?? []}
      />
    </div>

    <div class="col-md-4">
      <div class="bg-dark bg-opacity-50 p-4 rounded-3">
        <h4 class="mb-3">Details <em>[Not real yet]</em></h4>
        {#if data.page.media.genres.length > 0}
          <div class="mb-2"><span class="text-secondary">Genres:</span> {data.page.media.genres.join(', ')}</div>
        {/if}
        <div class="mb-2">
          <span class="text-secondary">Audio:</span>
          {audioLanguages.map(a => `${a.language}${a.original ? ' [Original]' : ''}`).join(', ')}
        </div>
        <div class="mb-2">
          <span class="text-secondary">Subtitles:</span>
          {subtitleLanguages.map(s => s.language).join(', ')}
        </div>
      </div>
    </div>
  </div>
</div>
