import { browser } from '$app/environment';
import type SubtitleTrack from './backends/subtitles/SubtitleTrack';

const STORAGE_KEY = 'apollo-video-player-stream-selection';

type StoredStreamSelection = {
  audioLanguage?: string,
  /** `null` means the user explicitly turned subtitles off. */
  subtitle?: { language: string, label: string } | null,
};

function readStoredSelection(): StoredStreamSelection {
  // Never touch `localStorage` while server-side rendering – even a `typeof` check hits Node's
  // lazy global and makes it log an ExperimentalWarning about the missing --localstorage-file
  if (!browser) {
    return {};
  }

  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw == null) {
      return {};
    }

    const parsed = JSON.parse(raw);
    return {
      audioLanguage: typeof parsed?.audioLanguage === 'string' ? parsed.audioLanguage : undefined,
      subtitle: parsed?.subtitle === null ? null : parseSubtitleIdentity(parsed?.subtitle),
    };
  } catch {
    return {};
  }
}

function parseSubtitleIdentity(value: unknown): { language: string, label: string } | undefined {
  if (typeof value !== 'object' || value == null) {
    return undefined;
  }

  const { language, label } = value as Record<string, unknown>;
  if (typeof language !== 'string' || typeof label !== 'string') {
    return undefined;
  }
  return { language, label };
}

function writeStoredSelection(selection: StoredStreamSelection): void {
  if (!browser) {
    return;
  }

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(selection));
  } catch {
    // ignore storage quota / availability errors
  }
}

export function rememberAudioLanguage(language: string): void {
  writeStoredSelection({ ...readStoredSelection(), audioLanguage: language });
}

export function rememberSubtitleTrack(track: SubtitleTrack | null): void {
  writeStoredSelection({
    ...readStoredSelection(),
    subtitle: track == null ? null : { language: track.language, label: track.label },
  });
}

export function readPreferredAudioLanguage(): string | null {
  return readStoredSelection().audioLanguage ?? null;
}

/**
 * Image-based subtitles are never returned: selecting one restarts the shared live transcode
 * for every session participant, so they are only ever (re-)activated by the backend telling us
 * one is burned in.
 */
export function findPreferredSubtitleTrack(tracks: ReadonlyArray<SubtitleTrack>): SubtitleTrack | null {
  const preferred = readStoredSelection().subtitle;
  if (preferred == null) {
    return null;
  }

  const candidates = tracks.filter((track) => !track.isBitmapBased);
  return candidates.find((track) => track.language === preferred.language && track.label === preferred.label)
    ?? candidates.find((track) => track.language === preferred.language)
    ?? null;
}
