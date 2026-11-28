import path from 'node:path'

import { defineConfig } from 'vite'

/**
 * Standalone build for the MarketLens liquidations experiment.
 *
 * This entry point is intentionally separate from the workspace app: it builds
 * only `experiments/liquidations-l4/` into its own artifact, so publishing it
 * never touches `/srv/0xdeck/dist` (the canonical app) and the canonical
 * `npm run build` is unaffected.
 *
 * `LIQUIDATIONS_BASE` sets the Vite `base` for an isolated PR preview prefix
 * (for example `/previews/pr-278/`) so every emitted asset URL resolves beneath
 * that prefix instead of at the host root. `LIQUIDATIONS_OUT_DIR` lets the
 * preview publish straight into its immutable artifact directory.
 *
 *   npm run dev:liquidations
 *   npm run build:liquidations
 *   LIQUIDATIONS_BASE=/previews/pr-278/ LIQUIDATIONS_OUT_DIR=/srv/.../dist \
 *     npm run build:liquidations
 */
const root = path.resolve(__dirname, 'experiments/liquidations-l4')
const base = process.env.LIQUIDATIONS_BASE ?? '/'
const outDir = process.env.LIQUIDATIONS_OUT_DIR
  ? path.resolve(process.env.LIQUIDATIONS_OUT_DIR)
  : path.resolve(root, 'dist')

export default defineConfig({
  root,
  base,
  build: {
    outDir,
    emptyOutDir: !process.env.LIQUIDATIONS_OUT_DIR,
    target: 'es2022',
    sourcemap: false,
  },
  server: {
    port: 57351,
    strictPort: true,
  },
  preview: {
    port: 57352,
    strictPort: true,
  },
})
