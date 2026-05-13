# Relai MVP Architecture

## 목표

Relai는 기획 초안, 담당자 연결, 양측 관점 번역, 변경 영향 분석, 의사결정 추천을 하나의 웹 워크스페이스에서 처리하는 제품이다.

핵심은 문서 생성 자체보다:

- 요구사항 원본을 한곳에 두고
- 기획자와 개발자가 각자 읽기 좋은 형태로 번역하며
- 변경이 생길 때 어떤 계약이 흔들리는지 같은 화면에서 판단하게 하는 것이다

## 핵심 디렉토리

```text
apps/relai-mvp/
├── server/
│   └── index.ts
├── src/
│   ├── App.tsx
│   ├── App.css
│   ├── index.css
│   └── main.tsx
├── package.json
├── vite.config.ts
└── .env.example
```

## 런타임 구조

### 1. 프론트엔드

React + Vite SPA가 메인 워크스페이스를 담당한다.

- 초안 입력과 파일 불러오기
- 담당자 연결
- 초안 목록과 현재 초안 선택
- 변경 요청 입력
- 계약 보드
- 영향 분석과 추천 액션 표시

브라우저는 초안, 변경 요청, 마지막 분석 결과를 로컬 저장소에 유지한다.

### 2. 백엔드

작은 Express 서버가 `/api/analyze`와 `/api/health`를 제공한다.

- `OPENAI_API_KEY`가 있으면 실제 AI 분석 호출
- 키가 없으면 규칙 기반 데모 분석 fallback
- 키는 서버 환경 변수로만 읽고 브라우저에는 노출하지 않음

### 3. AI 분석 계약

Relai의 분석 API는 `POST /api/analyze` 하나로 고정한다. 이 엔드포인트의 목적은 `승인 여부를 대신 결정`하는 것이 아니라, 계약 상태와 영향 범위를 구조화해 운영자가 바로 판단할 수 있게 만드는 것이다.

#### 요청 스키마

| 필드 | 타입 | 필수 | 규칙 |
| --- | --- | --- | --- |
| `mode` | `auto \| demo` | 아니오 | 기본값은 `auto`이다. `demo`면 AI 사용 가능 여부와 무관하게 규칙 기반 분석으로 고정한다. |
| `draft` | 객체 | 예 | `id`, `title`, `authorName`, `authorRole`, `ownerId`, `goal`, `body`, `dueDate`, `createdAt`가 모두 필요하다. |
| `changes` | 배열 | 예 | 각 항목은 `title`, `reason`, `requestor`, `urgency`, `createdAt`를 가진다. 변경 이유는 비어 있을 수 없다. |
| `team` | 배열 | 예 | 최소 1명 이상이어야 하며 `draft.ownerId`와 일치하는 담당자가 있어야 한다. |

#### 성공 응답 스키마

| 경로 | 타입 | 의미 |
| --- | --- | --- |
| `analysis.schemaVersion` | 문자열 | 현재 계약 버전이다. MVP 기준 `2026-04-20`으로 잠근다. |
| `analysis.mode` | `live \| demo` | 실제로 어떤 분석 모드가 적용되었는지 보여준다. |
| `analysis.source` | `openai \| heuristic` | OpenAI 응답인지 규칙 기반 fallback인지 명시한다. |
| `analysis.fallbackReason` | 문자열 또는 `null` | `forced_demo`, `missing_api_key`, `ai_error`, `invalid_ai_response` 중 하나다. |
| `analysis.plannerView` | 객체 | 기획자 관점 요약, 산출물, 리스크를 담는다. |
| `analysis.developerView` | 객체 | 계약 조건, 구현 포인트, 테스트 포인트를 담는다. |
| `analysis.contractBoard.locked` | 배열 | 현재 잠긴 계약이다. |
| `analysis.contractBoard.reopened` | 배열 | 변경으로 다시 열린 계약이다. |
| `analysis.contractBoard.pendingApproval` | 배열 | 승인권자 결정을 기다리는 항목이다. |
| `analysis.contractBoard.openQuestions` | 배열 | 열린 질문이다. |
| `analysis.contractBoard.needsConfirmation` | 배열 | AI가 확정하지 못한 항목이다. 반드시 `추가 확인 필요` 성격의 문장만 담는다. |
| `analysis.impact.affectedAreas` | 배열 | 현재 입력만으로도 영향이 있다고 볼 수 있는 축이다. |
| `analysis.impact.unresolvedImpact` | 배열 | 아직 미확정인 영향이다. 빈 배열 대신 명시적으로 남긴다. |
| `analysis.decision` | 객체 | 운영자에게 필요한 추천, 이유, 다음 액션을 담는다. |
| `meta` | 객체 | 요청 모드, 실제 모드, fallback 여부, 확인 필요 건수를 함께 반환한다. |

