<script lang="ts">
  import { m } from '$lib/paraglide/messages.js';
  import TablerIcon from '$lib/components/TablerIcon.svelte';
  import { applyBulkEditPlan } from './bulkEdit/applyPlan.js';
  import { collectDispositionFlags, computeBulkEditPlan } from './bulkEdit/computePlan.js';
  import { describeMatchedStreams } from './bulkEdit/format.js';
  import type {
    Condition,
    EditableFile,
    Operation,
    OperationKind,
    StreamType,
  } from './bulkEdit/types.js';

  let { files }: {
    /** Getter for the files the dialog operates on (the host passes the currently selected files). */
    files: () => EditableFile[],
  } = $props();

  let dialogRef: HTMLDialogElement;

  let conditions = $state<Condition[]>([]);
  let operations = $state<Operation[]>([]);

  let uidCounter = 0;
  function nextUid(): number {
    return uidCounter++;
  }

  const STREAM_TYPES: StreamType[] = ['video', 'audio', 'subtitle', 'attachment', 'misc'];

  const OPERATION_KINDS: { kind: OperationKind, label: string }[] = [
    { kind: 'tagWrite', label: 'Tag: Write (add/update)' },
    { kind: 'tagDelete', label: 'Tag: Delete by key' },
    { kind: 'dispositionSet', label: 'Disposition: Set flag' },
    { kind: 'dispositionUnsetAll', label: 'Disposition: Unset all flags' },
    { kind: 'streamReorder', label: 'Stream: Change order to position' },
    { kind: 'streamDelete', label: 'Stream: Delete' },
  ];

  const inScopeFiles = $derived(files());
  const dispositionFlags = $derived(collectDispositionFlags(inScopeFiles));
  const plan = $derived.by(() => computeBulkEditPlan(inScopeFiles, conditions, operations));

  // === open / close ===

  export function show(): void {
    hide();
    dialogRef.showModal();
    // showModal() inerts background interaction but not scrolling — lock the page scroll too.
    document.documentElement.style.overflow = 'hidden';
  }

  export function hide(): void {
    dialogRef?.close();
  }

  function onDialogClose(): void {
    document.documentElement.style.overflow = '';
  }

  // === conditions ===

  function defaultCondition(kind: Condition['kind']): Condition {
    if (kind === 'streamType') {
      return { uid: nextUid(), kind: 'streamType', streamType: 'video' };
    }
    return { uid: nextUid(), kind: 'tag', key: '', value: '' };
  }

  function addCondition(): void {
    conditions.push(defaultCondition('streamType'));
  }

  function removeCondition(uid: number): void {
    conditions = conditions.filter((condition) => condition.uid !== uid);
  }

  function changeConditionKind(index: number, kind: Condition['kind']): void {
    conditions[index] = { ...defaultCondition(kind), uid: conditions[index].uid };
  }

  // === operations ===

  function defaultOperation(kind: OperationKind): Operation {
    const uid = nextUid();
    switch (kind) {
      case 'tagWrite':
        return { uid, kind, key: '', value: '' };
      case 'tagDelete':
        return { uid, kind, key: '' };
      case 'dispositionSet':
        return { uid, kind, flag: dispositionFlags[0] ?? '', value: true };
      case 'dispositionUnsetAll':
        return { uid, kind };
      case 'streamReorder':
        return { uid, kind, position: 0 };
      case 'streamDelete':
        return { uid, kind };
    }
  }

  function addOperation(): void {
    operations.push(defaultOperation('tagWrite'));
  }

  function removeOperation(uid: number): void {
    operations = operations.filter((operation) => operation.uid !== uid);
  }

  function changeOperationKind(index: number, kind: OperationKind): void {
    operations[index] = { ...defaultOperation(kind), uid: operations[index].uid };
  }

  function moveOperationUp(index: number): void {
    if (index <= 0) {
      return;
    }
    [operations[index - 1], operations[index]] = [operations[index], operations[index - 1]];
  }

  function moveOperationDown(index: number): void {
    if (index >= operations.length - 1) {
      return;
    }
    [operations[index + 1], operations[index]] = [operations[index], operations[index + 1]];
  }

  // === footer actions ===

  function reset(): void {
    conditions = [];
    operations = [];
  }

  function handleApplyButton(): void {
    const currentFiles = files();
    // Recompute fresh against the current state, so what is applied is exactly what the preview shows.
    const freshPlan = computeBulkEditPlan(currentFiles, conditions, operations);

    if (!freshPlan.hasAnyChange) {
      alert('These operations would not change anything.');
      return;
    }

    if (!freshPlan.hasConditions) {
      const proceed = window.confirm(
        `No stream-selection conditions are set. This will apply the operations to ALL ` +
          `${freshPlan.totalStreamCount} stream(s) across ${freshPlan.matchedFileCount} file(s). Continue?`,
      );
      if (!proceed) {
        return;
      }
    }

    applyBulkEditPlan(currentFiles, freshPlan);
    hide();
  }

  // === helpers for the operation kind select (keeps template narrowing simple) ===

  function onOperationKindChange(index: number, value: string): void {
    changeOperationKind(index, value as OperationKind);
  }
