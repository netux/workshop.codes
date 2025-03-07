<script>
  import { items } from "../../stores/editor"
  import { getItemById, replaceBetween, setCurrentItemById, updateItem } from "../../utils/editor"
  import { fade, fly } from "svelte/transition"
  import { tick } from "svelte"

  let active = false
  let value = ""
  let replace = ""
  let input
  let replaceInput
  let itemMatches = []
  let selected = 0
  let message = ""

  $: searchItems(value, replace)
  $: if (active) focusInput()
  $: if (value || replace) message = ""
  $: occurrences = itemMatches.reduce((p, c) => p + c.contentMatches.length, 0)
  $: occurrencesString = `${ occurrences } occurrence${ occurrences > 1 ? "s" : "" } in ${ itemMatches.length } item${ itemMatches.length > 1 ? "s" : "" }`

  function searchItems() {
    if (!active) return
    if (!value) {
      itemMatches = []
      return
    }

    const filteredItems = $items.filter(i =>
      i.type == "item" &&
      i.content.indexOf(value) != -1)

    const regex = new RegExp(value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g")

    itemMatches = filteredItems.map(i => {
      const contentMatches = []

      let match = null
      while ((match = regex.exec(i.content)) != null) {
        const index = match.index
        contentMatches.push({
          index,
          truncateStart: index > 10,
          truncateEnd: index + value.length < i.content.length,
          string: i.content.substring(
            Math.max(0, index - 10),
            Math.min(index + value.length + 20, i.content.length)
          )
        })
      }

      return {
        id: i.id,
        name: i.name,
        parent: i.parent,
        order: i.name.length - value.length,
        contentMatches
      }
    })

    selected = 0
  }

  function replaceInAll() {
    if (!active) return
    if (!itemMatches?.length) return

    itemMatches.forEach(match => {
      const item = getItemById(match.id)
      item.content = item.content.replaceAll(value, replace)
      updateItem(item)
    })

    message = `Replaced ${ occurrencesString }`

    searchItems()
  }

  function highlightString(string) {
    const index = string.indexOf(value)
    const subString = string.substring(index, index + value.length)
    let elementString = `<mark>${ subString }</mark>`

    if (replace) elementString += `<mark class="text-white"> ⇢ ${ replace }</mark>`

    return replaceBetween(string, elementString, index, index + value.length)
  }

  function getParentsString(id) {
    if (!id) return ""

    const itemNames = []

    while (id) {
      const parent = getItemById(id)
      itemNames.push(parent.name)

      id = parent.parent
    }

    return itemNames.reverse().join(" > ")
  }

  function selectItem(id) {
    setCurrentItemById(id)
  }

  function setSelected(add) {
    selected = selected + add
    if (selected > itemMatches.length - 1 || selected > itemMatches.length - 1) selected = 0
    else if (selected < 0) selected = itemMatches.length - 1
  }

  function keydown(event) {
    if (event.ctrlKey && event.shiftKey && event.keyCode == 70) { // F key
      event.preventDefault()
      active = !active
      if (active) focusInput()
    }

    if (input != document.activeElement && replaceInput != document.activeElement) return
    if (!active) return

    if (selected && event.keyCode == 13) { // Enter key
      selectItem(itemMatches[selected].id)
    }

    if (event.keyCode == 40) { // Down array
      event.preventDefault()
      setSelected(1)
    }

    if (event.keyCode == 38) { // Up array
      event.preventDefault()
      setSelected(-1)
    }
  }

  async function focusInput() {
    await tick()
    input.focus()
  }
</script>

<svelte:window on:keydown={keydown} on:keydown={event => { if (event.key === "Escape") active = false }} />

{#if !active}
  <button class="form-input bg-darker text-dark cursor-pointer text-left" on:click={() => active = true}>
    <em>Find/Replace in all... (Ctrl+Shift+F)</em>
  </button>
{/if}

{#if active}
  <div in:fly={{ duration: 150, y: -30 }}>
    <input type="text" class="form-input bg-darker mt-1/4" placeholder="Find in all..." bind:value bind:this={input} />

    <div class="flex mt-1/16">
      <input type="text" class="form-input bg-darker" placeholder="Replace found with..." bind:value={replace} bind:this={replaceInput} />
      <button class="button button--secondary button--square button--small ml-1/16" on:click={replaceInAll}>Replace</button>
    </div>

    <div class="mt-1/16 text-italic text-dark text-small">Find is case sensitive</div>
  </div>

  {#if value}
    <div class="matches">
      {#if itemMatches.length}
        <div class="text-italic text-dark mb-1/8">
          Found {occurrencesString}
        </div>
      {/if}

      {#if !itemMatches.length && !message}
        <em class="text-dark">No matches found</em>
      {/if}

      {#each itemMatches as item, i}
        <div class="matches__item" class:matches__item--active={selected == i} on:click={() => selectItem(item.id)}>
          {item.name}

          {#if item.parent}
            <div class="text-small text-dark">{getParentsString(item.parent)}</div>
          {/if}

          <div class="text-dark text-small">
            <span class="text-white">Matches: {item.contentMatches.length}</span>

            {#each item.contentMatches as match}
              <div>
                - {match.truncateStart ? "..." : ""}{@html highlightString(match.string)}{match.truncateEnd ? "..." : ""}
              </div>
            {/each}
          </div>
        </div>
      {/each}
    </div>
  {/if}

  {#if message}
    <div class="text-primary" in:fade={{ duration: 150 }}>{message}</div>
  {/if}
{/if}
