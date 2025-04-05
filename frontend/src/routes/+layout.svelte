<script>
  import 'bootstrap/dist/css/bootstrap.css';
  import 'material-design-icons-iconfont/dist/material-design-icons.css';
  import { onMount } from 'svelte';

  const { children } = $props();

  // TODO: Mal https://smashing-freiburg-2024.netlify.app/07-color-scheme/ anschauen (+ Folie danach)
  // TODO: Mal https://smashing-freiburg-2024.netlify.app/20-text-wrap/ und https://smashing-freiburg-2024.netlify.app/31-text-box-trim/ anschauen
  // TODO: Mal https://smashing-freiburg-2024.netlify.app/27-dialog/ und https://smashing-freiburg-2024.netlify.app/28-popover/ anschauen
  // TODO: Für Video-Player-Styles anschauen: https://smashing-freiburg-2024.netlify.app/29-anchor/
  onMount(() => {
    import('bootstrap/dist/js/bootstrap.bundle.js');
  });
</script>

{@render children()}
