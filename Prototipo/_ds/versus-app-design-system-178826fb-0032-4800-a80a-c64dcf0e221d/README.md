# Versus App Design System — Conventions

## Setup

No global provider is required for most components. **Exception**: `Tooltip` requires `<TooltipProvider>` wrapping the render tree. `Popover`, `Drawer`, `Sheet`, and `DropdownMenu` are self-contained.

All components are exported from `window.VersusDS.*` and are standard React components styled with Tailwind CSS utility classes.

## Token Vocabulary

Three token families coexist. Use the Tailwind class equivalents listed below — do not write inline `style` props for color.

**shadcn/ui semantic tokens** (HSL, `hsl(var(--*))`) — use for standard UI:
| Class | Role |
|---|---|
| `bg-background` / `text-foreground` | App background / body text |
| `bg-card` / `text-card-foreground` | Card surfaces |
| `bg-muted` / `text-muted-foreground` | Subdued content |
| `bg-accent` / `text-accent-foreground` | Hover/interactive state |
| `bg-destructive` / `text-destructive-foreground` | Error / delete actions |
| `border` | Default border |
| `ring` | Focus ring |
| `rounded-lg` / `rounded-md` / `rounded-sm` | `var(--radius)` based border radii |

**Enterprise Logic `ent-*` tokens** (RGB triplets — opacity modifiers work: `bg-ent-primary/10`):
| Class | Role |
|---|---|
| `bg-ent-surface` / `bg-ent-surface-container` | Neutral surface hierarchy |
| `text-ent-on-surface` / `text-ent-on-surface-variant` | Body / secondary text |
| `bg-ent-primary` / `text-ent-on-primary` | Navy primary brand (#15326d) |
| `bg-ent-secondary` / `text-ent-on-secondary` | Teal accent (#0d7377) |
| `bg-ent-tertiary` / `text-ent-on-tertiary` | Amber warning (#b45309) |
| `bg-ent-error` / `text-ent-on-error` | Error red (#dc2626) |
| `bg-ent-primary-fixed` | Light navy tint for backgrounds |
| `bg-ent-outline-variant` | Subtle dividers / borders |

**v2 tokens** (hex, direct CSS vars — no opacity modifier):
| Class | Value |
|---|---|
| `bg-v2-primary` / `text-v2-primary` | DistriSuper Navy #213D82 |
| `bg-v2-secondary` / `text-v2-secondary` | DistriSuper Green #009E4F |
| `bg-v2-tertiary` | Mid-blue #3259C3 |
| `bg-v2-neutral` | Light grey #F4F7F9 |

**Fonts**: `font-inter` for v2 data-heavy views; `font-nunito` for the base app.

## Source Files

For up-to-date token values, read `styles.css` (which imports `_ds_bundle.css` with all compiled Tailwind utilities and token definitions). Per-component API: each component's `.d.ts` file.

## Idiomatic Example

```tsx
import { Card, CardHeader, CardTitle, CardContent, Badge, Button } from 'vristo-react-vite'

// Layout glue uses standard Tailwind utilities; components bring their own styles.
<Card className="w-[380px] bg-card">
  <CardHeader>
    <CardTitle className="text-ent-on-surface">Sales Summary</CardTitle>
  </CardHeader>
  <CardContent className="flex items-center gap-3">
    <Badge>Active</Badge>
    <Button size="sm" variant="outline">View Details</Button>
  </CardContent>
</Card>
```

For `Tooltip`:
```tsx
import { TooltipProvider, Tooltip, TooltipTrigger, TooltipContent } from 'vristo-react-vite'

<TooltipProvider>
  <Tooltip>
    <TooltipTrigger asChild><Button>Hover me</Button></TooltipTrigger>
    <TooltipContent>This is a tooltip</TooltipContent>
  </Tooltip>
</TooltipProvider>
```

# VersusDS (vristo-react-vite@0.0.0)

This design system is the published vristo-react-vite React library, bundled as a single
browser global. All 19 components are the real upstream code.

## Where things are

- `_ds_bundle.js` — the whole-DS bundle at the project root; loads every component to `window.VersusDS`. First line is a `/* @ds-bundle: … */` metadata header.
- `styles.css` — the single stylesheet entry: it `@import`s the tokens, fonts, and component styles (`_ds_bundle.css`). Link this one file.
- `components/<group>/<Name>/<Name>.prompt.md` (example JSX + variants), `<Name>.d.ts` (types), `<Name>.html` (variant grid).
- `tokens/*.css` — CSS custom properties, names verbatim from upstream.
- `fonts/` — `@font-face` files + `fonts.css` (when the package ships fonts).
- `guidelines/` — the design system's own usage guidance (1 doc(s), see `guidelines/index.md`). Read these before composing larger layouts.

For a specific component, `read_file("components/<group>/<Name>/<Name>.prompt.md")`.

## Loading

Add these two lines to your page once (React must be on the page first):

```html
<link rel="stylesheet" href="styles.css">
<script src="_ds_bundle.js"></script>
```

Components are then available at `window.VersusDS.*`. Mount into a dedicated child node (e.g. `<div id="ds-root">`), not the host page's own React root, so the two trees don't collide:

```jsx
const { Badge } = window.VersusDS;
ReactDOM.createRoot(document.getElementById('ds-root')).render(<Badge />);
```

## Tokens

133 CSS custom properties from vristo-react-vite. Names are
preserved verbatim from upstream. They are declared inside `_ds_bundle.css` (this DS ships one compiled stylesheet rather than separate token files).

- **color** (21): `--tw-bg-opacity`, `--tw-border-opacity`, `--tw-text-opacity`, …
- **spacing** (3): `--tw-ring-inset`, `--tw-space-x-reverse`, `--tw-space-y-reverse`
- **typography** (1): `--v2-font`
- **radius** (1): `--radius`
- **shadow** (4): `--tw-ring-offset-shadow`, `--tw-ring-shadow`, `--tw-shadow`, …
- **other** (103): `--animate-duration`, `--animate-delay`, `--animate-repeat`, …

## Components

### general
- `Badge`
- `Button`
- `Calendar`
- `Card`
- `Drawer`
- `DropdownMenu`
- `ExportButton`
- `Input`
- `LoadingSpinner`
- `Popover`
- `ScrollArea`
- `Select`
- `Separator`
- `Sheet`
- `Skeleton`
- `Table`
- `Tabs`
- `Textarea`
- `Tooltip`
