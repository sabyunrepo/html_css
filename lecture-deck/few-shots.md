# Few-shots

Few-shot은 실습 3에 둔다. `slide-spec.json` 바로 다음에 넣어야 출력 형식을 고정한다는 의미가 가장 잘 살아난다.

## Good Slide Spec

```json
{
  "id": "02-review-gate",
  "file": "slides/02-review-gate.html",
  "title": "검증은 마지막 장식이 아니라 통과문입니다",
  "message": "슬라이드가 생성된 뒤가 아니라 handoff 전 반드시 자동 검증을 통과해야 한다.",
  "visual": "Gate visual with pass/fail states and evidence list.",
  "learningObjective": "검증 gate가 발표 직전 품질을 보장하는 이유를 설명한다.",
  "audienceQuestion": "왜 슬라이드를 다 만든 뒤에도 자동 검증이 필요한가?",
  "explanationBeats": [
    "발표자료는 HTML, CSS, metadata, presenter note가 함께 맞아야 한다.",
    "검증 gate는 파일 누락, 링크, note 노출, overflow를 기계적으로 확인한다.",
    "handoff 전 gate 실패를 고치면 다음 주제에서도 같은 품질 기준이 반복된다."
  ],
  "exampleOrScenario": "학생이 slide HTML은 만들었지만 presenter review에서 note가 비어 있는 경우를 든다.",
  "misconceptionOrCaveat": "사람이 한 번 훑어보는 리뷰만으로는 숨은 note 노출이나 mobile overflow를 놓칠 수 있다.",
  "takeaway": "발표 직전에는 감상평보다 gate 결과와 실패 증거를 먼저 본다.",
  "speakerNote": "이 장의 핵심은 검증을 마지막 장식으로 보지 않는 것입니다. HTML 슬라이드는 화면만 예쁘면 끝나는 파일이 아니라, 링크, note 분리, 모바일 overflow, presenter review까지 같이 맞아야 합니다. 예를 들어 슬라이드 본문은 멀쩡한데 발표자 note가 비어 있으면 실제 발표자는 설명 흐름을 잃습니다. 반대로 note가 deck.html에 노출되면 청중에게 보여서는 안 되는 내용이 보입니다. 그래서 handoff 전에는 감상평보다 gate 결과와 실패 증거를 먼저 확인해야 합니다.",
  "evidence": ["scripts/verify-deck.js", "hooks/verify-deck.json"]
}
```

Why it works:

- `audienceQuestion`이 슬라이드의 교육 목적을 잡아 준다.
- `explanationBeats`가 설명 순서를 제공해서 요약문만 있는 슬라이드를 막는다.
- `speakerNote`가 화면 문구 반복이 아니라 30-60초 발화 흐름을 제공한다.

## Good Motion Spec

```json
{
  "id": "03-moment",
  "file": "slides/03-moment.html",
  "title": "오전 10시, 1분의 묵념",
  "message": "온 국민이 같은 시간에 멈춰 희생을 기억한다.",
  "visual": "Clock scene at 10:00 with one-minute pause signal.",
  "motion": {
    "type": "clock-pause",
    "mood": "solemn",
    "sequence": ["ring-breathe", "hand-settle", "pause-bars"],
    "loop": "finite",
    "reducedMotion": "static-final-state"
  },
  "speakerNote": "묵념은 경보가 아니라 공동의 기억 신호입니다.",
  "evidence": ["source.md#Moment"]
}
```

Why it works:

- `visual`은 사람이 읽는 장면 설명이다.
- `motion`은 생성기와 검증기가 읽는 구조화된 제약이다.
- `mood`가 과한 움직임을 막고, `sequence`가 keyframe 설계를 단계화한다.
- `reducedMotion`이 접근성 fallback을 먼저 고정한다.

## Bad Slide Spec

```json
{
  "title": "검증",
  "content": "검증이 중요하다",
  "visual": "nice image",
  "speakerNote": "검증은 중요합니다. 검증을 꼭 해야 합니다."
}
```

Why it fails:

