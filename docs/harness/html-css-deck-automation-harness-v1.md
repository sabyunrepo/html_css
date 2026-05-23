# HTML/CSS Deck Automation Harness v1

## 최종 목표

```text
Claude에게 자료를 주면
source brief -> slide spec -> HTML/CSS deck -> presenter review -> 검증 -> handoff
까지 반복 가능한 워크플로우로 만든다.
```

## 최종 폴더 구조

```text
lecture-deck/
  source.md
  slide-spec.json
  CLAUDE.md
  few-shots.md
  HANDOFF.md

  skills/
    deck-builder/
      SKILL.md

  agents/
    researcher.md
    slide-reviewer.md
    visual-reviewer.md

  hooks/
    harness-check.json
    render-check.json
    verify-deck.json

  scripts/
    run-hook.js
    verify-deck.js

  slides/
    00-title.html
    01-problem.html

  assets/
    style.css
    slides.js
    deck.js
    presenter-review.js

  deck.html
  presenter-review.html
  evaluation-template.md
```

## 실습 흐름

1. Source Brief: `source.md`에 주제, 대상, 발표 시간, 목표, 참고자료를 정리한다.
2. Slide Spec: `slide-spec.json`에 슬라이드별 `title`, `message`, `visual`, `speakerNote`, `evidence`를 정의한다.
3. Few-shot: `few-shots.md`에 좋은 slide spec, 나쁜 slide spec, 좋은 발표자 스크립트, 좋은 최종 보고 예시를 둔다.
4. CLAUDE.md: 프로젝트 규칙, `.note` 숨김, 발표자 검토용 script 표시, CSS visual 우선, overflow 검증 필수를 고정한다.
5. deck-builder Skill: source 읽기, spec 만들기, 슬라이드 생성, 발표자용 분리, 검증, 보고를 절차화한다.
6. Subagent 분리: researcher, slide-reviewer, visual-reviewer가 각각 자료, 흐름, 시각 품질을 검토한다.
7. Tool / MCP 기준: Web search는 최신 자료 확인, Browser는 렌더링 확인, Filesystem은 HTML/CSS/JS 수정, verification script는 누락/링크/overflow 검사를 맡는다.
8. Hook / Verification Gate: `scripts/run-hook.js`, `scripts/verify-deck.js`, `hooks/verify-deck.json`으로 통과 기준을 고정한다.
   - `harness-check`: source/spec/design/skill, link, animation safety를 빠르게 확인한다.
   - `render-check`: browser-rendered deck overflow, note exposure, presenter script, motion runtime을 확인한다.
   - `pre-handoff`: 두 gate를 모두 실행한다.
9. Evaluation Report: 변경 파일, 실행 명령, 결과, 남은 위험, 확인 URL을 남긴다.
10. Handoff: 목표, 현재 상태, 결정 사항, 검증 결과, 남은 작업, 다음 프롬프트를 기록한다.

## Local hook setup

- Claude Code local hook: `.claude/settings.local.json`
- Claude Code shareable template: `.claude/settings.local.example.json`
- Codex project config: `.codex/config.toml`
- Codex project hook: `.codex/hooks.json`
- Codex project skill: `.codex/skills/deck-builder/SKILL.md`
- Codex review agents: `.codex/agents/deck-*.toml`
- Shared runner: `lecture-deck/scripts/run-hook.js pre-handoff`

두 도구 모두 같은 runner를 호출한다. 따라서 Claude Code와 Codex 중 어느 쪽에서 작업하더라도 handoff 직전 검증 기준은 `hooks/verify-deck.json` 하나로 유지된다.

## 강의에서 강조할 한 문장

```text
이 실습의 결과물은 발표자료 하나가 아니라,
Claude가 다음 발표자료도 같은 품질로 만들 수 있게 하는
HTML/CSS Deck Automation Harness입니다.
```
