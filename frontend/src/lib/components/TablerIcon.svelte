<script lang="ts">
  import type { HTMLAttributes } from 'svelte/elements';
  import IconArrowLeft from 'virtual:icons/tabler/arrow-left';
  import IconArrowRight from 'virtual:icons/tabler/arrow-right';
  import IconBan from 'virtual:icons/tabler/ban';
  import IconBug from 'virtual:icons/tabler/bug';
  import IconCheck from 'virtual:icons/tabler/check';
  import IconChevronDown from 'virtual:icons/tabler/chevron-down';
  import IconChevronRight from 'virtual:icons/tabler/chevron-right';
  import IconChevronUp from 'virtual:icons/tabler/chevron-up';
  import IconCircleCaretRight from 'virtual:icons/tabler/circle-caret-right';
  import IconDeviceDesktop from 'virtual:icons/tabler/device-desktop';
  import IconDeviceFloppy from 'virtual:icons/tabler/device-floppy';
  import IconEdit from 'virtual:icons/tabler/edit';
  import IconEraser from 'virtual:icons/tabler/eraser';
  import IconFolderFilled from 'virtual:icons/tabler/folder-filled';
  import IconFolderOpen from 'virtual:icons/tabler/folder-open';
  import IconHeadphones from 'virtual:icons/tabler/headphones';
  import IconInfoCircle from 'virtual:icons/tabler/info-circle';
  import IconLink from 'virtual:icons/tabler/link';
  import IconLinkOff from 'virtual:icons/tabler/link-off';
  import IconLoader2 from 'virtual:icons/tabler/loader-2';
  import IconLogout from 'virtual:icons/tabler/logout';
  import IconMenu2 from 'virtual:icons/tabler/menu-2';
  import IconPlayerPlayFilled from 'virtual:icons/tabler/player-play-filled';
  import IconPlus from 'virtual:icons/tabler/plus';
  import IconRefresh from 'virtual:icons/tabler/refresh';
  import IconRotate from 'virtual:icons/tabler/rotate';
  import IconSearch from 'virtual:icons/tabler/search';
  import IconSelectAll from 'virtual:icons/tabler/select-all';
  import IconSettings from 'virtual:icons/tabler/settings';
  import IconShieldCheckFilled from 'virtual:icons/tabler/shield-check-filled';
  import IconShieldLock from 'virtual:icons/tabler/shield-lock';
  import IconSortAscending2 from 'virtual:icons/tabler/sort-ascending-2';
  import IconSortAscendingLetters from 'virtual:icons/tabler/sort-ascending-letters';
  import IconSortDescending2 from 'virtual:icons/tabler/sort-descending-2';
  import IconStopwatch from 'virtual:icons/tabler/stopwatch';
  import IconSubtitles from 'virtual:icons/tabler/subtitles';
  import IconTrash from 'virtual:icons/tabler/trash';
  import IconUser from 'virtual:icons/tabler/user-filled';
  import IconUserPlus from 'virtual:icons/tabler/user-plus';
  import IconUsers from 'virtual:icons/tabler/users';
  import IconVideo from 'virtual:icons/tabler/video';

  export type TablerIconId =
    | 'arrow-left'
    | 'arrow-right'
    | 'ban'
    | 'bug'
    | 'check'
    | 'chevron-down'
    | 'chevron-right'
    | 'chevron-up'
    | 'circle-caret-right'
    | 'device-desktop'
    | 'device-floppy'
    | 'edit'
    | 'eraser'
    | 'folder-filled'
    | 'folder-open'
    | 'headphones'
    | 'info-circle'
    | 'link'
    | 'link-off'
    | 'loader-2'
    | 'logout'
    | 'menu-2'
    | 'player-play-filled'
    | 'plus'
    | 'refresh'
    | 'rotate'
    | 'search'
    | 'select-all'
    | 'settings'
    | 'shield-check-filled'
    | 'shield-lock'
    | 'sort-ascending-2'
    | 'sort-ascending-letters'
    | 'sort-descending-2'
    | 'stopwatch'
    | 'subtitles'
    | 'trash'
    | 'user-filled'
    | 'users'
    | 'user-plus'
    | 'video'
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
      case 'arrow-right':
        return IconArrowRight;
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
      case 'chevron-up':
        return IconChevronUp;
      case 'circle-caret-right':
        return IconCircleCaretRight;
      case 'device-desktop':
        return IconDeviceDesktop;
      case 'device-floppy':
        return IconDeviceFloppy;
      case 'edit':
        return IconEdit;
      case 'eraser':
        return IconEraser;
      case 'folder-filled':
        return IconFolderFilled;
      case 'folder-open':
        return IconFolderOpen;
      case 'headphones':
        return IconHeadphones;
      case 'info-circle':
        return IconInfoCircle;
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
      case 'player-play-filled':
        return IconPlayerPlayFilled;
      case 'plus':
        return IconPlus;
      case 'refresh':
        return IconRefresh;
      case 'rotate':
        return IconRotate;
      case 'search':
        return IconSearch;
      case 'select-all':
        return IconSelectAll;
      case 'settings':
        return IconSettings;
      case 'shield-check-filled':
        return IconShieldCheckFilled;
      case 'shield-lock':
        return IconShieldLock;
      case 'sort-ascending-2':
        return IconSortAscending2;
      case 'sort-ascending-letters':
        return IconSortAscendingLetters;
      case 'sort-descending-2':
        return IconSortDescending2;
      case 'stopwatch':
        return IconStopwatch;
      case 'subtitles':
        return IconSubtitles;
      case 'trash':
        return IconTrash;
      case 'user-filled':
        return IconUser;
      case 'users':
        return IconUsers;
      case 'user-plus':
        return IconUserPlus;
      case 'video':
        return IconVideo;

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
