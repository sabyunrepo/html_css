# Evaluation Report

## 변경 파일

- `source.md`
- `slide-spec.json`
- `slides/*.html`
- `assets/*.css`
- `assets/*.js`
- `HANDOFF.md`

## 실행 명령

```sh
node scripts/run-hook.js harness-check
node scripts/run-hook.js render-check
node scripts/run-hook.js pre-handoff
```

## 결과

```text
slide count:
missing files:
broken links:
deck note exposure:
presenter script:
desktop overflow:
mobile overflow:
animation keyframe safety:
reduced motion fallback:
finite animation policy:
motion spec shape:
motion runtime:
reduced motion runtime:
```

## 남은 위험

- 

## 확인 URL

- `deck.html`
- `presenter-review.html`
