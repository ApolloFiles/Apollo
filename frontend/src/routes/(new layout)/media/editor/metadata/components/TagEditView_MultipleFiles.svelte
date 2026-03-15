<script lang="ts">
  import TablerIcon from '$lib/components/TablerIcon.svelte';
  import TagCollection, { type TagData } from '../TagCollection.svelte';
  import { getMkvTagInfo, hasMkvTagInfo } from './MkvTagInfoTextMap';

  type CollectedTag = {
    key: string,
    uniqueValues: Set<string>,
    tagPairs: [TagCollection, TagData['uid']][],
  };

  let { tagCollections }: { tagCollections: TagCollection[] } = $props();

  let tagKeysThatAreDuplicateInAtLeastOneFile: string[] = $derived.by(() => {
    const duplicatedKeys = new Set<string>();

    for (const tagCollection of tagCollections) {
      for (const tag of tagCollection.tags) {
        if (tagCollection.findByKeyIfUniqueOrNull(tag.key) == null) {
          duplicatedKeys.add(tag.key);
        }
      }
    }

    return Array.from(duplicatedKeys.values())
      .sort((a, b) => TagCollection.compareKeysForSorting(a, b));
  });
  let collectedGlobalTags: CollectedTag[] = $derived.by(() => {
    const collectedTags = new Map<TagData['key'], CollectedTag>();

    for (const tagCollection of tagCollections) {
      for (const tag of tagCollection.tags) {
        if (tagKeysThatAreDuplicateInAtLeastOneFile.includes(tag.key)) {
          continue;
        }

        if (!collectedTags.has(tag.key)) {
          collectedTags.set(tag.key, {
            key: tag.key,
            uniqueValues: new Set(),
            tagPairs: [],
          });
        }

        const collectedTag = collectedTags.get(tag.key)!;
        collectedTag.uniqueValues.add(tag.value);
        collectedTag.tagPairs.push([tagCollection, tag.uid]);
      }
    }

    // files(/TagCollections) without a tag key, should count as having an empty value,
    // so the UI displays that difference in value. So we check for that
    for (const tag of collectedTags.values()) {
      for (const tagCollection of tagCollections) {
        if (!tagCollection.findByKeyIfUniqueOrNull(tag.key)) {
          tag.uniqueValues.add('');
          break;
        }
      }
    }

    return Array.from(collectedTags.values())
      .sort((a, b) => TagCollection.compareKeysForSorting(a.key, b.key));
  });

  // FIXME: after editing a key, it might be sorted (e.g. to the top). If I clicked in the tag's value input, I am now typing in the wrong value input
  function onTagKeyInputBlur(collectedTag: CollectedTag, inputValue: string): void {
    if (collectedTag.key === inputValue) {
      return; // nothing changed
    }

    for (const [tagCollection, tagUid] of collectedTag.tagPairs) {
      tagCollection.setKeyByUid(tagUid, inputValue);
    }

    for (const tagCollection of tagCollections) {
      if (!_isCollectedTagInTagCollection(collectedTag, tagCollection)) {
        let value = '';
        if (collectedTag.uniqueValues.size === 1) {
          value = collectedTag.uniqueValues.values().next().value!;
        }

        tagCollection.pushTag(inputValue, value);
      }
    }
  }

  function handleTagValueEdit(collectedTag: CollectedTag, newValue: string): void {
    for (const [tagCollection, tagUid] of collectedTag.tagPairs) {
      tagCollection.setValueByUid(tagUid, newValue);
    }

    for (const tagCollection of tagCollections) {
      if (!_isCollectedTagInTagCollection(collectedTag, tagCollection)) {
        tagCollection.pushTag(collectedTag.key, newValue);
      }
    }
  }

  function deleteCollectedTag(collectedTag: CollectedTag): void {
    for (const [tagCollection, tagUid] of collectedTag.tagPairs) {
      tagCollection.deleteByUid(tagUid);
    }
  }

  function _isCollectedTagInTagCollection(collectedTag: CollectedTag, tagCollection: TagCollection): boolean {
    return collectedTag.tagPairs.some(([tagCollectionInPair, _]) => tagCollectionInPair === tagCollection);
  }
</script>

<div class="d-flex flex-column gap-2 pt-3">
  {#if collectedGlobalTags.length === 0}
    <p class="text-muted fst-italic">There are no file tags right now</p>
  {/if}

  {#each collectedGlobalTags as collectedTag}
    <div>
       <span
         style:color={hasMkvTagInfo(collectedTag.key) ? '' : 'gray'}
         title={getMkvTagInfo(collectedTag.key)?.info ?? '–'}
       ><TablerIcon icon="info-circle" /></span>

      <input
        class="input-tag-key"
        value={collectedTag.key}
        onblur={(event) => onTagKeyInputBlur(collectedTag, event.currentTarget.value)}
      >

      <TablerIcon icon="arrow-right" />

      <input
        class="input-tag-value"
        value={collectedTag.uniqueValues.size === 1 ? collectedTag.uniqueValues.values().next().value : '<Multiple values – Editing will overwrite all values>'}
        oninput={(event) => handleTagValueEdit(collectedTag, event.currentTarget.value)}
      >

      <button
        class="btn btn-sm btn-danger ms-2"
        onclick={() => deleteCollectedTag(collectedTag)}
      >
        <TablerIcon icon="trash" />
      </button>
    </div>
  {/each}

  {#each tagKeysThatAreDuplicateInAtLeastOneFile as tagKey}
    <div>
      <input
        class="input-tag-key cursor-not-allowed"
        value={tagKey}
        readonly
      />
      <TablerIcon icon="arrow-right" />
      <input
        class="input-tag-value cursor-not-allowed disabled"
        value="<Cannot edit – Key is not unique across selected files>"
        readonly
      />

      <button class="btn btn-sm btn-danger ms-2 cursor-not-allowed">
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

  .cursor-not-allowed {
    cursor: not-allowed;
  }
</style>
