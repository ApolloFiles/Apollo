<script lang="ts">
  const {children} = $props();
</script>

<!-- TODO: Pfeile links und rechts? Scrollbar via Drag? "Pagination"-Indikator darunter? -->
<div class="scrollbar-container">
  {@render children()}
</div>

<style>
  .scrollbar-container {
    display:    flex;
    overflow-x: auto;
    gap:        1.5rem;
  }
</style>
