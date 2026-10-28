import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, it } from 'node:test'

/**
 * Source guard for the chart settings dialog form vocabulary (issue #176):
 * one `Field` / `FieldLabel` + shared `Input` pattern, no local input class
 * literals, a stable id on every control and a matching label association.
 * There is no DOM test runner in this project, so the dialogs are checked as
 * source text the same way `marketStylePalette.test.ts` guards its literals.
 */
const HERE = path.dirname(fileURLToPath(import.meta.url))
const SRC_ROOT = path.resolve(HERE, '..')

const DIALOG_FILES = [
  path.join(SRC_ROOT, 'market', 'RollingVwapSettingsDialog.tsx'),
  path.join(SRC_ROOT, 'market', 'AnchoredVwapSettingsDialog.tsx'),
  path.join(SRC_ROOT, 'widgetSettings', 'FixedRangeVolumeProfileSettingsDialog.tsx'),
  path.join(SRC_ROOT, 'widgetSettings', 'MarketIndicatorStyleDialog.tsx'),
]

const VWAP_DIALOG_FILES = DIALOG_FILES.slice(0, 2)

function readDialog(file: string): string {
  return readFileSync(file, 'utf8')
}

/** Every native `<input` / shared `<Input` element in the file. */
function controlElements(source: string): string[] {
  return [...source.matchAll(/<(?:input|Input)\b[\s\S]*?\/>/g)].map((match) => match[0])
}

/** `id="literal"`, ``id={`template`}`` and `id={identifier}` attribute values. */
function idAttributes(element: string): string[] {
  return [...element.matchAll(/\bid=(?:"([^"]+)"|\{(`[^`]+`|[A-Za-z_$][\w$]*)\})/g)].map(
    (match) => match[1] ?? match[2],
  )
}

function labelledControlIds(source: string): string[] {
  return [
    ...source.matchAll(/htmlFor=(?:"([^"]+)"|\{(`[^`]+`|[A-Za-z_$][\w$]*)\})/g),
  ].map((match) => match[1] ?? match[2])
}

describe('chart settings dialog form vocabulary', () => {
  it('declares no local input class literal', () => {
    for (const file of DIALOG_FILES) {
      const source = readDialog(file)
      assert.equal(
        /INPUT_CLASSNAME\s*=/.test(source),
        false,
        `${path.relative(SRC_ROOT, file)} defines a local input class literal`,
      )
      assert.equal(
        source.includes('h-8 w-full rounded-md border border-input'),
        false,
        `${path.relative(SRC_ROOT, file)} still spells out the numeric input classes`,
      )
    }
  })

  it('gives every numeric and checkbox control a stable id', () => {
    for (const file of DIALOG_FILES) {
      const elements = controlElements(readDialog(file))
      assert.ok(elements.length > 0, `${path.relative(SRC_ROOT, file)} has no controls`)
      for (const element of elements) {
        const ids = idAttributes(element)
        assert.equal(
          ids.length,
          1,
          `${path.relative(SRC_ROOT, file)} control without exactly one id: ${element.slice(0, 60)}`,
        )
      }
    }
  })

  it('associates every control with a FieldLabel', () => {
    for (const file of DIALOG_FILES) {
      const source = readDialog(file)
      const labels = new Set(labelledControlIds(source))
      for (const element of controlElements(source)) {
        for (const id of idAttributes(element)) {
          assert.ok(
            labels.has(id),
            `${path.relative(SRC_ROOT, file)} has no htmlFor for control id ${id}`,
          )
        }
      }
    }
  })

  it('keeps control ids unique inside each dialog', () => {
    for (const file of DIALOG_FILES) {
      const ids = controlElements(readDialog(file)).flatMap(idAttributes)
      assert.deepEqual(
        ids.filter((id, index) => ids.indexOf(id) !== index),
        [],
        `${path.relative(SRC_ROOT, file)} repeats a control id`,
      )
    }
  })

  it('names the instance in both per-instance VWAP dialog descriptions', () => {
    for (const file of VWAP_DIALOG_FILES) {
      const source = readDialog(file)
      assert.ok(
        /DialogDescription[\s\S]*instanceLabel \?\?/.test(source),
        `${path.relative(SRC_ROOT, file)} does not render the instance label in DialogDescription`,
      )
    }
  })
})
