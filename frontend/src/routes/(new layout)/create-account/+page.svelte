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
  import type { PageProps } from './$types';

  const assetThirdPartyLoginLogos: Record<string, any> = import.meta.glob('$lib/assets/login/third-party/*.svg', {
    eager: true,
    query: { enhanced: true },
  });

  let { data }: PageProps = $props();

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

  // FIXME: This page shares a lot with the /login page
</script>

<svelte:head>
  <title>Create Account</title>
</svelte:head>

<div class="container">
  <div class="text-center">
    <img src="/logo.svg" alt="Apollo-Logo" width="764" height="764" style="height: 6rem; width: auto">
    <h1>Create an Apollo account</h1>

    <p>You have been invited to this Apollo instance!</p>
  </div>

  <div class="third-party-login-container">
      <h2 class="h6 text-muted">Create account using</h2>

      <div class="d-flex flex-wrap">
        {#each data.availableLoginProviders as provider}
          <a
            class="btn btn-outline-secondary p-2 text-white"
            href="/api/_auth/sign-up/{provider}?token={data.inviteToken}"
          >
            {#if determineIconComponent(provider)}
              {@const
                IconComponent = determineIconComponent(provider)}
              <IconComponent class="icon" style="font-size: 1.5rem" role="presentation"></IconComponent>
            {:else}
              {@const
                customSvg = assetThirdPartyLoginLogos[`/src/lib/assets/login/third-party/${provider}.svg`]}
              {#if customSvg}
                <img
                  src={customSvg.default}
                  class="third-party-img"
                  alt=""
                >
              {/if}
            {/if}
            {provider.charAt(0).toUpperCase()}{provider.substring(1)}
          </a>
        {/each}
      </div>
    </div>
</div>

<style>
  .third-party-login-container .third-party-img {
    vertical-align: middle;
    height:         2em;
    width:          auto;
  }

  .third-party-login-container .btn {
    flex:          calc(50% - .25rem);
    margin-bottom: .25rem;
  }

  /* To have it symmetric, evenly apply the margin to the left and right of the even/odd elements */
  .third-party-login-container a:nth-child(even) {
    margin-left: .25rem;
  }

  .third-party-login-container a:nth-child(odd) {
    margin-right: .25rem;
  }

  /* Last item should be full width */
  .third-party-login-container a:last-child:nth-child(odd) {
    flex:   50%;
    margin: unset;
  }
</style>