- `message`가 없어 한 장에서 말할 핵심이 흐려진다.
- `learningObjective`, `audienceQuestion`, `explanationBeats`, `exampleOrScenario`, `misconceptionOrCaveat`, `takeaway`가 없어 교육 흐름을 검토할 수 없다.
- `speakerNote`가 화면 문구를 반복하는 짧은 요약이라 발표자가 30-60초 설명할 수 없다.
- `evidence`가 없어 근거와 출처를 확인할 수 없다.

## Bad Motion Spec

```json
{
  "id": "04-flag",
  "visual": "cool animated flag",
  "motion": {
    "type": "flag",
    "sequence": ["move"],
    "loop": "infinite"
  }
}
```

Why it fails:

- `mood`와 `reducedMotion`이 없어 생성 품질과 접근성을 통제할 수 없다.
- `sequence`가 의미 동작이 아니라 장식 동작이다.
- `loop: infinite`는 발표용 visual에서 집중을 빼앗는다.

## Good CSS Animation

```css
.clock-ring {
  animation: card-place var(--motion-medium) var(--ease-calm) both;
  animation-delay: calc(var(--delay-step) * 1);
}

@media (prefers-reduced-motion: reduce) {
  .clock-ring {
    animation: none !important;
    opacity: 1;
    transform: none;
  }
}
```

Why it works:

- The motion reuses a named recipe from `motion.md`.
- Timing, easing, and delay come from `assets/style.css` motion tokens.
- The animated properties are only `opacity` and `transform`.
- A reduced-motion user gets the final readable state without movement.

## Good CSS Choreography

```css
.deck-frame.is-active .layer {
  animation: card-place var(--motion-medium) var(--ease-calm) both;
}

.deck-frame.is-active .layer:nth-child(2) {
  animation-delay: var(--delay-step);
}

.deck-frame.is-active .layer:nth-child(3) {
  animation-delay: calc(var(--delay-step) * 2);
}
```

Why it works:

- Multiple small elements move in a readable order.
- Staggered timing explains sequence instead of adding a decorative fade.
- The timing stays short enough for a presentation slide.

## Bad CSS Animation

```css
@keyframes flag-drop {
  from {
    top: 0;
    box-shadow: 0 0 40px red;
  }

  to {
    top: 80px;
    box-shadow: 0 0 80px red;
  }
}
```

Why it fails:

- `top`은 layout을 다시 계산하게 만든다.
- `box-shadow`는 paint 비용을 키운다.
- reduced-motion fallback이 없다.

## Bad CSS Choreography

```css
.visual {
  animation: fade-in 900ms ease both;
}
```

Why it fails:

- One container fade does not explain sequence, focus, or cause/effect.
- There is no staggered timing, so the motion reads as polish rather than content.
- A declared motion slide should animate small purposeful targets, not the whole scene.

## Bad Overflow-Prone Visual

```css
.flow-arrow::after {
  right: -6px;
  width: 12px;
  height: 12px;
}
```

Why it fails:

- Pseudo-elements drawn outside their parent can increase `scrollWidth` or `scrollHeight`.
- The render gate checks descendants for overflow, so arrowheads, labels, and markers must stay inside their own boxes.
- Prefer an inline arrow character or a contained CSS shape.
- Mobile navigation must not intersect the slide rectangle. Fixed bottom buttons can cover content while screenshots still look mostly acceptable, so place controls in normal flow or verify a reserved safe area.

## Good Presenter Script

```text
이 실습의 결과물은 발표자료 하나가 아닙니다.
source brief, slide spec, deck, presenter review, verification, handoff가 함께 남아야
다음 발표자료도 같은 품질로 만들 수 있습니다.
```

## Good Final Report

```text
변경 파일: slide-spec.json, slides/02-review-gate.html, assets/style.css
실행 명령: node scripts/verify-deck.js
결과: slide count 3, broken link 0, note exposure 0, overflow 0
남은 위험: 외부 이미지 없음. 실제 발표 전 문구 길이만 한 번 더 확인.
확인 URL: http://127.0.0.1:57610/deck.html
```
