<script lang="ts">
  import type { Component } from 'svelte';
  import IconApple from 'virtual:icons/logos/apple';
  import IconBluesky from 'virtual:icons/logos/bluesky';
  import IconDiscord from 'virtual:icons/logos/discord-icon';
  import IconFacebook from 'virtual:icons/logos/facebook';
  import IconGitHub from 'virtual:icons/logos/github-icon';
  import IconGitLab from 'virtual:icons/logos/gitlab';
  import IconGoogle from 'virtual:icons/logos/google-icon';
  import IconMastodon from 'virtual:icons/logos/mastodon-icon';
  import IconMicrosoft from 'virtual:icons/logos/microsoft-icon';
  import IconReddit from 'virtual:icons/logos/reddit-icon';
  import IconTelegram from 'virtual:icons/logos/telegram';
  import IconExTwitter from 'virtual:icons/logos/x';

  let { identifier }: { identifier: string } = $props();

  const assetThirdPartyLoginLogos: Record<string, any> = import.meta.glob('$lib/assets/login/third-party/*.svg', {
    eager: true,
    query: { enhanced: true },
  });

  const AuthProviderIconComponent: Component | null = $derived(determineIconComponent(identifier));
  const svgFallbackIcon = $derived(assetThirdPartyLoginLogos[`/src/lib/assets/login/third-party/${identifier}.svg`]?.default);

  function determineIconComponent(providerId: string): Component | null {
    switch (providerId.toLowerCase()) {
      case 'google':
        return IconGoogle;
      case 'microsoft':
        return IconMicrosoft;
      case 'github':
        return IconGitHub;
      case 'gitlab':
        return IconGitLab;
      case 'discord':
        return IconDiscord;
      case 'apple':
        return IconApple;
      case 'bluesky':
        return IconBluesky;
      case 'mastodon':
        return IconMastodon;
      case 'telegram':
        return IconTelegram;
      case 'reddit':
        return IconReddit;
      case 'twitter':
      case 'x':
        return IconExTwitter;
      case 'facebook':
        return IconFacebook;
      default:
        return null;
    }
  }
</script>

{#if AuthProviderIconComponent}
  <div class="icon-wrapper">
    <AuthProviderIconComponent role="presentation" />
  </div>
{:else if svgFallbackIcon}
  <img
    src={svgFallbackIcon}
    alt=""
    class="auth-provider-img"
    role="presentation"
  >
{/if}

<style>
  .icon-wrapper {
    border-radius:    6px;
    display:          inline-flex;
    padding:          4px;
    align-items:      center;
    justify-content:  center;
    font-size:        1.5rem;
    background-color: white;
    aspect-ratio:     1 / 1;
    vertical-align:   top;
  }

  .icon-wrapper:first-child {
    width: 2.3rem;
  }

  .auth-provider-img {
    vertical-align: middle;
    height:         2em;
    width:          auto;
  }
</style>
