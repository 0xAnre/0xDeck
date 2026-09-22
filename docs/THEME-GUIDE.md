# Theme Guide

How themes and the terminal shell work in 0xDeck. Widget content rules: [WIDGET-GUIDE.md](./WIDGET-GUIDE.md).

Themes are **color-only palettes** built on [shadcn/ui](https://ui.shadcn.com) CSS variables (OKLCH). Layout, spacing, typography, and component structure stay fixed across themes.

---

## Source files

| File | Role |
|------|------|
| `src/index.css` | shadcn theme token blocks per `[data-theme='…']` |
| `src/App.css` | `react-grid-layout` resize overrides only |
| `src/themeStorage.ts` | Theme IDs, labels, localStorage |
| `src/ThemeSelect.tsx` | Header theme dropdown |
| `components.json` | shadcn project config |
| `index.html` | Initial `data-theme` on `<html>` |

Theme is applied via `document.documentElement.dataset.theme` and `.dark` class. Default: `neutral`. Unknown saved theme ids fall back to `neutral`.

---

## Built-in themes

| ID | Label | shadcn preset |
|----|-------|---------------|
| `neutral` | Neutral | `b1D0dv86` |
| `stone` | Stone | `bKZTOaNk` |
| `mauve` | Mauve | `b6ZjlcKFk` |
| `taupe` | Taupe | `blTaKtCok` |
| `olive` | Olive | `b6t6ENHec` |

### Core variables

| Variable | Typical use |
|----------|-------------|
| `--background` / `--foreground` | Page and primary text |
| `--card` / `--card-foreground` | Panel surfaces |
| `--popover` | Dropdowns, menus |
| `--muted` / `--muted-foreground` | Secondary text |
| `--border` / `--input` / `--ring` | Borders and focus |
| `--bid`, `--ask`, `--up`, `--down`, `--long`, `--short` | Market semantics |
| `--chart-glow` | Chart placeholder gradient |

Full token blocks: `src/index.css`.

---

## Add a new theme

### 1. Get preset colors

Create a preset at [ui.shadcn.com/create](https://ui.shadcn.com/create), then extract the `.dark` block:

```bash
npx shadcn@latest preset decode <code>
```

### 2. Add CSS block in `src/index.css`

```css
[data-theme='my-theme'] {
  --background: oklch(...);
  --foreground: oklch(...);
  /* copy full token set from an existing theme and adjust colors only */
}
```

Include market tokens (`--bid`, `--ask`, etc.) and `--chart-glow`.

### 3. Register in `src/themeStorage.ts`

```ts
export const THEMES = ['neutral', 'stone', 'mauve', 'taupe', 'olive', 'my-theme'] as const

export const THEME_LABELS: Record<Theme, string> = {
  // ...
  'my-theme': 'My Theme',
}
```

`ThemeSelect` picks up `THEMES` automatically.

### 4. Keep shell fixed

Do not change spacing, font sizes, radius, or layout per theme. Themes change color tokens only.

---

## Shell & grid (theme-independent)

| Topic | Value |
|-------|-------|
| Grid | `react-grid-layout` v2 |
| Breakpoints | lg 36 cols / md 24 / sm 12 |
| Row height | 11px |
| Overlap | Enabled — last dragged panel on top |
| Layout storage | `localStorage` key `0xdeck-workspace` (lg only) |
| Resize | 8 invisible handles (edges + corners) |

---

## Design rules

1. **No hardcoded colors in widgets** — use shadcn/Tailwind semantic tokens (`text-up`, `text-bid`, `bg-card`, …)
2. **One shell for all widgets** — shadcn `Card` panel chrome in `App.tsx`
3. **Color palettes only** — no per-theme layout overrides
4. **Tabular nums** — trading data stays aligned
