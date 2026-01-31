<script lang="ts">
  import type { HTMLAttributes } from 'svelte/elements';
  import IconArrowLeft from 'virtual:icons/tabler/arrow-left';
  import IconBan from 'virtual:icons/tabler/ban';
  import IconBug from 'virtual:icons/tabler/bug';
  import IconCheck from 'virtual:icons/tabler/check';
  import IconChevronDown from 'virtual:icons/tabler/chevron-down';
  import IconChevronRight from 'virtual:icons/tabler/chevron-right';
  import IconCircleCaretRight from 'virtual:icons/tabler/circle-caret-right';
  import IconDeviceDesktop from 'virtual:icons/tabler/device-desktop';
  import IconEdit from 'virtual:icons/tabler/edit';
  import IconFolderFilled from 'virtual:icons/tabler/folder-filled';
  import IconLink from 'virtual:icons/tabler/link';
  import IconLinkOff from 'virtual:icons/tabler/link-off';
  import IconLoader2 from 'virtual:icons/tabler/loader-2';
  import IconLogout from 'virtual:icons/tabler/logout';
  import IconMenu2 from 'virtual:icons/tabler/menu-2';
  import IconPlus from 'virtual:icons/tabler/plus';
  import IconRefresh from 'virtual:icons/tabler/refresh';
  import IconSettings from 'virtual:icons/tabler/settings';
  import IconShieldCheckFilled from 'virtual:icons/tabler/shield-check-filled';
  import IconShieldLock from 'virtual:icons/tabler/shield-lock';
  import IconSortAscendingLetters from 'virtual:icons/tabler/sort-ascending-letters';
  import IconStopwatch from 'virtual:icons/tabler/stopwatch';
  import IconTrash from 'virtual:icons/tabler/trash';
  import IconUser from 'virtual:icons/tabler/user-filled';
  import IconUserPlus from 'virtual:icons/tabler/user-plus';
  import IconUsers from 'virtual:icons/tabler/users';

  export type TablerIconId =
    | 'arrow-left'
    | 'ban'
    | 'bug'
    | 'check'
    | 'chevron-down'
    | 'chevron-right'
    | 'circle-caret-right'
    | 'device-desktop'
    | 'edit'
    | 'folder-filled'
    | 'link'
    | 'link-off'
    | 'loader-2'
    | 'logout'
    | 'menu-2'
    | 'plus'
    | 'refresh'
    | 'settings'
    | 'shield-check-filled'
    | 'shield-lock'
    | 'sort-ascending-letters'
    | 'stopwatch'
    | 'trash'
    | 'user-filled'
    | 'users'
    | 'user-plus'
    ;

  let props: {
    icon: TablerIconId,
    spin?: boolean,
    class?: HTMLAttributes<HTMLElement>['class'],
  } = $props();

  const IconComponent = $derived.by(() => {
    switch (props.icon) {
      case 'arrow-left':
        return IconArrowLeft;
      case 'ban':
        return IconBan;
      case 'bug':
        return IconBug;
      case 'check':
        return IconCheck;
      case 'chevron-down':
        return IconChevronDown;
      case 'chevron-right':
        return IconChevronRight;
      case 'circle-caret-right':
        return IconCircleCaretRight;
      case 'device-desktop':
        return IconDeviceDesktop;
      case 'edit':
        return IconEdit;
      case 'folder-filled':
        return IconFolderFilled;
      case 'link':
        return IconLink;
      case 'link-off':
        return IconLinkOff;
      case 'loader-2':
        return IconLoader2;
      case 'logout':
        return IconLogout;
      case 'menu-2':
        return IconMenu2;
      case 'plus':
        return IconPlus;
      case 'refresh':
        return IconRefresh;
      case 'settings':
        return IconSettings;
      case 'shield-check-filled':
        return IconShieldCheckFilled;
      case 'shield-lock':
        return IconShieldLock;
      case 'sort-ascending-letters':
        return IconSortAscendingLetters;
      case 'stopwatch':
        return IconStopwatch;
      case 'trash':
        return IconTrash;
      case 'user-filled':
        return IconUser;
      case 'users':
        return IconUsers;
      case 'user-plus':
        return IconUserPlus;

      default:
        console.warn(`No icon found for id: ${props.icon}`);
        return null;
    }
  });

  const iconComponentClasses = $derived.by(() => {
    let classes: HTMLAttributes<HTMLElement>['class'] = 'tabler-icon';
    if (props.spin) {
      classes += ' tabler-icon-spinner';
    }
    if (props.class) {
      classes += ` ${props.class}`;
    }
    return classes;
  });
</script>

{#if IconComponent}
  <IconComponent class={iconComponentClasses} role="presentation" />
{/if}

<!--suppress CssUnusedSymbol -->
<style>
  :global {
    .tabler-icon {
      vertical-align: text-top;
    }

    .tabler-icon-spinner {
      animation: tabler-icon-spin 1s linear infinite;
    }

    @keyframes tabler-icon-spin {
      from {
        transform: rotate(0deg);
      }
      to {
        transform: rotate(360deg);
      }
    }
  }
</style>
