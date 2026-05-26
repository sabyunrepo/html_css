---
theme: canva-line-drawing-paper
fontFamily: 'Pretendard, Inter, Geist, Yoon Gothic, Apple SD Gothic Neo, system-ui, Helvetica, Arial, sans-serif'
displayFontFamily: 'Jeju Hallasan, 210 Naui Dongmu, Nanum Pen Script, Pretendard, system-ui, sans-serif'
transition: fade-out
mdc: true
source: 'https://www.canva.com/ko_kr/templates/EAGqlib6c24/'
---

# Canva Line Drawing Paper Deck Design Guide

## Intent

Canva template `EAGqlib6c24`의 "검은색과 흰색 라인 드로잉 팀 조직문화 프레젠테이션"을 HTML/CSS lecture deck용 디자인 시스템으로 변환한다.

이 덱은 순수한 흑백 미니멀리즘이 아니라, 따뜻한 베이지 종이 위에 검은 라인 드로잉과 크림색 정보 카드를 올린 내부 가이드 문서 스타일이다. 발표자는 친근하고 차분한 조직문화 워크북을 넘기는 느낌을 받아야 한다.

## Source Observations

Canva 페이지와 슬라이드 미리보기에서 확인한 기준:

- Format: presentation, 1920x1080 px.
- Palette: `#e3d9cf`, `#211d19`, `#eae0d6`, `#6c6863`, `#f3ebe2`.
- Fonts exposed by source page: `Jeju Hallasan`, `210 나의동무`, `윤고딕`.
- Cover pattern: beige paper background, top black pill label, oversized hand-drawn Korean title, bottom team line drawing.
- Table-of-contents pattern: left editorial title and illustration, right cream rounded card with numbered rows.
- Explainer pattern: large sans headline, short paragraph, two cream cards with centered titles and thin dividers.
- Value/detail pattern: stacked horizontal cards with a left line illustration, middle bullets, vertical divider, and right supporting text.

## Core System

- The slide surface is warm paper, not white chrome.
- Black line drawing is the primary visual device.
- Cream cards organize information; avoid heavy shadows and gradients.
- Use hand-drawn display typography only for cover-style titles or expressive labels.
- Use a clean Korean sans for body, slide titles, bullets, and evidence-oriented content.
- Keep all shapes flat. Depth comes from contrast between paper, cream cards, black ink, and thin dividers.

## Asset Strategy

Use Lucide icons inside plain HTML/CSS visual modules instead of ad-hoc illustration files or custom drawing markup:

- `lucide-icon`: standardized line icons for controls, checks, arrows, state labels, and technical primitives.
- `visual-module`: cards, rails, dividers, icon slots, and labels composed with HTML and CSS.
- `bitmap-illustration`: local raster images only when a full polished scene is required and HTML/CSS modules cannot communicate the idea.
- `custom-line-scene`: simple HTML/CSS line compositions for cover scenes, team scenes, or very deck-specific metaphors.

Detailed asset selection must follow `.codex/skills/deck-asset-selection/SKILL.md`.
Every slide spec must include `assetDecision` before HTML/CSS generation.

### Asset Selection Rules

- Use Lucide icons when the visual is an icon-sized noun or action: key, lock, browser, phone, check, x, warning, shield, user, clock, file, link, settings.
- Use HTML/CSS cards and rails for workflows, state transitions, comparison, validation gates, and security models.
- Use local raster images only for large scenes that genuinely need illustration detail.
- Keep CSS drawing simple: cards, labels, rails, circles, dividers, and icon containers.
- Do not add external visual CDNs or runtime dependencies.

## Colors

Use these local CSS tokens:

- `--paper`: `#e3d9cf`
- `--paper-soft`: `#eae0d6`
- `--card`: `#f3ebe2`
- `--card-strong`: `#fffaf3`
- `--ink`: `#211d19`
- `--muted-ink`: `#6c6863`
- `--divider`: `#c9beb2`
- `--line`: `#211d19`
- `--canvas`: `#f3ebe2`
- `--inverse-ink`: `#fffaf3`

