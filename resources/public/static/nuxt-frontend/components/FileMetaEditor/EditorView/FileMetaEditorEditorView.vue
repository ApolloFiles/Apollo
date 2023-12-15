<script lang="ts" setup>
import type {WriteVideoTagsApiResponse} from '~/types/FileMetaEditor';
import type ParsedFile from '~/types/ParsedFile';

const props = defineProps<{ files: ParsedFile[] }>();
const notifier = useToast();

const selectedFiles = computed(() => props.files.filter(file => file.appState.selected));
const allSelectedFileTagKeys = computed(() => _collectAllSelectedFileTagKeys());

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
  for (const file of files) {
    const fileTags: { [key: string]: string } = {};
    for (const fileTag of file.fileTags.values()) {
      fileTags[fileTag.key] = fileTag.value;
    }
    const reqBody = {
      filePath: file.meta.filePath,
      fileTags
    };

    await useFetch<WriteVideoTagsApiResponse>(
        'http://localhost:8080/api/v1/write-video-tags',
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
    )
        .then((response) => {
          if (response.error.value != null) {
            throw response.error.value;
          }
          if (response.status.value !== 'success') {
            throw new Error('Unexpected response status: ' + response.status.value);
          }
          if (response.data.value == null) {
            throw new Error('Unexpected response data: ' + response.data.value);
          }

          file.applyFromApiResponse(response.data.value);
          notifier.add({
            title: 'Saved',
            description: 'Successfully saved ' + file.meta.name,
            icon: 'i-ic-baseline-check',
            color: 'green',
            timeout: 2000
          });
        })
        .catch((err) => {
          console.error(err);

          notifier.add({
            title: 'Error',
            description: 'Failed to save ' + file.meta.name + ' (see console for details)',
            icon: 'i-ic-baseline-error',
            color: 'red',
            timeout: 2000
          });
        });
  }
}

function createNewTagForSelectedFiles(): void {
  let allFilesAlreadyHaveTag = true;

  for (const selectedFile of selectedFiles.value) {
    if (selectedFile.hasFileTag('')) {
      continue;
    }

    selectedFile.createFileTag();
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
      <div class="toolbar">
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

      <div class="flex gap-4 flex-col">
        <h1>File-Tags&nbsp;<UButton
            icon="i-ic-outline-add"
            size="2xs"
            color="lime"
            variant="solid"
            square
            @click="() => createNewTagForSelectedFiles()"
        />
        </h1>

        <FileMetaEditorEditorViewInputs
            v-for="fileTagKey in allSelectedFileTagKeys"
            :key="fileTagKey + JSON.stringify(selectedFiles)"
            :initialTagKey="fileTagKey"
            :selectedFiles="selectedFiles"
        />
      </div>
    </div>
  </div>
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
