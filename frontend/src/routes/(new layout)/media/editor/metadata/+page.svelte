<script lang="ts">
  import { goto, refreshAll } from '$app/navigation';
  import ApolloFilePicker from '$lib/components/apollo-file-picker/ApolloFilePicker.svelte';
  import TablerIcon from '$lib/components/TablerIcon.svelte';
  import { getClientSideRpcClient } from '$lib/oRPCClientSide';
  import { ORPCError } from '@orpc/client';
  import { onMount } from 'svelte';
  import type { PageProps } from './$types';
  import ProgressModal from './components/ProgressModal.svelte';
  import TagEditView_MultipleFiles from './components/TagEditView_MultipleFiles.svelte';
  import TagEditView_SingleFile from './components/TagEditView_SingleFile.svelte';
  import FileData from './FileData.svelte';

  let { data }: PageProps = $props();

  let saveModalRef: ProgressModal;
  let apolloFilePickerRef: ApolloFilePicker;
  let saveModalBodyText = $state('');
  let saveReFetchingTimeoutId: number | undefined = undefined;

  // svelte-ignore state_referenced_locally
  let files: FileData[] = $state(FileData.createMultipleFromBackendData(data.files));
  let selectedFileIds: FileData['identifier'][] = $state([]);
  let selectedFiles = $derived(files.filter((file) => selectedFileIds.includes(file.identifier)));

  $effect(() => {
    // update files, when page data changes (e.g. when user opens a new path)
    files = FileData.createMultipleFromBackendData(data.files);
    selectedFileIds = [];
  });

  // file selection helper functions

  function handleFileSelection(fileId: string, event: MouseEvent): void {
    const isCtrl = event.ctrlKey || event.metaKey;
    if (isCtrl) {
      if (selectedFileIds.includes(fileId)) {
        // Unselect if already selected
        selectedFileIds.splice(selectedFileIds.indexOf(fileId), 1);
      } else {
        selectedFileIds.push(fileId);
      }
    } else {
      selectedFileIds = [fileId];
    }

    // re-sort tags when selection changes
    for (const file of selectedFiles) {
      file.sortTagsByKey();
    }
  }

  function isSelected(fileId: string): boolean {
    return selectedFileIds.includes(fileId);
  }

  // file editing helper functions (write)

  function addEmptyGlobalMetadataTagToSelectedFiles(): void {
    for (const file of selectedFiles) {
      file.globalTags.pushEmptyTag();
    }
  }

  // button user actions

  function promptUserForPathToOpen(): void {
    apolloFilePickerRef.show();
  }

  function openApolloFileUri(uri: string): void {
    if (files.some(file => file.hasUnsavedChanges)) {
      const proceed = window.confirm('There are unsaved changes that will be lost if you open a new path. Do you want to proceed?');
      if (proceed !== true) {
        return;
      }
    }

    files = [];
    selectedFileIds = [];

    if (uri === data.requestedOpenUri) {
      refreshAll();
    } else {
      goto(`?file=${encodeURIComponent(uri)}`);
    }
  }

  function selectAllFiles(): void {
    if (selectedFileIds.length === files.length) {
      selectedFileIds = [];
    } else {
      selectedFileIds = files.map((file) => file.identifier);
    }
  }

  function saveAllFiles(): void {
    if (files.length === 0) {
      alert('No files to save');
      return;
    }

    sendSaveRequest(files, () => refreshAll())
      .catch((err) => {
        alert('Failed to save changes, see console for details');
        console.error('Failed to save changes:', err);
      });
  }

  function saveSelectedFiles(): void {
    if (selectedFileIds.length === 0) {
      alert('No files selected');
      return;
    }

    sendSaveRequest(selectedFiles, () => refreshSelectedFiles())
      .catch((err) => {
        alert('Failed to save changes, see console for details');
        console.error('Failed to save changes:', err);
      });
  }

  function handleStreamDeletionClick(file: FileData, stream: FileData['streams'][number]): void {
    const friendlyStreamName = `[${stream.identifier}] ${capitalizeFirstLetter(stream.type)} (${stream.streamContextText})`;
    const confirmationResponse = window.confirm(`Are you sure you want to delete '${friendlyStreamName}'`);
    if (confirmationResponse) {
      file.deleteStream(stream.identifier);
    }
  }

  function handleDeleteMkvStatisticsTagsFromSelectedFiles(): void {
    if (selectedFiles.length === 0) {
      alert('No files selected');
      return;
    }

    for (const selectedFile of selectedFiles) {
      selectedFile.globalTags.deleteAllByKeyCaseInsensitive('encoder');

      for (const tagSuffix of ['', '-eng']) {
        for (const stream of selectedFile.streams) {
          const statisticTags = stream.tags
            .findByKeyCaseInsensitive(`_STATISTICS_TAGS${tagSuffix}`)
            .filter(tag => tag.value.trim().length > 0);

          if (statisticTags.length !== 1) {
            continue;
          }

          for (const tagKeyToRemove of statisticTags[0].value.split(' ')) {
            if (tagKeyToRemove.trim().length > 0) {
              stream.tags.deleteAllByKeyCaseInsensitive(`${tagKeyToRemove}${tagSuffix}`);
            }
          }

          stream.tags.deleteAllByKeyCaseInsensitive(`_STATISTICS_TAGS${tagSuffix}`);
          stream.tags.deleteAllByKeyCaseInsensitive(`_STATISTICS_WRITING_APP${tagSuffix}`);
          stream.tags.deleteAllByKeyCaseInsensitive(`_STATISTICS_WRITING_DATE_UTC${tagSuffix}`);
        }
      }
    }
  }

  function handleAddCommonTagsToSelectedFiles(tagSet: 'common' | 'archival' | 'anime'): void {
    if (selectedFiles.length === 0) {
      alert('No files selected');
      return;
    }

    const commonGlobalTags = [
      'DATE_RELEASED',

      'IMDB',
      'TMDB',

      'TOTAL_PARTS',
      'track',

      'SYNOPSIS',
      'SYNOPSIS-eng',
      'SYNOPSIS-ger',

      'title',
      'TITLE-eng',
      'TITLE-ger',
    ];
    const commonArchivalGlobalTags = [
      'DATE_DIGITIZED',
      'DATE_ENCODED',
      'DATE_TAGGED',
      'ORIGINAL_MEDIA_TYPE',
      'LAW_RATING',
    ];
    const commonAnimeGlobalTags = [
      'MYANIMELIST',
      'TITLE-jpn',
    ];

    let tagSetToUse: string[];
    if (tagSet === 'common') {
      tagSetToUse = commonGlobalTags;
    } else if (tagSet === 'archival') {
      tagSetToUse = commonArchivalGlobalTags;
    } else if (tagSet === 'anime') {
      tagSetToUse = commonAnimeGlobalTags;
    } else {
      throw new Error(`Unknown tag set: ${tagSet}`);
    }

    for (const selectedFile of selectedFiles) {
      for (const tagKeyToAdd of tagSetToUse) {
        if (selectedFile.globalTags.findByKeyCaseInsensitive(tagKeyToAdd).length === 0) {
          selectedFile.globalTags.pushTag(tagKeyToAdd, '');
        }
      }

      selectedFile.globalTags.sortTagsByKey();

      if (tagSet === 'common') {
        for (const stream of selectedFile.streams) {
          if (stream.type !== 'video' && stream.type !== 'audio' && stream.type !== 'subtitle') {
            continue;
          }

          if (stream.tags.findByKeyCaseInsensitive('language').length === 0) {
            stream.tags.pushTag('language', '');
          }

          if (stream.type !== 'video' && stream.tags.findByKeyCaseInsensitive('title').length === 0) {
            stream.tags.pushTag('title', '');
          }

          stream.tags.sortTagsByKey();
        }

        selectedFile.globalTags.findByKeyCaseInsensitive('language');
      }
    }
  }

  // misc

  async function sendSaveRequest(filesToSave: FileData[], onWriteDone: () => void): Promise<void> {
    saveModalBodyText = 'Waiting for the server to start saving...';
    saveModalRef.show();

    let progressInfo;
    try {
      progressInfo = await getClientSideRpcClient().media.editor.writeChanges({
        files: filesToSave.map((fileToSave) => {
          return {
            identifier: fileToSave.identifier,
            desiredState: {
              file: {
                tags: fileToSave.globalTags.tags.map((tag) => ({
                  key: tag.key,
                  value: tag.value,
                })),
              },
              streams: fileToSave.streams.map((stream) => ({
                index: stream.identifier,
                order: stream.order,
                tags: stream.tags.tags.map((tag) => ({
                  key: tag.key,
                  value: tag.value,
                })),
                disposition: stream.disposition,
              })),
              streamsToDelete: fileToSave.streamsMarkedForDeletion as number[],
            },
          };
        }),
      });
    } catch (err) {
      if (err instanceof ORPCError && err.code === 'ANOTHER_WRITE_ALREADY_IN_PROGRESS') {
        alert('Another write operation is already in progress. Please wait for it to finish before starting a new one.');
        saveModalRef.hide();
        saveModalBodyText = '';
        return;
      }

      throw err;
    }


    saveModalBodyText = `Saving file ${progressInfo.currentFileIndex + 1} of ${progressInfo.totalFileCount}`;

    const fetchProgressInfoAndUpdateUIAndReQueueNextUpdateIfNeeded = async () => {
      try {
        const progressInfo = await getClientSideRpcClient().media.editor.getWriteProgress();

        if (progressInfo == null) {
          saveModalRef.hide();
          saveModalBodyText = '';

          onWriteDone();
          return;
        }

        saveModalBodyText = `Saving file ${progressInfo.currentFileIndex + 1} of ${progressInfo.totalFileCount}`;

        if (progressInfo.endTime != null) {
          saveModalRef.hide();

          if (progressInfo.error != null) {
            // TODO: send proper error notification
            alert('An error occurred while saving: ' + JSON.stringify(progressInfo.error, null, 2));
          } else {
            // TODO: send success notification about completion
            alert('Successfully saved changes!');
            onWriteDone();
          }

          return;
        }

        saveReFetchingTimeoutId = window.setTimeout(fetchProgressInfoAndUpdateUIAndReQueueNextUpdateIfNeeded, 1000);
      } catch (err) {
        // TODO: display warning to user
        console.warn('Failed to fetch save progress info, will retry in a bit', err);
        saveReFetchingTimeoutId = window.setTimeout(fetchProgressInfoAndUpdateUIAndReQueueNextUpdateIfNeeded, 2500);
        return;
      }
    };

    saveReFetchingTimeoutId = window.setTimeout(fetchProgressInfoAndUpdateUIAndReQueueNextUpdateIfNeeded, 750);
  }

  async function refreshSelectedFiles(): Promise<void> {
    if (data.requestedOpenUri == null) {
      alert('No path is currently open, cannot refresh');
      return;
    }

    const openPathResult = await getClientSideRpcClient().media.editor.openPath({ fileUri: data.requestedOpenUri });

    for (const selectedFileIdentifier of selectedFiles.map(file => file.identifier)) {
      const newFileData = openPathResult.find(fileData => fileData.identifier === selectedFileIdentifier);

      if (newFileData == null) {
        files = files.filter(file => file.identifier !== selectedFileIdentifier);
        continue;
      }

      const fileIndex = files.findIndex(file => file.identifier === selectedFileIdentifier);
      if (fileIndex === -1) {
        continue;
      }

      files[fileIndex] = FileData.createFromBackendData(newFileData);
    }
  }

  function capitalizeFirstLetter(str: string): string {
    if (str.length === 0) {
      return str;
    }

    return str.charAt(0).toUpperCase() + str.slice(1);
  }

  //

  function beforeUnloadEventListener(event: BeforeUnloadEvent): void {
    event.preventDefault();
    //noinspection JSDeprecatedSymbols
    event.returnValue = true;
  }

  onMount(() => {
    $effect(() => {
      if (files.some(file => file.hasUnsavedChanges)) {
        window.addEventListener('beforeunload', beforeUnloadEventListener);
      } else {
        window.removeEventListener('beforeunload', beforeUnloadEventListener);
      }
    });

    return () => {
      window.removeEventListener('beforeunload', beforeUnloadEventListener);
      window.clearTimeout(saveReFetchingTimeoutId);

      saveModalRef?.hide();
      apolloFilePickerRef?.hide();
    };
  });

  // "v2" TODOs:
  // TODO: Present user with a drop-down for multi-file and multi-value tags case, so they can choose one of the values from a file to write into all, if they want to
  // TODO: Editing stream tags in multi-file-select, when only one stream of that type exists across all selected files
  // TODO: Heavy refactoring and re-design: split UI into multiple components, use icons where appropriate, unify text sizes etc., check accessibility, ...
  // TODO: Add support for editing Chapters
  // TODO: Maybe show a still-frame or a couple second clip for every chapter, so it is easier to identify it (or at least a live_transcode link with a startOffset and without watch progress tracking)
  // TODO: Maybe we can offer format-specific suggestions/features, when supported and a warning for not explicitly supported ones
  //       e.g. normalization of tag keys (e.g. MKV mostly/mainly uses upper-case), (common)tag key name suggestions as one is typing, language code suggestion/search/completion for LANGUAGE tags, ...
  // TODO: Warn the user (or come up with something) regarding changes that should be saved but could be lost (e.g. ffmpeg dropped a tag, because the file format only allows specific tags and not any user-supplied tag)
  //       Validation should catch this for explicitly supported file formats, but the user needs to know for others I guess
  // TODO: We only tested/developed for mkv files. Tell user that non-mkv files are not officially supported and that tags etc. might be lost after saving
  // TODO: Validation (duplicate tag keys (case-insenstive?), empty tag keys that have values, ...)
  //       Maybe it makes sense to have validation
  //       errors (e.g. duplicate key, key contains '=' and no control characters (`/[\x00-\x1f\x7f]/.test(key)`) etc.),
  //       warnings (e.g. unexpected/invalid value for tag according to spec, keys longer than 64 characters or so),
  //       weak-warnings (e.g. tag with key but no value, 'default' disposition set on multiple stream-types, 'default' disposition stream is not the first stream of that type, ...)
  //       (errors prevent saving, warnings just ask for confirmation before saving, weak-warnings show up in the UI but do not prevent/delay saving)
  //       Could allow for 'hey this tag value might be wrong/non-spec-compliant' scenarios, without preventing saving
  // TODO: Support fetching info from TheMovieDB/AniList/etc. for easier tagging of such media (maybe even use 'Apollo Media' metadata if available, e.g. to auto-detect IDs)
  // TODO: Having better UI for the disposition flags would be nice... Some flags are mutually exclusive and there are just so many...
  //       Maybe we can show some select view (incl. enabled= and offer some kind of select-search-box, for when you want to actively edit them and add one? Or move them somewhere to take less space or something?
  // TODO: Can we provide a 'preview' of changes that would/will be written to the user?
  // TODO: Can the backend send a file-hash/stat-hash and the frontend can warn the user (and ask for confirmation) that the file seems to have changed, and whether they want to proceed with saving
