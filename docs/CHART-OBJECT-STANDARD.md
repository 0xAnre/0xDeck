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
| **Background / fill** — rectangle fill, band fills, FRVP histogram | MUST | MUST | Forbidden (stroke width) | Forbidden | This *is* the fill; keeps its own color + opacity pair. A bar-extent control (how far a bar reaches or how tall it is) is geometry, not stroke width; only the FRVP histogram exposes it today |
| **Fixed / semantic** — candles (narrow global color exception below), position markers, Aggregated Liquidations bars, RSI threshold colors, current price line | Forbidden, except the documented global candle rising/falling color exception | Forbidden | Forbidden | Forbidden | Forbidden |

Granularity means "what the user can style independently", not the number of rendered series: a band pair that renders an upper and a lower line may share width and `Line`/`Dot` at pair level as long as each line keeps its own color and opacity, but it MUST NOT collapse into a single chart-wide record. Multi-series line *groups* (3 EMA, 2 EMA) intentionally expose one control set for the whole group and MUST say so in the dialog (`MarketIndicatorStyleDialog` "Chart lines" note, `lineStyleMixed`).

| Object (today) | Category | Capabilities exposed | Style source | Settings surface |
|----------------|----------|----------------------|--------------|------------------|
| Line drawing (`line-*`) | Line-type | Color, Opacity, Width, Line/Dot | `src/market/lineInstances.ts`, `src/market/lineColors.ts` | `src/widgetSettings/LineStyleDialog.tsx` |
| Rectangle / box (`rect-*`) | Background / fill | Color, Opacity; geometry Lock (draft in the same settings dialog, shared with the header lock action) | `src/market/rectangleInstances.ts`, `src/market/rectangleColors.ts` | `src/widgetSettings/RectangleFillStyleDialog.tsx` |
| FRVP histogram bars (up / down) | Background / fill | Color, Opacity per direction; max bar width (% of range) and row fill (% of row) per instance — bar extent, not stroke width; row count stays the genuine price-bin count | `src/market/frvpHistogramStyles.ts`, `src/market/fixedRangeVolumeProfileRenderGeometry.ts` | `src/widgetSettings/FixedRangeVolumeProfileSettingsDialog.tsx` |
| FRVP level lines (point of control, value-area high/low) | Line-type | Color, Opacity, Width, Line/Dot per level | `src/market/frvpInstanceLineStyles.ts`, `src/market/frvpLevelLineColors.ts` | `src/widgetSettings/FixedRangeVolumeProfileSettingsDialog.tsx` |
| Anchored VWAP center line | Line-type | Color, Opacity, Width, Line/Dot | `src/market/anchoredVwapDrawingSettings.ts` (`vwapLine`) | `src/market/AnchoredVwapSettingsDialog.tsx` |
| Anchored VWAP band pairs ×3 (upper / lower) | Bands | Color + Opacity per line, Width + Line/Dot per pair | `src/market/anchoredVwapDrawingSettings.ts` (`band1`–`band3`) | `src/market/AnchoredVwapSettingsDialog.tsx` |
| Anchored VWAP band fill (per pair) | Background / fill | Color, Opacity per pair | `src/market/anchoredVwapBandFillSeriesPrimitive.ts` | `src/market/AnchoredVwapSettingsDialog.tsx` |
| Rolling VWAP center line | Line-type | Color, Opacity, Width, Line/Dot per instance | `src/market/rollingVwapSettings.ts` (`lineWidth`, `lineColor`, `lineOpacity`, `lineStyle`), `src/market/rollingVwapChartSeries.ts` | `src/market/RollingVwapSettingsDialog.tsx` |
| Rolling VWAP bands ×3 (six outlines, three fills; standard-deviation or percentage offsets) | Bands | Band type (Standard deviation / Percentage of VWAP) with an independent distance per band in each mode; Color, Opacity, Width, Line/Dot per band; one shared Background fill per instance | `src/market/rollingVwapSettings.ts` (`bandType`, `multipliers`, `bandPercentages`, `bandColors`, `bandOpacities`, `bandLineWidths`, `bandLineStyles`, `fillColor`, `fillOpacity`), `src/market/rollingVwapChartSeries.ts`, `src/market/rollingVwapBandRenderGeometry.ts`, `src/market/rollingVwapBandSeriesPrimitive.ts` | `src/market/RollingVwapSettingsDialog.tsx` |
| Time-based VWAP (daily, weekly, monthly, quarterly, yearly): center line + previous-session band lines | Bands | Color, Opacity, Width, Line/Dot per series (center line, previous-session upper, previous-session lower) | `src/market/sessionVwapChartSeries.ts`, `src/market/vwapChartLineStyles.ts`, `src/market/marketIndicatorPresentationApply.ts`, `src/marketIndicatorPresentationStorage.ts` (`series`) | `src/widgetSettings/MarketIndicatorStyleDialog.tsx` |
| Time-based VWAP band background | Background / fill | Color, Opacity (independent from the line record) | `src/market/sessionVwapBandFillStyle.ts`, `src/market/sessionVwapBandSeriesPrimitive.ts` | `src/widgetSettings/MarketIndicatorStyleDialog.tsx` "Background" |
| 3 EMA / 2 EMA | Line-type (group) | Color, Opacity, Width, Line/Dot for the group | `src/market/marketIndicatorSeriesColors.ts`, `src/market/marketStylePalette.ts` (`MARKET_STYLE_MULTI_LINE_SHADES`, `MARKET_STYLE_DUAL_LINE_SHADES`) | `src/widgetSettings/MarketIndicatorStyleDialog.tsx` |
| RSI line (+ period, overbought/oversold, threshold glow) | Line-type | Color, Opacity, Width, Line/Dot; range fields are non-style settings | `src/marketIndicatorPresentationStorage.ts`, `src/market/rsi.ts` | `src/widgetSettings/MarketIndicatorStyleDialog.tsx`, `src/market/rsiChartPane.ts` |
| Candles | Fixed / semantic | **Global Body / Border / Wick appearance only** — each part owns a rising/falling color pair, one visibility switch and one 0–100 opacity shared by that part's two directions; no width, line style, fill, per-direction opacity or per-panel/workspace/exchange override | `src/market/candleColors.ts` (defaults from `btcPerpetualCandleColors.ts`) | `src/AppearanceMenu.tsx` → `src/widgetSettings/CandleColorsDialog.tsx` |
| Position markers | Fixed / semantic | **Size only** — user marker size `0.5×`–`3×` (step `0.25`, default `1×`); color, shape, position and visibility semantics fixed. The *source* (wallet exchange + address) is global header state, not a chart-object style | `src/market/positionMarkers.ts` (`POSITION_MARKER_SIZE_*`, `sanitizePositionMarkerSize`), `src/market/hyperliquidMarkers.ts`, `src/market/marketSemanticColors.ts`, `src/market/positionWallet.ts` + `src/PositionWalletControl.tsx` (wallet), `src/market/lighterFills.ts` (Lighter trades → the same fill pipeline) | `src/widgetSettings/MarketPositionMarkerSettingsDialog.tsx` (gear on the `HeaderIndicatorsMenu.tsx` row) |
| Aggregated Liquidations bars | Fixed / semantic | None — fixed long/short pair; only source and pane position are settings | `src/market/aggregatedLiquidationsColors.ts`, `src/market/aggregatedLiquidationsSettings.ts` | `src/market/AggregatedLiquidationsSettingsDialog.tsx` |
| Live liquidation levels (MarketLens L4, open-position liquidation prices) | Background / fill (bar histogram) | Color, Opacity per side (long / short); max bar width as bar extent (% of the pane plot width, 5–100) — geometry, not stroke width. No line style, lock or delete: the profile owns no movable geometry | `src/market/liquidationLevelsSettings.ts`, `src/market/liquidationLevelsSeriesPrimitive.ts` | `src/market/PriceLevelsSettingsDialog.tsx` (kind `liquidation`) |
| Stop Loss Levels (MarketLens L4 `tpsl` channel `stop_losses`, resting trigger orders) | Background / fill (bar histogram) | Color, Opacity per side ("closes long" / "closes short"); max bar width (5–100 %); same object category as the liquidation profile | `src/market/liquidationLevelsSettings.ts`, `src/market/priceLevelsKind.ts`, `src/market/tpslLevelsFeed.ts` | `src/market/PriceLevelsSettingsDialog.tsx` (kind `stop-loss`) |
| Take Profit Levels (MarketLens L4 `tpsl` channel `take_profits`) | Background / fill (bar histogram) | Same as Stop Loss Levels, independently persisted | `src/market/liquidationLevelsSettings.ts`, `src/market/priceLevelsKind.ts`, `src/market/tpslLevelsFeed.ts` | `src/market/PriceLevelsSettingsDialog.tsx` (kind `take-profit`) |
| RSI threshold colors + glow | Fixed / semantic | None — fixed semantic pair, glow is a visibility toggle | `src/market/rsiLineColors.ts`, `src/market/rsi.ts` (`thresholdGlow`) | `src/widgetSettings/MarketIndicatorStyleDialog.tsx` |
| Current price line | Fixed / semantic | None — theme foreground @ 50%, dashed, 1px | `src/market/btcPerpetualCurrentPriceLineOptions.ts` | — |
| Selection outlines, handles, hover chrome | Fixed / semantic | None — shared geometry/`drawingCursor`, fixed handle alpha (chart chrome, never user-styled); overlay indicator selection is drawn by `src/market/overlayIndicatorSelectionHalo.ts` (own line color, fixed halo alpha) and the Aggregated Liquidations pane rim, never by writing series options | `src/market/lineColors.ts` (`LINE_HANDLE_FILL_OPACITY`), `src/market/rectangleColors.ts` (`RECTANGLE_HANDLE_FILL_OPACITY`), `src/market/drawingCursor.ts`, `src/market/overlayIndicatorSelectionHalo.ts` | — |

