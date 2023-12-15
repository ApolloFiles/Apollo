<script lang="ts" setup>
function selectDirectory(): void {
  const pathInput = window.prompt('Enter a path from Apollo to open');
  if (pathInput == null || pathInput === '') {
    return;
  }

  // TODO: Warn user when there are unsaved changes
  setSelectedDirectory(pathInput);
}

function setSelectedDirectory(directoryPath: string): void {
  apolloDirectoryPath.value = directoryPath;
  apolloDirectoryPathLastUpdate.value = Date.now();
}

const apolloDirectoryPath = ref('');
const apolloDirectoryPathLastUpdate = ref(0);
</script>

<template>
  <div class="h-screen">
    <!-- TODO: Button schöner platzieren -->
    <UButton
        icon="i-ic-baseline-folder"
        size="xl"
        color="primary"
        label="Open directory"
        @click="selectDirectory"
    />

    <DevOnly>
      <UButton
          label="open dev"
          size="2xs"
          color="orange"
          class="m-2 align-top"
          @click="setSelectedDirectory('/_media_lib_anime_serien/editor-test/Season 01/')"
      />
    </DevOnly>

    <hr>

    <div v-if="apolloDirectoryPath == ''">
      <p>No directory selected</p>
    </div>
    <div v-else>
      <LazyFileMetaEditor
          :key="apolloDirectoryPathLastUpdate"
          :apolloDirectoryPath="apolloDirectoryPath"/>
    </div>

    <UNotifications/>
  </div>
</template>
