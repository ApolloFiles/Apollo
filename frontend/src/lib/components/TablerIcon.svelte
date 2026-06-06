<script lang="ts">
  import type { HTMLAttributes } from 'svelte/elements';
  import IconAlertTriangle from 'virtual:icons/tabler/alert-triangle';
  import IconArrowLeft from 'virtual:icons/tabler/arrow-left';
  import IconArrowRight from 'virtual:icons/tabler/arrow-right';
  import IconArrowsDiagonalMinimize from 'virtual:icons/tabler/arrows-diagonal-minimize';
  import IconArrowsSort from 'virtual:icons/tabler/arrows-sort';
  import IconBan from 'virtual:icons/tabler/ban';
  import IconBug from 'virtual:icons/tabler/bug';
  import IconCheck from 'virtual:icons/tabler/check';
  import IconChevronDown from 'virtual:icons/tabler/chevron-down';
  import IconChevronRight from 'virtual:icons/tabler/chevron-right';
  import IconChevronUp from 'virtual:icons/tabler/chevron-up';
  import IconCircleCaretRight from 'virtual:icons/tabler/circle-caret-right';
  import IconCurrentLocation from 'virtual:icons/tabler/current-location';
  import IconDeviceDesktop from 'virtual:icons/tabler/device-desktop';
  import IconDeviceFloppy from 'virtual:icons/tabler/device-floppy';
  import IconEdit from 'virtual:icons/tabler/edit';
  import IconEraser from 'virtual:icons/tabler/eraser';
  import IconFile from 'virtual:icons/tabler/file';
  import IconFlag from 'virtual:icons/tabler/flag';
  import IconFolderFilled from 'virtual:icons/tabler/folder-filled';
  import IconFolderOpen from 'virtual:icons/tabler/folder-open';
  import IconHeadphones from 'virtual:icons/tabler/headphones';
  import IconInfoCircle from 'virtual:icons/tabler/info-circle';
  import IconLink from 'virtual:icons/tabler/link';
  import IconLinkOff from 'virtual:icons/tabler/link-off';
  import IconLoader2 from 'virtual:icons/tabler/loader-2';
  import IconLogout from 'virtual:icons/tabler/logout';
  import IconMenu2 from 'virtual:icons/tabler/menu-2';
  import IconMinus from 'virtual:icons/tabler/minus';
  import IconPencil from 'virtual:icons/tabler/pencil';
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
  import IconSortAscendingNumbers from 'virtual:icons/tabler/sort-ascending-numbers';
  import IconSortDescending2 from 'virtual:icons/tabler/sort-descending-2';
  import IconSortDescendingLetters from 'virtual:icons/tabler/sort-descending-letters';
  import IconSortDescendingNumbers from 'virtual:icons/tabler/sort-descending-numbers';
  import IconStopwatch from 'virtual:icons/tabler/stopwatch';
  import IconSubtitles from 'virtual:icons/tabler/subtitles';
  import IconTrash from 'virtual:icons/tabler/trash';
  import IconUser from 'virtual:icons/tabler/user-filled';
  import IconUserPlus from 'virtual:icons/tabler/user-plus';
  import IconUsers from 'virtual:icons/tabler/users';
  import IconVideo from 'virtual:icons/tabler/video';
  import IconX from 'virtual:icons/tabler/x';

  export type TablerIconId =
    | 'alert-triangle'
    | 'arrow-left'
    | 'arrow-right'
    | 'arrows-diagonal-minimize'
    | 'arrows-sort'
    | 'ban'
    | 'bug'
    | 'check'
    | 'chevron-down'
    | 'chevron-right'
    | 'chevron-up'
    | 'circle-caret-right'
    | 'current-location'
    | 'device-desktop'
    | 'device-floppy'
    | 'edit'
    | 'eraser'
    | 'file'
    | 'flag'
    | 'folder-filled'
    | 'folder-open'
    | 'headphones'
    | 'info-circle'
    | 'link'
    | 'link-off'
    | 'loader-2'
    | 'logout'
    | 'menu-2'
    | 'minus'
    | 'pencil'
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
    | 'sort-ascending-numbers'
    | 'sort-descending-2'
    | 'sort-descending-letters'
    | 'sort-descending-numbers'
    | 'stopwatch'
    | 'subtitles'
    | 'trash'
    | 'user-filled'
    | 'users'
    | 'user-plus'
    | 'video'
    | 'x'
    ;

  let props: {
    icon: TablerIconId,
    spin?: boolean,
    class?: HTMLAttributes<HTMLElement>['class'],
  } = $props();

  const IconComponent = $derived.by(() => {
    switch (props.icon) {
      case 'alert-triangle':
        return IconAlertTriangle;
      case 'arrow-left':
        return IconArrowLeft;
      case 'arrow-right':
        return IconArrowRight;
      case 'arrows-diagonal-minimize':
        return IconArrowsDiagonalMinimize;
      case 'arrows-sort':
        return IconArrowsSort;
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
      case 'current-location':
        return IconCurrentLocation;
      case 'device-desktop':
        return IconDeviceDesktop;
      case 'device-floppy':
        return IconDeviceFloppy;
      case 'edit':
        return IconEdit;
      case 'eraser':
        return IconEraser;
      case 'file':
        return IconFile;
      case 'flag':
        return IconFlag;
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
      case 'minus':
        return IconMinus;
      case 'pencil':
        return IconPencil;
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
      case 'sort-ascending-numbers':
        return IconSortAscendingNumbers;
      case 'sort-descending-2':
        return IconSortDescending2;
      case 'sort-descending-letters':
        return IconSortDescendingLetters;
      case 'sort-descending-numbers':
        return IconSortDescendingNumbers;
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
      case 'x':
        return IconX;

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