</script>

<svelte:head>
  <title>Metadata Editor | Apollo Media</title>
</svelte:head>

<ApolloFilePicker
  bind:this={apolloFilePickerRef}
  onResolve={(file) => openApolloFileUri(file.uri)}
/>

<ProgressModal
  bind:this={saveModalRef}
  title="Saving changes..."
  bodyText={saveModalBodyText}
/>

<!-- Buttons -->
<div>
  <button class="btn btn-sm btn-primary" onclick={() => promptUserForPathToOpen()}>
    <TablerIcon icon="folder-open" />
    Open path
  </button>
  <button class="btn btn-sm btn-primary" onclick={() => selectAllFiles()}>
    <TablerIcon icon="select-all" />
    Select all
  </button>
  <button class="btn btn-sm btn-success" onclick={() => saveAllFiles()}>
    <TablerIcon icon="device-floppy" />
    Save all
  </button>
  <button class="btn btn-sm btn-success" onclick={() => saveSelectedFiles()}>
    <TablerIcon icon="device-floppy" />
    Save selected
  </button>

  <button class="btn btn-sm btn-danger float-end" onclick={() => handleDeleteMkvStatisticsTagsFromSelectedFiles()}>
    <TablerIcon icon="eraser" />
    Delete MKV statistics tags
  </button>

  <div class="dropdown float-end me-2">
    <button
      class="btn btn-sm btn-secondary dropdown-toggle"
      type="button"
      data-bs-toggle="dropdown"
      data-bs-auto-close="outside"
      aria-expanded="false"
    >
      Multi-Add tags
    </button>
    <ul class="dropdown-menu">
      <li>
        <button
          type="button"
          class="dropdown-item"
          onclick={() => handleAddCommonTagsToSelectedFiles('common')}
        >
          Common
        </button>
      </li>

      <li>
        <button
          type="button"
          class="dropdown-item"
          onclick={() => handleAddCommonTagsToSelectedFiles('archival')}
        >
          Archival
        </button>
      </li>

      <li>
        <button
          type="button"
          class="dropdown-item"
          onclick={() => handleAddCommonTagsToSelectedFiles('anime')}
        >
          Anime
        </button>
      </li>
    </ul>
  </div>
