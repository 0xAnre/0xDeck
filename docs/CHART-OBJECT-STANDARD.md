# Chart Tool & Indicator Standard (normative)

Rules for BTC Perp chart tools, indicators and their settings (`src/market/`, `src/widgetSettings/`). They exist so new tools reuse the shared components and interaction modules instead of growing a second picker, a second width control or a second pointer path. Widget-level rules stay in [WIDGET-STANDARD.md](./WIDGET-STANDARD.md).

`MUST` = required for new or changed chart-tool work. `SHOULD` = deviate only with a recorded reason.

---

## Appearance & settings

**One color control (MUST).** Every color input uses `ColorOpacityField` (`src/widgetSettings/ColorOpacityField.tsx`) with palette, HEX normalization, opacity normalization and preview geometry from `src/widgetSettings/colorPickerPalette.ts`. Never add a bespoke picker, a raw `<input type="color">`, or a private swatch grid.

- Color and opacity are one control: pass `color` + `opacityPercent` together and emit 0–100 integer percentages; a color field without opacity is not the standard.
- The `Line`/`Dot` row (`lineStyle` + `onLineStyleChange`) is added only where the object's stroke style is user-selectable; use `lineStyleMixed` for indeterminate multi-series state instead of picking a series value. Fills, backgrounds and band/level strokes that have no persisted line-style value (rect fill, FRVP histogram, VWAP band fill) MUST omit the style row. Rolling VWAP band styles are per band (independent `solid`/`dotted`), matching their per-band color and opacity.
- Fills and backgrounds MUST use this same Color + Opacity control wherever the tool supports them.

**Separate fill control (MUST).** Any chart object that renders a configurable fill or background MUST expose a separate `Background` / `Fill` Color + Opacity setting through `ColorOpacityField` — one color + opacity pair, with no `Line`/`Dot` row and no width control. The fill setting is independent of the object's stroke color/opacity/width/style settings, persists per widget instance / chart object, and starts from **that object's own default** — there is no single universal fill default, see *Background / fill defaults per object* below. `0%` opacity means no visible fill. Examples: rectangle fill, Anchored VWAP band fill, FRVP histogram bars, time-based VWAP band background. Objects without a fill MUST NOT gain one just to satisfy this rule, and fixed semantic colors (candles, position markers, Aggregated Liquidations, plus the RSI threshold pair in `rsiLineColors.ts` — documented under Defaults) stay out of user fill styling.

**Background / fill defaults per object.** The shared palette fill role (`MARKET_STYLE_DEFAULTS.fill` = `MARKET_STYLE_PALETTE.medium` `#A3A3A3` @ `MARKET_STYLE_OPACITY_PERCENT.fill` = 25%) is the default for rectangle fill and time-based VWAP band background only. Each other fill-owning object has its own intentional default:

| Object | Default background / fill |
|--------|---------------------------|
| Rectangle fill (`readRectangleFillStyle` in `rectangleColors.ts`, from `DEFAULT_RECTANGLE_FILL_HEX` / `DEFAULT_RECTANGLE_FILL_OPACITY_PERCENT`) | palette fill role: `#A3A3A3` @ 25% |
| Time-based (daily/weekly/monthly/quarterly/yearly) VWAP band background (`MARKET_INDICATOR_BAND_FILL_IDS` in `indicators.ts`; `resolveSessionVwapBandFillStyle` in `sessionVwapBandFillStyle.ts`) | the same palette fill role, `#A3A3A3` @ 25% (it reuses `readRectangleFillStyle`) |
| Anchored VWAP band fill (`defaultBandPair` in `anchoredVwapDrawingSettings.ts`) | the same fill color (`MARKET_STYLE_DEFAULTS.fill.color`) with `fillOpacity: 0` — off by default |
| FRVP histogram bars (`frvpHistogramStyles.ts`, `fixedRangeVolumeProfileRenderGeometry.ts`) | candle up/down colors (`FRVP_HISTOGRAM_DEFAULT_UP_COLOR` = `#DBDBDB`, `FRVP_HISTOGRAM_DEFAULT_DOWN_COLOR` = `#808080`) at `FRVP_HISTOGRAM_DEFAULT_OPACITY_PERCENT` = 50% configured opacity, drawn at `FRVP_VALUE_AREA_ROW_OPACITY_PERCENT` = 55% of it inside and `FRVP_OUTSIDE_VALUE_AREA_ROW_OPACITY_PERCENT` = 25% of it outside the Value Area (alpha 0.275 / 0.125 at the default); the configured percent is the Value-Area ceiling, not the rendered row alpha |
| Rolling VWAP bands (`rollingVwapSettings.ts`, `rollingVwapChartSeries.ts`) | no band fill at all and no fill setting; its Info Box was removed in #175 |

