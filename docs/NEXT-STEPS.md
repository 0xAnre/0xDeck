# Next Steps

## Goal

Make 0xDeck a market research workspace canvas where users can combine built-in panels and custom widgets.

## Done

1. Local Python backend — FastAPI, DuckDB, Parquet streams ✅
2. Data source dialog — folder path + registry ✅
3. Widget catalog — Data Table, Chart, KPI, Dashboard, Reports, Notes ✅
4. Per-widget dataset binding + multi-instance widgets ✅
5. Time range filter — `15m | 1h | 6h | 24h | 7d | All` ✅
6. KPI aggregations — Last, Avg, Sum, Min, Max, Count, Change % ✅
7. Timestamp / cell formatters ✅
8. Data Table column picker + workspace defaults ✅
9. Auto registry refresh on folder save ✅
10. Header dropdowns for data widget settings (dataset, columns, range, metric, aggregation) ✅
11. Custom widget path — [templates/widget/](../templates/widget/README.md), [WIDGET-GUIDE](./WIDGET-GUIDE.md), [WIDGET-STANDARD](./WIDGET-STANDARD.md) ✅
12. BTC Perpetual — REST + WebSocket klines, indicators, rolling VWAP overlays, FRVP / rectangle / line tools ✅
13. Workspace screen navigation — `p` then `1`–`5` ✅

## Remaining

| Priority | Task |
|----------|------|
| 1 | Reports — saved queries + CSV/PDF export (UI mock today) |
| 2 | Backend performance — large stream queries (indexing, caching, file pruning) |
| 3 | Additional live widgets beyond BTC Perp (generic stream wiring for custom panels) |

## Optional polish

- Widget gallery / example workflows
- Bot monitor widget example
- Strategy notebook widget
- OHLC / candlestick chart type
- Global vs per-widget range sync toggle

## First milestone (complete)

Parquet folder path → dataset preview → chart + KPI + table.
