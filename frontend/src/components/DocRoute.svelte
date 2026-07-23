<script lang="ts">
  import { onMount } from 'svelte';
  import { openTab } from '../stores/tabs';

  // Export id so svelte-routing passes the :id param as a prop
  export let id: string = '';

  // Only open tab and set active on mount, not reactively (avoids re-setting activeTabId after back nav)
  onMount(() => {
    if (id) openTab(id);
  });
</script>