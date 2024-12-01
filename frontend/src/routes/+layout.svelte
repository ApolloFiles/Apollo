<script>
    import 'bootstrap/dist/css/bootstrap.css';
    import 'material-design-icons-iconfont/dist/material-design-icons.css';
    import {onMount} from 'svelte';

    const {children} = $props();

    onMount(() => {
        import('bootstrap/dist/js/bootstrap.bundle.js');
    });
</script>

<main>
    {@render children()}
</main>
