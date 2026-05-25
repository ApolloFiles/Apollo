<script lang="ts">
  import TablerIcon from '$lib/components/TablerIcon.svelte';
  import type { SideBarMenuItemGroup } from './AppSideBar.svelte';

  let {
    group,
    activeMenuItemHref,
    onNavigate,
  }: {
    group: SideBarMenuItemGroup,
    activeMenuItemHref: string | null,
    onNavigate: () => void,
  } = $props();

  const containsActive = $derived(group.items.some(i => i.href === activeMenuItemHref));

  // svelte-ignore state_referenced_locally
  let open = $state(containsActive);

  $effect(() => {
    if (containsActive) {
      open = true;
    }
  });
</script>

<button
  type="button"
  class="nav-link group-toggle"
  class:open
  aria-expanded={open}
  onclick={() => open = !open}
>
  <TablerIcon icon={open ? 'chevron-down' : 'chevron-right'} class="me-2" />
  {group.label}
</button>

{#if open}
  <div class="group-items">
    {#each group.items as item}
      <a
        href={item.href}
        class="nav-link"
        class:active={item.href === activeMenuItemHref}
        onclick={onNavigate}
      >
        <TablerIcon icon={item.icon} class="me-2" />
        {item.label}
      </a>
    {/each}
  </div>
{/if}

<style>
  .nav-link {
    color:           var(--text-secondary);
    padding:         10px 15px;
    border-radius:   8px;
    margin-bottom:   5px;
    transition:      all 0.2s ease;
    text-decoration: none;
    display:         flex;
    align-items:     center;
  }

  .nav-link:hover,
  .nav-link.active {
    color:            var(--text-primary);
    background-color: var(--hover-bg);
  }

  .group-toggle {
    width:      100%;
    text-align: left;
    background: transparent;
    border:     none;
    cursor:     pointer;
    font:       inherit;
  }

  .group-items {
    display:        flex;
    flex-direction: column;
    padding-left:   12px;
  }
</style>
