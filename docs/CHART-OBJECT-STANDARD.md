# Chart Tool & Indicator Standard (normative)

Rules for BTC Perp chart tools, indicators and their settings (`src/market/`, `src/widgetSettings/`). They exist so new tools reuse the shared components and interaction modules instead of growing a second picker, a second width control or a second pointer path. Widget-level rules stay in [WIDGET-STANDARD.md](./WIDGET-STANDARD.md).

`MUST` = required for new or changed chart-tool work. `SHOULD` = deviate only with a recorded reason.

---

## Appearance & settings

**One color control (MUST).** Every color input uses `ColorOpacityField` (`src/widgetSettings/ColorOpacityField.tsx`) with palette, HEX normalization, opacity normalization and preview geometry from `src/widgetSettings/colorPickerPalette.ts`. Never add a bespoke picker, a raw `<input type="color">`, or a private swatch grid.

- Color and opacity are one control: pass `color` + `opacityPercent` together and emit 0–100 integer percentages; a color field without opacity is not the standard.
- Stroke-capable fields add the `Line`/`Dot` row via `lineStyle` + `onLineStyleChange`; use `lineStyleMixed` for indeterminate multi-series state instead of picking a series value. Fill-only fields (rect fill, FRVP histogram, VWAP band fill, info-box background/text) MUST omit the style row.
- Fills and backgrounds MUST use this same Color + Opacity control wherever the tool supports them.

**One width control (MUST).** Stroke width comes from `LineChartStrokeSelectFields` (`src/widgetSettings/LineChartStrokeSelectFields.tsx`) over `LINE_CHART_STROKE_WIDTHS` in `src/market/lineChartStroke.ts` (1–4px, `DEFAULT_LINE_CHART_STROKE_WIDTH`). Do not introduce a competing width toggle or width range.

**Defaults (MUST).** Starting styles come from `src/market/marketStylePalette.ts`: `MARKET_STYLE_PALETTE`, `MARKET_STYLE_OPACITY_PERCENT` (`full` / `secondary` / `fill`) and `marketStyleRoleDefault(role)`; multi-series lines use `MARKET_STYLE_MULTI_LINE_SHADES` / `MARKET_STYLE_DUAL_LINE_SHADES`, volatility bands use `MARKET_STYLE_ROLLING_BAND_SHADES`. Feature files MUST NOT declare new hex literals — import palette values. Semantic colors that carry meaning are an explicit exception to the grayscale defaults: candle up/down (`btcPerpetualCandleColors.ts`), buy/sell position markers (`positionMarkers.ts`) and Aggregated Liquidations (`aggregatedLiquidationsColors.ts` — `LIQUIDATION_LONG_COLOR` = `#EF4444` for long liquidations, `LIQUIDATION_SHORT_COLOR` = `#22C55E` for short liquidations, identical in every theme). These MUST NOT be neutralized to grayscale and are not user-facing neutral starting styles.

**Settings dialogs (MUST).**

- Use the shadcn `Dialog` in `src/components/ui/dialog.tsx`; do not build a parallel modal/popover shell.
- Preserve the shared structure: `DialogHeader` (`DialogTitle` + `DialogDescription` naming the object) → body of `FieldGroup`/`Field` sections → `DialogFooter` with `Save`/`Cancel`, required for every chart tool and indicator settings dialog.
- Spacious and responsive: SHOULD share one width and spacing scale wider than the shadcn default `sm:max-w-sm`, with grouped sections and consistent gaps; the body MUST scroll inside `max-h-[calc(100dvh-2rem)]` instead of overflowing the viewport.
- MUST NOT darken or black out the chart behind the dialog: no near-opaque full-viewport scrim, no blur that makes the drawing unreadable while adjusting it. The chart stays visible so the change can be judged.
- Consistent labels and close behavior: same wording for Color/Opacity/Width/Line/Dot, same `Field`/`FieldLabel` association, and `X`, `Esc`, outside click all close. Return focus to the control that opened the dialog (`returnFocusId`).

**Draft + Save is mandatory (MUST).** Every chart tool and indicator settings dialog is draft-based — there are no exceptions. All edits stay in a local draft; only `Save` commits, through the existing instance-update → persist path.

