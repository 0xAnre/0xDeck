# MarketLens liquidations demo (standalone experiment)

A single, browser-openable page that draws **live Hyperliquid BTC open-position
liquidation-price liquidity** from the public MarketLens L4 stream. It is an
experiment, not a product surface: no workspace widget, no registry entry, no
backend route, no wallet, no orders, no authentication.

```text
experiments/liquidations-l4/
├── index.html            page shell (header, panel, footer, source notes)
├── style.css             dark theme, palette sampled from the reference view
├── fixtures/             one real delta file captured from the public stream
└── src/
    ├── main.ts           DOM wiring, viewport, interaction, status/freshness
    ├── client.ts         WebSocket lifecycle: ping/pong, staleness, reconnect
    ├── protocol.ts       head parsing, epoch/seq rules, book reducer
    ├── decode.ts         Parquet message → head + normalised rows
    ├── model.ts          screen-row binning + hover selection
    ├── view.ts           price↔row mapping, zoom/pan/re-centre, axis ticks
    ├── render.ts         Canvas 2D ladder renderer
    └── format.ts         display formatting
```

## Run it

```bash
npm run dev:liquidations     # http://localhost:57351
npm run build:liquidations   # artifact into experiments/liquidations-l4/dist
npm run test:liquidations    # protocol/view/model/client tests (node:test)
```

The PR preview is built with an isolated base so every asset URL stays beneath
its prefix and nothing can fall through to the canonical app:

```bash
LIQUIDATIONS_BASE=/previews/pr-<number>/ \
LIQUIDATIONS_OUT_DIR=/srv/0xdeck-previews/pr-<number>/<full-sha>/dist \
  npm run build:liquidations
```

## What the data is

Source: `wss://api.marketlens.app/data/hyperliquid/l4/liquidations/BTC` —
public, keyless, no `Authorization` header. The semantics below are taken from
the [published L4 API documentation](https://marketlens.app/api/l4/), not
inferred from samples.

- Every WebSocket **binary** message is one Parquet file. Its key-value metadata
  is the file head: `snapshot`, `channel`, `coin`, `epoch`, `seq`, `ts`.
- A **snapshot** starts an epoch: replace the channel's book with it.
- A **delta** belongs to one epoch and carries `seq` immediately after the last
  applied one. A delta from another epoch is void; a `seq` gap means a delta was
  missed → reconnect for a fresh snapshot. A later snapshot can arrive at any
  time and replaces the book again.
- On `liquidations`, one row is **one open position**, keyed by `user` (20-byte
  address). `price` is that position's liquidation price, `size` the position
  (positive long, negative short), `ts` when it last changed.
- A delta row carrying **only its key** removes that position. Removals come
  first in a file.
- Prices and sizes are Parquet decimals at the coin's own precision — BTC perp
  uses 1 price decimal and 5 size decimals, which the file's schema carries.
- The server sends a text `{"ping":<n>}` every 2 s; the client must answer
  `{"pong":<n>}` within 6 s or the connection is closed.

This is **liquidation-price liquidity of positions that are still open**. It is
not a history of liquidations that happened, and nothing here is reconstructed
or backfilled: if the stream cannot be read, the page says so instead of drawing.

## What the page shows

- A central price gutter with a continuous vertical liquidation-price axis.
  Shorts (negative size) are red bars growing **left**, longs green bars growing
  **right**; every row's bar length **and** brightness encode the position size
  at that price.
- Magnitude axes: shorts mirrored along the top, longs along the bottom, both
  anchored at zero next to the price gutter.
- Hover details per price row: the positions there (largest first), address,
  signed size, notional, and how long ago the level last changed.
- Scroll to zoom (anchored under the cursor), drag to pan, double-click or the
  **Re-centre** button to re-frame on the size-weighted bulk of the book.
- Status pill and overlay for connecting / live / stale / reconnecting / error,
  plus a footer with position counts, long/short totals, the visible window, the
  file head time, data age, epoch, sequence, files applied and decode duration.

The initial framing is a **mass-quantile window** (0.5 %–99.5 % of size), so the
ladder is framed on where liquidity actually is rather than on cross-margin
outliers that can sit several orders of magnitude away from the market. No mark
price is fetched — the stream does not carry one and the page does not call any
other service — so the ladder does not claim where spot is.

## Why the reference renderer is not reused

The reference view at `https://marketlens.app/data/hyperliquid/` was inspected
directly (public HTML and JavaScript, plus a rendered screenshot and pixel
sampling for the palette). The findings:

| Question | Finding |
| --- | --- |
| Installable package? | No. The public npm registry has no MarketLens view package (search returns unrelated projects). |
| What is the component? | A compiled Svelte component reached from `_app/immutable/nodes/<hash>.js`, which imports several hashed chunks; the renderer chunk calls `canvas.getContext('webgl2')` and uses custom GLSL plus `drawElementsInstanced`. |
| Can it be imported from the site? | No. `_app/immutable/*` responses carry no `Access-Control-Allow-Origin`, so a cross-origin ES module import from another origin is blocked by CORS. URLs are content-hashed and change on every deploy. |
| Can it be vendored? | Not permitted. The bundles are unlicensed third-party application code (the only licence text inside them is the bundled MIT Lucide icon attribution), so copying them into this repository would redistribute code without a licence. |

The node chunk also bootstraps a third-party session-recording snippet, so it is
not a self-contained component. Reuse would therefore mean vendoring an
unlicensed, hash-rotting, app-coupled bundle graph — so the page is an
**independently authored Canvas 2D renderer** that reproduces the reference's
visual language (dark canvas, hairline cards, red/green two-sided magnitude
bars, price column, mirrored top magnitude axis, compact K/M labels, lime
hover highlight) without copying its code. The trade-off is deliberate: no
WebGL2 instancing (irrelevant at this book size — only visible rows are drawn,
33k positions decode in ~0.1–0.2 s) and no dependency on the reference's
internals.

## Verification

- `npm run test:liquidations` — protocol reducer (snapshot replace, delta
  add/replace/remove, key-only removal, zero-size removal, foreign epoch, `seq`
  gap, duplicate `seq`, missing snapshot, wrong channel/coin, malformed rows),
  a real Parquet delta fixture decoded end-to-end, view maths (zoom anchoring,
  pan clamping, mass quantiles, tick steps), row binning and hover selection, and
  WebSocket lifecycle (ping→pong, stale on data stall, silence watchdog,
  backoff, application-driven resync, teardown leaving no timers).
- `npm run build` / `npm run lint` — the experiment is inside the typechecked
  TypeScript project, so it cannot rot silently.
- Browser evidence for a published preview (live connection, real rows matched
  between stream and render, interactions, responsive layout, disconnect
  behaviour, and the origin/checksum of every loaded JS/CSS asset) is recorded on
  the task PR, together with any limitation of that run.

## Limits

- Single channel, single coin (BTC). No historical executed-liquidations view.
- Linear price scale; the visible window is user-controlled above the minimum
  span. Zoom/pan state is not persisted.
- The book lives in memory only; a reconnect always starts from a fresh snapshot.
- No mark/spot price, so no "shorts above spot / longs below spot" split.
- Not published to the canonical site and not wired into any workspace.
