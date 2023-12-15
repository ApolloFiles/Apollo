<script lang="ts" setup>
import type {Ref} from 'vue';
import type {VideoAnalysisApiResponse} from '~/types/FileMetaEditor';
import ParsedFile from '~/types/ParsedFile';

const props = defineProps<{ apolloDirectoryPath: string }>();

const {pending, error, data: fetchedData} = await useLazyFetch<VideoAnalysisApiResponse>(
    'http://localhost:8080/api/v1/video-analysis',
    {
      server: false,
      cache: 'no-store',
      method: 'GET',
      query: {path: computed(() => props.apolloDirectoryPath)},
      headers: {'Authorization': 'Bearer superSecretTokenForSpraxDev'}
    }
);

const parsedFiles: Ref<ParsedFile[]> = ref([]);

watch(fetchedData, (newValue) => {
  if (parsedFiles.value.length > 0) {
    throw new Error('parsedFiles is not empty (looks like the vue component is re-used)');
  }

  const fetchedFiles = newValue?.files;
  if (fetchedFiles == null) {
    console.error(newValue);
    throw new Error('fetchedFiles is null');
  }

  for (const fetchedFile of fetchedFiles) {
    parsedFiles.value.push(ParsedFile.fromApiResponse(fetchedFile));
  }
});
</script>

<template>
  <div>
    <div v-if="pending">
      Loading...
    </div>
    <div v-else-if="error != null || fetchedData?.files == null">
      Error loading data:
      <pre>{{ JSON.stringify({error, fetchedData}, null, 4) }}</pre>
    </div>
    <div v-else class="flex">
      <FileMetaEditorSidebar :files="parsedFiles"/>
      <FileMetaEditorEditorView :files="parsedFiles"/>
    </div>
  </div>
</template>
