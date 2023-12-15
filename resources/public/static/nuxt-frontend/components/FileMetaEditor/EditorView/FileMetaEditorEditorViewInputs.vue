<script lang="ts" setup>
import type ParsedFile from '~/types/ParsedFile';

const props = defineProps<{ initialTagKey: string, selectedFiles: ParsedFile[] }>();

function deleteTag(): void {
  for (const selectedFile of props.selectedFiles) {
    selectedFile.removeFileTag(props.initialTagKey);
  }
}

let currentTagKey = props.initialTagKey;
const virtualTagKey = computed({
  get(): string {
    return currentTagKey;
  },
  set(value: string) {
    for (const selectedFile of props.selectedFiles) {
      if (selectedFile.hasFileTag(value)) {
        // TODO: Notify user and fix buggy feel because of view and data getting out-of-sync
        console.warn(`File ${selectedFile.meta.name} already has tag ${value}`);
        return;
      }
    }

    for (const selectedFile of props.selectedFiles) {
      selectedFile.renameFileTagKey(currentTagKey, value);
    }
    currentTagKey = value;
  }
});

const areTagValuesEqual = computed(() => {
  const firstTagValue = props.selectedFiles[0].getFileTagValue(currentTagKey) ?? '';
  return props.selectedFiles.every(f => (f.getFileTagValue(currentTagKey) ?? '') === firstTagValue);
});

const virtualTagValue = computed({
  get(): string {
    if (!areTagValuesEqual.value) {
      return '< multiple values > (feature not ready yet; only touch if you want to edit all at the same time)';
    }

    return props.selectedFiles[0].getFileTagValue(currentTagKey) ?? '';
  },
  set(value: string) {
    for (const file of props.selectedFiles) {
      file.setFileTagValue(currentTagKey, value);
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
