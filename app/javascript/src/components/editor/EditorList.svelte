<script>
  import { Sortable, MultiDrag } from "sortablejs"
  import EditorItem from "./EditorItem.svelte"
  import EditorFolder from "./EditorFolder.svelte"
  import { items, sortedItems } from "../../stores/editor.js"
  import { onMount } from "svelte"
  import { flip } from "svelte/animate"

  export let parent = null

  let element
  let isHoldingCtrl
  let sortable

  $: itemsInParent = getItemsInParent($items)

  onMount(() => {
    try {
      Sortable.mount(new MultiDrag())
    } catch {}

    sortable = new Sortable(element, {
      group: "items",
      animation: 100,
      swapTreshhold: 0.25,
      multiDrag: true,
      multiDragKey: "ctrl",
      onRemove: updateOrder,
      onUpdate: updateOrder,
      onSelect: event => {
        if (isHoldingCtrl) event.items.forEach(item => item.classList.add("sortable__multi-selected"))
      },
      onDeselect: event => {
        event.item.classList.remove("sortable__multi-selected")
      }
    })
  })

  function updateOrder() {
    const elements = document.querySelectorAll("[data-item-id]")
    elements.forEach((e, i) => {
      const id = e.dataset.itemId
      if (!id) return

      const item = $items.filter(item => item.id === id)[0]
      if (!item) return

      item.position = i

      const parent = e.parentNode.closest("[data-item-id]")
      item.parent = parent ? parent.dataset.itemId : null
    })

    $items = [...$items]
  }

  function getItemsInParent() {
    return $sortedItems.filter(i => parent ? i.parent == parent.id : !i.parent )
  }

  function keypress(event) {
    isHoldingCtrl = event.ctrlKey
  }
</script>

<svelte:window on:keydown={keypress} on:keyup={keypress} />

<div class="sortable" bind:this={element}>
  {#each itemsInParent || [] as item, index (item.id)}
    <div animate:flip={{ duration: 200 }}>
      {#if item.type === "item"}
        <EditorItem {item} {index} />
      {:else if item.type === "folder"}
        <EditorFolder {item} {index} />
      {/if}
    </div>
  {/each}
</div>
