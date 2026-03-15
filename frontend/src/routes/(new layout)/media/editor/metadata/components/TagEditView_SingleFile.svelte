<script lang="ts">
  import TablerIcon from '$lib/components/TablerIcon.svelte';
  import type TagCollection from '../TagCollection.svelte';
  import { getMkvTagInfo, hasMkvTagInfo } from './MkvTagInfoTextMap';

  let { tagCollection }: { tagCollection: TagCollection } = $props();
</script>

<div class="d-flex flex-column gap-2 pt-3">
  {#if tagCollection.tags.length === 0}
    <p class="text-muted fst-italic">There are no tags right now</p>
  {/if}

  {#each tagCollection.tags as tag}
    <div>
       <span
         style:color={hasMkvTagInfo(tag.key) ? '' : 'gray'}
         title={getMkvTagInfo(tag.key)?.info ?? '–'}
       ><TablerIcon icon="info-circle" /></span>

      <input class="input-tag-key" bind:value={() => tag.key, (key) => tagCollection.setKeyByUid(tag.uid, key)}>
      <TablerIcon icon="arrow-right" />
      <input class="input-tag-value" bind:value={() => tag.value, (value) => tagCollection.setValueByUid(tag.uid, value)}>

      <button
        class="btn btn-sm btn-danger ms-2"
        onclick={() => tagCollection.deleteByUid(tag.uid)}
      >
        <TablerIcon icon="trash" />
      </button>
    </div>
  {/each}
</div>

<style>
  .input-tag-key {
    width: 300px;
  }

  .input-tag-value {
    width: 600px;
  }
</style>