These per-object differences are intentional (W7): MUST NOT be flattened by copying the palette fill role onto an object with a different default, and an object without a fill MUST NOT gain one. This does not change the per-band Rolling VWAP `solid`/`dotted` styles or the `Line`/`Dot` omit list above.

**One width control (MUST).** Stroke width comes from `LineChartStrokeSelectFields` (`src/widgetSettings/LineChartStrokeSelectFields.tsx`) over `LINE_CHART_STROKE_WIDTHS` in `src/market/lineChartStroke.ts` (1–4px, `DEFAULT_LINE_CHART_STROKE_WIDTH`). Do not introduce a competing width toggle or width range.

**Defaults (MUST).** Starting styles come from `src/market/marketStylePalette.ts`: `MARKET_STYLE_PALETTE`, `MARKET_STYLE_OPACITY_PERCENT` (`full` / `secondary` / `fill`) and `marketStyleRoleDefault(role)`; multi-series lines use `MARKET_STYLE_MULTI_LINE_SHADES` / `MARKET_STYLE_DUAL_LINE_SHADES`, volatility bands use `MARKET_STYLE_ROLLING_BAND_SHADES`. Feature files MUST NOT declare new hex literals — import palette values. Semantic colors that carry meaning are an explicit exception to the grayscale defaults; the shared pair is defined once in `marketSemanticColors.ts` (`#22C55E` positive/buy/short-liquidation, `#EF4444` negative/sell/long-liquidation, identical in every theme). The exceptions are candle up/down (`btcPerpetualCandleColors.ts`), buy/sell position markers (`positionMarkers.ts`), Aggregated Liquidations (`aggregatedLiquidationsColors.ts` — `LIQUIDATION_LONG_COLOR` = `#EF4444` for long liquidations, `LIQUIDATION_SHORT_COLOR` = `#22C55E` for short liquidations) and RSI threshold colors (`rsiLineColors.ts` — the same fixed pair as markers and liquidations). These MUST NOT be neutralized to grayscale and are not user-facing neutral starting styles. The RSI threshold glow reuses those colors at a fixed opacity behind a visibility toggle, not a user color picker. RSI level price lines (overbought/mid/oversold) use internal `dashed` chrome, are not user-configurable, and are outside the `Line`/`Dot` vocabulary.

**Settings dialogs (MUST).**

- Use the shadcn `Dialog` in `src/components/ui/dialog.tsx`; do not build a parallel modal/popover shell.
- Preserve the shared structure, required for every chart tool and indicator settings dialog: `DialogHeader` (`DialogTitle` + `DialogDescription` naming the object) → grouped, labelled body sections → `DialogFooter` with required `Save`/`Cancel`. `FieldGroup`/`Field` + `FieldLabel` is the preferred labelling mechanism where the control is a form field; a labelled `<section>` group is the accepted body form where the controls are not form fields.
- Spacious and responsive: SHOULD share one width and spacing scale wider than the shadcn default `sm:max-w-sm`, with grouped sections and consistent gaps; the body MUST scroll inside `max-h-[calc(100dvh-2rem)]` instead of overflowing the viewport.
- MUST NOT darken or black out the chart behind the dialog: no near-opaque full-viewport scrim, no blur that makes the drawing unreadable while adjusting it. The overlay stays transparent and unblurred so the chart remains readable while drafting; `Save` applies the change so it can be judged on the chart. This is not a live preview.
- Consistent labels and close behavior: same wording for Color/Opacity/Width/Line/Dot, same `Field`/`FieldLabel` association, and `X`, `Esc`, outside click all close. `DialogDescription` identifies the concrete object/instance, not only the tool kind, where the dialog has one (for example `formatLineInstanceLabel`). Return focus to the control that opened the dialog (`returnFocusId`).
- Nested modal controls (`Select`, modal dropdown) close only themselves: an in-dialog press MUST NOT dismiss the dialog or click through to the control underneath. Shared `src/components/ui/dialog.tsx` `DialogContent` handles this once; do not add per-dialog outside-click handlers.

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
| Double click | Opens that object's settings, resolved by `src/market/chartObjectSettingsHitTest.ts` and `src/market/chartObjectSettingsPanePointer.ts`; new objects MUST extend `ChartObjectSettingsTarget` (`src/market/chartObjectSettingsTypes.ts`) so the header gear and double-click open the same dialog. The handler binds to every pane element that owns an object (candle pane, RSI pane, Aggregated Liquidations pane) and follows it when panes are added, removed or reordered (`src/market/chartPaneRoles.ts`) |
| Drag body | Moves the object when the tool supports moving and the object is unlocked |
| Drag handle | Resizes / adjusts endpoints, corners or anchors where the tool supports handles |
| Empty chart space | Deselects every tool through `clearDrawingSelections` (`src/market/drawingSelection.ts`); it applies to the RSI and Aggregated Liquidations panes as well (`src/market/drawingPaneDeselect.ts`) and never creates, moves or cancels an armed drawing |
| `Esc` | Cancels the active create/resize/move operation and discards the draft; the current selection is kept |
| `Delete` / `Backspace` | Deletes the selected object when it is unlocked; MUST be ignored while focus is in a form control (`isEditableKeyboardTarget`, `isRectangleKeyboardFocusOnOutsideControl`) |
| Lock | Object stays visible; MUST NOT be moved, resized or deleted on the chart. Lock is a geometry/ownership guard, so style settings and the header object list stay reachable (`isChartObjectLocked` / `setChartObjectLocked`, and per-instance guards such as `isRectangleInstanceTransformable`, `isLineInstanceTransformable`, `isAnchoredVwapInstanceLocked`); deleting a locked object from the header object list is the deliberate recovery path, the on-chart `Delete`/`Backspace` shortcut is not |
| Hide | Object stops rendering but is kept in storage, and can be shown, unlocked, re-styled or deleted (`isChartObjectHidden` / `setChartObjectHidden`; FRVP and rolling VWAP use the instance `enabled` flag) |

