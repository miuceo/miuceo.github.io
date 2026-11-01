---
name: brand-unbound
description: Applies the personal "Kobalt" brand identity (cobalt blue primary, coral and green accents, cool neutrals, light and dark modes, Poppins headings, Lora body) to any artifact such as slides, documents, web pages, dashboards, charts and graphics. Use it whenever the user asks for their own brand, the Kobalt look, the brand-unbound style, or a personal-brand design instead of Anthropic's brand-guidelines.
---

# Brand Unbound (Kobalt)

## Overview

Use this skill to style any output in the owner's personal brand. It keeps the same structure as a classic brand system (one main accent, two supporting accents, four neutrals) but with its own colors: cool cobalt blue as the lead, warm coral and fresh green as support.

Companion files in this folder:
- `DESIGN.md`: the full design system as plain markdown (paste into Google Stitch, a Claude Project, a Gem or a custom GPT).
- `tokens.css`: ready CSS variables with light and dark modes.
- `tokens.json`: the same tokens as data (Figma, Style Dictionary, scripts).

## Colors

Every color has a role. Use the role, not a guessed hex.

| Token | Role | Light | Dark |
| --- | --- | --- | --- |
| `text` | Text | `#14161f` | `#eff0f8` |
| `bg` | Page background | `#f6f7fb` | `#0f1119` |
| `mid` | Secondary elements, borders | `#aeb1c2` | `#8f93aa` |
| `surface` | Cards, soft sections | `#e2e4ee` | `#1b1f31` |
| `accent-1` | Primary accent (cobalt) | `#3a5bd9` | `#6483f0` |
| `accent-2` | Supporting accent (coral) | `#ef6f5e` | `#f48372` |
| `accent-3` | Supporting accent (green) | `#4fae8b` | `#5fc4a0` |
| `band` | Inverse section background | `#14161f` | `#454959` |

### Rules

- **Ratio 60-30-10.** About 60% neutral (`bg`, `surface`, `mid`), 30% cobalt, 10% coral or green.
- **Text on accents.** Light mode: `#f6f7fb` on cobalt, `#14161f` on coral and green. Dark mode: `#0f1119` on all three accents.
- **Accent as text.** Never use a raw accent for small body text. For links and labels use the darker light-mode shade `#2e459e`, or in dark mode the lighter shade `#91a6f3`.
- **Inverse bands.** Use `band` as the background and `bg` (light) or `text` (dark) as its text color for hero stripes, quotes and footers.
- **Contrast.** Normal text needs at least 4.5:1 against its background. Check before shipping.
- **Cycling.** When several shapes, chart series or cards need different colors, cycle cobalt, coral, green in that order. Never add a fourth accent.
- **Dark mode is not an inversion.** Use the Dark column. Do not mix light-mode accents with dark backgrounds.

## Typography

- **Headings:** Poppins (fallback Arial), weight 600.
- **Body:** Lora (fallback Georgia), weight 400.
- **UI, buttons, labels, captions:** Poppins 500 to 600.

| Level | Font | Size | Weight | Line height |
| --- | --- | --- | --- | --- |
| H1 | Poppins | 48 px (28 px on phones) | 600 | 1.12 |
| H2 | Poppins | 26 px (20 px on phones) | 600 | 1.2 |
| H3 | Poppins | 17 px | 600 | 1.3 |
| Lead | Lora | 18 px | 400 | 1.65 |
| Body | Lora | 16 px | 400 | 1.65 |
| Eyebrow | Poppins | 12 px uppercase, letter-spacing 0.1em | 600 | 1.4 |
| Button / UI | Poppins | 15 px | 600 | 1.2 |
| Caption | Poppins | 13 px | 500 | 1.4 |

Keep text lines to about 65 characters. In slides and documents, text of 24 pt and larger is Poppins, everything smaller is Lora. Balance headings (`text-wrap: balance`).

Web fonts: `https://fonts.googleapis.com/css2?family=Lora:ital,wght@0,400;0,500;1,400&family=Poppins:wght@500;600;700&display=swap`

## Components and layout

- **Spacing unit:** 8 px. Scale: 8, 12, 16, 24, 32, 56.
- **Buttons:** radius 8 px, padding 10 px 20 px, Poppins 600. Primary is cobalt, secondary is coral, ghost has a 2 px outline in `text`.
- **Cards:** radius 12 px, 1 px border in `mid`, no shadow.
- **Tags:** fully rounded (999 px), accent background, text color by contrast rule.
- **Inputs:** radius 8 px, 1.5 px border in `mid`, cobalt 2 px focus ring.
- **Brand shapes:** circle, rounded square, half circle. Use them as flat decorative blocks in cobalt, coral, green and `surface`.
- **Charts:** flat fills, no gradients, series order cobalt, coral, green. Axis and labels use `text` or `mid`.
- **Imagery:** flat, geometric, generous whitespace. No gradients, no drop shadows, no stock-photo overlays.

## Applying it by output type

### HTML and CSS
Link `tokens.css`, then style with the variables (`var(--accent-1)`, `var(--surface)`). Load the Google Fonts link above. Provide light and dark through `prefers-color-scheme`.

### PowerPoint (python-pptx)
```python
from pptx.dml.color import RGBColor

TEXT    = RGBColor(0x14, 0x16, 0x1F)
BG      = RGBColor(0xF6, 0xF7, 0xFB)
MID     = RGBColor(0xAE, 0xB1, 0xC2)
SURFACE = RGBColor(0xE2, 0xE4, 0xEE)
COBALT  = RGBColor(0x3A, 0x5B, 0xD9)
CORAL   = RGBColor(0xEF, 0x6F, 0x5E)
GREEN   = RGBColor(0x4F, 0xAE, 0x8B)
```
Set the slide background to `BG` (or the dark `0F1119`), titles in Poppins 600 at 24 pt or larger, body in Lora. Non-text shapes cycle cobalt, coral, green. Fall back to Arial and Georgia when the fonts are not installed.

### Word, PDF and documents
Headings Poppins 600 in `text`, body Lora 16 px, links in `#2e459e`, tables with a `surface` header row and 1 px `mid` borders.

### Charts and graphics
Series colors cobalt, coral, green; gridlines `surface` or `mid`; labels `text`. Keep one highlighted series at most and mute the rest with `mid`.

## Checklist before delivering

1. Only palette hexes are used, in the right roles.
2. Ratio is close to 60-30-10 and there are at most three accents.
3. Text on every accent follows the contrast rule.
4. Poppins for headings and UI, Lora for body, with fallbacks.
5. Both light and dark are correct if the output supports themes.
