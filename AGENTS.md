# Project Instructions

## Instruction Ownership

- 전역/사용자 레벨 AGENTS.md는 비워 두고, 이 프로젝트의 지침은 이 파일에서 관리한다.
- 하위 deck harness 지침은 해당 하위 AGENTS.md를 우선하며, 공통 HTML/CSS 규칙만 이 파일에 추가한다.

## Project Workflow Policy

- 이 저장소에서 자동화 지침, 에이전트 역할, hook, skill, 검증 정책은 프로젝트 안에 둔다.
- 하위 디렉터리에 더 구체적인 `AGENTS.md`가 있으면 그 파일을 먼저 따른다.
- `lecture-deck/` 작업은 `/Users/sabyun/goinfre/html_css/lecture-deck/AGENTS.md`를 기준으로 진행한다.
- 메인 세션은 오케스트레이션 담당이다. 메인 세션이 모든 연구, 기획, 제작, 검토, 검증, 수정을 혼자 직접 처리하지 말고, 현재 phase를 판단한 뒤 맞는 skill/agent workflow로 위임하고 결과를 통합한다.
- 메인 세션은 가능한 경우 역할 에이전트를 실제로 spawn/delegate해야 한다. 에이전트 도구가 사용할 수 없을 때만 fallback으로 직접 수행하고, 그 경우 최종 보고와 trace에 fallback 사유를 남긴다.
- 에이전트는 실제 워크플로우 작업을 수행한다. 연구 에이전트는 근거를 모으고, 자산 에이전트는 이미지/라이선스를 판단하고, 콘텐츠 에이전트는 산출물을 만들고, 리뷰/검증/재생성/워크플로우 개선 에이전트는 각자 맡은 범위의 결과와 증거를 반환한다.
- 메인 세션은 에이전트 결과를 그대로 믿고 끝내지 않는다. 계약 파일, validation hook, screenshot 품질, reset boundary를 확인한 뒤 최종 판단과 사용자 보고를 맡는다.
- 실패가 나면 메인 세션이 임시 패치로 덮지 않는다. 실패 유형을 분류해서 research, asset, content, visual review, validation, output regeneration, workflow improvement 중 맞는 경로로 다시 라우팅한다.
- 자동화 워크플로우 요청은 다음 원칙을 기본으로 해석한다: "메인 세션은 오케스트레이터로만 동작하고, 각 단계마다 필요한 에이전트를 spawn/delegate하며, 에이전트 결과를 통합/검증/재라우팅한 뒤 어떤 에이전트와 검증을 사용했는지 보고한다."
- 기본 운영 모드는 Codex Desktop interactive orchestration이다. Codex Desktop 안에서는 메인 세션이 `spawn_agent`/delegate 도구로 역할 에이전트를 직접 호출하고, 로컬 runner나 `codex exec` adapter는 보조/CI/재현용으로만 사용한다.
- 프로젝트 Stop hook은 `.codex/scripts/stop-continuation.js`로 관리한다. 라우팅 가능한 실패나 `.codex/stop-continuation-plan.json`의 pending 작업이 있으면 Stop을 block하고 "다음 계획 있으면 진행해" 지시를 주입한다. 실제 더 할 작업이 없으면 `.codex/stop-continuation-state.json`의 `noWorkCount`를 1 올리고, 작업이 다시 생기면 0으로 초기화한다. `noWorkCount`가 3에 도달하면 이후 no-work Stop에서는 차단 출력을 내지 않는다.
- 자동화 워크플로우를 우회해서 일회성으로 결과물만 고치지 않는다. 반복되는 결함은 skill, agent, hook, validation, design contract 중 맞는 레이어에 반영한다.
- 생성 결과물이 나쁘게 나온 경우는 기본적으로 하네스 결함의 증상으로 본다. `route-failure.js`나 검증 결과가 현재 deck output만의 문제라고 분류하기 전까지는 산출물 패치보다 agent, skill, hook, validator, design/motion contract, eval case 개선을 먼저 한다.
- 생성 산출물과 워크플로우 자산을 구분한다. reset, cleanup, 새 주제 생성 시에도 `.codex/agents/`, `.codex/skills/`, `lecture-deck/agents/`, `lecture-deck/hooks/`, `lecture-deck/scripts/` 같은 오케스트레이션 자산은 보존한다.

## Common HTML/CSS Rules

- 기존 구조와 파일 경계를 먼저 확인한 뒤 수정한다.
- 공유 동작은 `assets/`에 두고, 개별 화면/슬라이드 내용은 해당 하위 산출물 파일에 둔다.
- CSS는 읽기 쉬운 토큰과 재사용 가능한 모듈을 우선한다. 검증을 통과하기 위해 임시 스타일을 덧씌우는 방식은 피한다.
- 시각 자료가 필요한 콘텐츠는 실제 의미를 전달하는 이미지, 스크린샷, 도표, 아이콘, CSS 모듈 중 가장 설명력이 높은 형식을 선택한다.
