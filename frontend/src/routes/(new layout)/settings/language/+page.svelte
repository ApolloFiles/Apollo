<script lang="ts">
  import TablerIcon from '$lib/components/TablerIcon.svelte';
  import { getClientSideRpcClient } from '$lib/oRPCClientSide';
  import { m } from '$lib/paraglide/messages.js';
  import { locales } from '$lib/paraglide/runtime';
  import { setUiLanguageCookieInBrowser, UI_LANGUAGE_AUTO_VALUE as AUTO } from '$lib/uiLanguageCookie';
  import { untrack } from 'svelte';
  import type { PageProps } from './$types';

  type Locale = (typeof locales)[number];
  type LanguageChoice = typeof AUTO | Locale;

  let { data }: PageProps = $props();

  function toChoice(stored: string | null): LanguageChoice {
    return stored != null && (locales as readonly string[]).includes(stored) ? (stored as Locale) : AUTO;
  }

  let selected = $state<LanguageChoice>(untrack(() => toChoice(data.loggedInUser.uiLanguage)));
  let isSaving = $state(false);

  function determineLocaleLabel(locale: string): string {
    try {
      const label = new Intl.DisplayNames([locale], { type: 'language' }).of(locale);
      if (label != null && label !== locale) {
        return label.charAt(0).toUpperCase() + label.slice(1);
      }
    } catch {
      // In case Intl does not know the locale
    }
    return locale.toUpperCase();
  }

  const uiLanguageOptions = $derived([
    { value: AUTO, label: m.page_settings_language_option_automatic() },
    ...locales.map((locale) => ({ value: locale, label: `${determineLocaleLabel(locale)} (${locale})` })),
  ]);

  async function save(): Promise<void> {
    const uiLanguage = selected === AUTO ? null : selected;
    if (uiLanguage === (data.loggedInUser.uiLanguage ?? null)) {
      return;
    }

    isSaving = true;
    try {
      await getClientSideRpcClient().user.settings.language.updateUiLanguage({ uiLanguage });
      setUiLanguageCookieInBrowser(uiLanguage);

      window.location.reload();
    } catch (err) {
      isSaving = false;
      throw err;
    }
  }
</script>

<svelte:head>
  <title>{m.page_settings_language_title()} | Apollo</title>
</svelte:head>

<div class="language-settings-page">
  <header class="settings-header">
    <h1>{m.page_settings_language_title()}</h1>
    {#if m.page_settings_language_subtitle()}
      <p class="subtitle">{m.page_settings_language_subtitle()}</p>
    {/if}
  </header>

  <div class="settings-card">
    <div class="fields-section">
      <div class="field-item">
        <div class="field-label-group">
          <label for="uiLanguage">{m.page_settings_language_field_label()}</label>
        </div>

        <div class="field-control">
          <select
            id="uiLanguage"
            class="form-select"
            bind:value={selected}
            onchange={save}
            disabled={isSaving}
          >
            {#each uiLanguageOptions as option (option.value)}
              <option value={option.value}>{option.label}</option>
            {/each}
          </select>

          {#if isSaving}
            <TablerIcon icon="loader-2" spin={true} />
          {/if}
        </div>
      </div>
    </div>
  </div>
</div>

<style>
  .language-settings-page {
    max-width:      800px;
    margin:         0 auto;
    padding-bottom: 40px;
  }

  .settings-header {
    margin-bottom: 30px;
  }

  .settings-header h1 {
    font-size:     2rem;
    font-weight:   700;
    margin-bottom: 8px;
  }

  .subtitle {
    color:     var(--text-secondary);
    font-size: 1.1rem;
  }

  .settings-card {
    background-color: var(--secondary-bg);
    border:           1px solid var(--border-color);
    border-radius:    12px;
    padding:          30px;
    box-shadow:       0 4px 20px var(--card-shadow);
  }

  .field-item {
    display:         flex;
    justify-content: space-between;
    align-items:     center;
    gap:             20px;
  }

  .field-label-group {
    flex: 1;
  }

  .field-label-group label {
    display:     block;
    font-weight: 600;
    font-size:   1.05rem;
  }

  .field-control {
    flex:        1.5;
    display:     flex;
    align-items: center;
    gap:         15px;
    min-height:  42px;
  }

  .field-control .form-select {
    flex: 1;
  }

  @media (max-width: 600px) {
    .field-item {
      flex-direction: column;
      align-items:    stretch;
    }

    .field-control {
      margin-top: 10px;
    }
  }
</style>
