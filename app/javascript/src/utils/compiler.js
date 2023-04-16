import { templates } from "../lib/templates"
import { getSettings, getClosingBracket, replaceBetween, splitArgumentsString } from "./editor"
import { flatItems } from "../stores/editor"
import { translationKeys, defaultLanguage, selectedLanguages } from "../stores/translationKeys"
import { languageOptions } from "../lib/languageOptions"
import { get } from "svelte/store"

export function compile(overwriteContent = null) {
  let joinedItems = overwriteContent || get(flatItems)

  joinedItems = removeComments(joinedItems)

  const [settingsStart, settingsEnd] = getSettings(joinedItems)
  let settings = joinedItems.slice(settingsStart, settingsEnd)

  if (!settings || !settingsEnd) settings = templates.Settings

  joinedItems = joinedItems.replace(settings, "")
  joinedItems = extractAndInsertMixins(joinedItems)
  joinedItems = evaluateForLoops(joinedItems)
  joinedItems = evaluateConditionals(joinedItems)
  joinedItems = convertTranslations(joinedItems)

  const variables = compileVariables(joinedItems)
  const subroutines = compileSubroutines(joinedItems)

  return settings + variables + subroutines + joinedItems
}

export function getVariables(joinedItems) {
  let globalVariables = joinedItems.match(/(?<=Global\.)[^\s,.[\]);]+/g)
  globalVariables = [...new Set(globalVariables)]

  let playerVariables = joinedItems.match(/(?<=(Event Player|Victim|Attacker|Healer|Healee|Local Player)\.)[^\s,.[\]);]+/g)
  playerVariables = [...new Set(playerVariables)]

  return { globalVariables, playerVariables }
}

export function getSubroutines(joinedItems) {
  let subroutines = joinedItems.match(/Subroutine;[\r\n]+([^\r\n;]+)/g) || []
  subroutines = subroutines.map(s => s.replace("Subroutine;\n", "").replace("Call Subroutine", "").replace(/[\())\s]/g, ""))
  return [...new Set(subroutines)]
}