### Color Rules

- Default slide background is `--paper`.
- Cards use `--card` or `--card-strong`.
- All major type is `--ink`; do not introduce mid-gray body copy for hierarchy.
- Use `--muted-ink` only for captions, source labels, or low-priority metadata.
- Dividers use `--divider`, 1px.
- Do not introduce saturated accent colors unless the content requires a semantic state. This style should remain black, cream, beige, and warm gray.
- Do not use pure black or near-black as a large filled surface. Reserve dark ink for text, strokes, small labels, and small state badges. Large UI surfaces such as terminal panes, hubs, preview cards, or section blocks must use warm charcoal, blue-charcoal, paper, or cream fills instead of `#000`, `#070606`, or `#11100f`.
- Black pill labels are optional section markers, not the default metadata style. If a slide is introductory, instructional, or friendly in tone, prefer a warm-charcoal pill or outlined cream label.

## Typography

### Families

- Display hand font: `Jeju Hallasan`, `210 나의동무`, `Nanum Pen Script`, fallback sans.
- Body sans: `윤고딕`, `Pretendard`, `Inter`, `Geist`, `Apple SD Gothic Neo`, system sans.
- Mono is optional and reserved for code snippets, CSS tokens, and short technical labels.

### Type Roles

- Cover title: 72-96px desktop, hand-drawn display, line-height 1.0.
- Slide headline: 48-64px desktop, clean sans, weight 700-800, line-height 1.08.
- Section label: 16-18px, sans or hand label, weight 700, black pill when needed.
- Card title: 24-30px, sans, weight 700-800, line-height 1.25.
- Body large: 22-26px, sans, weight 400-500, line-height 1.45.
- Body: 18-20px, sans, weight 400-500, line-height 1.5.
- Caption/source: 12-14px, sans or mono, weight 500, line-height 1.2.
- Code: 16-20px, mono, line-height 1.45.

### Type Rules

- Letter spacing stays `0` for layout stability and Korean readability.
- Use hand-drawn display type sparingly. If every slide uses it heavily, the deck becomes decorative instead of clear.
- Keep body text black. Use size, weight, position, and divider structure for hierarchy.
- Screen text must stay shorter than presenter notes.
- On content slides, the headline should identify the message but not dominate the visual evidence. Korean content-slide headings should render in two lines or fewer at desktop size. If a Korean headline wraps to three or more heavy lines, rewrite it before shrinking supporting visuals.

## Layout

- Slide canvas is 16:9 and should read well at 1920x1080.
- Use 64-88px outer padding on desktop.
- Content-slide headlines should leave enough column height for subtitle and visual modules. Do not let the headline occupy more than roughly half of the text column.
- Layout generation must follow `.codex/skills/deck-visual-hierarchy-layout/SKILL.md`.
- Every slide spec must include `importanceMap`; use it to allocate scale, position, grouping, and metadata priority.
- Before placing elements, rank visible content by communication role:
  - Primary message: the shortest sentence the audience must remember.
  - Primary evidence or action: the visual, diagram, image, or example that proves or demonstrates the message.
  - Secondary constraints: cautions, exceptions, and supporting details.
  - Metadata: source labels, captions, dates, and section tags.
