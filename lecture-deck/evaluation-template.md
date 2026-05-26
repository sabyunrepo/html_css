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
node scripts/run-hook.js deck-loop
node scripts/improvement-loop.js --max-iterations=8 --threshold-percent=10
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
improvement loop efficiency:
```

## 남은 위험

- 

## 워크플로우 학습 확인

- 단계 순서:
- 사용한 에이전트/스킬:
- 실패 라우팅 근거:
- 하네스 개선 backlog 반영:
- 최종 게이트:

## 확인 URL

- `deck.html`
- `presenter-review.html`
