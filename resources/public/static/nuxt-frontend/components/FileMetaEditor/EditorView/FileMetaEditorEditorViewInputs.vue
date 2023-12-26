<script lang="ts" setup>
import type ParsedFile from '~/types/ParsedFile';

const props = defineProps<{ initialTagKey: string, selectedFiles: ParsedFile[], streamIndex: number }>();

function deleteTag(): void {
  for (const selectedFile of props.selectedFiles) {
    if (props.streamIndex === -1) {
      selectedFile.removeFileTag(props.initialTagKey);
      return;
    }

    selectedFile.removeStreamTag(props.streamIndex, props.initialTagKey);
  }
}

let currentTagKey = props.initialTagKey;
const virtualTagKey = computed({
  get(): string {
    return currentTagKey;
  },
  set(value: string) {
    for (const selectedFile of props.selectedFiles) {
      if ((props.streamIndex === -1 && selectedFile.hasFileTag(value)) ||
        (props.streamIndex !== -1 && selectedFile.hasStreamTag(props.streamIndex, value))) {
        // TODO: Notify user and fix buggy feel because of view and data getting out-of-sync
        console.warn(`Tag already exists on {file=${selectedFile.meta.name},streamIndex=${props.streamIndex},tagKey=${value}`);
        return;
      }
    }

    for (const selectedFile of props.selectedFiles) {
      if (props.streamIndex === -1) {
        selectedFile.renameFileTagKey(currentTagKey, value);
        continue;
      }

      selectedFile.renameStreamTagKey(props.streamIndex, currentTagKey, value);
    }
    currentTagKey = value;
  }
});

const areTagValuesEqual = computed(() => {
  if (props.streamIndex === -1) {
    const firstTagValue = props.selectedFiles[0].getFileTagValue(currentTagKey) ?? '';
    return props.selectedFiles.every(f => (f.getFileTagValue(currentTagKey) ?? '') === firstTagValue);
  }

  const firstTagValue = props.selectedFiles[0].getStreamTagValue(props.streamIndex, currentTagKey) ?? '';
  return props.selectedFiles.every(f => (f.getStreamTagValue(props.streamIndex, currentTagKey) ?? '') === firstTagValue);
});

const virtualTagValue = computed({
  get(): string {
    if (!areTagValuesEqual.value) {
      return '< multiple values > (feature not ready yet; only touch if you want to edit all at the same time)';
    }

    if (props.streamIndex === -1) {
      return props.selectedFiles[0].getFileTagValue(currentTagKey) ?? '';
    }

    return props.selectedFiles[0].getStreamTagValue(props.streamIndex, currentTagKey) ?? '';
  },
  set(value: string) {
    for (const file of props.selectedFiles) {
      if (props.streamIndex === -1) {
        file.setFileTagValue(currentTagKey, value);
        continue;
      }

      file.setStreamTagValue(props.streamIndex, currentTagKey, value);
    }
  }
});
</script>

<template>
  <div class="flex justify-center gap-2">
    <UInput color="primary"
            variant="outline"
            placeholder="Key"
            v-model="virtualTagKey"
            :ui="{ wrapper: 'relative grow' }"/>

    <span class="self-center">=</span>

    <UInput color="primary"
            variant="outline"
            placeholder="Value"
            v-model="virtualTagValue"
            :ui="{ wrapper: 'relative grow' }"/>

    <UButton
      icon="i-ic-outline-delete"
      size="sm"
      color="red"
      variant="solid"
      square
      @click="() => deleteTag()"
    />
  </div>
</template>