- `Cancel`, the `X` close button, `Esc` and outside click MUST all discard the draft and leave the stored object unchanged.
- Live or per-keystroke committing in a tool or indicator settings dialog is explicitly non-conforming.
- A draft may sanitize values on blur/`Enter`, but sanitizing MUST NOT write to storage.

---

## Mouse & keyboard interactions

Shared behavior below applies to every drawing tool and to interactable indicators; tool-specific capabilities may differ but these MUST NOT.

| Action | Required behavior |
|--------|-------------------|
| Single click | Selects the object (tool selection helpers in `src/market/drawingSelection.ts`, `apply*Selection` per tool) |
| Double click | Opens that object's settings, resolved by `src/market/chartObjectSettingsHitTest.ts` and `src/market/chartObjectSettingsPanePointer.ts`; new objects MUST extend `ChartObjectSettingsTarget` (`src/market/chartObjectSettingsTypes.ts`) so the header gear and double-click open the same dialog |
| Drag body | Moves the object when the tool supports moving and the object is unlocked |
| Drag handle | Resizes / adjusts endpoints, corners or anchors where the tool supports handles |
| Empty chart space | Deselects |
| `Esc` | Cancels the active create/resize/move operation and discards the draft; the current selection is kept |
| `Delete` / `Backspace` | Deletes the selected object when it is unlocked; MUST be ignored while focus is in a form control (`isEditableKeyboardTarget`, `isRectangleKeyboardFocusOnOutsideControl`) |
| Lock | Object stays visible; MUST NOT be moved, resized or deleted on the chart. Lock is a geometry/ownership guard, so style settings and the header object list stay reachable (`isChartObjectLocked` / `setChartObjectLocked`, and per-instance guards such as `isRectangleInstanceTransformable`, `isLineInstanceTransformable`, `isAnchoredVwapInstanceLocked`); deleting a locked object from the header object list is the deliberate recovery path, the on-chart `Delete`/`Backspace` shortcut is not |
| Hide | Object stops rendering but is kept in storage, and can be shown, unlocked, re-styled or deleted (`isChartObjectHidden` / `setChartObjectHidden`; FRVP and rolling VWAP use the instance `enabled` flag) |

**Keyboard ownership (MUST).** Exactly one panel handles drawing shortcuts at a time — `src/market/rectangleKeyboardScope.ts` (`claimRectangleKeyboardPanel` / `isActiveRectangleKeyboardPanel`). New tools MUST gate their `keydown` handler on the same active-panel check rather than adding an unscoped global listener.

**Chart navigation (MUST).** Pan/zoom works normally whenever the pointer is not interacting with a drawing. Navigation locking comes from the interaction modules (`isRectangleChartNavigationLocked`, `isLineChartNavigationLocked`, `isFixedRangeVolumeProfileChartNavigationLocked`, `isAnchoredVwapDrawingNavigationLocked`) applied through `src/market/chartDrawingInteractionMode.ts`. Hit resolution across overlapping objects MUST go through `src/market/drawingPointerArbitration.ts` (`preferDrawingPointerTarget`, `preferDrawingPointerTargetAmongPeers`, `*HitAtPanePoint`) and peer selection release through `src/market/drawingSelection.ts`; do not attach competing pane pointer handlers for a new tool.

**Feedback (MUST).** Selection outline and drag preview come from the shared per-tool render geometry and handle lists, so selection looks the same across tools. No tool currently changes the pointer cursor or paints a hover highlight; if that is added it MUST be one shared mechanism gated by the same active-panel check, not a tool-only visual language. New tools MUST render selection/handles through the same pattern instead of a tool-only visual language.

---

## Defaults & persistence

