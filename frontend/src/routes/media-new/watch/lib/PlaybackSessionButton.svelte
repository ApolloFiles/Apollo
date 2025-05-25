<script lang="ts">
  import { onMount } from 'svelte';
  import IconClipboard from 'virtual:icons/tabler/clipboard';
  import IconClipboardCheck from 'virtual:icons/tabler/clipboard-check';
  import IconRefreshCheck from 'virtual:icons/tabler/circle-dashed-check';
  import IconRefresh from 'virtual:icons/tabler/refresh';
  import IconUserGroup from 'virtual:icons/tabler/users-group';
  import type { PlayerSessionInfoResponse } from '../../../../../../src/webserver/Api/v0/media/player-session/info';
  import { regenerateJoinToken } from './playback-session-backend-api';

  let {
    sessionId = $bindable(),
    sessionInfo = $bindable(),
  }: {
    sessionId: string | null,
    sessionInfo: PlayerSessionInfoResponse['session'] | null,
  } = $props();

  let menuVisible = $state(false);
  let shareUrl: string | null = $state(null);

  let visualizeCopyToClipboard = $state(false);
  let copyToClipboardTimeout: number | null = null;

  let visualizeRegenerateShareUrlSuccess = $state(false);
  let regenerateShareUrlLoading = $state(false);
  let regenerateShareUrlSuccessTimeout: number | null = null;

  function togglePlaybackSessionSettingsMenu() {
    menuVisible = !menuVisible;
  }

  function removeParticipant(id: string) {
    alert(`Not implemented yet (remove user with id=${id})`);
  }

  function copyShareUrl(): void {
    if (shareUrl == null) {
      throw new Error('Tried to copy share URL, but it is not set');
    }

    navigator.clipboard.writeText(shareUrl);

    if (copyToClipboardTimeout != null) {
      clearTimeout(copyToClipboardTimeout);
    }
    copyToClipboardTimeout = window.setTimeout(() => {
      visualizeCopyToClipboard = false;
      copyToClipboardTimeout = null;
    }, 2000);
    visualizeCopyToClipboard = true;
  }

  async function regenerateShareUrl(): Promise<void> {
    if (sessionId == null) {
      console.error('Tried to regenerate share URL, but sessionId is not known');
      return;
    }
    if (regenerateShareUrlLoading) {
      return;
    }

    if (regenerateShareUrlSuccessTimeout != null) {
      clearTimeout(regenerateShareUrlSuccessTimeout);
    }
    visualizeRegenerateShareUrlSuccess = false;
    regenerateShareUrlLoading = true;

    try {
      shareUrl = '';
      const regenerateResponse = await regenerateJoinToken(sessionId);
      shareUrl = regenerateResponse.shareUrl;

      visualizeRegenerateShareUrlSuccess = true;
      regenerateShareUrlSuccessTimeout = window.setTimeout(() => {
        visualizeRegenerateShareUrlSuccess = false;
        regenerateShareUrlSuccessTimeout = null;
      }, 2000);
    } finally {
      regenerateShareUrlLoading = false;
    }
  }

  onMount(() => {
    return () => {
      sessionInfo = null;
    };
  });
</script>

<button type="button"
        class="nav-link btn btn-link"
        aria-label="Open playback session settings"
        title="Playback session settings"
        onclick={togglePlaybackSessionSettingsMenu}
>
  <IconUserGroup />
</button>

{#if menuVisible}
  <div class="card shadow-lg position-absolute end-0 mt-5 menu-container">
    <div class="card-body d-flex flex-column gap-4">
      <div class="participant-list-section">
        <div class="fw-semibold mb-2">Participants</div>
        <ul class="list-unstyled mb-0">
          {#if sessionInfo}
            <!-- TODO: Vermutlich das <li> in ne Komponente und das delete optional machen oder so bzw. sagen dass man den Owner rendern will -->
            <li class="d-flex align-items-center gap-1 py-1 border-bottom border-secondary-subtle">
              <img class="rounded-circle me-2" src="https://github.com/SpraxDev.png" width="32" height="32"
                   loading="lazy" alt="" />
              <span class="connected-indicator" class:connected={sessionInfo.participants.owner.connected}
                    title={sessionInfo.participants.owner.connected ? 'Connected' : 'Disconnected'}></span>
              <span
                class="flex-grow-1">{sessionInfo.participants.owner.displayName + (sessionInfo.participants.owner.id === sessionInfo.yourId ? ' (You)' : '')}</span>
            </li>

            {#each sessionInfo.participants.otherParticipants as participant}
              <li class="d-flex align-items-center gap-1 py-1 border-bottom border-secondary-subtle">
                <img class="rounded-circle me-2" src="https://github.com/SpraxDev.png" width="32" height="32"
                     loading="lazy" alt="" />
                <span class="connected-indicator" class:connected={participant.connected}
                      title={participant.connected ? 'Connected' : 'Disconnected'}></span>
                <span
                  class="flex-grow-1">{participant.displayName + (participant.id === sessionInfo.yourId ? ' (You)' : '')}</span>
                <button class="btn btn-sm btn-outline-danger px-2 py-0" title="Remove participant"
                        onclick={() => removeParticipant(participant.id)}>x
                </button>
              </li>
            {/each}
          {/if}
        </ul>
      </div>

      {#if sessionInfo != null && sessionInfo.participants.owner.id === sessionInfo.yourId}
        <div class="share-link-section">
          <div class="fw-semibold mb-2">Share Link</div>
          {#if shareUrl != null}
            <div class="input-group">
              <input class="form-control bg-dark text-light" type="text" readonly value={shareUrl} />
              <button
                class="btn"
                class:btn-outline-light={!visualizeCopyToClipboard}
                class:btn-outline-success={visualizeCopyToClipboard}
                type="button"
                onclick={copyShareUrl}
              >
                {#if visualizeCopyToClipboard}
                  <IconClipboardCheck />
                {:else}
                  <IconClipboard />
                {/if}
              </button>
              <button
                class="btn"
                class:btn-outline-light={!visualizeRegenerateShareUrlSuccess}
                class:btn-outline-success={visualizeRegenerateShareUrlSuccess}
                type="button"
                onclick={regenerateShareUrl}>
                {#if visualizeRegenerateShareUrlSuccess}
                  <IconRefreshCheck />
                {:else}
                  <div class:spinning-icon={regenerateShareUrlLoading}>
                    <IconRefresh />
                  </div>
                {/if}
              </button>
            </div>
          {:else}
            <button class="btn btn-primary w-100"
                    type="button"
                    onclick={regenerateShareUrl}>
              Generate Share Link
            </button>
          {/if}
        </div>
      {/if}
    </div>
  </div>
{/if}

<style>
  .menu-container {
    min-width:        340px;
    z-index:          100;
    background-color: var(--bs-dark-bg-subtle, #23272b);
    color:            var(--bs-light, #f8f9fa);
  }

  .connected-indicator {
    display:          inline-block;
    width:            10px;
    height:           10px;
    border-radius:    50%;
    vertical-align:   middle;
    margin-right:     4px;
    background-color: red;
  }

  .connected {
    background-color: green;
  }

  .spinning-icon {
    display:     inline-block;
    animation:   spin 2s infinite linear;
    line-height: 0;
  }

  @keyframes spin {
    from {
      transform: rotate(0deg);
    }
    to {
      transform: rotate(360deg);
    }
  }
</style>