</script>

<dialog
  bind:this={dialogRef}
  class="bulk-edit-dialog"
  aria-label="Bulk Edit Stream Tags"
  closedby="closerequest"
  onclose={onDialogClose}>
  <div class="bulk-edit-dialog-body">
    <header class="be-header">
      <h2>Bulk-Edit Stream Tags</h2>
      <p class="be-muted">Select streams across the files, define operations, preview the exact changes, then apply.</p>
    </header>

    <!-- ===== Stream Selection ===== -->
    <section class="be-section">
      <div class="be-section-head">
        <h3>Stream Selection</h3>
        <span class="be-muted">All conditions must match (AND)</span>
      </div>

      {#if conditions.length === 0}
        <div class="be-warning" role="status">
          <TablerIcon icon="alert-triangle" />
          No conditions added — this selects <strong>all</strong> streams across the files. You will be asked to confirm before applying.
        </div>
      {/if}

      {#each conditions as condition, index (condition.uid)}
        {#if index > 0}
          <div class="be-and">AND</div>
        {/if}
        <div class="be-row">
          <select
            class="be-input be-kind"
            value={condition.kind}
            onchange={(event) => changeConditionKind(index, event.currentTarget.value as Condition['kind'])}>
            <option value="streamType">Stream type</option>
            <option value="tag">Tag key + value</option>
          </select>

          {#if condition.kind === 'streamType'}
            <select class="be-input" bind:value={condition.streamType}>
              {#each STREAM_TYPES as streamType}
                <option value={streamType}>{streamType}</option>
              {/each}
            </select>
          {:else}
            <input class="be-input" placeholder="key (e.g. language)" bind:value={condition.key} />
            <span class="be-eq">=</span>
            <input class="be-input" placeholder="value (e.g. jpn)" bind:value={condition.value} />
            <span class="be-muted be-hint">case-insensitive</span>
          {/if}

          <button type="button" class="be-icon-btn be-danger" title="Remove condition" onclick={() => removeCondition(condition.uid)}>
            <TablerIcon icon="trash" />
          </button>
        </div>
      {/each}

      <button type="button" class="be-add-btn" onclick={addCondition}>
        <TablerIcon icon="plus" /> Add condition
      </button>

      <p class="be-summary" title={describeMatchedStreams(plan.matchedStreams)}>
        Selected <strong>{plan.totalStreamCount}</strong> stream(s) across <strong>{plan.matchedFileCount}</strong> file(s)
        {#if plan.oneStreamPerFile}<span class="be-muted">— one stream per file</span>{/if}
      </p>
    </section>

    <!-- ===== Operations ===== -->
    <section class="be-section">
      <div class="be-section-head">
        <h3>Operations</h3>
        <span class="be-muted">Applied top to bottom</span>
      </div>

      {#each operations as operation, index (operation.uid)}
        <div class="be-row">
          <div class="be-reorder">
            <button type="button" class="be-icon-btn" title="Move up" disabled={index === 0} onclick={() => moveOperationUp(index)}>
              <TablerIcon icon="sort-ascending-2" />
            </button>
            <button type="button" class="be-icon-btn" title="Move down" disabled={index === operations.length - 1} onclick={() => moveOperationDown(index)}>
              <TablerIcon icon="sort-descending-2" />
            </button>
          </div>

          <select
            class="be-input be-kind"
            value={operation.kind}
            onchange={(event) => onOperationKindChange(index, event.currentTarget.value)}>
            {#each OPERATION_KINDS as operationKind}
              <option value={operationKind.kind}>{operationKind.label}</option>
            {/each}
          </select>

          {#if operation.kind === 'tagWrite'}
            <input class="be-input" placeholder="key" bind:value={operation.key} />
            <span class="be-eq">=</span>
            <input class="be-input" placeholder="value" bind:value={operation.value} />
            <span class="be-muted be-hint">case-insensitive</span>
          {:else if operation.kind === 'tagDelete'}
            <input class="be-input" placeholder="key" bind:value={operation.key} />
            <span class="be-muted be-hint">case-insensitive</span>
          {:else if operation.kind === 'dispositionSet'}
            <select class="be-input" bind:value={operation.flag}>
              {#each dispositionFlags as flag}
                <option value={flag}>{flag}</option>
              {/each}
            </select>
            <select class="be-input" value={operation.value ? 'on' : 'off'} onchange={(event) => (operation.value = event.currentTarget.value === 'on')}>
              <option value="on">on</option>
              <option value="off">off</option>
            </select>
          {:else if operation.kind === 'streamReorder'}
            <span class="be-muted">to position</span>
            <input class="be-input be-num" type="number" min="0" bind:value={operation.position} />
            <span class="be-muted be-hint">0-based</span>
          {/if}

          <button type="button" class="be-icon-btn be-danger" title="Remove operation" onclick={() => removeOperation(operation.uid)}>
            <TablerIcon icon="trash" />
          </button>
        </div>
      {/each}

      <button type="button" class="be-add-btn" onclick={addOperation}>
        <TablerIcon icon="plus" /> Add operation
      </button>
    </section>

    <!-- ===== Preview ===== -->
    <section class="be-section">
      <div class="be-section-head">
        <h3>Preview</h3>
        <span class="be-muted">The exact changes that will be applied (dry-run)</span>
      </div>

      {#if !plan.hasAnyChange}
        <p class="be-muted be-empty">No changes.</p>
      {:else}
        <ul class="be-preview">
          {#each plan.streamChanges as change (change.fileIdentifier + ':' + change.streamIdentifier)}
            <li class="be-preview-stream">
              <div class="be-preview-stream-head">
                #{change.streamIdentifier} ({change.streamType})
                <span class="be-muted">in {change.fileDisplayName}</span>
              </div>
              <ul class="be-preview-changes">
                {#if change.willBeDeleted}
                  <li class="be-del"><TablerIcon icon="trash" /> Delete stream</li>
                {:else}
                  {#each change.tagDeletes as tagDelete}
                    <li class="be-del">
                      <TablerIcon icon="minus" /> Delete tag <code>{tagDelete.key}</code>
                      {#if tagDelete.previousValue != null}<span class="be-muted">(was “{tagDelete.previousValue}”)</span>{/if}
                    </li>
                  {/each}
                  {#each change.tagWrites as tagWrite}
                    <li class="be-add-change">
                      <TablerIcon icon="pencil" /> Set tag <code>{tagWrite.key}</code> = “{tagWrite.value}”
                      {#if tagWrite.previousValue != null}<span class="be-muted">(was “{tagWrite.previousValue}”)</span>{/if}
                    </li>
                  {/each}
                  {#each change.dispositionChanges as dispositionChange}
                    <li>
                      <TablerIcon icon="flag" /> Disposition <code>{dispositionChange.flag}</code>:
                      {dispositionChange.from ? 'on' : 'off'} → <strong>{dispositionChange.to ? 'on' : 'off'}</strong>
                    </li>
                  {/each}
                {/if}
              </ul>
            </li>
          {/each}

          {#each plan.fileReorders as reorder (reorder.fileIdentifier)}
            <li class="be-preview-stream">
              <div class="be-preview-stream-head">
                <TablerIcon icon="arrows-sort" /> Reorder streams
                <span class="be-muted">in {reorder.fileDisplayName}</span>
              </div>
              <ul class="be-preview-changes">
                <li class="be-muted">New order: {reorder.orderedStreamIdentifiers.map((id) => `#${id}`).join(', ')}</li>
              </ul>
            </li>
          {/each}
        </ul>
      {/if}
    </section>
  </div>

  <footer class="bulk-edit-footer">
    <button type="button" class="btn-secondary be-footer-left" onclick={reset}>Reset</button>
    <button type="button" class="btn-primary" onclick={handleApplyButton}>
      {m.common_btn_label_apply()}
    </button>
    <button type="button" class="btn-secondary" onclick={() => hide()}>{m.common_btn_label_cancel()}</button>
  </footer>
</dialog>

<style>
  .bulk-edit-dialog {
    --be-bg:          #14161d;
    --be-surface:     #181b23;
    --be-surface-2:   #1f2330;
    --be-border:      #2b2f3a;
    --be-text:        #eef0f6;
    --be-text-muted:  #8b90a0;
    --be-accent:      #5b8cff;
    --be-danger:      #ff6b6b;
    --be-warning-bg:  #3a2f12;
    --be-warning-fg:  #ffd479;
  }

  .bulk-edit-dialog:open {
    box-sizing:         border-box;
    display:            grid;
    grid-template-rows: minmax(0, 1fr) auto;
    width:              min(60rem, 94vw);
    height:             min(46rem, 90vh);
    padding:            0;
    border:             none;
    border-radius:      0.85rem;
    background-color:   var(--be-bg);
    color:              var(--be-text);
    overflow:           clip;
    box-shadow:         0 1.5rem 4rem rgb(0 0 0 / 0.55);
    font-family:        system-ui, sans-serif;
  }

  .bulk-edit-dialog::backdrop {
    background-color: rgb(0 0 0 / 0.55);
    backdrop-filter:  blur(2px);
  }

  .bulk-edit-dialog-body {
    overflow-y: auto;
    padding:    1.25rem 1.5rem;
    min-height: 0;
  }

  .be-header h2 {
    margin:      0;
    font-size:   1.4rem;
  }

  .be-muted {
    color:     var(--be-text-muted);
    font-size: 0.85rem;
  }

  .be-section {
    margin-top:    1.5rem;
    padding-top:   1rem;
    border-top:    1px solid var(--be-border);
  }

  .be-section-head {
    display:     flex;
    align-items: baseline;
    gap:         0.75rem;
    margin-bottom: 0.75rem;
  }

  .be-section-head h3 {
    margin:    0;
    font-size: 1.1rem;
  }

  .be-row {
    display:     flex;
    align-items: center;
    flex-wrap:   wrap;
    gap:         0.4rem;
    margin:      0.35rem 0;
  }

  .be-and {
    font-size:   0.75rem;
    font-weight: 700;
    color:       var(--be-text-muted);
    letter-spacing: 0.08em;
    margin:      0.15rem 0 0.15rem 0.25rem;
  }

  .be-eq {
    color: var(--be-text-muted);
  }

  .be-hint {
    font-style: italic;
  }

  .be-input {
    padding:          0.4rem 0.55rem;
    border:           1px solid var(--be-border);
    border-radius:    0.45rem;
    background-color: var(--be-surface-2);
    color:            inherit;
    font:             inherit;
  }

  .be-input:focus-visible {
    outline:        2px solid var(--be-accent);
    outline-offset: 1px;
  }

  .be-kind {
    min-width: 12rem;
  }

  .be-num {
    width: 6rem;
  }

  .be-reorder {
    display: flex;
    gap:     0.2rem;
  }

  .be-icon-btn {
    display:          inline-flex;
    align-items:      center;
    justify-content:  center;
    padding:          0.35rem;
    border:           1px solid var(--be-border);
    border-radius:    0.45rem;
    background-color: var(--be-surface-2);
    color:            inherit;
    cursor:           pointer;
  }

  .be-icon-btn:hover:not(:disabled) {
    background-color: var(--be-border);
  }

  .be-icon-btn:disabled {
    opacity: 0.4;
    cursor:  not-allowed;
  }

  .be-icon-btn.be-danger {
    color: var(--be-danger);
  }

  .be-add-btn {
    display:          inline-flex;
    align-items:      center;
    gap:              0.3rem;
    margin-top:       0.5rem;
    padding:          0.4rem 0.75rem;
    border:           1px dashed var(--be-border);
    border-radius:    0.45rem;
    background-color: transparent;
    color:            var(--be-text);
    cursor:           pointer;
  }

  .be-add-btn:hover {
    background-color: var(--be-surface-2);
  }

  .be-warning {
    display:          flex;
    align-items:      center;
    gap:              0.5rem;
    padding:          0.6rem 0.8rem;
    margin-bottom:    0.6rem;
    border-radius:    0.45rem;
    background-color: var(--be-warning-bg);
    color:            var(--be-warning-fg);
    font-size:        0.9rem;
  }

  .be-summary {
    margin-top: 0.8rem;
    font-size:  0.95rem;
  }

  .be-empty {
    font-style: italic;
  }

  .be-preview {
    list-style: none;
    margin:     0;
    padding:    0;
    display:    flex;
    flex-direction: column;
    gap:        0.6rem;
  }

  .be-preview-stream {
    padding:          0.5rem 0.7rem;
    border:           1px solid var(--be-border);
    border-radius:    0.5rem;
    background-color: var(--be-surface);
  }

  .be-preview-stream-head {
    font-weight:   600;
    margin-bottom: 0.3rem;
  }

  .be-preview-changes {
    list-style: none;
    margin:     0;
    padding-left: 0.5rem;
    display:    flex;
    flex-direction: column;
    gap:        0.2rem;
    font-size:  0.9rem;
  }

  .be-preview-changes code {
    background-color: var(--be-surface-2);
    padding:          0.05rem 0.3rem;
    border-radius:    0.3rem;
  }

  .be-del {
    color: var(--be-danger);
  }

  .be-add-change {
    color: var(--be-accent);
  }

  .bulk-edit-footer {
    display:          flex;
    justify-content:  flex-end;
    gap:              0.5rem;
    padding:          0.75rem 1rem;
    border-top:       1px solid var(--be-border);
    background-color: var(--be-surface);
  }

  .be-footer-left {
    margin-right: auto;
  }

  .btn-secondary,
  .btn-primary {
    padding:       0.5rem 1.15rem;
    border-radius: 0.5rem;
    font:          inherit;
    font-weight:   500;
    cursor:        pointer;
  }

  .btn-secondary {
    border:           1px solid var(--be-border);
    background-color: transparent;
    color:            var(--be-text);
  }

  .btn-secondary:hover {
    background-color: var(--be-surface-2);
  }

  .btn-primary {
    border:           1px solid var(--be-accent);
    background-color: var(--be-accent);
    color:            #0b1020;
  }

  .btn-primary:hover {
    filter: brightness(1.08);
  }

  .btn-secondary:focus-visible,
  .btn-primary:focus-visible {
    outline:        2px solid var(--be-accent);
    outline-offset: 2px;
  }
</style>
