import { beforeNavigate } from '$app/navigation';
import { m } from '#lib/paraglide/messages.js';

/**
 * Asks the user to confirm leaving the page while `hasUnsavedChanges` returns true.
 * Must be called during component initialization.
 */
export function guardUnsavedChanges(hasUnsavedChanges: () => boolean): { bypass: () => void } {
  let bypassed = false;

  beforeNavigate((navigation) => {
    if (bypassed || !hasUnsavedChanges()) {
      return;
    }

    if (navigation.type === 'leave') {
      // SvelteKit turns this into the browser's native unload confirmation
      navigation.cancel();
      return;
    }

    if (!window.confirm(m.common_confirm_leave_with_unsaved_changes())) {
      navigation.cancel();
    }
  });

  return {
    bypass: () => {
      bypassed = true;
    },
  };
}
