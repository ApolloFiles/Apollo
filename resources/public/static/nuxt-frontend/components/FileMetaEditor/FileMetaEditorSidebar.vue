<script lang="ts" setup>
import type ParsedFile from '~/types/ParsedFile';

const props = defineProps<{ files: ParsedFile[] }>();

function handleSelectClick(file: ParsedFile, isMultiSelect: boolean): void {
  if (isMultiSelect) {
    file.appState.selected = !file.appState.selected;
    return;
  }

  if (file.appState.selected) {
    const shouldSelectCurrentFile = props.files.filter(file => file.appState.selected).length > 1;

    _unselectAll();
    if (shouldSelectCurrentFile) {
      file.appState.selected = true;
    }

    return;
  }

  _unselectAll();
  file.appState.selected = true;
}

function formatVideoDuration(durationStr: string): string {
  const duration = parseFloat(durationStr);

  const hours = Math.floor(duration / 3600);
  const minutes = Math.floor((duration - (hours * 3600)) / 60);
  const seconds = Math.floor(duration - (hours * 3600) - (minutes * 60));

  let result = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  if (hours <= 0) {
    return result;
  }
  return `${hours.toString().padStart(2, '0')}:${result}`;
}

function _unselectAll(): void {
  for (const file of props.files) {
    file.appState.selected = false;
  }
}
</script>

<template>
  <div class="sidebar overflow-y-auto">
    <ul>
      <li v-for="file in props.files"
          :key="file.meta.name"
          :class="{selected: file.appState.selected}"
          @click.passive="handleSelectClick(file, $event.ctrlKey)"
          class="flex justify-between"
      >
        <span class="truncate" :title="file.meta.name">{{ file.meta.name }}</span>
        <span class="text-right" title="(hh:)mm:ss">{{ formatVideoDuration(file.meta.duration) }}</span>
        <span class="text-orange-400" :class="{hidden: !file.appState.unsavedChanges}"><em>(*)</em></span>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.sidebar {
  width: 20%;
}

.sidebar ul {
  list-style: none;
  padding:    0;
  margin:     0;
}

.sidebar li {
  padding: 10px;
  cursor:  pointer;
}

.sidebar li.selected {
  background-color: grey;
  color:            white;
}
</style>
