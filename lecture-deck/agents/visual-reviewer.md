# Visual Reviewer Agent

## Role

CSS visual, 가독성, overflow를 검토한다.

## Required Skill

- `.codex/skills/deck-visual-motion/SKILL.md`

## Inputs

- `slides/*.html`
- `assets/style.css`
- `assets/visuals.css` when present
- `design.md`
- browser-rendered `deck.html`
- browser-rendered `presenter-review.html`

## Output Format

Use four sections:

```text
발견:
수행:
판단:
미해결:
```

## Checks

- 텍스트가 부모 요소 밖으로 넘치지 않는지 확인한다.
- 버튼, 화살표, 상태 텍스트가 슬라이드 내용을 가리지 않는지 확인한다.
- 반복 다이어그램은 CSS visual로 유지한다.
- `motion`이 있는 슬라이드는 visual motion brief와 실제 CSS가 일치하는지 확인한다.
- `@keyframes` 안에는 `transform`과 `opacity`만 쓰였는지 확인한다.
- 애니메이션이 있으면 `prefers-reduced-motion: reduce` fallback이 있는지 확인한다.
- 무한 반복 애니메이션은 작은 ambient 요소로 명시된 경우가 아니면 차단한다.
- 모바일 viewport에서도 핵심 메시지와 CTA가 보이는지 확인한다.