**Why fixed / semantic objects stay out of user styling (MUST).** Their color carries meaning, not preference: candle direction, buy/sell and long/short side, and RSI threshold state must read the same in every theme and every panel, and the current price line is a chart-wide reference whose label the chart auto-derives from its color. Giving them a user color would either break the meaning (a green "long liquidation") or desynchronize the auto-contrast label. They MUST NOT gain a color, opacity, width, style or fill control; they MAY have a visibility toggle (`Position Markers`, `Threshold Glow`, event toggles). The one exception is the explicitly requested, narrowly scoped global candle appearance preference below; it MUST NOT be treated as precedent for any other fixed/semantic object.

**Fixed / semantic candle appearance exception (MUST).** The user's explicit candle-style request supersedes the old no-color/no-opacity prohibition **only** for the one global candle appearance preference below. It does not relax the rule for position markers, Aggregated Liquidations, RSI thresholds, the current price line or any other object, and it does not turn candles into a Line-type or Background/fill object.

- Three native parts, independently switchable and styled: **Body**, **Borders** and **Wick**. Every part stores its own rising/falling color pair, one visibility flag and one 0–100 opacity shared by that part's two directions. Width, line style, fills, per-direction opacity and per-panel/workspace/exchange overrides stay forbidden.
- Defaults and legacy compatibility: `#DBDBDB` / `#808080`, Body and Wick visible, Borders hidden, every opacity 100. A legacy `0xdeck-candle-colors` record with only `{ rising, falling }` seeds all three parts in memory; loading, opening or cancelling never rewrites it. Only `Save` writes the whole sanitized record. `Reset` edits the draft; Save is still required.
- The record is global (`0xdeck-candle-colors`) and applies to every current and new BTC Perp panel in every workspace, on both candle exchanges. The canonical record keeps the legacy top-level `rising`/`falling` names mirroring Body plus `body`/`border`/`wick` part records; it never persists native `upColor`/`downColor` names. Missing/invalid part fields fall back per field without discarding valid legacy/custom choices; opacity clamps to 0–100 and non-finite/non-number values fall back to 100.
- Native mapping: `upColor`/`downColor` (Body), `wickUpColor`/`wickDownColor` + `wickVisible`, `borderUpColor`/`borderDownColor` + `borderVisible`. Installed lightweight-charts 5.2.0 has no `bodyVisible`, so Body visibility is an alpha-0 Body color; Border and Wick keep their colors and use their native visibility switch. A hidden or 0%-opacity part keeps its chosen color, so re-enabling restores it. The border remains the native 1px border; do not add a width setting or a custom candle renderer.
- Native rendering couples body and border at extreme bar spacing: when the bar is at most twice the native border width, the installed library draws only the border and skips the body. Record this installed-library limit instead of emulating a body with custom geometry.
- Opacity is per part, never canvas or series-wide alpha: a partially transparent part is an RGBA color of that part only. At 100% each visible part uses its exact `#RRGGBB`, so defaults and opaque legacy/custom pairs render pixel-identically.
- `Save` applies the whole record in place through `candlestickSeries.applyOptions(...)`: no chart recreation, no series creation, no `setData`, no history/VWAP refetch, no viewport reset and no subscription change. Subscriptions, equality checks and cross-tab `storage` sync compare the whole record, so visibility- or opacity-only changes are not ignored when the direction colors are unchanged.
- The dialog is the shared shadcn `Dialog` with the shared width/spacing/overlay constants and one compact row per part: a native checkbox inside `Field`, one `ColorOpacityField` per direction in its color-only `showOpacity={false}` mode (the shared palette/custom HEX picker) and one shared `Slider` per part. There is no second picker and no per-direction opacity.
- Semantic UI tokens (`--up`/`--down`) and every other series, marker, pane, indicator and chart object keep their existing color sources. Candle appearance is a user preference, not a theme token.

