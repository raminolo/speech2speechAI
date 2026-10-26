# Design language — "Studio"

The reference for keeping this app visually coherent as it grows. Read it before
touching `style.css`, `index.html`, or any DOM-building code in `main.js`.

---

## The thesis: a light studio, and the orb is the only speaker

This is a voice app running on your desk, in daylight. The canvas is soft
paper-grey; surfaces are white glass cards with diffuse shadows. The one thing
in the room that has color is the thing that is talking:

- **The orb carries all saturated color.** Its glass core, ring, and glow take
  the current state hue (`--glow`, set by each `.state-*` class).
- **Everything else is quiet greys** — surfaces, borders, buttons, the
  transcript. Word-sized *role echoes* (a mono label, a small icon) may borrow
  the state hue so the transcript reads in the orb's color language.

## Color tokens

All in `:root` in `style.css`. Never raw hex in rules.

| Token | Value | Use |
|---|---|---|
| `--bg` | `#f3f4f8` | Page canvas (cool paper grey, faint accent tint radials) |
| `--surface` | `#ffffff` | Cards, buttons, panels, the chat drawer |
| `--surface-2` | `#f6f7fb` | Inputs, nested surfaces, history rows |
| `--border` / `--border-strong` | rgba(16,19,34,.08/.16) | Hairlines |
| `--shadow-soft` / `--shadow-pop` | — | Diffuse elevation; `pop` for modals/popovers |
| `--text` / `--text-dim` / `--text-faint` | `#101322` + alphas | Type hierarchy |

State hues (the orb's voice):

| Token | Value | Meaning |
|---|---|---|
| `--speaking` / `--accent` | `#6d5cff` violet | Assistant speaking |
| `--listening` / `--accent-2` | `#00b8db` cyan | You / listening / idle |
| `--processing` | `#f59e0b` amber | Thinking / tool call |
| `--error` | `#ff5d6c` | Errors |
| `--success` | `#10b981` | Ready |

Each `.state-*` class on the orb sets `--glow` and shows exactly one
indicator (`.ind-*`). The orb's glow opacity and scale react to
`--ai-audio-level` (set from JS) — the signature animation; keep new motion
subordinate to it.

## Typography

- **Inter** for everything human.
- **Geist Mono** for machine text: captions, status tags, tool calls, ids.
- **Space Grotesk** (display) for the wordmark and modal titles only.

Uppercase + letterspacing only on tiny mono labels. Never put prose in mono.

## Layout & motion

- **Bottom dock structure**: a solid app bar (brand left, account right), the
  orb centered on one continuous canvas, and every frequently-used control in
  a labeled bottom dock. Hairlines + spacing, never heavy boxes. The dock is
  the app's navigation model — new primary controls belong there.
- Radii: 12px (controls) / 20px (panels) / 28px (modals); pill buttons.
- Quiet by default: the idle orb breathes slowly (2.4s); everything else
  animates ≤ 0.3s ease. `body.booting` freezes first paint — anything that
  animates on load must respect it.
- `prefers-reduced-motion` collapses all animation.

## Responsive floor (non-negotiable)

- Works down to a **360px** phone. Extend the `@media (max-width: 600px)`
  block; don't fight it. There is a tablet tier (601–1024px) and short-viewport
  tiers (max-height 760/560px).
- Panels rise **from the dock edge**: the conversation history is a centered
  bottom sheet on every screen size; dialogs are full-screen sheets on phones.
- Modals are **full-screen sheets** on phones with `env(safe-area-inset-*)`
  padding; scroll inside `.modal-content`.
- Inputs are **16px on phones** (iOS Safari zooms anything smaller).
- Tap targets ≥ **44px**; `touch-action: manipulation` on everything tappable.
- Visible focus (`:focus-visible`, accent outline) on every interactive element.
- The floating bubble stream is desktop-only; on phones the conversation
  drawer is the single transcript surface.

## Before you ship — the mirror check

1. Is every saturated color on the orb, or a word-sized role echo? Remove
   colored fills/borders elsewhere.
2. Is mono only for machine text, Inter for humans, Grotesk for titles?
3. Does a new state set `--glow` and show exactly one `.ind-*`?
4. Separations are hairlines + spacing, not boxes?
5. New motion quieter than the orb, and reduced-motion-safe?
6. Does it still pass 360px, the 44px tap floor, and keyboard focus?
7. Remove one accessory. Precision beats addition.