#### 실패 응답 스키마

| 상태 코드 | 코드 | 의미 | 처리 원칙 |
| --- | --- | --- | --- |
| `400` | `INVALID_PAYLOAD` | `draft`, `changes`, `team` 형식이 잘못되었다. | 어느 필드가 비었는지 `details`로 돌려준다. |
| `422` | `INVALID_OWNER` | `draft.ownerId`와 팀 담당자가 연결되지 않는다. | 담당자 연결 전에는 분석을 진행하지 않는다. |
| `422` | `INSUFFICIENT_DRAFT` | `goal` 또는 `body`가 비어 있다. | 빈 원문을 요약하지 않는다. |
| `500` | `ANALYSIS_FAILED` | demo fallback조차 만들 수 없는 예외다. | 마지막 수단이며 일반적인 AI 실패에는 사용하지 않는다. |

#### fallback 결정표

| 조건 | 응답 모드 | `meta.status` | `fallbackReason` | 제품 처리 |
| --- | --- | --- | --- | --- |
| `mode=demo` | `demo` | `fallback` | `forced_demo` | 심사용 데모나 로컬 환경에서 동일 흐름을 강제로 유지한다. |
| `OPENAI_API_KEY` 없음 | `demo` | `fallback` | `missing_api_key` | 제품 흐름을 멈추지 않고 규칙 기반 분석을 반환한다. |
| OpenAI 호출 실패 | `demo` | `fallback` | `ai_error` | 네트워크·모델 오류를 사용자 실패로 전가하지 않는다. |
| OpenAI 응답 파싱 실패 | `demo` | `fallback` | `invalid_ai_response` | 잘못된 JSON을 그대로 쓰지 않고 안전하게 데모 분석으로 되돌린다. |
| OpenAI 정상 응답 | `live` | `success` | `null` | 실시간 AI 분석을 반환한다. |

#### `추가 확인 필요` 정책

- AI는 승인 여부를 대신 결정하지 않는다.
- 입력 근거가 짧거나 담당자가 불명확하면 `needsConfirmation`에 남긴다.
- 화면, API, 테스트 영향이 확정되지 않으면 `unresolvedImpact`로 분리한다.
- `needsConfirmation`과 `unresolvedImpact`는 빈칸으로 두지 않고, 왜 미확정인지 짧게 적는다.
- 프론트는 이 두 배열을 `추가 확인 필요`와 `미확정 영향` 레일에 그대로 매핑해야 한다.

## 주요 설계 원칙

1. 하나의 원본 초안에서 두 관점을 파생한다.
2. 변경 요청은 이유와 긴급도를 반드시 함께 가진다.
3. AI가 실패해도 데모 분석으로 흐름이 멈추지 않는다.
4. 계약 보드는 요약보다 책임과 열린 질문을 먼저 보여준다.
5. `추가 확인 필요`와 `미확정 영향`은 확정 결과와 섞지 않고 별도 레일로 남긴다.
6. MVP는 외부 연동보다 계약 가시화와 재작업 감소 가치 검증을 우선한다.

## 다음 확장 포인트

- 승인 상태와 승인 이력
- 버전별 초안 비교
- Jira, Slack, Notion 등 외부 연동
- 프로젝트/릴리즈 단위 영향 맵
- 팀별 권한 관리