</div>

<!-- file list -->
<div>
  {#if files.length > 0}
    <ul>
      {#each files as file}
        <!-- svelte-ignore a11y_click_events_have_key_events, a11y_interactive_supports_focus -->
        <div
          class="file-list-item"
          onclick={(event) => handleFileSelection(file.identifier, event)}
          aria-selected={isSelected(file.identifier)}
          role="option"
        >
          {file.displayName}
          {#if file.hasUnsavedChanges}
            <span title="Unsaved changes" style="color: orange"><em><strong>*</strong></em></span>
          {/if}
        </div>
      {/each}
    </ul>
  {/if}
</div>

<!-- edit area -->
<div class="mt-5">
  {#if selectedFileIds.length === 0}
    <p>No file selected</p>
  {:else}
    <!-- file tags -->
    <div>
      <div>
        <p class="d-inline h4">File tags</p>
        <button class="btn btn-sm btn-primary" onclick={() => addEmptyGlobalMetadataTagToSelectedFiles()}>
          <TablerIcon icon="plus" />
        </button>
      </div>

      {#if selectedFileIds.length === 1}
        <TagEditView_SingleFile tagCollection={selectedFiles[0].globalTags} />
      {:else}
        <TagEditView_MultipleFiles tagCollections={selectedFiles.map(file => file.globalTags)} />
      {/if}
    </div>

    <!-- streams -->
    <div class="mt-5">
      <div>
        <p class="d-inline h4">Streams</p>
      </div>

      {#if selectedFileIds.length > 1}
        <p class="text-danger fst-italic">Cannot edit streams, when multiple files are selected</p>
      {:else}
        {#each selectedFiles[0].streams as stream}
          <div class="mt-3">
            <div>
              <p class="d-inline h5">
                [{stream.identifier}]
                {#if stream.type === 'video'}
                  <TablerIcon icon="video" />
                {:else if stream.type === 'audio'}
                  <TablerIcon icon="headphones" />
                {:else if stream.type === 'subtitle'}
                  <TablerIcon icon="subtitles" />
                {:else if stream.type === 'attachment'}
                  <TablerIcon icon="file" />
                {/if}
                {capitalizeFirstLetter(stream.type)}
              </p>
              <button
                title="Move the stream one up"
                class="btn btn-sm btn-warning"
                onclick={() => selectedFiles[0].updateStreamOrderOneUp(stream.identifier)}
              >
                <TablerIcon icon="sort-ascending-2" />
              </button>
              <button
                title="Move the stream one down"
                class="btn btn-sm btn-warning"
                onclick={() => selectedFiles[0].updateStreamOrderOneDown(stream.identifier)}
              >
                <TablerIcon icon="sort-descending-2" />
              </button>
              <button
                title="Delete this stream from the file"
                class="btn btn-sm btn-danger"
                onclick={() => handleStreamDeletionClick(selectedFiles[0], stream)}
              >
                <TablerIcon icon="trash" />
              </button>
            </div>
            <small class="text-muted">{stream.streamContextText}</small>

            <div>
              <strong>Disposition</strong>
              <div class="d-flex flex-wrap gap-1 mt-2" style="max-width: 1000px">
                {#each Object.entries(stream.disposition) as [dispositionKey, dispositionValue]}
                  <button
                    class="btn btn-sm rounded-pill"
                    style="--bs-btn-font-size: 0.8rem"
                    class:btn-success={dispositionValue}
                    class:btn-danger={!dispositionValue}
                    onclick={() => selectedFiles[0].toggleDisposition(stream.identifier, dispositionKey)}
                  >{dispositionKey}</button>
                {/each}
              </div>
            </div>

            <div>
              <strong>Tags</strong>
              <button
                class="btn btn-sm btn-primary"
                onclick={() => stream.tags.pushEmptyTag()}
              >
                <TablerIcon icon="plus" />
              </button>
            </div>
            <TagEditView_SingleFile tagCollection={stream.tags} />
          </div>
        {/each}
      {/if}
    </div>
  {/if}
</div>

<style>
  .file-list-item[aria-selected='true'] {
    background-color: darkblue;
  }
</style>
