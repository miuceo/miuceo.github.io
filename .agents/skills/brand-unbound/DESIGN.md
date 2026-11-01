# Design System: Kobalt

A personal-brand design system. Calm, confident and clear: cool cobalt blue leads, warm coral and fresh green support, neutrals carry a slight blue tint. Flat geometric shapes, generous whitespace, no gradients and no shadows.

Use this file as the single source of truth when generating screens, pages, slides or documents. Use only the tokens listed here.

## Brand Voice

- Tone: clear, friendly, practical. Short sentences, active voice.
- Layout feel: spacious, left-aligned text, one idea per section.
- Language of UI copy follows the user's language.

## Colors

Light mode:
- Text: #14161f
- Background: #f6f7fb
- Mid gray (secondary, borders): #aeb1c2
- Surface (cards, soft sections): #e2e4ee
- Primary accent (cobalt): #3a5bd9
- Secondary accent (coral): #ef6f5e
- Tertiary accent (green): #4fae8b
- Inverse band background: #14161f (text on it: #f6f7fb)
- Accent as text (links, labels): #2e459e

Dark mode:
- Text: #eff0f8
- Background: #0f1119
- Mid gray (secondary, borders): #8f93aa
- Surface (cards, soft sections): #1b1f31
- Primary accent (cobalt): #6483f0
- Secondary accent (coral): #f48372
- Tertiary accent (green): #5fc4a0
- Inverse band background: #454959 (text on it: #eff0f8)
- Accent as text (links, labels): #91a6f3

Text on accent fills:
- Light mode: #f6f7fb on cobalt, #14161f on coral and green
- Dark mode: #0f1119 on all three accents

Color usage:
- Ratio about 60% neutral, 30% cobalt, 10% coral or green
- Never more than three accents on one screen
- Normal text contrast at least 4.5:1
- Never use a raw accent color for small body text

## Typography

- Heading font: Poppins, fallback Arial, sans-serif, weight 600
- Body font: Lora, fallback Georgia, serif, weight 400
- UI font: Poppins, weight 500 to 600
- Google Fonts: https://fonts.googleapis.com/css2?family=Lora:ital,wght@0,400;0,500;1,400&family=Poppins:wght@500;600;700&display=swap

Type scale:
- Heading 1: Poppins 48px (28px on mobile), weight 600, line height 1.12, letter spacing -0.01em
- Heading 2: Poppins 26px (20px on mobile), weight 600, line height 1.2
- Heading 3: Poppins 17px, weight 600, line height 1.3
- Lead paragraph: Lora 18px, weight 400, line height 1.65
- Body: Lora 16px, weight 400, line height 1.65
- Eyebrow label: Poppins 12px, uppercase, letter spacing 0.1em, weight 600
- Button and UI text: Poppins 15px, weight 600
- Caption: Poppins 13px, weight 500

Text line length: at most 65 characters. Balance headings.

## Spacing

- Base unit: 8px
- Scale: 8px, 12px, 16px, 24px, 32px, 56px
- Page side gutter: at least 16px on mobile, 56px on desktop
- Content max width: 1080px

## Shape and Elevation

- Button radius: 8px
- Input radius: 8px
- Card radius: 12px
- Tag radius: 999px (pill)
- Borders: 1px solid mid gray
- Shadows: none. Separate layers with surface color and borders.

## Components

Primary button:
- Background: primary accent (cobalt), text per "text on accent fills"
- Padding: 10px 20px, radius 8px, Poppins 15px weight 600

Secondary button:
- Background: secondary accent (coral), text per "text on accent fills"

Ghost button:
- Transparent background, 2px border in text color, text in text color

Card:
- Background: background color, 1px border in mid gray, radius 12px, padding 24px
- Featured card: inverse band background with inverse text

Tag:
- Pill shape, accent background, Poppins 12px weight 600, padding 4px 11px

Input:
- Background: background color, 1.5px border in mid gray, radius 8px, padding 10px 12px
- Focus: 2px outline in primary accent, 1px offset

Navigation:
- Logo left, links right, Poppins 14px weight 500, active link in accent-as-text color with a 2px underline
- Bottom border 1px in surface color

Section styles:
- Default section: background color
- Soft section: surface color
- Inverse section: inverse band background with inverse text

Charts:
- Flat fills, no gradients
- Series order: cobalt, coral, green
- Gridlines in surface or mid gray, labels in text color

Brand shapes:
- Circle, rounded square and half circle in flat cobalt, coral, green and surface
- Use as decorative blocks, never overlapping text

## Dark Mode

- Switch every token to its dark value, never invert colors automatically
- Use the dark accent shades; do not mix light-mode accents with dark backgrounds
- Keep the same layout, radius and spacing

## Do and Don't

Do:
- Use exact hex values from this file
- Keep layouts spacious with one main idea per section
- Cycle accent colors in the order cobalt, coral, green

Don't:
- Add gradients, shadows, glows or blur effects
- Introduce a fourth accent color
- Set paragraphs in Poppins or headings in Lora
- Use pure black or pure white for text or backgrounds

## Accessibility

- Contrast at least 4.5:1 for normal text, 3:1 for large text and UI shapes
- Visible keyboard focus on every interactive element
- Minimum tap target 44px
- Respect reduced motion preferences