**Keyboard ownership (MUST).** Exactly one panel handles drawing shortcuts at a time — `src/market/rectangleKeyboardScope.ts` (`claimRectangleKeyboardPanel` / `isActiveRectangleKeyboardPanel`). New tools MUST gate their `keydown` handler on the same active-panel check rather than adding an unscoped global listener.

**Chart navigation (MUST).** Pan/zoom works normally whenever the pointer is not interacting with a drawing. Navigation locking comes from the interaction modules (`isRectangleChartNavigationLocked`, `isLineChartNavigationLocked`, `isFixedRangeVolumeProfileChartNavigationLocked`, `isAnchoredVwapDrawingNavigationLocked`) applied through `src/market/chartDrawingInteractionMode.ts`. Hit resolution across overlapping objects MUST go through `src/market/drawingPointerArbitration.ts` (`preferDrawingPointerTarget`, `preferDrawingPointerTargetAmongPeers`, `*HitAtPanePoint`) and peer selection release through `src/market/drawingSelection.ts`; do not attach competing pane pointer handlers for a new tool.

**Feedback (MUST).** Selection outline and drag preview come from the shared per-tool render geometry and handle lists, so selection looks the same across tools. The hover cursor is likewise one shared mapping: `src/market/drawingCursor.ts` (`resolveDrawingCursor`, `updateDrawingCursor`) maps a hit target to a CSS cursor — `move` for a draggable body, `pointer` for a selectable/locked body, `nwse-resize`/`nesw-resize`/`ns-resize`/`ew-resize` for resize handles, `crosshair`/`grab` for line endpoints and VWAP anchors, `default` for empty pane space and hidden objects. Each tool only feeds the hit target it won through `preferDrawingPointerTargetAmongPeers`; the pane cursor returns to `default` on pointer leave, while a draft/drag is active and after pointer up/cancel. New tools MUST reuse this mapping and render selection/handles through the same pattern instead of a tool-only visual language.

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
| Pane element registry (candle / RSI / liquidations) | `src/market/chartPaneRoles.ts`, `src/market/candlePane.ts` |
| Hover cursor mapping | `src/market/drawingCursor.ts` (`resolveDrawingCursor`, `updateDrawingCursor`) |
| Empty-space deselect on non-candle panes | `src/market/drawingPaneDeselect.ts` |
| Keyboard ownership | `src/market/rectangleKeyboardScope.ts` |
| Navigation lock application | `src/market/chartDrawingInteractionMode.ts` |
| Per-tool interactions | `rectangleInteraction.ts`, `lineInteraction.ts`, `fixedRangeVolumeProfileInteraction.ts`, `anchoredVwapDrawingInteraction.ts` |
| Settings dialogs | `src/widgetSettings/LineStyleDialog.tsx`, `RectangleFillStyleDialog.tsx`, `MarketIndicatorStyleDialog.tsx`, `FixedRangeVolumeProfileSettingsDialog.tsx`, `src/market/RollingVwapSettingsDialog.tsx`, `src/market/AnchoredVwapSettingsDialog.tsx`, `src/market/AggregatedLiquidationsSettingsDialog.tsx`, `src/components/ui/dialog.tsx` |
| Dialog width/spacing + non-blackout overlay | `src/widgetSettings/chartSettingsDialogLayout.ts` (`CHART_SETTINGS_DIALOG_CONTENT_CLASS`, `CHART_SETTINGS_DIALOG_OVERLAY_CLASS`, `CHART_SETTINGS_DIALOG_BODY_CLASS`) |
| Dialog draft/diff/sanitize logic | `src/widgetSettings/lineStyleDraft.ts`, `rectangleFillStyleDraft.ts`, `marketIndicatorStyleDraft.ts`, `fixedRangeVolumeProfileSettingsDraft.ts`, `src/market/aggregatedLiquidationsSettingsDraft.ts` |
