<script>
  import { destroyItem } from "../../utils/editor"

  export let item

  function destroy() {
    if (confirm(`Are you sure you wish to destroy "${ item.name }"?`)) destroyItem(item.id)
  }
</script>

<button class="empty-button text-small text-red" on:click={destroy}>
  ╳
</button>
