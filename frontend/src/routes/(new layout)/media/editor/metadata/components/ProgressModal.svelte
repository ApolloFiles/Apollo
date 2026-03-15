<script lang="ts">
  import TablerIcon from '$lib/components/TablerIcon.svelte';

  let { title, bodyText }: { title: string, bodyText: string } = $props();

  let dialogElementRef: HTMLDialogElement;

  export function show(): void {
    hide();
    dialogElementRef.showModal();
  }

  export function hide(): void {
    dialogElementRef?.close();
  }
</script>

<dialog bind:this={dialogElementRef} closedby="none">
  <h2 class="progress-modal-title"><TablerIcon icon="loader-2" spin={true} />&nbsp;{title}</h2>
  <p class="progress-modal-message">{bodyText}</p>
</dialog>

<style>
  ::backdrop {
    background-color: black;
    opacity:          0.4;
  }
</style>
