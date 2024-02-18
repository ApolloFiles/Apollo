<script lang="ts" setup>
import type {Ref} from 'vue';
import type {WriteVideoTagsApiResponse} from '~/types/FileMetaEditor';
import type ParsedFile from '~/types/ParsedFile';

const props = defineProps<{ files: ParsedFile[] }>();
const apolloBaseUrl = useAppConfig().apolloBaseUrl;
const notifier = useToast();

const selectedFiles = computed(() => props.files.filter(file => file.appState.selected));
const allSelectedFileTagKeys = computed(() => _collectAllSelectedFileTagKeys());

let saveInProgress = ref(false);
let saveInProgressStats: Ref<{
  currentFileName: string,
  currentFileIndex: number,
  total: number,
  progressStats?: { progress?: number, text?: string }
}> = ref({currentFileName: '', currentFileIndex: -1, total: 0});

defineShortcuts({
  ctrl_s: {
    usingInput: true,
    handler: () => saveSelectedFiles()
  },
  ctrl_shift_s: {
    usingInput: true,
    handler: () => saveAllFiles()
  }
});

async function saveSelectedFiles(): Promise<void> {
  return saveFiles(selectedFiles.value);
}

async function saveAllFiles(): Promise<void> {
  return saveFiles(props.files);
}

async function saveFiles(files: ParsedFile[]): Promise<void> {
  if (saveInProgress.value) {
    notifier.add({
      title: 'Save in progress',
      description: 'Please wait for the current save to finish',
      icon: 'i-ic-baseline-warning-amber',
      color: 'orange',
      timeout: 4000
    });
    return;
  }

  saveInProgressStats.value.currentFileIndex = -1;
  saveInProgressStats.value.total = files.length;
  saveInProgressStats.value.progressStats = undefined;
  saveInProgress.value = true;
  try {
    for (const file of files) {
      ++saveInProgressStats.value.currentFileIndex;
      saveInProgressStats.value.currentFileName = file.meta.name;

      const fileTags: { [key: string]: string } = {};
      for (const fileTag of file.fileTags.values()) {
        fileTags[fileTag.key] = fileTag.value;
      }

      const streamTags: { [streamIndex: number]: { [key: string]: string } } = {};
      for (const [streamIndex, streamMeta] of file.streamMeta.entries()) {
        streamTags[streamIndex] = {};
        for (const streamTag of streamMeta.tags.values()) {
          streamTags[streamIndex][streamTag.key] = streamTag.value;
        }
      }

      const streamDispositions: { [streamIndex: number]: { [key: string]: 0 | 1 } } = {};
      for (const [streamIndex, streamMeta] of file.streamMeta.entries()) {
        streamDispositions[streamIndex] = {};
        for (const dispositionKey in streamMeta.disposition) {
          streamDispositions[streamIndex][dispositionKey] = streamMeta.disposition[dispositionKey];
        }
      }

      const reqBody = {
        filePath: file.meta.filePath,
        fileTags,
        streamTags,
        streamDispositions
      };

      const handleWriteResponse = (response: { statusCode: number, body: WriteVideoTagsApiResponse }) => {
        if (response.statusCode !== 200) {
          throw new Error('Unexpected response status code: ' + response.statusCode);
        }

        file.applyFromApiResponse(response.body);
        notifier.add({
          title: 'Saved',
          description: 'Successfully saved ' + file.meta.name,
          icon: 'i-ic-baseline-check',
          color: 'green',
          timeout: 2000
        });
      };

      const writeVideoTagsRes = await useFetch<{ taskId: string, taskStatusUri: string }>(
        `${apolloBaseUrl}/api/v1/write-video-tags`,
        {
          server: false,
          cache: 'no-store',
          method: 'POST',
          body: JSON.stringify(reqBody),
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer superSecretTokenForSpraxDev'
          }
        }
      );
      if (writeVideoTagsRes.error.value != null) {
        throw writeVideoTagsRes.error.value;
      }
      if (writeVideoTagsRes.status.value !== 'success') {
        throw new Error('Unexpected response status: ' + writeVideoTagsRes.status.value);
      }
      if (writeVideoTagsRes.data.value == null) {
        throw new Error('Unexpected response data: ' + writeVideoTagsRes.data.value);
      }

      const taskStatusUri = writeVideoTagsRes.data.value.taskStatusUri;

      let taskStatusRequestCounter = 0;
      while (true) {
        ++taskStatusRequestCounter;

        const taskStatusRes = await useFetch<{
          taskId: string,
          creationTime: string,
          finished: boolean,
          progressStats?: { progressPercentage?: number, text?: string }
          result?: { statusCode: number, body: WriteVideoTagsApiResponse }
        }>(`${apolloBaseUrl}${taskStatusUri}`,
          {
            server: false,
            cache: 'no-store',
            method: 'GET',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': 'Bearer superSecretTokenForSpraxDev'
            }
          }
        );
        if (taskStatusRes.error.value != null) {
          throw taskStatusRes.error.value;
        }
        if (taskStatusRes.status.value !== 'success') {
          throw new Error('Unexpected response status: ' + taskStatusRes.status.value);
        }
        if (taskStatusRes.data.value == null) {
          throw new Error('Unexpected response data: ' + taskStatusRes.data.value);
        }

        saveInProgressStats.value.progressStats = taskStatusRes.data.value.progressStats;

        if (taskStatusRes.data.value.finished) {
          if (taskStatusRes.data.value.result == null) {
            throw new Error('Unexpected response data (field result missing?): ' + taskStatusRes.data.value);
          }

          handleWriteResponse(taskStatusRes.data.value.result);
          break;
        }

        console.log('Waiting for task to finish...');
        await new Promise(resolve => setTimeout(resolve, taskStatusRequestCounter <= 5 ? 500 : 1000));
      }
    }
  } catch (err) {
    console.error(err);

    notifier.add({
      title: 'Error',
      description: 'Failed to save ' + (saveInProgressStats.value.currentFileName ?? '') + ' (see console for details)',
      icon: 'i-ic-baseline-error',
      color: 'red',
      timeout: 0
    });

  } finally {
    saveInProgress.value = false;
  }
}

