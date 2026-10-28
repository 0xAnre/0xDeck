import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, it } from 'node:test'

/**
 * Static regression guard for #169: chart settings dialogs must not stop click
 * propagation on `DialogContent`. Radix Popover (non-modal) dismisses on a
 * deferred document `click` listener, so a dialog-level `stopPropagation()`
 * leaves the shared color picker open until `Esc`.
 *
 * `src/components/ui/dialog.tsx` + `src/lib/dialogOutsideClick.ts` own nested
 * layer dismissal once; per-dialog outside-click handlers are forbidden by
 * docs/CHART-OBJECT-STANDARD.md.
 */

const SOURCE_ROOT = path.resolve(import.meta.dirname, '..')

const SCANNED_DIRECTORY_SUFFIX: Record<string, string> = {
  market: 'SettingsDialog.tsx',
  widgetSettings: 'Dialog.tsx',
}

const FORBIDDEN_ATTRIBUTE_PATTERN =
  /\bon(?:Click|PointerDown|MouseDown|PointerUp|MouseUp)\b\s*=/

const IDENTIFIER_CHARACTER_PATTERN = /[A-Za-z0-9_$]/

function dialogSourceFiles(): { name: string; source: string }[] {
  const files: { name: string; source: string }[] = []

  for (const [directory, suffix] of Object.entries(SCANNED_DIRECTORY_SUFFIX)) {
    const directoryPath = path.join(SOURCE_ROOT, directory)
    for (const entry of readdirSync(directoryPath).sort()) {
      if (!entry.endsWith(suffix)) continue
      files.push({
        name: `${directory}/${entry}`,
        source: readFileSync(path.join(directoryPath, entry), 'utf8'),
      })
    }
  }

  return files
}

/** Index of the `>` that closes the JSX opening tag starting at `start`. */
function openingTagEnd(source: string, start: number): number {
  let depth = 0
  let quote: string | null = null

  for (let index = start; index < source.length; index += 1) {
    const character = source[index]

    if (quote !== null) {
      if (character === '\\') index += 1
      else if (character === quote) quote = null
      continue
    }

    if (character === '"' || character === "'" || character === '`') {
      quote = character
    } else if (character === '{' || character === '(' || character === '[') {
      depth += 1
    } else if (character === '}' || character === ')' || character === ']') {
      depth -= 1
    } else if (character === '>' && depth === 0) {
      return index
    }
  }

  return -1
}

function dialogContentTags(source: string): string[] {
  const marker = '<DialogContent'
  const tags: string[] = []
  let index = source.indexOf(marker)

  while (index !== -1) {
    const nextCharacter = source[index + marker.length]
    if (nextCharacter === undefined || !IDENTIFIER_CHARACTER_PATTERN.test(nextCharacter)) {
      const end = openingTagEnd(source, index + marker.length)
      assert.notEqual(end, -1, `unterminated <DialogContent> tag at index ${index}`)
      tags.push(source.slice(index, end + 1))
    }
    index = source.indexOf(marker, index + marker.length)
  }

  return tags
}

describe('chart settings dialogs', () => {
  it('scan every chart settings dialog source', () => {
    const files = dialogSourceFiles()
    assert.ok(files.length > 0, 'no chart settings dialog sources found')

    for (const { name, source } of files) {
      assert.ok(
        dialogContentTags(source).length > 0,
        `${name} should render <DialogContent>`,
      )
    }
  })

  it('do not pass click or pointer handlers to DialogContent', () => {
    const violations: string[] = []

    for (const { name, source } of dialogSourceFiles()) {
      for (const tag of dialogContentTags(source)) {
        if (FORBIDDEN_ATTRIBUTE_PATTERN.test(tag)) {
          violations.push(`${name}: ${tag.split('\n')[0].trim()}`)
        }
      }
    }

    assert.deepEqual(
      violations,
      [],
      `DialogContent must not stop propagation of document clicks (#169):\n${violations.join('\n')}`,
    )
  })

  it('detect a click handler in a multiline attribute value', () => {
    const source = [
      '<DialogContent',
      '  className="x"',
      '  onClick={(event) => event.stopPropagation()}',
      '>',
    ].join('\n')

    const [tag] = dialogContentTags(source)
    assert.match(tag, FORBIDDEN_ATTRIBUTE_PATTERN)
  })
})
