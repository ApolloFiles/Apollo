<script module lang="ts">
  // Sentinel marking the spot in a translated message where a styled fragment
  // (a bold value, an underlined word, …) should be spliced in. Pass it as the
  // message's placeholder value, e.g. `m.some_message({ name: MESSAGE_SLOT })`,
  // and provide the styled fragment as this component's children.
  //
  // Why: Paraglide messages are plain strings, so a message like
  // "Linked as {name}" cannot carry markup around the placeholder without either
  // {@html} (XSS risk for untrusted values) or splitting into fragments (which
  // hard-codes word order and breaks other languages). Rendering the sentinel
  // via a text node keeps word order in the translator's hands and the markup in
  // the template. Private-use codepoint, so it won't collide with real text.
  export const MESSAGE_SLOT = '\\uE000';
</script>

<script lang="ts">
  import type { Snippet } from 'svelte';

  let { text, children }: {
    /** The message rendered with `MESSAGE_SLOT` passed as its placeholder value */
    text: string,
    /** Rendered in place of the sentinel — wrap it in whatever markup you need */
    children: Snippet,
  } = $props();

  const parts = $derived(text.split(MESSAGE_SLOT));
</script>

{parts[0] ?? ''}{@render children()}{parts[1] ?? ''}
