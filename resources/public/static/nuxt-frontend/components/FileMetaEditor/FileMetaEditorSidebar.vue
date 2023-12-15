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
      >
        {{ file.meta.name }}
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
