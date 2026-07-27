<script lang="ts">
  import TablerIcon from '$lib/components/TablerIcon.svelte';
  import TagCollection, { type TagData } from '../TagCollection.svelte';
  import { getMkvTagInfo, hasMkvTagInfo } from './MkvTagInfoTextMap';

  type CollectedTag = {
    key: string,
    /**
     * {@code null} for tags that have a key.
     *
     * Tags without a key cannot be matched across files by their key, so they are matched by their
     * position among all the key-less tags of a file instead. This is that position.
     */
    emptyKeyIndex: number | null,
    uniqueValues: Set<string>,
    tagPairs: [TagCollection, TagData['uid']][],
  };

  let { tagCollections }: { tagCollections: TagCollection[] } = $props();

  let tagKeysThatAreDuplicateInAtLeastOneFile: string[] = $derived.by(() => {
    const duplicatedKeys = new Set<string>();

    for (const tagCollection of tagCollections) {
      for (const tag of tagCollection.tags) {
        // Tags without a key are newly added ones the user has not named yet – a file is expected to
        // have more than one of them, so they are exempt from the duplicate check and are matched by
        // their position instead (see #collectedGlobalTags).
        if (tag.key === '') {
          continue;
        }

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
    /** Indexed by {@link CollectedTag#emptyKeyIndex} */
    const collectedTagsWithoutKey: CollectedTag[] = [];

    for (const tagCollection of tagCollections) {
      let emptyKeyIndex = 0;

      for (const tag of tagCollection.tags) {
        if (tag.key === '') {
          collectedTagsWithoutKey[emptyKeyIndex] ??= {
            key: '',
            emptyKeyIndex,
            uniqueValues: new Set(),
            tagPairs: [],
          };

          const collectedTag = collectedTagsWithoutKey[emptyKeyIndex];
          collectedTag.uniqueValues.add(tag.value);
          collectedTag.tagPairs.push([tagCollection, tag.uid]);

          ++emptyKeyIndex;
          continue;
        }

        if (tagKeysThatAreDuplicateInAtLeastOneFile.includes(tag.key)) {
          continue;
        }

        if (!collectedTags.has(tag.key)) {
          collectedTags.set(tag.key, {
            key: tag.key,
            emptyKeyIndex: null,
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
    // ... the same applies to files that have fewer key-less tags than the file with the most of them
    for (const tag of collectedTagsWithoutKey) {
      if (tag.tagPairs.length < tagCollections.length) {
        tag.uniqueValues.add('');
      }
    }

    return [
      ...Array.from(collectedTags.values())
        .sort((a, b) => TagCollection.compareKeysForSorting(a.key, b.key)),

      // tags without a key always sort last (see TagCollection#compareKeysForSorting) and are
      // already ordered by their #emptyKeyIndex
      ...collectedTagsWithoutKey,
    ];
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

        _pushMissingTag(tagCollection, collectedTag, inputValue, value);
      }
    }
  }

  function handleTagValueEdit(collectedTag: CollectedTag, newValue: string): void {
    for (const [tagCollection, tagUid] of collectedTag.tagPairs) {
      tagCollection.setValueByUid(tagUid, newValue);
    }

    for (const tagCollection of tagCollections) {
      if (!_isCollectedTagInTagCollection(collectedTag, tagCollection)) {
        _pushMissingTag(tagCollection, collectedTag, collectedTag.key, newValue);
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

  /**
   * Adds a tag to a file that does not have the edited {@link CollectedTag} yet.
   *
   * A tag that still has no key is matched by its position among the file's other key-less tags, so
   * we have to pad that file with key-less tags to make the new one end up at the same position.
   * Without it, editing the value of the second key-less tag would write into the first one of a
   * file that only has a single key-less tag so far.
   */
  function _pushMissingTag(tagCollection: TagCollection, collectedTag: CollectedTag, key: string, value: string): void {
    if (key === '' && collectedTag.emptyKeyIndex != null) {
      while (tagCollection.findByEmptyKey().length < collectedTag.emptyKeyIndex) {
        tagCollection.pushEmptyTag();
      }
    }

    tagCollection.pushTag(key, value);
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

      <div class="dropdown d-inline-block">
        <button
          class="btn btn-sm btn-secondary dropdown-toggle"
          type="button"
          data-bs-toggle="dropdown"
          aria-expanded="false"
          aria-label="Open dropdown to show all unique values for this tag across the selected files"
        >
        </button>
        <ul class="dropdown-menu">
          <li><h6 class="dropdown-header">values across selected files</h6></li>
          {#each collectedTag.uniqueValues as uniqueValue}
            <li>
              <button
                type="button"
                class="dropdown-item"
                onclick={() => handleTagValueEdit(collectedTag, uniqueValue)}
              >
                {uniqueValue || '<Empty text>'}
              </button>
            </li>
          {/each}

          <li><hr class="dropdown-divider"></li>

          <li><h6 class="dropdown-header">suggested values (TODO)</h6></li>

        </ul>
      </div>

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
       <span
         style:color={hasMkvTagInfo(tagKey) ? '' : 'gray'}
         title={getMkvTagInfo(tagKey)?.info ?? '–'}
       ><TablerIcon icon="info-circle" /></span>

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
