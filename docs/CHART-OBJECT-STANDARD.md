# Chart Tool & Indicator Standard (normative)

Rules for BTC Perp chart tools, indicators and their settings (`src/market/`, `src/widgetSettings/`). They exist so new tools reuse the shared components and interaction modules instead of growing a second picker, a second width control or a second pointer path. Widget-level rules stay in [WIDGET-STANDARD.md](./WIDGET-STANDARD.md).

`MUST` = required for new or changed chart-tool work. `SHOULD` = deviate only with a recorded reason. A requirement that is not met by the current code is a **conformance gap** ([Known conformance gaps](#known-conformance-gaps)), not an exception: an exception needs a recorded technical or functional justification plus its consequence.

---

## Capability matrix by object type (MUST)

Every chart object in `src/market/` + `src/widgetSettings/` belongs to exactly one of four categories. The category decides which capabilities the object MUST expose; an applicable capability that a new object omits is a conformance gap.

| Category | Color | Opacity | Width | Solid / dotted (`Line` / `Dot`) | Fill / background |
|----------|-------|---------|-------|-------------------------------|-------------------|
| **Line-type** — indicator lines, EMA/VWAP series, drawing lines, VWAP anchors, level lines | MUST | MUST | MUST | MUST | Only if the object renders a fill; then through the separate fill control below |
| **Bands** — time-based VWAP bands, Anchored VWAP bands, Rolling VWAP volatility bands | MUST, **per band** when the object has more than one | MUST, per band | MUST, per band | MUST, per band | Only if the object renders a fill; then per band |
| **Background / fill** — rectangle fill, band fills, FRVP histogram | MUST | MUST | Forbidden | Forbidden | This *is* the fill; keeps its own color + opacity pair |
| **Fixed / semantic** — candles, position markers, Aggregated Liquidations bars, RSI threshold colors, current price line | Forbidden | Forbidden | Forbidden | Forbidden | Forbidden |

Granularity means "what the user can style independently", not the number of rendered series: a band pair that renders an upper and a lower line may share width and `Line`/`Dot` at pair level as long as each line keeps its own color and opacity, but it MUST NOT collapse into a single chart-wide record. Multi-series line *groups* (3 EMA, 2 EMA) intentionally expose one control set for the whole group and MUST say so in the dialog (`MarketIndicatorStyleDialog` "Chart lines" note, `lineStyleMixed`).

| Object (today) | Category | Capabilities exposed | Style source | Settings surface |
|----------------|----------|----------------------|--------------|------------------|
| Line drawing (`line-*`) | Line-type | Color, Opacity, Width, Line/Dot | `src/market/lineInstances.ts`, `src/market/lineColors.ts` | `src/widgetSettings/LineStyleDialog.tsx` |
| Rectangle / box (`rect-*`) | Background / fill | Color, Opacity | `src/market/rectangleInstances.ts`, `src/market/rectangleColors.ts` | `src/widgetSettings/RectangleFillStyleDialog.tsx` |
| FRVP histogram bars (up / down) | Background / fill | Color, Opacity per direction | `src/market/frvpHistogramStyles.ts` | `src/widgetSettings/FixedRangeVolumeProfileSettingsDialog.tsx` |
| FRVP level lines (point of control, value-area high/low) | Line-type | Color, Opacity, Width, Line/Dot per level | `src/market/frvpInstanceLineStyles.ts`, `src/market/frvpLevelLineColors.ts` | `src/widgetSettings/FixedRangeVolumeProfileSettingsDialog.tsx` |
| Anchored VWAP center line | Line-type | Color, Opacity, Width, Line/Dot | `src/market/anchoredVwapDrawingSettings.ts` (`vwapLine`) | `src/market/AnchoredVwapSettingsDialog.tsx` |
| Anchored VWAP band pairs ×3 (upper / lower) | Bands | Color + Opacity per line, Width + Line/Dot per pair | `src/market/anchoredVwapDrawingSettings.ts` (`band1`–`band3`) | `src/market/AnchoredVwapSettingsDialog.tsx` |
| Anchored VWAP band fill (per pair) | Background / fill | Color, Opacity per pair | `src/market/anchoredVwapBandFillSeriesPrimitive.ts` | `src/market/AnchoredVwapSettingsDialog.tsx` |
| Rolling VWAP center line | Line-type | Color, Opacity, Line/Dot per instance; Width shared by the instance | `src/market/rollingVwapSettings.ts`, `src/market/rollingVwapChartSeries.ts` | `src/market/RollingVwapSettingsDialog.tsx` |
| Rolling VWAP deviation bands ×3 | Bands | Color, Opacity, Line/Dot per band; Width shared by the instance (gap G1) | `src/market/rollingVwapSettings.ts` (`bandColors`, `bandOpacities`, `bandLineStyles`, `lineWidth`) | `src/market/RollingVwapSettingsDialog.tsx` |
| Time-based VWAP (daily, weekly, monthly, quarterly, yearly): center line + previous-session band lines | Bands | One Color/Opacity/Width/Line-Dot record shared by the center line and both band lines (gap G2) | `src/market/sessionVwapChartSeries.ts`, `src/market/vwapChartLineStyles.ts`, `src/marketIndicatorPresentationStorage.ts` | `src/widgetSettings/MarketIndicatorStyleDialog.tsx` |
| Time-based VWAP band background | Background / fill | Color, Opacity (independent from the line record) | `src/market/sessionVwapBandFillStyle.ts`, `src/market/sessionVwapBandSeriesPrimitive.ts` | `src/widgetSettings/MarketIndicatorStyleDialog.tsx` "Background" |
| 3 EMA / 2 EMA | Line-type (group) | Color, Opacity, Width, Line/Dot for the group | `src/market/marketIndicatorSeriesColors.ts`, `src/market/marketStylePalette.ts` (`MARKET_STYLE_MULTI_LINE_SHADES`, `MARKET_STYLE_DUAL_LINE_SHADES`) | `src/widgetSettings/MarketIndicatorStyleDialog.tsx` |
| RSI line (+ period, overbought/oversold, threshold glow) | Line-type | Color, Opacity, Width, Line/Dot; range fields are non-style settings | `src/marketIndicatorPresentationStorage.ts`, `src/market/rsi.ts` | `src/widgetSettings/MarketIndicatorStyleDialog.tsx`, `src/market/rsiChartPane.ts` |
| Candles | Fixed / semantic | None — theme-resolved up/down tokens | `src/market/btcPerpetualCandleColors.ts` | — |
| Position markers | Fixed / semantic | None — fixed buy/sell pair (visibility toggle only) | `src/market/positionMarkers.ts`, `src/market/marketSemanticColors.ts` | Indicators menu toggle |
| Aggregated Liquidations bars | Fixed / semantic | None — fixed long/short pair; only source and pane position are settings | `src/market/aggregatedLiquidationsColors.ts`, `src/market/aggregatedLiquidationsSettings.ts` | `src/market/AggregatedLiquidationsSettingsDialog.tsx` |
| RSI threshold colors + glow | Fixed / semantic | None — fixed semantic pair, glow is a visibility toggle | `src/market/rsiLineColors.ts`, `src/market/rsi.ts` (`thresholdGlow`) | `src/widgetSettings/MarketIndicatorStyleDialog.tsx` |
| Current price line | Fixed / semantic | None — theme foreground @ 50%, dashed, 1px | `src/market/btcPerpetualCurrentPriceLineOptions.ts` | — |
| Selection outlines, handles, hover chrome | Fixed / semantic | None — shared geometry/`drawingCursor`, fixed handle alpha (chart chrome, never user-styled) | `src/market/lineColors.ts` (`LINE_HANDLE_FILL_OPACITY`), `src/market/rectangleColors.ts` (`RECTANGLE_HANDLE_FILL_OPACITY`), `src/market/drawingCursor.ts` | — |

**Why fixed / semantic objects stay out of user styling (MUST).** Their color carries meaning, not preference: candle direction, buy/sell and long/short side, and RSI threshold state must read the same in every theme and every panel, and the current price line is a chart-wide reference whose label the chart auto-derives from its color. Giving them a user color would either break the meaning (a green "long liquidation") or desynchronize the auto-contrast label. They MUST NOT gain a color, opacity, width, style or fill control; they MAY have a visibility toggle (`Position Markers`, `Threshold Glow`, event toggles).

**No new category (MUST).** A new chart object reuses one of these four categories. If it genuinely needs a fifth (for example a new fixed semantic accent), update this matrix in the same PR and state the reason; do not invent an object type with a partial set of capabilities.

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

**Settings dialogs (MUST).** Every chart tool and indicator settings dialog follows the contract in [Settings dialogs](#settings-dialogs-must): one shell, one width scale, a transparent non-blackout overlay, one label vocabulary and draft → `Save` semantics. Do not build a second modal/popover shell, a second spacing scale or a live-commit dialog.

---

## Color picker (shared control + dismissal contract)

**One control (MUST).** `ColorOpacityField` (`src/widgetSettings/ColorOpacityField.tsx`) over `src/widgetSettings/colorPickerPalette.ts` is the only color input for chart objects; opacity and color are one pair, and the 0–100 integer percentage is the persisted unit. The popover contains the palette grid, the optional `Custom HEX` form (`normalizeColorPickerHexInput`, invalid input shows a `FieldError` and commits nothing) and the opacity slider (`normalizeColorPickerOpacityPercent`). The `Line` / `Dot` row renders only when `onLineStyleChange` is passed, so fills never get a style row.

**Dismissal contract (MUST).** Verified against the implementation; a new color surface MUST behave the same way.

| Interaction | Behavior | Implemented by |
|-------------|----------|----------------|
| Swatch click | Applies the color immediately to the caller's draft; the popover stays open so color + opacity can be tuned together | `ColorOpacityField` `onColorChange` |
| Custom HEX (`Set`, `Enter` or blur) | Normalizes and applies; invalid hex highlights the field and applies nothing | `ColorOpacityField` `commitCustomInput` |
| Opacity slider | Applies immediately, integer 0–100 | `ColorOpacityField` + `normalizeColorPickerOpacityPercent` |
| Trigger press | Toggles the popover open/closed — this is the in-place close affordance; the popover has no separate close or `Cancel` button | `PopoverTrigger` (`src/components/ui/popover.tsx`) |
| Outside press | Closes **only** the popover; the surrounding dialog stays open | Radix `usePointerDownOutside` in `@radix-ui/react-dismissable-layer` |
| `Esc` | Closes **only** the popover (first `Esc`), because only the highest dismissable layer handles `Esc`; the dialog and its draft survive. A second `Esc` closes the dialog and discards the draft | Radix `DismissableLayer` (`isHighestLayer` escape handler) + `src/components/ui/dialog.tsx` |
| Commit vs discard | The popover never writes storage: it edits the dialog draft. Dismissing the popover keeps the edited draft; only the dialog decides (see [Settings dialogs](#settings-dialogs-must)) | `ColorOpacityField` + `*Draft` modules |
| No click-through | The popover is portaled above the dialog; the dialog overlay is transparent but still receives pointer events, so a dismissing press can never reach the chart and create/move an object. Modal `Select`s inside a dialog are absorbed once by `isPointInsideDialogPanel` (`src/lib/dialogOutsideClick.ts`) | `src/components/ui/dialog.tsx` |

**Where it may appear (MUST).** Only inside a chart settings dialog (today: `LineStyleDialog`, `RectangleFillStyleDialog`, `MarketIndicatorStyleDialog`, `FixedRangeVolumeProfileSettingsDialog`, `RollingVwapSettingsDialog`, `AnchoredVwapSettingsDialog`). Adding the popover to a header menu would need its own verified no-click-through story; do not assume the dialog contract transfers.

---

## Settings dialogs (MUST)

One shell and one vocabulary, so a tool dialog and an indicator dialog are interchangeable for the user.

- **Shell.** Use the shadcn `Dialog` in `src/components/ui/dialog.tsx`; never a parallel modal/popover shell.
- **Structure.** `DialogHeader` (`DialogTitle` + `DialogDescription`) → grouped, labelled body sections → `DialogFooter` with required `Save`/`Cancel`. `FieldGroup`/`Field` + `FieldLabel` is the preferred labelling where the control is a form field; a labelled `<section>` group is the accepted body form where the controls are not form fields (used by the Rolling VWAP, Anchored VWAP and Aggregated Liquidations dialogs).
- **Width and spacing.** Pass `CHART_SETTINGS_DIALOG_CONTENT_CLASS` and `CHART_SETTINGS_DIALOG_BODY_CLASS` from `src/widgetSettings/chartSettingsDialogLayout.ts`. Those constants are the only width/spacing scale (wider than the shadcn default `sm:max-w-sm`, viewport-capped by `max-h-[calc(100dvh-2rem)]`); the body scrolls inside the dialog while header and footer stay pinned. Do not hardcode a per-dialog width.
- **Overlay.** Pass `CHART_SETTINGS_DIALOG_OVERLAY_CLASS`: the chart MUST stay readable while editing — no near-opaque scrim and no blur. The overlay is transparent but still intercepts pointer events, which is what makes "no click-through" true.
- **Labels.** Same wording everywhere: `Color`, `Opacity`, `Width`, `Line` / `Dot`, `Fill` / `Background`, `Cancel`, `Save`. `DialogDescription` names the concrete object/instance where the dialog has one (`formatLineInstanceLabel`, `formatRectangleInstanceLabel`, `formatFixedRangeVolumeProfileInstanceLabel`, `formatAnchoredVwapInstanceLabel`, `rollingVwapInstanceDisplayLabel`), not only the tool kind.
- **Open/close symmetry.** The header gear (`HeaderIndicatorsMenu.tsx`, `HeaderToolsMenu.tsx` through `ChartObjectListRow`) and the on-chart double click open the *same* dialog through one `ChartObjectSettingsTarget`; `X`, `Esc`, outside click and `Cancel` all close it; focus returns to the control that opened it (`returnFocusId` + `onCloseAutoFocus`).
- **Nested modal controls.** `Select` and other modal dropdowns close only themselves: an in-dialog press must not dismiss the dialog or click through to the control underneath. `DialogContent` handles this once (`isPointInsideDialogPanel`); do not add per-dialog outside-click handlers.

**Draft + Save is mandatory (MUST).** Every chart tool and indicator settings dialog is draft-based — there are no exceptions. All edits stay in a local draft; only `Save` commits, through the existing instance-update → persist path.

- `Cancel`, the `X` close button, `Esc` and outside click MUST all discard the draft and leave the stored object unchanged.
- Live or per-keystroke committing in a tool or indicator settings dialog is explicitly non-conforming.
- A draft may sanitize values on blur/`Enter`, but sanitizing MUST NOT write to storage.

---

## Mouse & keyboard interactions

Shared behavior below applies to every drawing tool and to interactable indicators. One action has exactly one meaning on every tool, pane and indicator; tool-specific extra capabilities may differ, but these MUST NOT.

| Action | Required behavior |
|--------|-------------------|
| Single click | Selects the object under the pointer and releases every other tool's selection. Selection is a pure state change: it never creates, moves or cancels a drawing. Shared helpers: `applyRectangleSelection` / `applyLineSelection` / `applyFixedRangeVolumeProfileSelection` / `applyAnchoredVwapDrawingSelection`, arbitrated by `preferDrawingPointerTargetAmongPeers` (`src/market/drawingPointerArbitration.ts`) and released through `clear*SelectionForPeerClaim` (`src/market/drawingSelection.ts`) |
| Double click | Opens that object's settings, resolved by `src/market/chartObjectSettingsHitTest.ts` and bound per pane by `src/market/chartObjectSettingsPanePointer.ts` (native `dblclick` on the pane element). New objects MUST extend `ChartObjectSettingsTarget` (`src/market/chartObjectSettingsTypes.ts`) so the header gear and double click open the same dialog. The handler binds to every pane element that owns an object (candle pane, RSI pane, Aggregated Liquidations pane) and follows panes being added, removed or reordered (`src/market/chartPaneRoles.ts`). Locked and hidden objects keep their settings entry |
| Drag body | Moves the object when the tool supports moving and the object is unlocked |
| Drag handle | Resizes / adjusts endpoints, corners or anchors where the tool supports handles |
| Outside click (chart) | Deselects every tool through `clearDrawingSelections` (`src/market/drawingSelection.ts`); it applies to the RSI and Aggregated Liquidations panes as well (`src/market/drawingPaneDeselect.ts`) and never creates, moves or cancels an armed drawing |
| Outside click (settings surface) | Dismisses only the topmost surface and discards its draft: a press outside the settings dialog closes it (`DialogContent` outside pointer-down), a press outside an open color popover closes only the popover and keeps the dialog. The press never reaches the chart or the control underneath (transparent-but-interactive overlay, `isPointInsideDialogPanel` for nested modal `Select`s) |
| `Esc` | Cancels the active create/resize/move operation and discards the draft, keeping the current selection (`cancel*Interaction` in `rectangleInteraction.ts`, `lineInteraction.ts`, `fixedRangeVolumeProfileInteraction.ts`, `anchoredVwapDrawingInteraction.ts`). Inside a dialog it closes the dialog (discarding the draft); while a color popover is open the first `Esc` closes only the popover |
| `Delete` / `Backspace` | Deletes the selected object when it is unlocked; MUST be ignored while focus is in a form control (`isEditableKeyboardTarget`, `isRectangleKeyboardFocusOnOutsideControl`) |
| Lock | Object stays visible; MUST NOT be moved, resized or deleted on the chart. Lock is a geometry/ownership guard, so style settings and the header object list stay reachable (`isChartObjectLocked` / `setChartObjectLocked`, and per-instance guards such as `isRectangleInstanceTransformable`, `isLineInstanceTransformable`, `isAnchoredVwapInstanceLocked`); deleting a locked object from the header object list is the deliberate recovery path, the on-chart `Delete`/`Backspace` shortcut is not |
| Hide | Object stops rendering but is kept in storage, and can be shown, unlocked, re-styled or deleted (`isChartObjectHidden` / `setChartObjectHidden`; FRVP and rolling VWAP use the instance `enabled` flag) |

**Overlay indicators (current behavior, tracked as gap G3).** An overlay indicator has no geometry of its own, so it participates only in double click (settings); it has no selection state, drag, handle, on-chart delete or `Lock`. That interaction difference from drawing tools is a recorded gap, not a free choice — see [Known conformance gaps](#known-conformance-gaps). New overlay objects MUST at minimum implement the double-click settings entry through the shared hit test and pane binding.

**Keyboard ownership (MUST).** Exactly one panel handles drawing shortcuts at a time — `src/market/rectangleKeyboardScope.ts` (`claimRectangleKeyboardPanel` / `isActiveRectangleKeyboardPanel`). New tools MUST gate their `keydown` handler on the same active-panel check rather than adding an unscoped global listener.

**Chart navigation (MUST).** Pan/zoom works normally whenever the pointer is not interacting with a drawing. Navigation locking comes from the interaction modules (`isRectangleChartNavigationLocked`, `isLineChartNavigationLocked`, `isFixedRangeVolumeProfileChartNavigationLocked`, `isAnchoredVwapDrawingNavigationLocked`) applied through `src/market/chartDrawingInteractionMode.ts`. Hit resolution across overlapping objects MUST go through `src/market/drawingPointerArbitration.ts` (`preferDrawingPointerTarget`, `preferDrawingPointerTargetAmongPeers`, `*HitAtPanePoint`) and peer selection release through `src/market/drawingSelection.ts`; do not attach competing pane pointer handlers for a new tool.

**Feedback (MUST).** Selection outline and drag preview come from the shared per-tool render geometry and handle lists, so selection looks the same across tools. The hover cursor is likewise one shared mapping: `src/market/drawingCursor.ts` (`resolveDrawingCursor`, `updateDrawingCursor`) maps a hit target to a CSS cursor — `move` for a draggable body, `pointer` for a selectable/locked body, `nwse-resize`/`nesw-resize`/`ns-resize`/`ew-resize` for resize handles, `crosshair`/`grab` for line endpoints and VWAP anchors, `default` for empty pane space and hidden objects. Each tool only feeds the hit target it won through `preferDrawingPointerTargetAmongPeers`; the pane cursor returns to `default` on pointer leave, while a draft/drag is active and after pointer up/cancel. New tools MUST reuse this mapping and render selection/handles through the same pattern instead of a tool-only visual language.

---

## Persistence (settings MUST render and MUST survive reload)

**Both halves are required (MUST).** Every setting a user can edit MUST (a) change what is rendered on the chart and (b) come back unchanged after a reload. Two failure modes are equally non-conforming:

- **Persisted but unrendered** — the control writes storage that no render path reads (dead setting, e.g. a style written for an object kind the renderer deliberately ignores).
- **Rendered but unpersisted** — the object renders from defaults or in-memory state only, so the next reload silently loses the setting (including drafts that were never committed, or a control that only mutates local dialog state).

`0%` opacity is a valid, persisted value meaning "invisible"; it MUST NOT be treated as "unset" and MUST NOT be dropped by a sanitizer.

**Write path (MUST).** A setting change goes through the existing instance update path (patch instance → `saveWidget*` → `localStorage`) so header menu, dialog and on-chart state cannot diverge. A new setting added to a persisted record but not to that record's sanitizer is a poison pair by definition: the sanitizer would drop it on the next reload.

**Per-family storage (MUST).** These are the only storage modules for chart object settings; a new setting family needs its own row here in the same PR.

| Setting family | Storage module | Key | Sanitizer | Rendered by |
|----------------|----------------|-----|-----------|-------------|
| Rectangle geometry, lock/hidden, fill color + opacity | `src/rectangleInstancesStorage.ts` | `0xdeck-widget-rectangle-instances` | `sanitizeRectangleInstances` (`src/market/rectangleInstances.ts`) | `src/market/rectangleSeriesPrimitive.ts`, `src/market/rectangleColors.ts` |
| Line geometry, lock/hidden, stroke color/opacity/width/style | `src/lineInstancesStorage.ts` | `0xdeck-widget-line-instances` | `sanitizeLineInstances` (`src/market/lineInstances.ts`) | `src/market/lineSeriesPrimitive.ts`, `src/market/lineColors.ts` |
| FRVP range/rows/value area/extend-right, per-level line styles, per-direction histogram styles | `src/fixedRangeVolumeProfileInstancesStorage.ts` | `0xdeck-widget-fixed-range-vp-instances` | `sanitizeFixedRangeVolumeProfileInstances` + `sanitizeFrvpInstanceHistogramStyles` (`src/market/frvpHistogramStyles.ts`) | `src/market/fixedRangeVolumeProfileSeriesPrimitive.ts`, `src/market/fixedRangeVolumeProfileRenderGeometry.ts` |
| Rolling VWAP instances (period, multipliers, per-band colors/opacities/line styles, shared width, center line, enabled/locked) | `src/rollingVwapInstancesStorage.ts` | `0xdeck-widget-rolling-vwap-instances` | `sanitizeRollingVwapInstances` → `sanitizeRollingVwapSettings` (`src/market/rollingVwapSettings.ts`) | `src/market/rollingVwapChartSeries.ts` |
| Anchored VWAP anchor, lock/hidden, line + band pair styles and fills | `src/anchoredVwapInstancesStorage.ts` | `0xdeck-widget-anchored-vwap-instances` | `sanitizeAnchoredVwapInstances` → `sanitizeAnchoredVwapDrawingSettings` (`src/market/anchoredVwapDrawingSettings.ts`) | `src/market/anchoredVwapDrawingChartSeries.ts`, `src/market/anchoredVwapBandFillSeriesPrimitive.ts` |
| Indicator line styles + time-based VWAP band background | `src/marketIndicatorPresentationStorage.ts` | `0xdeck-widget-market-indicator-presentation` | `sanitizePresentation` (module-local) + `sanitizeLineChartStrokeStyle`, `sanitizeMarketStyleOpacityPercent` | `src/market/marketIndicatorPresentationApply.ts` |
| RSI period / overbought / oversold / threshold glow | `src/marketRsiSettingsStorage.ts` | `0xdeck-widget-market-rsi-settings` | `sanitizeRsiSettings` (`src/market/rsi.ts`) | `src/market/rsiChartPane.ts` |
| Aggregated Liquidations source + pane position | `src/liquidationsSettingsStorage.ts` | `0xdeck-widget-liquidations-settings` | `sanitizeAggregatedLiquidationsSettings` | `src/market/aggregatedLiquidationsChartSeries.ts`, `src/market/aggregatedLiquidationsPaneLayout.ts` |
| Enabled indicator set | `src/marketIndicatorStorage.ts` | `0xdeck-widget-market-indicators` | `sanitizeIndicatorList` (module-local, includes the `ema-200` → `dual-ema` legacy id) | `src/BtcPerpetualChartPanel.tsx` series visibility |
| Position Markers toggle | `src/marketPositionMarkersStorage.ts` | `0xdeck-widget-market-position-markers` | boolean coercion on load (invalid ⇒ OFF) | `src/market/hyperliquidMarkers.ts` |
| Chart viewport per interval, exchange, interval | `src/marketChartViewportStorage.ts`, `src/marketExchanges.ts`, `src/marketIntervalStorage.ts` | `0xdeck-widget-market-chart-viewports`, `0xdeck-widget-market-exchanges`, `0xdeck-widget-market-intervals` | per-module load guards | `src/market/marketChartViewport.ts`, chart panel |

**Legacy read-only paths (MUST stay read-only).** `0xdeck-widget-rolling-vwap-settings` (`src/rollingVwapSettingsStorage.ts`) is read only to migrate a pre-instance overlay into instances (`migrateLegacyRollingVwapToInstances` in `src/market/rollingVwapInstancesMigration.ts`) and MUST NOT receive new fields; its `saveWidgetRollingVwapSettings` export currently has no UI call site and new code MUST NOT call it. Legacy `rolling-vwap` entries in the indicator presentation map are never applied to rendering: `applyMarketIndicatorPresentationToBundle` returns early for that id, and `syncWidgetMarketIndicatorPresentations` skips it. New settings MUST NOT be added to either legacy path.

**Sanitizers are the storage contract (MUST).** Shared controls sanitize on load (`sanitizeLineChartStrokeStyle`, `sanitizeMarketStyleOpacityPercent`, `isLineChartStrokeWidth`, `isRollingVwapHexColor`), so hand-edited or older storage cannot render an invalid style; an unknown value falls back to the object's default instead of failing the whole record. Defaults themselves follow [Defaults](#appearance--settings): one palette role set, no feature-local hex literals.

---

## Feature parity (MUST)

Functionally equivalent chart objects MUST expose the same capabilities and the same interaction vocabulary. Parity is checked against the [capability matrix](#capability-matrix-by-object-type-must) and against existing objects of the same category — not against a new object's own ambition.

1. **Same category ⇒ same capability set.** A new band MUST have per-band color, opacity, width and `Line`/`Dot` like the existing bands; a new line MUST have color, opacity, width and `Line`/`Dot` like the existing lines; a new fill MUST have color + opacity and no width/style. Before adding a control, check how the existing objects of that category expose it and reuse the same control, labels and defaults.
2. **Same interaction vocabulary.** Select, double click to settings, outside click, `Esc`, lock, hide and delete behave as in [Mouse & keyboard interactions](#mouse--keyboard-interactions). A new tool that opens settings only from the header, or that adds a third way to dismiss a dialog, is non-conforming.
3. **Missing capability = conformance gap.** Omitting a capability that the matrix requires is not an intentional exception and MUST NOT be described as one in a PR. Either implement it, or record it in [Known conformance gaps](#known-conformance-gaps) with the owning module and the consequence.
4. **Exception policy.** An exception is allowed only with a recorded technical or functional justification *and* its consequence for the user, e.g. "the band pair shares one width because the primitive draws both lines with a single stroke; consequence: upper and lower band width cannot differ". Justification must be in this document (or an ADR it links to), not only in a PR comment.
5. **Default parity.** Equivalent objects default to equivalent roles (`MARKET_STYLE_DEFAULTS`, `MARKET_STYLE_ROLLING_BAND_SHADES`) except where [Background / fill defaults per object](#appearance--settings) records a deliberate per-object default. Fixed semantic styling stays fixed for every object of that class.

---

## Known conformance gaps

Audit of the current code (base `origin/main` at the time of writing). These are deviations from the rules above, listed as work items — not approved exceptions, and not claims that the standard is already enforced. Re-audit and update this list whenever a chart object's settings change.

| ID | Gap | Where (verified) | User-visible consequence |
|----|-----|------------------|--------------------------|
| G1 | Rolling VWAP deviation bands have no per-band width: one `lineWidth` per instance is applied to the center line and all three bands | `src/market/rollingVwapSettings.ts` (single `lineWidth`), `applyRollingVwapChartLineWidth` in `src/market/rollingVwapChartSeries.ts`, one `Width` select in `src/market/RollingVwapSettingsDialog.tsx` under "Line" | Band width cannot differ per band, while band color, opacity and `Line`/`Dot` can — and Anchored VWAP does expose a width per band pair |
| G2 | Time-based VWAP (daily/weekly/monthly/quarterly/yearly) renders a center line plus two previous-session band lines, but all three are styled by one indicator record | `MarketIndicatorPresentation` (`src/marketIndicatorPresentationStorage.ts`) applied to every series of `bundle.dailyVwap.ordered` / `weekly` / `monthly` / `quarterly` / `yearly` in `src/market/marketIndicatorPresentationApply.ts`; defaults in `src/market/vwapChartLineStyles.ts` (`VWAP_CHART_SERIES_STYLES`) | Choosing one color collapses the intentional center/band distinction, and the band lines cannot be given their own color, opacity, width or `Line`/`Dot`. The only independent band control is the band background fill (`src/market/sessionVwapBandFillStyle.ts`) |
| G3 | Single click does not select overlay indicators; there is no selection state, drag, on-chart delete or `Lock` for them | Only `dblclick` is bound (`src/market/chartObjectSettingsPanePointer.ts`); indicator hit tests exist only inside the settings hit test (`hitTestLineSeriesAtPane`, `hitTestSingletonMarketIndicators` in `src/market/chartObjectSettingsHitTest.ts`) | The interaction vocabulary differs from drawing tools: an indicator answers double click but not click, so selection feedback never appears, and `Delete`/`Backspace` can only remove drawings |
| G4 | Two vocabularies for the same visibility concept: rectangle/line/anchored VWAP use `hidden`, while FRVP and Rolling VWAP instances use `enabled` | `isChartObjectHidden` / `setChartObjectHidden` (`src/market/chartObjectState.ts`) vs. `enabled` in `src/market/fixedRangeVolumeProfileInstances.ts` and `src/market/rollingVwapInstances.ts` | The header row (hide/show) looks identical, so the divergence is invisible until code reads the field; a shared helper that assumed `hidden` would silently fail on FRVP/rolling VWAP |

G4 is a naming/consistency deviation only (rendering and persistence are correct for both fields); G1–G3 are user-visible missing capabilities. None of them is covered by a recorded justification yet, so none may be cited as precedent for a new object.

---

## Reference components (do not duplicate)

| Concern | Use |
|---------|-----|
| Color + opacity (+ Line/Dot) popover | `src/widgetSettings/ColorOpacityField.tsx`, `src/widgetSettings/colorPickerPalette.ts` |
| Popover/modal dismissal (outside click, `Esc`, no click-through) | `src/components/ui/popover.tsx`, `src/components/ui/dialog.tsx`, `src/lib/dialogOutsideClick.ts` |
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