export function getMixins(joinedItems) {
  let mixins = joinedItems.match(/(?<=@mixin\s)[^\s\(]+/g)
  mixins = [...new Set(mixins)]

  return mixins
}

function extractAndInsertMixins(joinedItems) {
  const mixins = {}

  // Find stated mixins and save their names and params to an object
  const mixinRegex = /@mixin/g
  let match
  while ((match = mixinRegex.exec(joinedItems)) != null) {
    let closing = getClosingBracket(joinedItems, "{", "}", match.index)
    if (closing < 0) {
      closing = joinedItems.length
    }
    const content = joinedItems.slice(match.index, closing)
    const name = content.match(/(?<=@mixin\s)(\w+)/)?.[0]

    if (!name) throw new Error("Mixin is missing a name")
    if (mixins[name]) throw new Error(`Mixin "${ name }" is already defined`)

    const firstOpenBracket = content.indexOf("{")
    const firstOpenParen = content.indexOf("(")
    const closingParen = getClosingBracket(content, "(", ")", firstOpenParen - 1)
    if (closingParen < 0) {
      continue
    }
    const params = content.slice(firstOpenParen + 1, closingParen).replace(/\s/, "").split(",")
    const paramsDefaults = params
      .map(param => {
        const slicedAt = param.indexOf("=")
        if (slicedAt != -1) return [param.slice(0, param.indexOf("=")), param.slice(param.indexOf("=") + 1)]
        else return [param]
      })
      .map(([key, value]) => ({ key: key.trim(), default: (value || "").trim() }))

    const mixin = content.slice(firstOpenBracket + 1, closing)?.trim()

    mixins[name] = {
      content: mixin,
      full: joinedItems.slice(match.index, closing + 1),
      params: paramsDefaults,
      hasContents: mixin.includes("@contents;")
    }
  }

  // Remove mixins from content
  Object.values(mixins).forEach(({ full }) => joinedItems = joinedItems.replace(full, ""))

  // Find stated includes for mixins and replace them with mixins
  while (joinedItems.indexOf("@include") != -1) {
    // Get arguments
    const index = joinedItems.indexOf("@include")
    let closing = getClosingBracket(joinedItems, "(", ")", index + 1)
    if (closing < 0) {
      closing = joinedItems.length
    }
    const full = joinedItems.slice(index, closing + 1)
    const name = full.match(/(?<=@include\s)(\w+)/)?.[0]
    const mixin = mixins[name]

    if (!mixin) throw new Error(`Included a mixin that was not specified: "${ name }"`)

    const argumentsOpeningParen = full.indexOf("(")
    const argumentsClosingParen = getClosingBracket(full, "(", ")", argumentsOpeningParen - 1)
    if (argumentsClosingParen < 0) {
      continue
    }
    const argumentsString = full.slice(argumentsOpeningParen + 1, argumentsClosingParen)
    const splitArguments = splitArgumentsString(argumentsString) || []

    let replaceWith = mixin.content
    if (replaceWith.includes(`@include ${ name }`)) throw new Error("Can not include a mixin in itself")

    // Get content for @contents
    let fullMixin
    let contents
    if (mixin.hasContents) {
      let contentsClosing = getClosingBracket(joinedItems, "{", "}", index)
      if (contentsClosing) {
        contentsClosing = joinedItems.length
      }
      fullMixin = joinedItems.slice(index, contentsClosing + 1)

      const contentsOpening = fullMixin.indexOf("{")

      if (contentsOpening != -1) {
        contents = fullMixin.slice(contentsOpening + 1, fullMixin.length - 1)
        if (contents.includes(`@include\s${ name }`)) throw new Error("Can not include a mixin in itself")
      }

      replaceWith = replaceWith.replace("@contents;", contents || "")
    }

    let paramIndex = 0
    mixin.params.forEach(param => {
      replaceWith = replaceWith.replaceAll("Mixin." + param.key, splitArguments[paramIndex]?.trim() || param.default)
      paramIndex++
    })

    const closingSemicolon = (!mixin.hasContents || !contents) && joinedItems[closing + 1] == ";"

    joinedItems = replaceBetween(joinedItems, replaceWith, index, index + ((contents && fullMixin) || full).length + (closingSemicolon ? 1 : 0))
  }

  return joinedItems
}

const regexRegex = /^\/(.+)\/(\w*)$/

const conditionalOperations = {
  // order is deliberate so longer operators match first
  "is not": (l, r) => l !== r,
  "is": (l, r) => l === r,
  "contains": (l, r) => l.includes(r),
  "test": (l, r) => {
    const match = r.match(regexRegex)
    if (!match) {
      return false
    }
    const [_, pattern, flags] = match
    let regex
    try {
      regex = new RegExp(pattern, flags)
    } catch (err) {
      return false
    }
    return regex.test(l)
  }
}

function evaluateConditionals(joinedItems) {
  const ifStartRegex = /@if[\s\n]*\(/g
  const startBracketRegex = /[\s\n]*\{/g
  const elseStartRegex = /[\s\n]*@else[\s\n]*\{/g
  const operatorRegex = new RegExp(`(?<=\\b)(${ Object.keys(conditionalOperations).join("|") })(?=\\b)`)

  let match
  while ((match = ifStartRegex.exec(joinedItems)) != null) {
    const openingConditionParenIndex = match.index + match[0].length - 1
    const closingConditionParenIndex = getClosingBracket(joinedItems, "(", ")", openingConditionParenIndex - 1)
    if (closingConditionParenIndex < 0) {
      continue
    }

    const conditionStr = joinedItems.substring(openingConditionParenIndex + 1, closingConditionParenIndex)

    const operatorMatch = operatorRegex.exec(conditionStr)
    if (operatorMatch == null) {
      continue
    }

    const operator = operatorMatch[1]
    const lefthand = conditionStr.substring(0, operatorMatch.index).trimEnd()
    const righthand = conditionStr.substring(operatorMatch.index + operator.length).trimStart()

    startBracketRegex.lastIndex = closingConditionParenIndex + 1 // set start position for the exec below
    const startBracketMatch = startBracketRegex.exec(joinedItems)
    if (startBracketMatch == null || startBracketMatch.index !== closingConditionParenIndex + 1) {
      continue
    }

    const openingBracketIndex = startBracketMatch.index + startBracketMatch[0].length - 1
    const closingBracketIndex = getClosingBracket(joinedItems, "{", "}", openingBracketIndex - 1)
    if (closingBracketIndex < 0) {
      continue
    }

    let conditionalEndingIndex = closingBracketIndex

    const trueBlockContent = joinedItems.substring(openingBracketIndex + 1, closingBracketIndex)
    let falseBlockContent = ""

    elseStartRegex.lastIndex = closingBracketIndex + 1 // set start position for the exec below
    const elseMatch = elseStartRegex.exec(joinedItems)
    if (elseMatch != null && elseMatch.index === closingBracketIndex + 1) {
      const afterElseMatchedTextIndex = elseMatch.index + elseMatch[0].length
      const matchingClosingBracketForElseIndex = getClosingBracket(joinedItems, "{", "}", afterElseMatchedTextIndex - 2)
      if (matchingClosingBracketForElseIndex > 0) {
        falseBlockContent = joinedItems.substring(afterElseMatchedTextIndex, matchingClosingBracketForElseIndex)
        conditionalEndingIndex = matchingClosingBracketForElseIndex
      } else {
        continue
      }
    }

    const passed = conditionalOperations[operator]?.(lefthand, righthand)

    const finalContent = passed ? trueBlockContent : falseBlockContent
    joinedItems = replaceBetween(
      joinedItems,
      finalContent,
      match.index,
      conditionalEndingIndex + 1
    )
    // reset regex last index to right on the replaced content, to allow for nested `@if`s
    ifStartRegex.lastIndex = match.index
  }

  return joinedItems
}

function compileVariables(joinedItems) {
  const { globalVariables, playerVariables } = getVariables(joinedItems)

  if (!globalVariables?.length && !playerVariables.length) return ""

  return `
variables {
${ globalVariables.length ? "  global:" : "" }
${ globalVariables.map((v, i) => `    ${ i }: ${ v }`).join("\n") }

${ playerVariables.length ? "  player:" : "" }
${ playerVariables.map((v, i) => `    ${ i }: ${ v }`).join("\n") }
}\n\n`
}

function compileSubroutines(joinedItems) {
  const subroutines = getSubroutines(joinedItems)

  if (!subroutines.length) return ""

  return `
subroutines {
${ subroutines.map((v, i) => `    ${ i }: ${ v }`).join("\n") }
}\n\n`
}

function removeComments(joinedItems) {
  return joinedItems.replaceAll(/\/\*[\s\S]*?\*\/|([^:]|^)\/\/.*$/gm, "")
}

function convertTranslations(joinedItems) {
  if (!get(selectedLanguages)?.length) return joinedItems
  if (!Object.keys(get(translationKeys) || {})?.length) return joinedItems

  // Find @translate in content and replace with given translation key
  let match
  const regex = /@translate/g
  while ((match = regex.exec(joinedItems)) != null) {
    const closing = getClosingBracket(joinedItems, "(", ")", match.index + 1)
    if (closing < 0) {
      continue
    }
    const full = joinedItems.slice(match.index, closing + 1)

    const argumentsOpeningParen = full.indexOf("(")
    const argumentsClosingParen = getClosingBracket(full, "(", ")", argumentsOpeningParen - 1)
    if (argumentsClosingParen < 0) {
      continue
    }
    const argumentsString = full.slice(argumentsOpeningParen + 1, argumentsClosingParen)
    const splitArguments = splitArgumentsString(argumentsString) || []
    const key = splitArguments[0].replaceAll("\"", "")

    const eachLanguageStrings = []
    get(selectedLanguages).forEach((language) => {
      const translation = get(translationKeys)[key]?.[language] || get(translationKeys)[key]?.[get(defaultLanguage)] || key
      eachLanguageStrings.push(`Custom String("${ translation }"${ splitArguments.length > 1 ? ", " : "" }${ splitArguments.slice(1).join(", ") })`)
    })

    const replaceWith = `Value In Array(
      Array(${ eachLanguageStrings.join(", ") }),
      Max(False, Index Of Array Value(Global.WCDynamicLanguages, Custom String("{0}", Map(Practice Range), Null, Null)))
    )`

    joinedItems = replaceBetween(joinedItems, replaceWith, match.index, match.index + full.length)
  }

  // Array with custom string for Practice Range in each selected language
  const customStringArrayForEachLanguage = get(selectedLanguages).map(language => `Custom String("${ languageOptions[language].detect }")`)
  const rule = `
  rule("Workshop.codes Editor Dynamic Language - Set Languages") {
    event { Ongoing - Global; }
    actions { Global.WCDynamicLanguages = Array(${ customStringArrayForEachLanguage.join(", ") }); }
  }`

  return joinedItems + rule
}

function evaluateForLoops(joinedItems) {
  let match
  const forRegex = /@for\s+\(\s*((?:(\w+)\s+)?(?:from\s+))?(\d+)\s+(?:(through|to)\s+)?(\d+)\s*\)\s*\{/g // Matches "@for ([var] [from] number through|to number) {" in groups for each param
  while ((match = forRegex.exec(joinedItems)) != null) {
    const [full, _, variable, start, clusivity, end] = match

    const inclusive = clusivity === "through"
    const openingBracketIndex = match.index + full.length - 1
    const closingBracketIndex = getClosingBracket(joinedItems, "{", "}", openingBracketIndex - 1)

    const content = joinedItems.substring(openingBracketIndex + 1, closingBracketIndex)

    // Replace "For.[variable]" with the current index
    let repeatedContent = ""
    for(let i = parseInt(start); i < parseInt(end) + (inclusive ? 1 : 0); i++) {
      repeatedContent += content.replaceAll(`For.${ variable || "i" }`, i)
    }

    joinedItems = replaceBetween(joinedItems, repeatedContent, match.index, closingBracketIndex + 1)
    forRegex.lastIndex = 0 // This is necessary in case the replaced content is shorter than the original content
  }

  return joinedItems
}
