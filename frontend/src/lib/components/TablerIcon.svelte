<script lang="ts">
  import type { HTMLAttributes } from 'svelte/elements';
  import IconCheck from 'virtual:icons/tabler/check';
  import IconChevronDown from 'virtual:icons/tabler/chevron-down';
  import IconCircleCaretRight from 'virtual:icons/tabler/circle-caret-right';
  import IconDeviceDesktop from 'virtual:icons/tabler/device-desktop';
  import IconEdit from 'virtual:icons/tabler/edit';
  import IconFolderFilled from 'virtual:icons/tabler/folder-filled';
  import IconLink from 'virtual:icons/tabler/link';
  import IconLinkOff from 'virtual:icons/tabler/link-off';
  import IconLoader2 from 'virtual:icons/tabler/loader-2';
  import IconLogout from 'virtual:icons/tabler/logout';
  import IconMenu from 'virtual:icons/tabler/menu-2';
  import IconSettings from 'virtual:icons/tabler/settings';
  import IconShieldLock from 'virtual:icons/tabler/shield-lock';
  import IconTrash from 'virtual:icons/tabler/trash';
  import IconUser from 'virtual:icons/tabler/user-filled';

  export type TablerIconId = 'check'
                             | 'chevron-down'
                             | 'circle-caret-right'
                             | 'device-desktop'
                             | 'edit'
                             | 'folder-filled'
                             | 'link'
                             | 'link-off'
                             | 'loader-2'
                             | 'logout'
                             | 'menu-2'
                             | 'settings'
                             | 'shield-lock'
                             | 'trash'
                             | 'user-filled'
    ;

  let props: {
    icon: TablerIconId,
    spin?: boolean,
    class?: HTMLAttributes<HTMLElement>['class'],
  } = $props();

  const IconComponent = $derived.by(() => {
    switch (props.icon) {
      case 'check':
        return IconCheck;
      case 'chevron-down':
        return IconChevronDown;
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
        return IconMenu;
      case 'settings':
        return IconSettings;
      case 'shield-lock':
        return IconShieldLock;
      case 'trash':
        return IconTrash;
      case 'user-filled':
        return IconUser;

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
  <IconComponent
    class={iconComponentClasses}
    role="presentation"
  />
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