**Fixed / semantic size exception (MUST).** A fixed/semantic object MAY expose a **size** control only where size carries no category meaning, and only through a dialog that follows [Settings dialogs](#settings-dialogs-must). Today that is exactly one object: **position markers**, whose arrow size (`0.5×`–`3×`, step `0.25`, default `1×`) is a presentation preference that never changes side, shape, position or color, and is the only size control of its kind in the matrix. Size does not relax the color rule: the buy/sell pair stays fixed and the marker size MUST NOT become a per-side or a color/opacity/width/fill setting. A second fixed/semantic object MUST NOT gain a size control without updating this matrix and recording why size is meaningful there; position markers are not precedent for candle, liquidation or RSI chrome sizing. Position markers have no hit-testable on-chart footprint (they are series markers, not geometry), so their settings entry is the header gear only; there is no double-click target to mirror and no interaction contract is bypassed.

**No new category (MUST).** A new chart object reuses one of these four categories. If it genuinely needs a fifth (for example a new fixed semantic accent), update this matrix in the same PR and state the reason; do not invent an object type with a partial set of capabilities.

---

## Appearance & settings

**One color control (MUST).** Every color input uses `ColorOpacityField` (`src/widgetSettings/ColorOpacityField.tsx`) with palette, HEX normalization, opacity normalization and preview geometry from `src/widgetSettings/colorPickerPalette.ts`. Never add a bespoke picker, a raw `<input type="color">`, or a private swatch grid.

- Color and opacity are one control: pass `color` + `opacityPercent` together and emit 0–100 integer percentages. The only color-only surfaces are the global candle dialog's six part swatches (`ColorOpacityField` with `showOpacity={false}`): each part has one shared opacity `Slider` beside its rising/falling swatches, so the picker itself omits a per-color slider. It still uses the same palette, HEX and opacity normalization; every other chart object passes both values.
- The `Line`/`Dot` row (`lineStyle` + `onLineStyleChange`) is added only where the object's stroke style is user-selectable; use `lineStyleMixed` for indeterminate multi-series state instead of picking a series value. Fills, backgrounds and band/level strokes that have no persisted line-style value (rect fill, FRVP histogram, VWAP band fill) MUST omit the style row. Rolling VWAP band styles are per band (independent `solid`/`dotted`), matching their per-band color and opacity.
- Fills and backgrounds MUST use this same Color + Opacity control wherever the tool supports them.

**Separate fill control (MUST).** Any chart object that renders a configurable fill or background MUST expose a separate `Background` / `Fill` Color + Opacity setting through `ColorOpacityField` — one color + opacity pair, with no `Line`/`Dot` row and no stroke-width control. The FRVP histogram's max-width and row-fill controls are bar-extent geometry (see the capability matrix), not a stroke width. The fill setting is independent of the object's stroke color/opacity/width/style settings, persists per widget instance / chart object, and starts from **that object's own default** — there is no single universal fill default, see *Background / fill defaults per object* below. `0%` opacity means no visible fill. Examples: rectangle fill, Anchored VWAP band fill, Rolling VWAP band fill, FRVP histogram bars, time-based VWAP band background. Objects without a fill MUST NOT gain one just to satisfy this rule, and fixed semantic colors (candles, position markers, Aggregated Liquidations, plus the RSI threshold pair in `rsiLineColors.ts` — documented under Defaults) stay out of user fill styling.

**Background / fill defaults per object.** The shared palette fill role (`MARKET_STYLE_DEFAULTS.fill` = `MARKET_STYLE_PALETTE.medium` `#A3A3A3` @ `MARKET_STYLE_OPACITY_PERCENT.fill` = 25%) is the default for rectangle fill and time-based VWAP band background only. Each other fill-owning object has its own intentional default:

| Object | Default background / fill |
|--------|---------------------------|
| Rectangle fill (`readRectangleFillStyle` in `rectangleColors.ts`, from `DEFAULT_RECTANGLE_FILL_HEX` / `DEFAULT_RECTANGLE_FILL_OPACITY_PERCENT`) | palette fill role: `#A3A3A3` @ 25% |
| Time-based (daily/weekly/monthly/quarterly/yearly) VWAP band background (`MARKET_INDICATOR_BAND_FILL_IDS` in `indicators.ts`; `resolveSessionVwapBandFillStyle` in `sessionVwapBandFillStyle.ts`) | the same palette fill role, `#A3A3A3` @ 25% (it reuses `readRectangleFillStyle`) |
| Anchored VWAP band fill (`defaultBandPair` in `anchoredVwapDrawingSettings.ts`) | the same fill color (`MARKET_STYLE_DEFAULTS.fill.color`) with `fillOpacity: 0` — off by default |
| FRVP histogram bars (`frvpHistogramStyles.ts`, `fixedRangeVolumeProfileRenderGeometry.ts`) | candle up/down colors (`FRVP_HISTOGRAM_DEFAULT_UP_COLOR` = `#DBDBDB`, `FRVP_HISTOGRAM_DEFAULT_DOWN_COLOR` = `#808080`) at `FRVP_HISTOGRAM_DEFAULT_OPACITY_PERCENT` = 50% configured opacity, drawn at `FRVP_VALUE_AREA_ROW_OPACITY_PERCENT` = 55% of it inside and `FRVP_OUTSIDE_VALUE_AREA_ROW_OPACITY_PERCENT` = 25% of it outside the Value Area (alpha 0.275 / 0.125 at the default); the configured percent is the Value-Area ceiling, not the rendered row alpha. Missing width/height fields render the legacy maximum of `FRVP_HISTOGRAM_MAX_WIDTH_FRACTION_OF_RANGE` = 1/6 of the selected range and a full (`FRVP_HISTOGRAM_DEFAULT_BAR_HEIGHT_PERCENT` = 100%) price row; optional per-instance `histogramWidthPercent` (1–100% of the range) and `histogramBarHeightPercent` (1–100% of the row, centered in the bin) change only that bar extent |
| Rolling VWAP band fills (`rollingVwapSettings.ts`, `rollingVwapChartSeries.ts`, `rollingVwapBandSeriesPrimitive.ts`) | the palette fill role color `#A3A3A3` at a Rolling-VWAP-only `DEFAULT_ROLLING_VWAP_FILL_OPACITY` of 15% (not the role's 25%): one color + opacity per instance covering all three upper/lower band pairs, which are nested, so the alpha compounds to ~39% in the innermost region and stays legible over candles; per-band line colors, opacities and `solid`/`dotted` styles stay independent; its Info Box was removed in #175 |

These per-object differences are intentional (W7): MUST NOT be flattened by copying the palette fill role onto an object with a different default, and an object without a fill MUST NOT gain one. The Rolling VWAP fill is per instance (one `Background` color + opacity for bands 1–3) with no per-band fill controls; this does not change the per-band Rolling VWAP `solid`/`dotted` styles or the `Line`/`Dot` omit list above.

**One width control (MUST).** Stroke width comes from `LineChartStrokeSelectFields` (`src/widgetSettings/LineChartStrokeSelectFields.tsx`) over `LINE_CHART_STROKE_WIDTHS` in `src/market/lineChartStroke.ts` (1–4px, `DEFAULT_LINE_CHART_STROKE_WIDTH`). Do not introduce a competing width toggle or width range.

**Defaults (MUST).** Starting styles come from `src/market/marketStylePalette.ts`: `MARKET_STYLE_PALETTE`, `MARKET_STYLE_OPACITY_PERCENT` (`full` / `secondary` / `fill`) and `marketStyleRoleDefault(role)`; multi-series lines use `MARKET_STYLE_MULTI_LINE_SHADES` / `MARKET_STYLE_DUAL_LINE_SHADES`, volatility bands use `MARKET_STYLE_ROLLING_BAND_SHADES`. Feature files MUST NOT declare new hex literals — import palette values. Semantic colors that carry meaning are an explicit exception to the grayscale defaults; the shared pair is defined once in `marketSemanticColors.ts` (`#22C55E` positive/buy/short-liquidation, `#EF4444` negative/sell/long-liquidation, identical in every theme). The exceptions are candle up/down (`btcPerpetualCandleColors.ts` — default `#DBDBDB` / `#808080`, overridable only through the global candle appearance exception above), buy/sell position markers (`positionMarkers.ts`), Aggregated Liquidations (`aggregatedLiquidationsColors.ts` — `LIQUIDATION_LONG_COLOR` = `#EF4444` for long liquidations, `LIQUIDATION_SHORT_COLOR` = `#22C55E` for short liquidations) and RSI threshold colors (`rsiLineColors.ts` — the same fixed pair as markers and liquidations). These objects carry their own fixed source or the documented candle preference; they MUST NOT be restyled through the neutral palette roles, the shared semantic pair MUST NOT be redefined per theme, and candles remain the only one with a user color preference. The RSI threshold glow reuses those colors at a fixed opacity behind a visibility toggle, not a user color picker. RSI level price lines (overbought/mid/oversold) use internal `dashed` chrome, are not user-configurable, and are outside the `Line`/`Dot` vocabulary.

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
| Outside press | A press inside the dialog panel closes **only** the popover and the surrounding dialog stays open; a press on the transparent overlay (outside the dialog panel) dismisses the popover and the dialog together | Radix `usePointerDownOutside` in the unified `radix-ui` package |
| `Esc` | Closes **only** the popover (first `Esc`), because only the highest dismissable layer handles `Esc`; the dialog and its draft survive. A second `Esc` closes the dialog and discards the draft | Radix `DismissableLayer` (`isHighestLayer` escape handler) + `src/components/ui/dialog.tsx` |
| Commit vs discard | The popover never writes storage: it edits the dialog draft. Dismissing the popover keeps the edited draft; only the dialog decides (see [Settings dialogs](#settings-dialogs-must)) | `ColorOpacityField` + `*Draft` modules |
| No click-through | The popover is portaled above the dialog; the dialog overlay is transparent but still receives pointer events, so a dismissing press can never reach the chart and create/move an object. Modal `Select`s inside a dialog are absorbed once by `isPointInsideDialogPanel` (`src/lib/dialogOutsideClick.ts`) | `src/components/ui/dialog.tsx` |

**Where it may appear (MUST).** Only inside a chart settings dialog (today: `LineStyleDialog`, `RectangleFillStyleDialog`, `MarketIndicatorStyleDialog`, `FixedRangeVolumeProfileSettingsDialog`, `RollingVwapSettingsDialog`, `AnchoredVwapSettingsDialog`, `CandleColorsDialog`). Adding the popover directly to a header menu would need its own verified no-click-through story; do not assume the dialog contract transfers.

---

## Settings dialogs (MUST)

One shell and one vocabulary, so a tool dialog and an indicator dialog are interchangeable for the user.

- **Shell.** Use the shadcn `Dialog` in `src/components/ui/dialog.tsx`; never a parallel modal/popover shell.
- **Structure.** `DialogHeader` (`DialogTitle` + `DialogDescription`) → grouped, labelled body sections → `DialogFooter` with required `Save`/`Cancel`. `FieldGroup`/`Field` + `FieldLabel` is the preferred labelling where the control is a form field; a labelled `<section>` group is the accepted body form where the controls are not form fields (used by the Rolling VWAP, Anchored VWAP and Aggregated Liquidations dialogs).
- **Width and spacing.** Pass `CHART_SETTINGS_DIALOG_CONTENT_CLASS` and `CHART_SETTINGS_DIALOG_BODY_CLASS` from `src/widgetSettings/chartSettingsDialogLayout.ts`. Those constants are the only width/spacing scale (wider than the shadcn default `sm:max-w-sm`, viewport-capped by `max-h-[calc(100dvh-2rem)]`); the body scrolls inside the dialog while header and footer stay pinned. Do not hardcode a per-dialog width.
- **Overlay.** Pass `CHART_SETTINGS_DIALOG_OVERLAY_CLASS`: the chart MUST stay readable while editing — no near-opaque scrim and no blur. The overlay is transparent but still intercepts pointer events, which is what makes "no click-through" true.
- **Labels.** Same wording everywhere: `Color`, `Opacity`, `Width`, `Line` / `Dot`, `Fill` / `Background`, `Cancel`, `Save`. `DialogDescription` names the concrete object/instance where the dialog has one (`formatLineInstanceLabel`, `formatRectangleInstanceLabel`, `formatFixedRangeVolumeProfileInstanceLabel`, `formatAnchoredVwapInstanceLabel`, `rollingVwapInstanceDisplayLabel`), not only the tool kind.
- **Open/close symmetry.** The header gear (`HeaderIndicatorsMenu.tsx`, `HeaderToolsMenu.tsx` through `ChartObjectListRow`) and the on-chart double click open the *same* dialog through one `ChartObjectSettingsTarget`; `X`, `Esc`, outside click and `Cancel` all close it; focus returns to the control that opened it (`returnFocusId` + `onCloseAutoFocus`). The one documented exception is fixed/semantic Position Markers (`MarketPositionMarkerSettingsDialog.tsx`): their markers own no hit-testable geometry, so the dialog opens from the header gear only and has no on-chart double-click twin (see *Fixed / semantic size exception*). That exception is scoped to objects without geometry — any chart object that *does* own geometry MUST still implement the single shared `ChartObjectSettingsTarget` entry, and the gear + double click MUST NOT diverge.
- **Nested modal controls.** `Select` and other modal dropdowns close only themselves: an in-dialog press must not dismiss the dialog or click through to the control underneath. `DialogContent` handles this once (`isPointInsideDialogPanel`); do not add per-dialog outside-click handlers.

**Draft + Save is mandatory (MUST).** Every chart tool and indicator settings dialog is draft-based — there are no exceptions. All edits stay in a local draft; only `Save` commits, through the existing instance-update → persist path.

- `Cancel`, the `X` close button, `Esc` and outside click MUST all discard the draft and leave the stored object unchanged.
- Live or per-keystroke committing in a tool or indicator settings dialog is explicitly non-conforming.
- A draft may sanitize values on blur/`Enter`, but sanitizing MUST NOT write to storage.
- The rectangle dialog's draft also carries the object's existing geometry `locked` flag (the fill color/opacity pair is unchanged). It opens with the persisted lock state and `Save` commits a changed lock through the same per-instance update path as the header lock action; that commit never rewrites geometry, `hidden`, the fill pair or sibling objects. A target that disappears closes the dialog without a commit, and a different target remounts the draft.

---

## Mouse & keyboard interactions

Shared behavior below applies to every drawing tool and to interactable indicators. One action has exactly one meaning on every tool, pane and indicator; tool-specific extra capabilities may differ, but these MUST NOT.

| Action | Required behavior |
|--------|-------------------|
| Single click | Selects the object under the pointer and releases every other tool's selection. Selection is a pure state change: it never creates, moves or cancels a drawing. A click is a press released within `pointerMovementWithinClickTolerance` (`src/market/chartObjectState.ts`), so a press that becomes a pan selects nothing. Shared helpers: `applyRectangleSelection` / `applyLineSelection` / `applyFixedRangeVolumeProfileSelection` / `applyAnchoredVwapDrawingSelection` for drawings, `applyOverlayIndicatorSelection` (`src/market/overlayIndicatorSelection.ts`) for overlay indicators, arbitrated by `preferDrawingPointerTargetAmongPeers` (`src/market/drawingPointerArbitration.ts`) and released through `clear*SelectionForPeerClaim` (`src/market/drawingSelection.ts`). Precedence is the settings hit-test order, so a click on a drawing never selects the overlay indicator behind it |
| Double click | Opens that object's settings, resolved by `src/market/chartObjectSettingsHitTest.ts` and bound per pane by `src/market/chartObjectSettingsPanePointer.ts` (native `dblclick` on the pane element). New objects MUST extend `ChartObjectSettingsTarget` (`src/market/chartObjectSettingsTypes.ts`) so the header gear and double click open the same dialog. The handler binds to every pane element that owns an object (candle pane, RSI pane, Aggregated Liquidations pane) and follows panes being added, removed or reordered (`src/market/chartPaneRoles.ts`). Locked and hidden objects keep their settings entry |
| Drag body | Moves the object when the tool supports moving and the object is unlocked |
| Drag handle | Resizes / adjusts endpoints, corners or anchors where the tool supports handles |
| Outside click (chart) | Deselects every tool through `clearDrawingSelections` (`src/market/drawingSelection.ts`) and releases the overlay indicator selection; it applies to the RSI and Aggregated Liquidations panes as well (`src/market/drawingPaneDeselect.ts`) and never creates, moves or cancels an armed drawing |
| Outside click (settings surface) | Dismisses only the topmost surface and discards its draft: a press outside the settings dialog closes it (`DialogContent` outside pointer-down), a press outside an open color popover but inside the dialog panel closes only the popover and keeps the dialog, while a press on the transparent dialog overlay (outside the dialog panel) dismisses both. The press never reaches the chart or the control underneath (transparent-but-interactive overlay, `isPointInsideDialogPanel` for nested modal `Select`s) |
| `Esc` | Cancels the active create/resize/move operation and discards the draft, keeping the current selection (`cancel*Interaction` in `rectangleInteraction.ts`, `lineInteraction.ts`, `fixedRangeVolumeProfileInteraction.ts`, `anchoredVwapDrawingInteraction.ts`). Inside a dialog it closes the dialog (discarding the draft); while a color popover is open the first `Esc` closes only the popover. When no dialog or popover consumed the key, `Esc` releases the overlay indicator selection, gated on the same active-panel scope |
| `Delete` / `Backspace` | Deletes the selected object when it is unlocked; MUST be ignored while focus is in a form control (`isEditableKeyboardTarget`, `isRectangleKeyboardFocusOnOutsideControl`) |
| Lock | Object stays visible; MUST NOT be moved, resized or deleted on the chart. Lock is a geometry/ownership guard, so style settings and the header object list stay reachable (`isChartObjectLocked` / `setChartObjectLocked`, and per-instance guards such as `isRectangleInstanceTransformable`, `isLineInstanceTransformable`, `isAnchoredVwapInstanceLocked`); deleting a locked object from the header object list is the deliberate recovery path, the on-chart `Delete`/`Backspace` shortcut is not. The rectangle settings dialog shows and drafts the same `locked` flag; only its `Save` commits through the existing lock update path, while `Cancel`, `X`, `Esc` and outside click discard the draft |
| Hide | Object stops rendering but is kept in storage, and can be shown, unlocked, re-styled or deleted (`isChartObjectHidden` / `setChartObjectHidden`; FRVP and rolling VWAP use the instance `enabled` flag) |

**Overlay indicators.** An overlay indicator has no geometry of its own, so it participates in single click (selection), double click (settings) and the shared `Esc` / outside-press dismissal, but NOT in drag, resize, handles, on-chart `Delete` or `Lock`. Single click resolves the target through the same `hitTestChartObjectSettingsTarget` as double click and is decided on pointer up (a press that becomes a pan selects nothing); the selection is transient UI state only — it is never persisted and never written back into the object's stored color, opacity, width or style, and it is released on deselect, on press elsewhere, when the object is hidden or removed, and by `Esc`. A press that resolves a drawing, the empty pane or an armed/in-progress drawing gesture releases or never creates the overlay selection. New overlay objects MUST implement this selection plus the double-click settings entry through the shared hit test and pane binding — no second pointer path or selection store.

**Keyboard ownership (MUST).** Exactly one panel handles drawing shortcuts at a time — `src/market/rectangleKeyboardScope.ts` (`claimRectangleKeyboardPanel` / `isActiveRectangleKeyboardPanel`). New tools MUST gate their `keydown` handler on the same active-panel check rather than adding an unscoped global listener.

**Chart navigation (MUST).** Pan/zoom works normally whenever the pointer is not interacting with a drawing. Navigation locking comes from the interaction modules (`isRectangleChartNavigationLocked`, `isLineChartNavigationLocked`, `isFixedRangeVolumeProfileChartNavigationLocked`, `isAnchoredVwapDrawingNavigationLocked`) applied through `src/market/chartDrawingInteractionMode.ts`. Hit resolution across overlapping objects MUST go through `src/market/drawingPointerArbitration.ts` (`preferDrawingPointerTarget`, `preferDrawingPointerTargetAmongPeers`, `*HitAtPanePoint`) and peer selection release through `src/market/drawingSelection.ts`; do not attach competing pane pointer handlers for a new tool. The candle pane additionally supports a right-button press-and-hold two-axis scaling gesture (pure math `src/market/rightDragChartScaling.ts`, pointer lifecycle `src/market/rightDragChartScalingPointer.ts`): horizontal movement scales only logical time (right = wider/fewer bars, left = narrower/more bars), vertical movement scales only the candle price range around the pressed point (up = taller/smaller span, down = shorter/larger span), both compose diagonally, scaling starts only after `pointerMovementWithinClickTolerance`, and a horizontal-only gesture never disables candle-price autoscale. It binds to the candle pane by series identity (`candlePane.ts`), never to the RSI or Aggregated Liquidations panes, stays out of the way while a drawing interaction owns the pointer, and never selects, moves, creates, deletes or edits a chart object. Vertical scaling uses the public manual price-range mode and participates in the existing per-widget/per-interval viewport capture. A new tool MUST NOT add a competing right-button pane handler and MUST keep native-menu suppression scoped to the candle pane's own right-button gesture: `contextmenu` is suppressed while a right press is pending or a right drag is active and for the short `RIGHT_DRAG_CONTEXT_MENU_TAIL_MS` window (750 ms) after a drag ends, because Chromium on macOS/Linux requests the menu on press (before any movement can be measured) while Chromium on Windows requests it on release; no other pane, widget or gesture may suppress the menu. It must keep the gesture pointer lifecycle (pointer capture, `pointercancel`, lost capture, outside release) leak-free.

**Feedback (MUST).** Selection outline and drag preview come from the shared per-tool render geometry and handle lists, so selection looks the same across tools. Overlay indicators, which own no geometry, render the same "selected object is outlined" language through a transient chart-chrome halo: the selected lines are stroked wider in their own color (`src/market/overlayIndicatorSelectionHalo.ts`) and the bar-based Aggregated Liquidations overlay outlines its pane. Both are draw-only — no series option and no storage is written, so a selection can never overwrite a persisted style. The hover cursor is likewise one shared mapping: `src/market/drawingCursor.ts` (`resolveDrawingCursor`, `updateDrawingCursor`) maps a hit target to a CSS cursor — `move` for a draggable body, `pointer` for a selectable/locked body or a selectable overlay indicator (`overlay-indicator` slot), `nwse-resize`/`nesw-resize`/`ns-resize`/`ew-resize` for resize handles, `crosshair`/`grab` for line endpoints and VWAP anchors, `default` for empty pane space and hidden objects. Each tool only feeds the hit target it won through `preferDrawingPointerTargetAmongPeers`; the pane cursor returns to `default` on pointer leave, while a draft/drag is active and after pointer up/cancel. New tools MUST reuse this mapping and render selection/handles through the same pattern instead of a tool-only visual language.

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
| FRVP range/rows/value area/extend-right, per-level line styles, per-direction histogram styles, max bar width and row fill | `src/fixedRangeVolumeProfileInstancesStorage.ts` | `0xdeck-widget-fixed-range-vp-instances` | `sanitizeFixedRangeVolumeProfileInstances` + `sanitizeFrvpInstanceHistogramStyles` (`src/market/frvpHistogramStyles.ts`) | `src/market/fixedRangeVolumeProfileSeriesPrimitive.ts`, `src/market/fixedRangeVolumeProfileRenderGeometry.ts` |
| Rolling VWAP instances (period, band type, standard-deviation multipliers, percentage distances, per-band colors/opacities/widths/line styles, shared fill color/opacity, center-line width/style, enabled/locked) | `src/rollingVwapInstancesStorage.ts` | `0xdeck-widget-rolling-vwap-instances` | `sanitizeRollingVwapInstances` → `sanitizeRollingVwapSettings` (`src/market/rollingVwapSettings.ts`); missing/invalid `bandType` ⇒ `stdev`, missing/invalid `bandPercentages` ⇒ 0 per band | `src/market/rollingVwapChartSeries.ts` (native centre), `src/market/rollingVwapBandSeriesPrimitive.ts` (six outlines + three fills) |
| Anchored VWAP anchor, lock/hidden, line + band pair styles and fills | `src/anchoredVwapInstancesStorage.ts` | `0xdeck-widget-anchored-vwap-instances` | `sanitizeAnchoredVwapInstances` → `sanitizeAnchoredVwapDrawingSettings` (`src/market/anchoredVwapDrawingSettings.ts`) | `src/market/anchoredVwapDrawingChartSeries.ts`, `src/market/anchoredVwapBandFillSeriesPrimitive.ts` |
| Indicator line styles, per-series time-based VWAP line styles + time-based VWAP band background | `src/marketIndicatorPresentationStorage.ts` | `0xdeck-widget-market-indicator-presentation` | `sanitizeMarketIndicatorPresentation` (flat fields + `series`) + `sanitizeLineChartStrokeStyle`, `sanitizeMarketStyleOpacityPercent` | `src/market/marketIndicatorPresentationApply.ts` |
| RSI period / overbought / oversold / threshold glow | `src/marketRsiSettingsStorage.ts` | `0xdeck-widget-market-rsi-settings` | `sanitizeRsiSettings` (`src/market/rsi.ts`) | `src/market/rsiChartPane.ts` |
| Aggregated Liquidations source + pane position | `src/liquidationsSettingsStorage.ts` | `0xdeck-widget-liquidations-settings` | `sanitizeAggregatedLiquidationsSettings` | `src/market/aggregatedLiquidationsChartSeries.ts`, `src/market/aggregatedLiquidationsPaneLayout.ts` |
| Live liquidation-level profile long/short color + opacity and max bar width | `src/liquidationLevelsSettingsStorage.ts` | `0xdeck-widget-liquidation-levels-settings` (unchanged) | `sanitizeLiquidationLevelsSettings` (`src/market/liquidationLevelsSettings.ts`, field-by-field; 0 % opacity is valid, width clamps to 5–100) | `src/market/liquidationLevelsSeriesPrimitive.ts` (paint), `src/market/PriceLevelsSettingsDialog.tsx` (write path) |
| Stop Loss Levels color + opacity and max bar width | `src/liquidationLevelsSettingsStorage.ts` | `0xdeck-widget-stop-loss-levels-settings` | same `sanitizeLiquidationLevelsSettings` | same primitive (kind `stop-loss`), same dialog |
| Take Profit Levels color + opacity and max bar width | `src/liquidationLevelsSettingsStorage.ts` | `0xdeck-widget-take-profit-levels-settings` | same `sanitizeLiquidationLevelsSettings` | same primitive (kind `take-profit`), same dialog |
| Enabled indicator set | `src/marketIndicatorStorage.ts` | `0xdeck-widget-market-indicators` | `sanitizeIndicatorList` (module-local, includes the `ema-200` → `dual-ema` legacy id) | `src/BtcPerpetualChartPanel.tsx` series visibility |
| Position Markers visibility + marker size | `src/marketPositionMarkersStorage.ts` | `0xdeck-widget-market-position-markers` | `sanitizePositionMarkerSettings` → `sanitizePositionMarkerSize` (`src/market/positionMarkers.ts`); a legacy boolean record is migrated (toggle kept, size ⇒ default), anything invalid ⇒ OFF at the default size | `src/market/hyperliquidMarkers.ts` (markers), `src/widgetSettings/MarketPositionMarkerSettingsDialog.tsx` (write path) |
| Global Position Markers wallet (exchange + address + Lighter account) | `src/market/positionWallet.ts` | `0xdeck-position-wallet` (global, **not** workspace/panel scoped) | `sanitizePositionWalletSelection` → `positionWalletAddressError`; unknown exchange/bad address/lighter index falls back to the built-in Hyperliquid wallet, invalid Lighter index ⇒ auto-resolve | `src/PositionWalletControl.tsx` (write path), `src/market/usePositionWallet.ts` (read), `src/market/lighterFillsStore.ts` (Lighter session) |
| Chart viewport per interval, exchange, interval | `src/marketChartViewportStorage.ts`, `src/marketExchanges.ts`, `src/marketIntervalStorage.ts` | `0xdeck-widget-market-chart-viewports`, `0xdeck-widget-market-exchanges`, `0xdeck-widget-market-intervals` | per-module load guards | `src/market/marketChartViewport.ts`, chart panel |
| Global candle appearance (Body/Border/Wick colors, visibility, opacity) | `src/market/candleColors.ts` + `src/market/useCandleColors.ts` | `0xdeck-candle-colors` (global, **not** workspace/panel scoped): legacy top-level `rising`/`falling` mirror of Body + `body`/`border`/`wick` records `{ visible, rising, falling, opacity }` | `sanitizeCandleColors` (per field, legacy pair seeds all parts, opacity clamps 0–100) | `src/BtcPerpetualChartPanel.tsx` (in-place candlestick series `applyOptions`); UI `src/AppearanceMenu.tsx` + `src/widgetSettings/CandleColorsDialog.tsx` |

**Visibility semantics: `hidden` vs `enabled` (MUST).** Two storage vocabularies express the same render/no-render concept with inverted polarity, and both stay as they are — no migration, no rename and no storage-key change:

- `hidden` (rectangle, line, anchored VWAP): opt-in hiding. Absent or `false` = rendered; the field is deleted when the object is shown again (`isChartObjectHidden` / `setChartObjectHidden` in `src/market/chartObjectState.ts`).
- `enabled` (FRVP, rolling VWAP instances): opt-out enabling. Missing/`true` = rendered; `false` = kept in storage but not rendered (the `sanitize*` functions default it to `true`, render paths skip disabled instances, and `isFixedRangeVolumeProfileInstanceHidden` is the existing FRVP bridge to the `hidden` vocabulary). Rolling VWAP reads its instance `enabled` flag directly in `rollingVwapChartSeries.ts`.

Both fields only gate rendering: a hidden/disabled object keeps its geometry, its settings and its header list row, so it can be shown, restyled or deleted. No shared helper is warranted today: the two vocabularies meet at exactly one bridge (`isFixedRangeVolumeProfileInstanceHidden`) and a generic `!enabled ⇒ hidden` wrapper would add a third name without removing real duplication. New objects MUST pick one of the two and record it in the table above.

**Legacy read-only paths (MUST stay read-only).** `0xdeck-widget-rolling-vwap-settings` (`src/rollingVwapSettingsStorage.ts`) is read only to migrate a pre-instance overlay into instances (`migrateLegacyRollingVwapToInstances` in `src/market/rollingVwapInstancesMigration.ts`) and MUST NOT receive new fields; its `saveWidgetRollingVwapSettings` export currently has no UI call site and new code MUST NOT call it. Legacy `rolling-vwap` entries in the indicator presentation map are never applied to rendering: `applyMarketIndicatorPresentationToBundle` returns early for that id, and `syncWidgetMarketIndicatorPresentations` skips it. New settings MUST NOT be added to either legacy path.

**Sanitizers are the storage contract (MUST).** Shared controls sanitize on load (`sanitizeLineChartStrokeStyle`, `sanitizeMarketStyleOpacityPercent`, `isLineChartStrokeWidth`, `isRollingVwapHexColor`), so hand-edited or older storage cannot render an invalid style; an unknown value falls back to the object's default instead of failing the whole record. Defaults themselves follow [Defaults](#appearance--settings): one palette role set, no feature-local hex literals.

---

## Series primitive redraw lifecycle (MUST)

A lightweight-charts series/pane primitive is a *view* of caller-owned state. Its `updateAllViews()` — and every `renderer()` / view `update()` it calls — MUST be view-only: it may rebuild geometry and paint the next frame, but it MUST NOT schedule another chart redraw, directly or indirectly. No `requestUpdate()`, no series `applyOptions` / `setData`, no public setter, and no timer, `requestAnimationFrame` chain or microtask that ends in a request may originate inside the render pass. A self-scheduling render path turns one library update into a permanent frame loop: the chart repaints forever while nothing changes.

**Legitimate invalidation (MUST remain).** Only these call sites may call `requestUpdate()`, one call per explicit change:

- attachment initialization (`attached()`), so the primitive paints its first frame — via its own `invalidate()`, not from `updateAllViews()`;
- an external data, style or visibility change made outside the chart (`set*` / `invalidate()` on the attachment, context replacement);
- the object's public update / apply path that the chart cannot observe;
- user interaction that changes what must be drawn (pan/zoom, hover, selection, drag).

**Requests vs painted frames (MUST be distinguished).** One `requestUpdate()` call per explicit external change is correct and is what the reference primitives do; a test MUST NOT require two setters to produce one request. Coalescing requested updates into painted frames is the chart library's job, not the primitive's: several `requestUpdate()` calls before the next paint become one frame inside lightweight-charts, so the primitive MUST NOT add its own batching, debounce or timer layer to reduce request counts. This standard makes no promise about a fixed number of painted frames per interaction, and a test MUST NOT assert one; what matters is that requests stay bounded by real external events (a pan/zoom may request once per pointer event) and that an idle chart settles to zero further requests and zero further frames. Library-driven `updateAllViews()` is never an invalidation source, and it MUST still rebuild the visible model from the current context, because the library calls it for its own layout passes (data change, pan/zoom, resize, pane reorder).

**Disposal (MUST).** `detached()` clears the chart, series and `requestUpdate` references and every timer or listener the primitive installed, so no later callback can schedule a frame; the attach helper's `dispose()` detaches. After disposal a public setter or library update MUST be a no-op — never a throw and never a paint.

**Lifecycle tests (MUST for a new or changed primitive).** Unit tests count `requestUpdate()` calls and canvas draws as separate signals; painted-frame behaviour needs the real-library browser harness (below):

- **Idle settles:** after the initial paint, repeated library `updateAllViews()` calls on an unchanged context add **zero** further `requestUpdate()` calls — including the hidden (`visible: false`), zero-opacity (`fillOpacity: 0`), empty (no models) and multiple-primitive mounted states.
- **External changes paint:** each external data/style/visibility setter and each public update adds exactly one `requestUpdate()` call, and the next library update renders the new state.
- **Interaction paints:** pan/zoom, hover or selection that must repaint adds requests bounded by the gesture's own events — never a fixed machine-frame number and never a self-sustaining chain; the library's own pass stays view-only.
- **Dispose stops scheduling:** after detach/dispose no callback adds a request or a frame, and later setters do not resurrect one.

Unit tests count the primitive's own `requestUpdate()` / `invalidate()` calls **separately** from canvas clears and draws; a Node test cannot observe real painted frames. Painted-frame coalescing and idle quiescence are covered by the real-library Playwright harness, which wraps `requestAnimationFrame` around the installed `lightweight-charts` package and counts real canvas fills per frame: [e2e/anchored-vwap-redraw.spec.ts](../e2e/anchored-vwap-redraw.spec.ts) and [e2e/vwap-band-fill.spec.ts](../e2e/vwap-band-fill.spec.ts) over [e2e/fixtures/anchored-vwap-redraw.ts](../e2e/fixtures/anchored-vwap-redraw.ts) and [e2e/fixtures/vwap-band-fill.ts](../e2e/fixtures/vwap-band-fill.ts). A render pass legitimately clears and repaints once per frame, so a draw counter alone cannot distinguish "one frame per interaction" from "one frame forever". Distinguish live ticks from idle: a live kline tick must repaint; a settled hidden, zero-opacity or empty chart must not.

**Scope.** #254 and #259 fixed this defect class; their lifecycle tests in `sessionVwapBandSeriesPrimitive.test.ts` and `anchoredVwapBandFillSeriesPrimitive.test.ts` are the reference pattern, not a request to rewrite unrelated primitives, their numerical code or their performance characteristics. A source-text scan for `requestUpdate` cannot prove the absence of an indirect loop (for example through a library API that itself triggers a layout pass), so review MUST NOT accept a grep claim as evidence — only the counting lifecycle test is evidence.

---

## Rolling VWAP band primitive (#262, MUST)

A Rolling VWAP instance renders its six deviation-band outlines and three band
fills through **one** official series primitive attached to its native centre
`LineSeries` (`src/market/rollingVwapBandSeriesPrimitive.ts`, geometry in
`src/market/rollingVwapBandRenderGeometry.ts`). This is a supported
implementation of the **Bands** category, not a new object type or a capability
gap; every user-facing capability above stays the same.

- **Why.** Before #262 the instance owned six native band `LineSeries` plus
  three fill primitives. Installed lightweight-charts 5.2.x rebuilds one raw
  item and style object per loaded row for **every** `series.update()`, so one
  live tick over N loaded bars cost seven full-history rebuilds per instance.
  The centre stays native for series identity, the last-value label and the
  price line; the outlines/fills move into the primitive.
- **Layers.** Fills paint at `'bottom'`, outlines at `'normal'`, the selection
  halo at `'top'`, matching the former fill primitives and native band series.
- **Interaction stays shared.** `chartObjectSettingsHitTest.ts` resolves a
  band-part hit through the primitive's official `hitTest`/geometry and the
  native centre first (same precedence as the old series order). Single click,
  double click, the per-instance settings dialog, outside press, `Esc`, the
  header hide/show/delete rows and the per-band halo all reuse
  `chartObjectSettingsTarget`, `overlayIndicatorSelection` and
  `overlayIndicatorSelectionHalo`; there is no second pointer path, picker or
  store. A band whose selected distance is zero (a 0 multiplier in
  standard-deviation mode or a 0 % distance in percentage mode), a hidden/disabled
  instance or an unsupported timeframe has no geometry and cannot be selected.
- **Per-first-visible-base projection.** Percentage and IndexedTo100 convert
  each native source with that source's own first visible value. The primitive
  reproduces this through official APIs by projecting each outline value
  through the centre conversion base, and its `autoscaleInfo` merges the
  per-outline ratio ranges (fills through the centre base) before returning the
  raw range. The former 3.95 %/3.99 % divergence is resolved; the remaining
  same-input residual is a last-bit floating-point difference in the merged
  price range (≤0.05 % of pixels, identical ink, ~1e-12 px coordinates), not a
  base or geometry difference.
- **Redraw lifecycle.** `updateAllViews()` rebuilds the visible window (plus
  neighbours) and never requests a paint; external data/style/visibility/public
  updates and the attach hook each call `invalidate()` once; `detached()`
  clears every reference, so disposal stops scheduling. Counting tests:
  `src/market/rollingVwapBandSeriesPrimitive.test.ts`; real-library frames and
  same-input pixel/coordinate comparators: `e2e/rolling-vwap-band-primitive.spec.ts`.

### Band type: standard deviation or percentage of VWAP (#282, MUST)

Each Rolling VWAP instance selects its band offsets with one **Band type**
control in `RollingVwapSettingsDialog.tsx`: `Standard deviation` (`stdev`) or
`Percentage of VWAP` (`percentage`). This is a per-instance offset definition,
not a new chart object; the centre line, the band styling, the primitive
pipeline and every interaction stay exactly as they are.

- **Storage and migration.** `bandType` and `bandPercentages` (`band1`–`band3`)
  live in the existing per-instance record, sanitized by
  `sanitizeRollingVwapSettings`. `bandType` defaults to `stdev` and every
  percentage defaults to `0`, so a pre-#282 record keeps its exact
  standard-deviation bands and gains no visible percentage bands. Loading is a
  read only: the legacy record is not rewritten until the user adds an instance
  or saves settings, and the legacy read-only keys stay untouched.
- **Both parameter sets are kept.** `multipliers` (Pine σ multiples) and
  `bandPercentages` are stored separately; the dialog's `Band type` switch and a
  later Save keep the inactive mode's values, so switching back restores them.
  Only the selected mode positions the bands: a `0` distance hides that pair
  while the other mode's non-zero value stays stored.
- **Percentage formula.** `upper = VWAP * (1 + p / 100)` and
  `lower = VWAP * (1 - p / 100)` around the instance's own rolling VWAP. It is
  not a percentage of candle price, not an ATR or stdev distance, and it is
  independent of the chart's **Percentage / IndexedTo100 price-scale mode** —
  the band primitive keeps its existing per-first-visible-base projection for
  every price-scale mode.
- **Validation.** A percentage is a finite number `0 <= p <= 100`
  (`MAX_ROLLING_VWAP_BAND_PERCENTAGE`, the whole VWAP distance). Fractional
  values are supported; missing, `NaN`/Infinity, numeric-string, negative and
  `> 100` values fall back to that band's `0` default in the sanitizer.
- **Unchanged math.** VWAP/stdev centre, rolling window, `minBars`, warmup,
  volume weighting, zero-volume and gap handling, and every other indicator are
  untouched by the band type: only the band offsets read the selected set.
- **Unchanged presentation.** Per-band color/opacity/width/`Line`/`Dot`, the
  shared Background fill, halo, hit test, gear/double-click settings,
  hide/show/delete and per-instance isolation behave the same in both modes;
  autoscale and hit testing read the resolved selected distances through the
  one primitive.

## Live price-level profiles (#280, MUST)

Three opt-in profiles render live MarketLens Hyperliquid L4 books as right-anchored, leftward bar
profiles on the candle pane through **one** primitive and one index/geometry/settings scaffold
(`src/market/liquidationLevelsSeriesPrimitive.ts`, kinds in `src/market/priceLevelsKind.ts`):

- **Liquidation Levels** — open positions at their liquidation price (own socket, own feed);
- **Stop Loss Levels** / **Take Profit Levels** — resting trigger orders at their trigger price, one
  channel each of a single shared `tpsl` socket.

They are supported **Background / fill** objects (bars), not a new category: per-side Color + Opacity
plus one bar-extent control, and no stroke width, line style, lock or delete, because they own no
movable geometry. Each kind has its own toggle, settings record and storage key; the trigger-order
magnitudes are the **position-covered** size (`size === 0` = whole position, fixed orders cap at
`min(order size, position)`), never the raw order size alone. Full source semantics, side wording,
verified live schema and provenance are in
[MARKETLENS-LIQUIDATION-LEVELS.md](./MARKETLENS-LIQUIDATION-LEVELS.md).

- **Fixed defaults, user-restylable bars.** Long `#22C55E` / short `#EF4444` (the shared semantic
  pair) at 60 % opacity, 25 % max bar width. The user may restyle the pair because a bar drawn over
  candles is a legibility preference; the *sides* never change meaning. Defaults come from
  `marketSemanticColors.ts`; no feature-local hex literal exists.
- **Current profile, not a time series.** Bars are drawn at their liquidation price with the current
  candle price scale, so panning into old candles keeps showing today's book. The primitive paints
  `LEV LIQ · LIVE/STALE/SYNCING` at the top of the column, and the panel notice states
  connecting/reconnecting/resyncing/stale explicitly; a reset clears the book before the reconnect.
  It never writes candle data, adds a price/time scale, or returns `autoscaleInfo`.
- **Per-paint bound.** Only the visible price band is binarized, into one row per CSS pixel of the
  candle pane (cap 2 000 rows), through a price-sorted index answered by binary search; per-paint work
  is bounded by the pane height and the positions inside the visible band, never by loaded candle
  history or the whole ≈ 32 k-position book. There is no native series per row. When the row cap
  applies the row height is derived as `paneHeight / rowCount`, so paint and hit test keep covering
  the whole pane instead of clipping the bottom price band.
- **Mixed rows and empty windows.** A row that holds both long and short positions paints the longer
  side first and the second side at half alpha, so the overlap reads as both sides instead of hiding
  one. The status label is painted even when the visible window holds no positions, so an empty
  window is not mistaken for a disabled indicator.
- **Honest hover totals and readiness.** The trigger-order readout never prints a bare "requested"
  total: fixed-size orders keep their requested size, whole-position orders (`size === 0`) report the
  position they close, and uncovered orders are counted separately. A profile is `LIVE` only after
  its own channel applied a snapshot; before that it is `SYNCING` ("waiting for the snapshot"), and a
  decode failure is attributed and shown, not swallowed.
- **Hover cost (recorded, bounded).** A crosshair move inside the bar column re-derives the
  visible-band profile of the profiles it probes (the same bounded derivation as a paint, stopping at
  the first resolved profile in hit order); moves outside the column are rejected without derivation.
  This is an accepted bounded cost, not a measured frame budget.
- **Several profiles at once.** Paint order is fixed (liquidation → stop loss → take profit) and hit
  order is the reverse, so the pointer resolves the profile painted on top; each profile keeps its own
  label line and header gear row, so none becomes inaccessible. Bar lengths are normalised *within*
  one profile — no cross-type unit or scale claim exists.
- **Transforms per paint, index on updates.** Price→row and row→price conversions are recomputed in
  every view rebuild from `coordinateToPrice`/`priceToCoordinate`; the sorted price index is
  price-domain derived state rebuilt lazily, at most once per read after the book changed.
- **Redraw lifecycle.** `updateAllViews()` is view-only; one `invalidate()` per external change (new
  file, settings, visibility, status, selection); pan/zoom/resize/pane-reorder/manual scale repaint
  through the library's own passes; `detached()` clears every reference. Counting tests:
  `src/market/liquidationLevelsSeriesPrimitive.test.ts`; real-library frames and DPR-2 bitmap geometry:
  `e2e/liquidation-levels-primitive.spec.ts`, `e2e/liquidation-levels-primitive-dpr2.spec.ts`.
- **Interaction stays shared.** The bars are hit-tested through
  `hitTestChartObjectSettingsTarget` (rebuilt geometry, same price conversions), so single click
  selects them as an overlay indicator (halo drawn by the primitive in its own colors), double click
  opens `LiquidationLevelsSettingsDialog`, and outside click / `Esc` release the selection. Hover uses
  `chart.subscribeCrosshairMove` and only reads state, so pan/zoom/crosshair/drawing tools are
  untouched.
- **Exchange scope.** The feed is Hyperliquid BTC data. On Binance the menu row is disabled with
  "Hyperliquid only" wording, no socket is opened, and a panel that still has the indicator selected
  shows an explicit unavailable notice instead of drawing foreign data.

## Performance and cost contracts (MUST)

Chart-object cost claims are reviewable only when the counted unit is named. The current inventory,
the measured evidence and the unmeasured risks are in
[CHART-PERFORMANCE-AUDIT.md](./CHART-PERFORMANCE-AUDIT.md); this section is the rule set that
follows from it. These rules constrain *how* chart objects are built and how performance is claimed —
they do not pick an architecture, a worker, a cache or a page cap.

**Name the layer (MUST).** A claim, test or review must say which cost layer it is about:
**(1)** source derivation over candles, **(2)** a native series data update (`setData`/`update`),
**(3)** a primitive view rebuild (`updateAllViews()` geometry), or **(4)** paint (canvas draw calls in
bitmap space, ×DPR). Requests (`requestUpdate()`/`invalidate()`) are a separate axis from painted
frames and MUST NOT be reported as frames. "The formula is O(N)" is not a time claim; "the page took
120 ms" is not evidence about which layer caused it.

**Per-paint work MUST be bounded by what is drawn (MUST).** A renderer, view `update()` or geometry
build MUST NOT walk the loaded candle history on every painted frame. It MUST be bounded either by
the visible window plus its chronological neighbours (the pattern in
[session band geometry](../src/market/sessionVwapBandRenderGeometry.ts), #252, and
[Rolling VWAP band primitive](#rolling-vwap-band-primitive-262-must), #262) or by a bounded model
count (number of drawings, instances, profile rows). Bounding by V is required for *paint* work; it
is NOT a requirement for source derivation that runs once per history page or once per live tick —
full-buffer EMA/RSI/VWAP recomputation is legitimate (see *Not requirements*).

**Transforms are per paint; price-domain state may be incremental (MUST).** Coordinate and logical
conversions (`timeToCoordinate`, `priceToCoordinate`, `logicalToCoordinate`, `coordinateToTime`) MUST
be recomputed during the view rebuild for the current chart state; MUST NOT be cached across paints,
frames, pans or resizes. A stale coordinate cache is a correctness bug, not an optimisation. Price-
domain derived state (EMA recursion, rolling sums, session accumulators, anchor-sliced VWAP) MAY be
maintained incrementally instead of recomputed, but only when it is exact and preserves the seeds,
session boundaries, anchor terms and prepend behaviour below; the incremental result MUST equal the
full recompute, and a counting/equality test MUST ship with it.

**Native series first; a primitive needs evidence (MUST).** Prefer documented native series and
official APIs. Moving native series into a series primitive is justified only by measured per-update
cost, as #262 did for the Rolling VWAP bands (7 → 1 native updates per instance per tick). Object
count alone is not a reason to build a primitive, and a new primitive MUST NOT replace a capability
the official API already provides. When counting cost, count native series per rendered line: one
native series per instance is one O(N) data update per tick in the installed 5.2.x line.

**Inactive objects: no hidden history writes, exact hydration (MUST).** History application MUST NOT
derive or write series data for a chart object that is not rendered in the current panel state
(inactive indicator, disabled/hidden instance), except where that work is required for a rendered
object. Deferring the work MUST NOT leave a renderable object stale: enabling a previously inactive
object MUST hydrate it from the full loaded history before (or atomically with) making it visible, and
from then on live ticks MUST keep it identical to an always-active reference — same seeds, session
boundaries, anchor math and final values. A latest-point live update MUST NEVER be applied to a series
that was not hydrated, and a deferral MUST NOT change the final loaded candles or the saved viewport.
The existing RSI pane creation (`syncRsiPane` → `setRsiPaneHistoryData`) is the hydration reference.
Status at base `6544e96`: not met — see the conformance gap P1 below; the fix is owned by the open
task, not by this rule.

**History and viewport invariants (MUST).** Any change on the history, live or paint path MUST
preserve: the final requested candle count and pages actually honoured; the exact saved viewport
(visible time range plus logical anchors and right offset); the EMA SMA seed and warmup; the RSI
Wilder seed; UTC VWAP session boundaries (day, Monday week, calendar month/quarter/year); the Rolling
VWAP window and `minBars` floor; the Anchored VWAP anchor and anchor-sliced walk; candle order,
dedupe and live-bar final state; every colour, opacity, width, style and default; and the provider
availability metadata (`available_from`, `history_unavailable`) that the notices rely on. Dropping
requested pages, clamping the saved viewport, lowering history caps, disabling defaults or merely
wrapping an unbounded task in a timer are NOT acceptable ways to improve responsiveness.

**Availability provenance (MUST).** Interval support is source data, not UI preference
(`src/market/indicators.ts`). An object that cannot compute or render for the current interval,
history horizon or anchor position MUST show the existing explicit state/notice and MUST NOT render a
silently empty or fabricated result; a context or profile request older than the provider horizon must
surface that provenance. A performance change MUST NOT hide, widen or fake availability.

**Evidence for a performance claim (MUST).** A PR that claims a performance improvement must include:
immutable raw results per cell with script/asset hashes, source SHA, host (CPU model and count), DPR,
viewport and cadence; timing windows anchored after warm-up; matched controls (same candles, same final
N and V, interleaved repeats); counted units named separately (requests, native updates, canvas
fills/clears, long tasks, frame pacing); an explicit statement whether it measured the real application
or an isolated fixture; DPR 1 and DPR 2 pixel identity whenever geometry changes (including alpha
seams); and the installed `lightweight-charts` version. Absolute milliseconds are host-dependent:
targets are assessments, not CI gates, and only counters may gate. Upstream fixes are version-scoped
and a library upgrade is never an unmeasured performance fix.

**Not requirements (explicit).** Nothing here requires or authorises:

- an arbitrary page cap (the current 40-page viewport and preload constants are implementation
  behaviour, not a contract);
- a yield/`setTimeout`/`requestIdleCallback` timer around history application;
- a blanket "no caching" or, conversely, a mandatory cache;
- O(visible) complexity for all indicators — only per-paint work must be V-bounded;
- workers, conflation, decimation, batching or a rewrite of the numerical code;
- a blanket ban on full recomputation for EMA/RSI/session VWAP;
- an automatic Principal Engineer review or a new approval flow.

**Current status at base `6544e96`.** Redraw lifecycle: met for the primitives that ship the counting
tests (see [Series primitive redraw lifecycle](#series-primitive-redraw-lifecycle-must)). Visible-
window paint bounding: met for session VWAP bands, Rolling VWAP bands and the live liquidation-level
profile (visible price band + pane rows); not yet measured/gated for the anchored VWAP band fill and
the Aggregated Liquidations overlay (audit risks R5/R7). Inactive-object
derivation: **not met** (P1). Box visibility for a start that predates loaded history is a product
geometry decision tracked separately; it is a visibility limitation, not a performance contract.

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
| P1 | History application derives and writes indicator/instance series even when the object is not rendered (inactive indicator, disabled/hidden instance) | `src/market/applyChartHistorySeries.ts:39-60` writes the candle, 5 EMA and 5 session VWAP levels (21 native `setData` calls) plus every Rolling and Anchored instance, and RSI when its pane exists | Panning back and restoring a deep viewport pay full-series derivation and native updates for objects the user cannot see; measured page and restore cost grows with loaded N — owned by the open history-application task (#264) |

At base `6544e96` one gap is open: **P1**, the inactive-object derivation contract above, which the open history-application task owns. #194 (Rolling VWAP per-band widths, per-series time-based VWAP styling) and #195 (overlay indicator single-click selection, `hidden` / `enabled` semantics) stay resolved. A gap removed from this table MUST NOT be cited as precedent for a new object.

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
| Overlay indicator single-click selection + feedback | `src/market/overlayIndicatorSelection.ts`, `src/market/overlayIndicatorSelectionHalo.ts` |
| Settings target + hit test + pane double-click | `src/market/chartObjectSettingsTypes.ts`, `chartObjectSettingsHitTest.ts`, `chartObjectSettingsPanePointer.ts` |
| Pane element registry (candle / RSI / liquidations) | `src/market/chartPaneRoles.ts`, `src/market/candlePane.ts` |
| Hover cursor mapping | `src/market/drawingCursor.ts` (`resolveDrawingCursor`, `updateDrawingCursor`) |
| Empty-space deselect on non-candle panes | `src/market/drawingPaneDeselect.ts` |
| Keyboard ownership | `src/market/rectangleKeyboardScope.ts` |
| Navigation lock application | `src/market/chartDrawingInteractionMode.ts` |
| Per-tool interactions | `rectangleInteraction.ts`, `lineInteraction.ts`, `fixedRangeVolumeProfileInteraction.ts`, `anchoredVwapDrawingInteraction.ts` |
| Settings dialogs | `src/widgetSettings/LineStyleDialog.tsx`, `RectangleFillStyleDialog.tsx`, `MarketIndicatorStyleDialog.tsx`, `FixedRangeVolumeProfileSettingsDialog.tsx`, `CandleColorsDialog.tsx`, `src/market/RollingVwapSettingsDialog.tsx`, `src/market/AnchoredVwapSettingsDialog.tsx`, `src/market/AggregatedLiquidationsSettingsDialog.tsx`, `src/market/LiquidationLevelsSettingsDialog.tsx`, `src/widgetSettings/MarketPositionMarkerSettingsDialog.tsx`, `src/components/ui/dialog.tsx` |
| Dialog width/spacing + non-blackout overlay | `src/widgetSettings/chartSettingsDialogLayout.ts` (`CHART_SETTINGS_DIALOG_CONTENT_CLASS`, `CHART_SETTINGS_DIALOG_OVERLAY_CLASS`, `CHART_SETTINGS_DIALOG_BODY_CLASS`) |
| Dialog draft/diff/sanitize logic | `src/widgetSettings/lineStyleDraft.ts`, `rectangleFillStyleDraft.ts`, `marketIndicatorStyleDraft.ts`, `fixedRangeVolumeProfileSettingsDraft.ts`, `src/market/aggregatedLiquidationsSettingsDraft.ts` |
| Global candle appearance preference | `src/market/candleColors.ts`, `src/market/useCandleColors.ts`, `src/AppearanceMenu.tsx`, `src/widgetSettings/CandleColorsDialog.tsx` |
| Redraw-request lifecycle tests (unit: `requestUpdate` calls + canvas draws) | `src/market/sessionVwapBandSeriesPrimitive.test.ts`, `src/market/anchoredVwapBandFillSeriesPrimitive.test.ts`, `src/market/lineSeriesPrimitive.test.ts`, `src/market/rectangleSeriesPrimitive.test.ts`, `src/market/fixedRangeVolumeProfileSeriesPrimitive.test.ts` |
| Live feed sharing (one socket per page, ordered decode, ref-count) | `src/market/liquidationLevelsFeed.ts` (liquidation), `src/market/tpslLevelsFeed.ts` (both trigger-order channels), `src/market/liquidationLevelsStreamClient.ts`, `src/market/liquidationLevelsProtocol.ts` |
| Price-indexed profile geometry + hit test | `src/market/liquidationLevelsIndex.ts`, `src/market/liquidationLevelsProfileGeometry.ts` |
| Profile kinds, labels, storage keys, paint/hit order | `src/market/priceLevelsKind.ts` |
| Painted-frame coverage (real library: rAF + real canvas fills) | [e2e/anchored-vwap-redraw.spec.ts](../e2e/anchored-vwap-redraw.spec.ts), [e2e/vwap-band-fill.spec.ts](../e2e/vwap-band-fill.spec.ts), [e2e/fixtures/anchored-vwap-redraw.ts](../e2e/fixtures/anchored-vwap-redraw.ts), [e2e/fixtures/vwap-band-fill.ts](../e2e/fixtures/vwap-band-fill.ts) |