function deleteStatisticsTagsRelatedTagsFromSelectedFiles(): void {
  for (const selectedFile of selectedFiles.value) {
    for (const streamId of selectedFile.streamMeta.keys()) {
      const statisticsTags = selectedFile.getStreamTagValue(streamId, '_STATISTICS_TAGS-eng');
      if (statisticsTags == null) {
        continue;
      }

      for (const tagKeyToRemove of statisticsTags.split(' ')) {
        if (tagKeyToRemove.trim().length > 0) {
          selectedFile.removeStreamTag(streamId, `${tagKeyToRemove}-eng`);
        }
      }

      selectedFile.removeStreamTag(streamId, '_STATISTICS_TAGS-eng');
      selectedFile.removeStreamTag(streamId, '_STATISTICS_WRITING_APP-eng');
      selectedFile.removeStreamTag(streamId, '_STATISTICS_WRITING_DATE_UTC-eng');
    }
  }
}

function createNewTagForSelectedFiles(streamIndex: number): void {
  let allFilesAlreadyHaveTag = true;

  for (const selectedFile of selectedFiles.value) {
    if ((streamIndex === -1 && selectedFile.hasFileTag('')) ||
      (streamIndex !== -1 && selectedFile.hasStreamTag(streamIndex, ''))) {
      continue;
    }

    if (streamIndex === -1) {
      selectedFile.createFileTag();
    } else {
      selectedFile.createStreamTag(streamIndex);
    }
    allFilesAlreadyHaveTag = false;
  }

  if (allFilesAlreadyHaveTag) {
    notifier.add({
      title: 'Cannot create duplicate empty tag',
      description: 'Please set a key value before creating another empty tag',
      icon: 'i-ic-outline-warning-amber',
      color: 'orange',
      timeout: 4000
    });
  }
}