- Allocate size and position by that ranking. On instructional slides, primary evidence or action should be at least as visually prominent as the headline, while secondary constraints sit in smaller cards or rows.
- If an official image shows the actual method, product, place, or state, treat it as primary evidence, not decoration or a captioned thumbnail.
- Every slide spec must declare `visualArchetype`. The archetype is the promised visual grammar, not a decorative label.
- Every slide spec must also declare `visualForm`. This is the actual layout form used by the generated HTML/CSS.
- Do not let a deck collapse into repeated card grids. Across a 10-slide deck, use at least five distinct visual archetypes, and avoid reusing one archetype for more than roughly one third of the deck.
- Prefer a mix of forms: `evidence-image`, `interface-mock`, `funnel`, `document-template`, `process-rail`, `token-board`, `radial-map`, `hub-map`, `triage-table`, `step-path`, `timeline`, `matrix`, `annotated-screenshot`, and `before-after`.
- Card grids are allowed, but they are not the default answer. If the slide message is about flow, hierarchy, mapping, extraction, comparison, or a document/prompt shape, choose a form that visibly matches that structure.
- For workflow decks, prefer this progression when it fits the content: proof image -> interface mock -> input board -> prompt/template -> process rail -> system/token board -> catalog -> handoff map -> risk triage -> starter path.
- Every slide spec must declare `motionDecision.mode` as `static` or `animated` with a short reason.
- Use `animated` only when movement explains time, sequence, cause/effect, or focus. Do not animate static proof images, catalogs, caution lists, or checklist slides just to make them feel lively.
- In a normal lecture deck, animated slides should be the minority. A 10-slide deck should usually keep motion to three or four teaching moments unless the whole topic is motion itself.
- Most slides use one of four patterns:
  - `cover-scene`: black pill label, hand title, bottom line-drawing scene.
  - `toc-split`: left title/illustration, right large rounded contents card.
  - `two-card-explainer`: headline, lead copy, two equal cream cards.
  - `stacked-value-rows`: headline, lead copy, two or three horizontal cards with illustration and divided text.
- Cards use 20-28px radius and 28-40px interior padding.
- Keep card grids roomy. This design depends on calm spacing, not dense dashboards.
- Avoid nested cards. A card can contain dividers and columns, but not another framed card.

## Components

### `paper-slide`

Default slide surface.

- Background: `--paper`.
- Text: `--ink`.
- No gradient.
- No drop shadow.

### `black-pill-label`

Small top label used on covers and section openers.

- Background: `--ink`.
- Text: `--inverse-ink`.
- Radius: 9999px.
- Padding: 8px 22px.
- Type: 16-18px, weight 700.

### `hand-title`

Expressive display headline.

- Use only for cover, divider, or closing slides.
- Keep line count to 1-2 lines.
- Pair with a clean sans subtitle or card layout.

### `cream-info-card`

Primary information container.

- Background: `--card` or `--card-strong`.
- Radius: 20-28px.
- Border: optional 1px `--divider`.
- Shadow: none, or at most a very subtle `0 4px 14px rgba(7, 6, 6, 0.04)` for separation.
- Dividers inside the card are preferred over additional nested containers.

### `line-drawing-scene`

Hand-drawn black illustration.

- Use HTML elements and CSS borders for recognizable objects or people.
- Lines are black, 2-4px, and rounded where possible.
- Filled black shapes are allowed only for simple emphasis.
- Illustrations should explain the slide: team, presenter, board, workflow, rule stack, check gate, or user preference.
- Avoid stock-photo style images and colorful icons.

### `lucide-icon`

Standard semantic line icon.

- Size: 52-88px for slide visuals, 20-32px for controls or metadata.
- Shape: use the Lucide path itself inside a stable HTML/CSS icon slot.
- Stroke: black, rounded caps and joins, no fill unless the source icon requires it.
- Use as one component inside a card row; do not stretch icons into hero illustrations.
- Do not use text-only placeholders as icon substitutes.

### `bitmap-illustration`

Large local raster illustration.

- Store under `assets/illustrations/`.
- Keep an adjacent source note in `assets/illustrations/README.md`.
- Match the deck palette: black line, paper, cream, and muted warm gray.
- Remove unnecessary gradients and tiny details if they conflict with the Canva line-drawing deck style.

### `divider-line`

Thin beige/warm gray line for card separation.

- Thickness: 1px.
- Color: `--divider`.
- Use horizontal dividers in contents cards and vertical dividers in wide value rows.

## Slide Patterns

### Cover Scene

Use for slide 1 or major section starts.

- Top center: `black-pill-label`.
- Main title: large `hand-title`, centered or slightly above center.
- Bottom 25-35%: line drawing of people, interface, or presentation scene.
- Keep the drawing grounded to the lower edge so the slide feels like a page illustration.

### Contents Split

Use for agenda or summary slides.