- New tools/indicators start from the grayscale role defaults above (semantic colors excepted, see Defaults) and behave identically for the shared controls (same color popover, same 0–100% opacity, same 1–4px widths, same Line/Dot semantics).
- Shared controls MUST sanitize stored values on load (for example `sanitizeLineChartStrokeStyle`, `sanitizeMarketStyleOpacityPercent`, per-instance sanitizers) so legacy or hand-edited storage cannot render an invalid style.
- Settings persist per applicable widget instance / chart object, keyed by the panel instance id, and MUST survive reloads:
  - Instance records: `src/market/rectangleInstances.ts`, `lineInstances.ts`, `fixedRangeVolumeProfileInstances.ts`, `rollingVwapInstances.ts`, `anchoredVwapInstances.ts`.
  - Storage modules + keys: `src/rectangleInstancesStorage.ts` (`0xdeck-widget-rectangle-instances`), `src/lineInstancesStorage.ts` (`0xdeck-widget-line-instances`), `src/fixedRangeVolumeProfileInstancesStorage.ts` (`0xdeck-widget-fixed-range-vp-instances`), `src/rollingVwapInstancesStorage.ts` (`0xdeck-widget-rolling-vwap-instances`), `src/anchoredVwapInstancesStorage.ts` (`0xdeck-widget-anchored-vwap-instances`).
  - Indicator style/levels and indicator settings: `src/marketIndicatorPresentationStorage.ts` (`0xdeck-widget-market-indicator-presentation`), `src/marketRsiSettingsStorage.ts` (`0xdeck-widget-market-rsi-settings`), `src/liquidationsSettingsStorage.ts` (`0xdeck-widget-liquidations-settings`).
- A setting change MUST be written through the existing instance update path (patch instance → persist) so header menu, dialog and on-chart state stay in sync.

---

## Reference components (do not duplicate)

| Concern | Use |
|---------|-----|
| Color + opacity (+ Line/Dot) popover | `src/widgetSettings/ColorOpacityField.tsx`, `src/widgetSettings/colorPickerPalette.ts` |
| Stroke width select | `src/widgetSettings/LineChartStrokeSelectFields.tsx`, `src/market/lineChartStroke.ts` |
| Object row (hide / lock / settings / delete) | `src/widgetSettings/ChartObjectListRow.tsx` (used by `HeaderIndicatorsMenu.tsx`, `HeaderToolsMenu.tsx`) |
| Palette + role defaults + opacity folding | `src/market/marketStylePalette.ts` |
| Hidden / locked flags | `src/market/chartObjectState.ts` |
| Cross-tool selection & pointer arbitration | `src/market/drawingSelection.ts`, `src/market/drawingPointerArbitration.ts` |
| Settings target + hit test + pane double-click | `src/market/chartObjectSettingsTypes.ts`, `chartObjectSettingsHitTest.ts`, `chartObjectSettingsPanePointer.ts` |
| Keyboard ownership | `src/market/rectangleKeyboardScope.ts` |
| Navigation lock application | `src/market/chartDrawingInteractionMode.ts` |
| Per-tool interactions | `rectangleInteraction.ts`, `lineInteraction.ts`, `fixedRangeVolumeProfileInteraction.ts`, `anchoredVwapDrawingInteraction.ts` |
| Settings dialogs | `src/widgetSettings/LineStyleDialog.tsx`, `RectangleFillStyleDialog.tsx`, `MarketIndicatorStyleDialog.tsx`, `FixedRangeVolumeProfileSettingsDialog.tsx`, `src/market/RollingVwapSettingsDialog.tsx`, `src/market/AnchoredVwapSettingsDialog.tsx`, `src/market/AggregatedLiquidationsSettingsDialog.tsx`, `src/components/ui/dialog.tsx` |
| Dialog width/spacing + non-blackout overlay | `src/widgetSettings/chartSettingsDialogLayout.ts` (`CHART_SETTINGS_DIALOG_CONTENT_CLASS`, `CHART_SETTINGS_DIALOG_OVERLAY_CLASS`, `CHART_SETTINGS_DIALOG_BODY_CLASS`) |
| Dialog draft/diff/sanitize logic | `src/widgetSettings/lineStyleDraft.ts`, `rectangleFillStyleDraft.ts`, `marketIndicatorStyleDraft.ts`, `fixedRangeVolumeProfileSettingsDraft.ts`, `src/market/aggregatedLiquidationsSettingsDraft.ts` |