function capitalizeFirstLetter(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function _collectAllSelectedFileTagKeys(): Set<string> {
  const result = new Set<string>();

  for (const selectedFile of selectedFiles.value) {
    for (const fileTag of selectedFile.fileTags.values()) {
      result.add(fileTag.key);
    }
  }

  return result;
}
</script>

<template>
  <div class="main">
    <div class="content">
      <UAccordion
        color="primary"
        variant="soft"
        size="sm"
        :items="[{ label: 'Common (Mkv) Tags', slot: 'common-mkv-tags' }, { label: 'Common (Mkv-Stream) Tags', slot: 'common-mkv-stream-tags' }]"
      >
        <template #common-mkv-tags>
          <h2 class="text-3xl">Titles</h2>
          <pre class="inline"
               title="The title of this item. For example, for music you might label this “Canon in D”, or for video’s audio track you might use “English 5.1” This is akin to the “TIT2” tag in [@!ID3v2].">TITLE</pre>,
          <pre class="inline" title="Sub Title of the entity.">SUBTITLE</pre>,
          <pre class="inline"
               title="Describes the original type of the media, such as, “DVD”, “CD”, “computer image,” “drawing,” “lithograph,” and so forth. This is akin to the “TMED” tag in [@!ID3v2].">ORIGINAL_MEDIA_TYPE</pre>

          <h2 class="text-3xl">Search and Classification</h2>
          <pre class="inline" title="A short description of the content, such as “Two birds flying.”">DESCRIPTION</pre>,
          <pre class="inline" title="A description of the story line of the item.">SYNOPSIS</pre>,
          <pre class="inline"
               title="The type of the item. e.g., Documentary, Feature Film, Cartoon, Music Video, Music, Sound FX, …">CONTENT_TYPE</pre>,
          <pre class="inline"
               title="The name of the country that is meant to have other tags inside (using nested tags) to country specific information about the item, in the Matroska countries form, i.e. [@!BCP47] two-letter region subtag, without the UK exception. All tags in this list can be used “under” the COUNTRY_SPECIFIC tag like LABEL, PUBLISH_RATING, etc.">COUNTRY</pre>,
          <pre class="inline"
               title="Depending on the COUNTRY it’s the format of the rating of a movie (P, R, X in the USA, an age in other countries or a URI defining a logo).">LAW_RATING</pre>

          <h2 class="text-3xl">Organization Information</h2>
          <pre class="inline"
               title="Total number of parts defined at the first lower level. (e.g., if TargetType is ALBUM, the total number of tracks of an audio CD)">TOTAL_PARTS</pre>,
          <pre class="inline"
               title="Number of the current part of the current level. (e.g., if TargetType is TRACK, the track number of an audio CD)">PART_NUMBER</pre>,
          <pre class="inline"
               title="A number to add to PART_NUMBER, when the parts at that level don’t start at 1. (e.g., if TargetType is TRACK, the track number of the second audio CD)">PART_OFFSET</pre>

          <h2 class="text-3xl">Temporal Information</h2>
          <pre class="inline"
               title="The time that the item was originally released. This is akin to the “TDRL” tag in [@!ID3v2].">DATE_RELEASED</pre>,
          <pre class="inline"
               title="The time that the encoding of this item was completed began. This is akin to the “TDEN” tag in [@!ID3v2].">DATE_ENCODED</pre>,
          <pre class="inline"
               title="The time that the tags were done for this item. This is akin to the “TDTG” tag in [@!ID3v2].">DATE_TAGGED</pre>,
          <pre class="inline"
               title="The time that the item was transferred to a digital medium. This is akin to the “IDIT” tag in [@?RIFF.tags].">DATE_DIGITIZED</pre>

          <h2 class="text-3xl">Identifiers</h2>
          <pre class="inline"
               title="Internet Movie Database [@!IMDb] identifier. “tt” followed by at least 7 digits for Movies, TV Shows, and Episodes.">IMDB</pre>,
          <pre class="inline"
               title="The Movie DB “movie_id” or “tv_id” identifier for movies/TV shows [@!MovieDB]. The variable length digits string MUST be prefixed with either “movie/” or “tv/”.">TMDB</pre>,
          <pre class="inline"
               title="The TV Database [@!TheTVDB] tag which can include movies. The variable length digits string representing a “Series ID”, “Episode ID” or “Movie ID” identifier MUST be prefixed with “series/”, “episodes/” or “movies/” respectively.">TVDB2</pre>,
          <pre class="inline"
               title="Hab ich mir einfach ausgedacht – Die ID aus der URL nutzen">MYANIMELIST</pre>,
          <pre class="inline"
               title="Hab ich mir einfach ausgedacht – Die ID aus der URL nutzen">ANIDB</pre>


          <h2 class="text-3xl">Personal &amp; Technical Information</h2>
          <pre class="inline" title="Any comment related to the content.">COMMENT</pre>,
          <pre class="inline" title="A list of the settings used for encoding this item. No specific format.">ENCODER_SETTINGS</pre>

          <h2 class="text-3xl">Legal</h2>
          <pre class="inline"
               title="The copyright information as per the copyright holder. This is akin to the “TCOP” tag in [@!ID3v2].">COPYRIGHT</pre>,
          <pre class="inline" title="The license applied to the content (like Creative Commons variants).">LICENSE</pre>,
          <pre class="inline" title="The terms of use for this item. This is akin to the “USER” tag in [@!ID3v2].">TERMS_OF_USE</pre>
        </template>

        <template #common-mkv-stream-tags>
          <h2 class="text-3xl">Titles</h2>
          <pre class="inline"
               title="The title of this item. For example, for music you might label this “Canon in D”, or for video’s audio track you might use “English 5.1” This is akin to the “TIT2” tag in [@!ID3v2].">TITLE</pre>

          <h2 class="text-3xl">Language</h2>
          <pre class="inline"
               title="ISO639-2 (z.B. eng, deu, jpn=Japanisch, und=undefined); Muss ignoriert werden, wenn LanguageBCP47-Tag vorhanden">Language</pre> (<a href="https://www.loc.gov/standards/iso639-2/php/code_list.php" target="_blank" rel="noopener">ref</a>),
          <pre class="inline"
               title="BCP47 (z.B. en, en-US, de, de-DE, ja); Wenn vorhanden muss ein Language-Tag ignoriert werden">LanguageBCP47</pre> (<a href="https://www.iana.org/assignments/language-subtag-registry/language-subtag-registry" target="_blank" rel="noopener">ref</a>)
        </template>
      </UAccordion>

      <div class="toolbar">
        <UTooltip text="Reads the tag and deletes the listed tags">
          <UButton
            icon="i-ic-delete"
            size="sm"
            color="orange"
            :disabled="selectedFiles.length === 0"
            @click="() => deleteStatisticsTagsRelatedTagsFromSelectedFiles()"
          >Delete <code>_STATISTICS_TAGS-eng</code> related tags</UButton>
        </UTooltip>

        <!--        <UTooltip text="Discard changes in this file">-->
        <!--          <UButton-->
        <!--              icon="i-ic-baseline-refresh"-->
        <!--              size="sm"-->
        <!--              color="primary"/>-->
        <!--        </UTooltip>-->

        <UTooltip text="Save selected files" :shortcuts="['Ctrl', 'S']">
          <UButton
            icon="i-ic-baseline-save"
            size="sm"
            color="primary"
            :disabled="selectedFiles.length === 0"
            @click="() => saveSelectedFiles()"
          />
        </UTooltip>

        <UTooltip text="Save all files" :shortcuts="['Ctrl', 'Shift', 'S']">
          <UButton
            icon="i-ic-baseline-save-all"
            size="sm"
            color="primary"
            @click="() => saveAllFiles()"
          />
        </UTooltip>
      </div>

      <div class="flex gap-4 flex-col"
           v-if="selectedFiles.length >= 1">
        <h1>File-Tags&nbsp;<UButton
          icon="i-ic-outline-add"
          size="2xs"
          color="lime"
          variant="solid"
          square
          @click="() => createNewTagForSelectedFiles(-1)"
        />
          <br v-if="selectedFiles.length === 1">
          <small
            v-if="selectedFiles.length === 1"
            :title="`${selectedFiles[0].meta.probeScore}% Zuversicht in den erkannten Container-Typ (probeScore)`"
          >{{ selectedFiles[0].meta.formatNameLong }}
            <UIcon name="i-ic-outline-info"/>
          </small>
        </h1>

        <FileMetaEditorEditorViewInputs
          v-for="fileTagKey in allSelectedFileTagKeys"
          :key="fileTagKey + JSON.stringify(selectedFiles)"
          :initialTagKey="fileTagKey"
          :selectedFiles="selectedFiles"
          :stream-index="-1"
        />
      </div>

      <div class="flex gap-4 flex-col pt-8"
           v-if="selectedFiles.length === 1"
           v-for="streamIndex in selectedFiles[0].streamMeta.keys()">
        <div class="flex justify-between">
          <div class="flex-shrink-0 mr-10">
            <h1>{{ capitalizeFirstLetter(selectedFiles[0].streamMeta.get(streamIndex)?.codecType ?? 'Stream') }}-Tags&nbsp;(#{{ streamIndex
              }})&nbsp;<UButton
                icon="i-ic-outline-add"
                size="2xs"
                color="lime"
                variant="solid"
                square
                @click="() => createNewTagForSelectedFiles(streamIndex)"
              />
              <br v-if="selectedFiles.length === 1">
              <small v-if="selectedFiles.length === 1">{{ selectedFiles[0].streamMeta.get(streamIndex)?.codecNameLong
                }}</small>
            </h1>
          </div>
          <div v-if="selectedFiles.length == 1">
            <UBadge
              :ui="{ rounded: 'rounded-full' }"
              class="cursor-pointer mr-1"
              :key="streamIndex.toString() + dispositionKey + JSON.stringify(selectedFiles)"
              v-for="(dispositionValue, dispositionKey) of selectedFiles[0].streamMeta.get(streamIndex)!.disposition"
              :variant="dispositionValue == 1 ? 'solid' : 'soft'"
              :color="dispositionValue == 1 ? 'green': 'red'"
              @click.passive="() => selectedFiles[0].streamMeta.get(streamIndex)!.disposition[dispositionKey] = (dispositionValue == 1 ? 0 : 1)"
            >{{ dispositionKey }}
            </UBadge>
          </div>
        </div>

        <FileMetaEditorEditorViewInputs
          v-for="streamTag of selectedFiles[0].streamMeta.get(streamIndex)!.tags.values()"
          :key="streamIndex.toString() + streamTag.key + JSON.stringify(selectedFiles)"
          :initialTagKey="streamTag.key"
          :selectedFiles="selectedFiles"
          :stream-index="streamIndex"
        />
      </div>
      <div v-else-if="selectedFiles.length > 1">
        <strong><em>Cannot edit stream tags with multiple files selected.</em></strong>
      </div>
    </div>
  </div>

  <UModal v-model="saveInProgress" prevent-close>
    <UCard :ui="{ ring: '', divide: 'divide-y divide-gray-100 dark:divide-gray-800' }">
      <template #header>
        <h1>Speichere Datei {{ saveInProgressStats.currentFileIndex + 1 }} von {{ saveInProgressStats.total }}</h1>
      </template>

      <UButton loading block>{{ saveInProgressStats.currentFileName }}</UButton>
      <p v-if="saveInProgressStats.progressStats?.progress !== undefined">
        {{ saveInProgressStats.progressStats.progress * 100 }}&nbsp;%
      </p>
      <p v-if="saveInProgressStats.progressStats?.text" style="white-space: pre">
        {{ saveInProgressStats.progressStats.text }}
      </p>
    </UCard>
  </UModal>
</template>

<style scoped>
.main {
  width: 80%;
}

.main .toolbar {
  display:         flex;
  justify-content: flex-end;
  align-items:     center;
  height:          50px;
  padding:         10px;
}

.main .toolbar button {
  margin-left: 10px;
}

.main .content {
  padding:    10px;
  overflow-y: auto;
}
</style>