- Left 38-45%: big title and supporting line drawing near bottom.
- Right 55-62%: one large `cream-info-card`.
- Card rows use number, title, and optional page/step label.
- Separate rows with `divider-line`; do not box every row.

### Two Card Explainer

Use for conceptual contrasts.

- Top: large clean sans headline.
- Below: one short lead paragraph.
- Bottom: two equal `cream-info-card` blocks.
- Each card uses centered title, one divider, and concise body.

### Stacked Value Rows

Use for process, principles, or checklist slides.

- Top: headline and short lead.
- Main: two or three full-width cream cards stacked vertically.
- Each row has:
  - left illustration area,
  - middle title and bullets,
  - vertical divider,
  - right supporting explanation.
- Use consistent row height so the slide feels engineered, not improvised.

## CSS Visual Quality

- Every visual should be recognizable as a black line drawing on paper.
- Prefer purposeful scenes over abstract placeholder boxes.
- Do not use colorful chart fills, pastel blocks, glassmorphism, heavy shadows, or gradients.
- If a technical concept needs a diagram, draw it as an annotated whiteboard or rule stack on a cream card.
- Lines should be slightly friendly: rounded caps, rounded joins, imperfect-but-controlled geometry.

## Motion Contract

- Motion should feel like ink settling on paper or cards being calmly placed.
- Motion must explain sequence, focus, state change, or cause/effect.
- Treat `motion.md` as the reusable motion recipe catalog for LLM and agent work.
- Use local motion tokens from `assets/style.css`; do not invent one-off duration, delay, easing, or entry-distance values inside new slide CSS.
- In `@keyframes`, animate only `transform` and `opacity`.
- Never animate layout properties: `top`, `left`, `right`, `bottom`, `width`, `height`, `margin`, or `padding`.
- Never animate paint-heavy properties: `background`, `background-color`, `box-shadow`, `filter`, `border`, or `color`.
- Use finite animations with `animation-fill-mode: both`.
- Use `will-change` only on small moving elements that actually animate.
- Include `@media (prefers-reduced-motion: reduce)` whenever animation exists.
- A declared motion slide should use choreography: at least three small animated targets and two or more staggered delays when teaching order, layering, or state change.

### Motion Tokens

Use these local CSS tokens from `assets/style.css`:

- `--motion-fast`: short supporting reveal.
- `--motion-medium`: default card or step reveal.
- `--motion-slow`: rail, connector, or larger sequence reveal.
- `--motion-rise`: vertical entry distance for placed elements.
- `--motion-scale-start`: compact start scale for rail or ink reveals.
- `--delay-step`: stagger unit for ordered sequences.
- `--delay-nudge`: small offset when a child detail should follow its parent.
- `--ease-calm`: default easing for all generated motion.

### Recommended Motion Vocabulary

- `card-place`: cream cards rise 8-16px into position with opacity.
- `rail-grow`: a connector or rail grows from a meaningful origin with opacity.
- `ink-settle`: text or drawing groups settle from a tiny vertical offset.
- `passkey-step-in`: compact step rows enter in a ceremony sequence.
- `passkey-rail-in`: a ceremony connector reveals after the steps start.

## Visual Motion Brief

Before generating animated slide HTML/CSS, write a brief for each animated visual:

```text
Slide:
Meaning:
Motion:
Allowed properties: transform, opacity.
Reduced motion:
Risk:
```

If the brief cannot explain why motion improves understanding, keep the visual static.

## Responsive Behavior

- Below tablet width, reduce outer padding and allow cards to stack.
- Keep text within cards; never let long Korean words or inline code overflow.
- Line drawings may shrink or move below text, but must remain visible.
- Cards can become full-width on mobile.
- Touch controls remain at least 44px high.

## Slide Rules

- One slide, one message.
- Screen text should be shorter than presenter notes.
- Speaker-only content stays in `.note` and `speakerNote`.
- Do not expose `.note` in `deck.html`.
- Presenter review must show `speakerNote` and `evidence`.
- Follow `slide-spec.json` for slide order, title, message, visual, motion, and evidence.
