import { type FormEvent, useEffect, useMemo, useState } from 'react'
import './App.css'

type Role = 'planner' | 'developer' | 'pm'
type AnalyzeMode = 'auto' | 'demo'
type AnalysisMode = 'live' | 'demo'
type AnalysisSource = 'openai' | 'heuristic'
type FallbackReason =
  | 'forced_demo'
  | 'missing_api_key'
  | 'ai_error'
  | 'invalid_ai_response'
  | null

type TeamMember = {
  id: string
  name: string
  role: Role
  focus: string
}

type DraftRecord = {
  id: string
  title: string
  authorName: string
  authorRole: Role
  ownerId: string
  goal: string
  body: string
  dueDate: string
  createdAt: string
}

type ChangeRequest = {
  id: string
  title: string
  reason: string
  requestor: string
  urgency: '낮음' | '보통' | '높음'
  createdAt: string
}

type Handoff = {
  owner: string
  responsibility: string
}

type Analysis = {
  schemaVersion: '2026-04-20'
  mode: AnalysisMode
  source: AnalysisSource
  fallbackReason: FallbackReason
  generatedAt: string
  plannerView: {
    summary: string
    deliverables: string[]
    risks: string[]
  }
  developerView: {
    summary: string
    contracts: string[]
    implementation: string[]
    tests: string[]
  }
  contractBoard: {
    locked: string[]
    reopened: string[]
    pendingApproval: string[]
    openQuestions: string[]
    needsConfirmation: string[]
    handoffs: Handoff[]
  }
  impact: {
    severity: '낮음' | '보통' | '높음'
    affectedAreas: string[]
    unresolvedImpact: string[]
    scheduleNote: string
    rollbackNote: string
  }
  decision: {
    recommendation: string
    reasons: string[]
    nextActions: string[]
  }
}

type AnalyzeMeta = {
  schemaVersion: '2026-04-20'
  requestedMode: AnalyzeMode
  resolvedMode: AnalysisMode
  source: AnalysisSource
  status: 'success' | 'fallback'
  aiEnabled: boolean
  fallbackReason: FallbackReason
  needsConfirmationCount: number
  unresolvedImpactCount: number
}

type AnalyzeResponse = {
  analysis: Analysis
  meta: AnalyzeMeta
}

type HealthResponse = {
  ok: boolean
  aiEnabled: boolean
  model: string | null
}

const teamSeed: TeamMember[] = [
  {
    id: 'planner-1',
    name: '민아',
    role: 'planner',
    focus: '변경 의도와 승인 근거를 문서 기준으로 잠급니다.',
  },
  {
    id: 'developer-1',
    name: '지수',
    role: 'developer',
    focus: 'API, 화면, 테스트 영향과 재작업 비용을 검증합니다.',
  },
  {
    id: 'pm-1',
    name: '도윤',
    role: 'pm',
    focus: '출시 시점, 승인권자, 운영 리스크를 최종 판단합니다.',
  },
]

const draftSeed: DraftRecord = {
  id: 'draft-relai-001',
  title: '파트너 초대 흐름에 승인 단계 추가',
  authorName: '민아',
  authorRole: 'planner',
  ownerId: 'developer-1',
  goal: '외부 파트너 초대 요청이 승인된 뒤에만 발송되고 감사 로그가 남아야 합니다.',
  body:
    '현재는 관리자라면 누구나 초대를 바로 발송할 수 있습니다. 다음 배치에서는 파트너 초대 요청을 먼저 생성하고, 승인권자가 승인하면 발송되도록 바꿉니다. 승인 대기 중에는 발송 버튼을 잠그고, 승인 이력과 반려 사유를 감사 로그에 남겨야 합니다. 기존 초대 API, 관리자 화면, 알림 문구, QA 회귀 범위를 함께 다시 확인해야 합니다.',
  dueDate: '2026-04-26',
  createdAt: '2026. 4. 20. 오전 2:20',
}

const changeSeed: ChangeRequest[] = [
  {
    id: 'change-001',
    title: '승인 전 발송 버튼 잠금',
    reason: '운영팀이 승인 없는 초대 발송을 막아야 한다고 요청했습니다.',
    requestor: '운영 리드',
    urgency: '높음',
    createdAt: '2026. 4. 20. 오전 2:21',
  },
  {
    id: 'change-002',
    title: '반려 사유 감사 로그 추가',
    reason: '누가 왜 반려했는지 추적할 수 있어야 CS 대응과 분쟁 처리가 가능합니다.',
    requestor: 'CS 운영',
    urgency: '보통',
    createdAt: '2026. 4. 20. 오전 2:23',
  },
  {
    id: 'change-003',
    title: '승인 알림 문구 재정렬',
    reason: '승인 대기와 승인 완료 메시지가 현재 동일해서 파트너가 혼동합니다.',
    requestor: '브랜드 마케팅',
    urgency: '보통',
    createdAt: '2026. 4. 20. 오전 2:24',
  },
]

const initialLocal = buildLocalAnalysis(draftSeed, changeSeed, teamSeed, 'demo', 'forced_demo')

function uid(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`
}

function timestamp() {
  return new Date().toLocaleString('ko-KR', {
    dateStyle: 'short',
    timeStyle: 'short',
  })
}

function inferAffectedAreas(text: string) {
  const areas = new Set<string>()
  const source = text.toLowerCase()

  if (/승인|반려|approval/.test(source)) areas.add('승인 정책')
  if (/api|백엔드|server|로그/.test(source)) areas.add('API 계약')
  if (/화면|버튼|문구|파트너|초대/.test(source)) areas.add('프론트 화면')
  if (/qa|테스트|회귀|검증/.test(source)) areas.add('테스트 범위')
  if (/일정|배치|출시/.test(source)) areas.add('배포 일정')

  if (areas.size === 0) {
    areas.add('운영 정책')
    areas.add('프론트 화면')
  }

  return [...areas]
}

function fallbackMessage(reason: FallbackReason) {
  switch (reason) {
    case 'forced_demo':
      return '데모 모드로 고정했습니다. 화면과 흐름은 같은 계약으로 유지됩니다.'
    case 'missing_api_key':
      return 'OpenAI 키가 없어 데모 분석으로 이어집니다. 핵심 운영 흐름은 유지됩니다.'
    case 'ai_error':
      return 'AI 호출이 실패해도 로컬 데모 분석으로 fallback 했습니다.'
    case 'invalid_ai_response':
      return 'AI 응답 형식이 맞지 않아 안전한 데모 분석으로 전환했습니다.'
    default:
      return 'OpenAI live 분석이 같은 계약 스키마로 반영되었습니다.'
  }
}

function buildLocalAnalysis(
  draft: DraftRecord,
  changes: ChangeRequest[],
  team: TeamMember[],
  requestedMode: AnalyzeMode,
  fallbackReason: FallbackReason,
): AnalyzeResponse {
  const owner = team.find((member) => member.id === draft.ownerId) ?? team[0]
  const changeSummary = changes.map((item) => `${item.title} (${item.urgency})`).join(', ')
  const areaSource = `${draft.title} ${draft.goal} ${draft.body} ${changes
    .map((item) => `${item.title} ${item.reason}`)
    .join(' ')}`
  const affectedAreas = inferAffectedAreas(areaSource)
  const needsConfirmation = changes.length > 0
    ? changes
        .filter((item) => item.reason.length < 36 || item.title.includes('문구'))
        .map((item) => `${item.title}: 승인 기준과 변경 종료 조건을 추가 확인해야 합니다.`)
    : ['변경 요청이 없어 추가 확인 필요 항목이 아직 없습니다.']

  const unresolvedImpact = affectedAreas.slice(0, 3).map((area, index) => {
    if (area === 'API 계약') {
      return '승인 이력 저장 스키마와 기존 초대 API 호환 여부가 아직 미확정입니다.'
    }

    if (area === '테스트 범위') {
      return '회귀 테스트를 관리자/파트너 양쪽 흐름까지 넓힐지 QA 확인이 필요합니다.'
    }

    return `${area} 레일은 ${changes[index]?.title ?? '최근 변경'} 기준으로 반영 범위가 더 필요합니다.`
  })

  const analysis: Analysis = {
    schemaVersion: '2026-04-20',
    mode: fallbackReason ? 'demo' : 'live',
    source: fallbackReason ? 'heuristic' : 'openai',
    fallbackReason,
    generatedAt: timestamp(),
    plannerView: {
      summary:
        `${draft.title}는 기능 추가 자체보다 승인 조건을 운영 규칙으로 잠그는 일이 핵심입니다. ` +
        `현재 변경은 ${changeSummary || '변경 없음'} 기준으로 다시 열렸습니다.`,
      deliverables: [
        '승인 대기 상태와 발송 가능 상태를 분리한 화면 카피',
        '반려 사유와 감사 로그 정책을 포함한 운영 계약 문구',
        '승인권자와 개발 착수 조건을 묶은 합의 잠금 보드',
      ],
      risks: [
        '승인 전 발송 차단 위치가 화면과 API에서 다르면 다시 오해가 생깁니다.',
        '반려 사유 저장 범위가 불명확하면 CS와 운영팀이 서로 다른 로그를 보게 됩니다.',
        'QA 범위가 늦게 열리면 승인 기능 추가가 일정 전체를 흔들 수 있습니다.',
      ],
    },
    developerView: {
      summary:
        `${owner.name} 기준으로는 화면 수정보다 상태 전이와 API/로그 계약을 먼저 잠가야 합니다.`,
      contracts: [
        '초대 요청은 created → pendingApproval → approved/rejected 상태 전이를 가져야 합니다.',
        '승인 전 발송 버튼과 발송 API는 동일한 잠금 규칙을 공유해야 합니다.',
        '반려 사유와 승인 이력은 감사 로그 필드로 남아야 합니다.',
      ],
      implementation: [
        '관리자 초대 화면에 승인 대기/승인 완료/반려 상태를 분리합니다.',
        '초대 API 응답에 승인 상태, 승인자, 승인 시각 필드를 추가합니다.',
        '알림 문구와 로그 타임라인이 같은 상태명을 사용하도록 맞춥니다.',
      ],
      tests: [
        '승인 전 발송 버튼이 잠기는지 확인합니다.',
        '승인 후에만 초대 API가 성공하는지 확인합니다.',
        '반려 사유가 감사 로그와 운영 화면에 동시에 보이는지 확인합니다.',
      ],
    },
    contractBoard: {
      locked: [
        `담당 개발 리드는 ${owner.name}이며 영향 검증 책임을 집니다.`,
        '승인 전 발송 금지는 제품 정책이 아니라 운영 계약으로 잠급니다.',
        `출시 목표 시점은 ${draft.dueDate}이며, 승인 조건이 잠겨야 개발 착수가 가능합니다.`,
      ],
      reopened: changes.map(
        (item) => `${item.title}: 기존 초대 흐름 계약을 다시 열고 영향 범위를 재계산해야 합니다.`,
      ),
      pendingApproval: [
        '승인권자를 운영 리드로 고정할지 PM 승인으로 올릴지 결정이 필요합니다.',
        '반려 사유를 파트너에게 그대로 노출할지 내부용으로 제한할지 승인받아야 합니다.',
      ],
      openQuestions: [
        '승인 알림 문구를 브랜드 톤에 맞추되 운영 상태명은 그대로 유지할 수 있습니까?',
        '파트너 재초대 시 기존 승인 이력을 이어서 보여줄지 새 요청으로 분리할지 정해야 합니다.',
        '감사 로그 보존 기간을 운영 정책과 보안 정책 중 어디에 종속시킬지 정해야 합니다.',
      ],
      needsConfirmation,
      handoffs: [
        {
          owner: '기획 담당',
          responsibility: '반려 사유 공개 범위와 승인 완료 정의를 문서로 확정합니다.',
        },
        {
          owner: owner.name,
          responsibility: '화면, API, 테스트 영향 범위를 하나의 변경 묶음으로 다시 산정합니다.',
        },
        {
          owner: '운영 리드',
          responsibility: '승인권자와 출시 전 점검 기준을 최종 승인합니다.',
        },
      ],
    },
    impact: {
      severity: changes.some((item) => item.urgency === '높음') ? '높음' : '보통',
      affectedAreas,
      unresolvedImpact,
      scheduleNote:
        '승인 규칙을 이번 스프린트 초반에 잠그지 않으면 화면 수정이 API/QA 재작업으로 번집니다.',
      rollbackNote:
        '개발 착수 전에 reopened 계약과 pendingApproval 항목을 분리해 두면 반영 취소 시 영향 회수가 쉬워집니다.',
    },
    decision: {
      recommendation:
        '승인권자와 반려 사유 공개 범위를 먼저 잠근 뒤 화면/API 구현을 같은 변경 묶음으로 진행합니다.',
      reasons: [
        '현재 변경은 문구 수정이 아니라 승인 단계 도입이라 상태 전이 계약이 먼저입니다.',
        'reopened 계약과 pendingApproval 항목이 섞이면 개발 착수 조건이 흐려집니다.',
        'needsConfirmation을 남겨야 AI가 확정할 수 없는 운영 판단을 숨기지 않습니다.',
      ],
      nextActions: [
        '승인권자와 공개 범위를 오늘 안에 확정합니다.',
        '초대 화면과 API 상태 필드를 동시에 수정합니다.',
        'QA 회귀 케이스에 승인 전/후/반려 흐름을 추가합니다.',
      ],
    },
  }

  return {
    analysis,
    meta: {
      schemaVersion: '2026-04-20',
      requestedMode,
      resolvedMode: analysis.mode,
      source: analysis.source,
      status: fallbackReason ? 'fallback' : 'success',
      aiEnabled: false,
      fallbackReason,
      needsConfirmationCount: analysis.contractBoard.needsConfirmation.length,
      unresolvedImpactCount: analysis.impact.unresolvedImpact.length,
    },
  }
}

function App() {
  const [team] = useState(teamSeed)
  const [draft, setDraft] = useState(draftSeed)
  const [changeForm, setChangeForm] = useState({
    title: '',
    reason: '',
    requestor: '운영 리드',
    urgency: '보통' as ChangeRequest['urgency'],
  })
  const [changes, setChanges] = useState(changeSeed)
  const [serviceMode, setServiceMode] = useState<AnalyzeMode>('auto')
  const [analysis, setAnalysis] = useState<Analysis>(initialLocal.analysis)
  const [meta, setMeta] = useState<AnalyzeMeta>(initialLocal.meta)
  const [health, setHealth] = useState<HealthResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [runtimeNote, setRuntimeNote] = useState(fallbackMessage(initialLocal.meta.fallbackReason))
  const [error, setError] = useState('')

  const owner = useMemo(
    () => team.find((member) => member.id === draft.ownerId) ?? team[0],
    [draft.ownerId, team],
  )

  const impactRows = useMemo(() => {
    return analysis.impact.affectedAreas.map((area, index) => ({
      area,
      reopened:
        analysis.contractBoard.reopened[index] ?? analysis.contractBoard.reopened[0] ?? '다시 열린 계약 없음',
      status:
        analysis.impact.unresolvedImpact[index] ??
        analysis.contractBoard.pendingApproval[index] ??
        '현재 레일은 잠긴 계약 안에서 진행 가능합니다.',
      nextAction:
        analysis.decision.nextActions[index] ??
        analysis.contractBoard.handoffs[index]?.responsibility ??
        '담당자 검토 필요',
    }))
  }, [analysis])

  useEffect(() => {
    void loadHealth()
    void performAnalysis(draftSeed, changeSeed, { silentError: true })
  }, [])

  async function loadHealth() {
    try {
      const response = await fetch('/api/health')
      if (!response.ok) return
      const payload = (await response.json()) as HealthResponse
      setHealth(payload)
    } catch {
      setHealth(null)
    }
  }

  async function performAnalysis(
    nextDraft: DraftRecord = draft,
    nextChanges: ChangeRequest[] = changes,
    options?: { silentError?: boolean },
  ) {
    setLoading(true)
    setError('')

    try {
      const response = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: serviceMode,
          draft: nextDraft,
          changes: nextChanges,
          team,
        }),
      })

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as
          | { error?: { message?: string; details?: string[] } }
          | null
        const message = payload?.error?.message ?? '분석 요청이 실패했습니다.'
        const details = payload?.error?.details?.join(' ') ?? ''
        throw new Error(`${message} ${details}`.trim())
      }

      const payload = (await response.json()) as AnalyzeResponse
      setAnalysis(payload.analysis)
      setMeta(payload.meta)
      setRuntimeNote(fallbackMessage(payload.meta.fallbackReason))
    } catch (caught) {
      const fallbackReason: FallbackReason = serviceMode === 'demo' ? 'forced_demo' : 'ai_error'
      const fallback = buildLocalAnalysis(nextDraft, nextChanges, team, serviceMode, fallbackReason)

      setAnalysis(fallback.analysis)
      setMeta(fallback.meta)
      setRuntimeNote('분석 서버 연결이 없어도 로컬 데모 분석으로 화면과 상태 흐름을 유지합니다.')

      if (!options?.silentError) {
        setError(caught instanceof Error ? caught.message : '알 수 없는 오류가 발생했습니다.')
      }
    } finally {
      setLoading(false)
    }
  }

  function submitDraft(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    const nextDraft = {
      ...draft,
      createdAt: timestamp(),
    }

    setDraft(nextDraft)
    void performAnalysis(nextDraft, changes)
  }

  function submitChange(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (!changeForm.title.trim() || !changeForm.reason.trim()) {
      setError('변경 제목과 변경 이유를 모두 입력해야 합니다.')
      return
    }

    const nextChanges = [
      {
        id: uid('change'),
        createdAt: timestamp(),
        ...changeForm,
      },
      ...changes,
    ]

    setChanges(nextChanges)
    setChangeForm({
      title: '',
      reason: '',
      requestor: changeForm.requestor,
      urgency: '보통',
    })
    void performAnalysis(draft, nextChanges)
  }

  return (
    <div className="app-shell">
      <main className="app-frame">
        <header className="topbar panel">
          <div className="topbar-copy">
            <p className="eyebrow">Relai / Change Control Tower</p>
            <h1>변경 영향 맵과 합의 잠금 보드로 개발 착수 조건을 먼저 잠급니다.</h1>
            <p className="lede">
              Relai는 회의록 요약이 아니라 요구사항 변경을 계약 단위로 다시 열고,
              무엇이 잠겼고 무엇이 승인 대기인지 같은 화면에서 운영하는 시스템입니다.
            </p>
          </div>

          <div className="topbar-side">
            <div className="status-stack">
              <div>
                <span className="label">분석 모드</span>
                <strong>{meta.resolvedMode === 'live' ? 'Live analysis' : 'Demo fallback'}</strong>
              </div>
              <div>
                <span className="label">분석 소스</span>
                <strong>{meta.source === 'openai' ? 'OpenAI' : 'Heuristic contract'}</strong>
              </div>
              <div>
                <span className="label">AI 상태</span>
                <strong>
                  {health?.aiEnabled
                    ? `활성 (${health.model ?? '모델 미표시'})`
                    : '비활성 · fallback 준비'}
                </strong>
              </div>
            </div>

            <div className="toolbar-row">
              <label className="control-inline">
                <span>실행 모드</span>
                <select
                  value={serviceMode}
                  onChange={(event) => setServiceMode(event.target.value as AnalyzeMode)}
                >
                  <option value="auto">auto</option>
                  <option value="demo">demo</option>
                </select>
              </label>

              <button
                type="button"
                className="primary-button"
                onClick={() => void performAnalysis()}
                disabled={loading}
              >
                {loading ? '분석 중...' : '영향 다시 계산'}
              </button>
            </div>

            <p className="runtime-note">{runtimeNote}</p>
          </div>
        </header>

        <section className="stats-grid" aria-label="contract signals">
          <article className="stat-cell panel">
            <span>잠긴 계약</span>
            <strong>{analysis.contractBoard.locked.length}</strong>
            <p>개발 착수 전제로 유지되는 항목</p>
          </article>
          <article className="stat-cell panel">
            <span>다시 열린 계약</span>
            <strong>{analysis.contractBoard.reopened.length}</strong>
            <p>변경으로 재검토가 필요한 범위</p>
          </article>
          <article className="stat-cell panel">
            <span>승인 대기</span>
            <strong>{analysis.contractBoard.pendingApproval.length}</strong>
            <p>승인권자 판단이 필요한 항목</p>
          </article>
          <article className="stat-cell panel">
            <span>추가 확인 필요</span>
            <strong>{meta.needsConfirmationCount}</strong>
            <p>AI가 확정할 수 없어 남긴 질문</p>
          </article>
          <article className="stat-cell panel">
            <span>미확정 영향</span>
            <strong>{meta.unresolvedImpactCount}</strong>
            <p>영향은 보이지만 아직 잠기지 않은 범위</p>
          </article>
        </section>

        <section className="workflow-strip panel" aria-label="operating workflow">
          <article>
            <span className="step-number">01</span>
            <strong>변경 입력</strong>
            <p>초안 목표와 최근 변경 요청을 한 계약 묶음으로 넣습니다.</p>
          </article>
          <article>
            <span className="step-number">02</span>
            <strong>영향 번역</strong>
            <p>기획 언어를 화면·API·테스트 영향으로 다시 풀어냅니다.</p>
          </article>
          <article>
            <span className="step-number">03</span>
            <strong>합의 잠금</strong>
            <p>locked, reopened, pendingApproval, needsConfirmation을 분리합니다.</p>
          </article>
          <article>
            <span className="step-number">04</span>
            <strong>다음 액션</strong>
            <p>승인권자, 개발 리드, QA가 바로 움직일 수 있는 액션으로 넘깁니다.</p>
          </article>
        </section>

        <section className="tower-layout">
          <article className="panel">
            <div className="panel-head">
              <div>
                <p className="eyebrow subtle">Wow point 1</p>
                <h2>변경 영향 맵</h2>
              </div>
              <div className={`severity-box severity-${analysis.impact.severity}`}>
                <span>영향 강도</span>
                <strong>{analysis.impact.severity}</strong>
              </div>
            </div>

            <div className="panel-body impact-body">
              <div className="impact-summary">
                <div>
                  <span className="label">현재 초안</span>
                  <strong>{draft.title}</strong>
                </div>
                <div>
                  <span className="label">담당 개발 리드</span>
                  <strong>{owner.name}</strong>
                </div>
                <div>
                  <span className="label">완료 목표</span>
                  <strong>{draft.dueDate}</strong>
                </div>
                <div>
                  <span className="label">마지막 분석</span>
                  <strong>{analysis.generatedAt}</strong>
                </div>
              </div>

              <table className="impact-table">
                <thead>
                  <tr>
                    <th>영향 레일</th>
                    <th>다시 열린 계약</th>
                    <th>현재 상태</th>
                    <th>즉시 액션</th>
                  </tr>
                </thead>
                <tbody>
                  {impactRows.map((row) => (
                    <tr key={row.area}>
                      <td>{row.area}</td>
                      <td>{row.reopened}</td>
                      <td>{row.status}</td>
                      <td>{row.nextAction}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div className="evidence-grid">
                <section>
                  <span className="label">일정 메모</span>
                  <p>{analysis.impact.scheduleNote}</p>
                </section>
                <section>
                  <span className="label">회수 메모</span>
                  <p>{analysis.impact.rollbackNote}</p>
                </section>
                <section>
                  <span className="label">기획자 요약</span>
                  <p>{analysis.plannerView.summary}</p>
                </section>
              </div>
            </div>
          </article>

          <article className="panel">
            <div className="panel-head">
              <div>
                <p className="eyebrow subtle">Wow point 2</p>
                <h2>합의 잠금 보드</h2>
              </div>
              <div className="board-meta">
                <span>{meta.status === 'fallback' ? 'fallback flow' : 'live flow'}</span>
              </div>
            </div>

            <div className="panel-body board-grid">
              <section className="board-lane">
                <h3>잠긴 계약</h3>
                <ul>
                  {analysis.contractBoard.locked.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </section>
              <section className="board-lane">
                <h3>다시 열린 계약</h3>
                <ul>
                  {analysis.contractBoard.reopened.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </section>
              <section className="board-lane">
                <h3>승인 대기</h3>
                <ul>
                  {analysis.contractBoard.pendingApproval.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </section>
              <section className="board-lane">
                <h3>추가 확인 필요</h3>
                <ul>
                  {analysis.contractBoard.needsConfirmation.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </section>
            </div>
          </article>
        </section>

        <section className="operations-layout">
          <article className="panel">
            <div className="panel-head">
              <div>
                <p className="eyebrow subtle">Input</p>
                <h2>초안과 변경 입력</h2>
              </div>
              <span className="panel-caption">입력 후 같은 계약 스키마로 즉시 재분석합니다.</span>
            </div>

            <div className="panel-body">
              {error ? <p className="error-box">{error}</p> : null}

              <form className="form-stack" onSubmit={submitDraft}>
                <div className="field-grid two-up">
                  <label>
                    <span>초안 제목</span>
                    <input
                      value={draft.title}
                      onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))}
                    />
                  </label>
                  <label>
                    <span>담당 개발 리드</span>
                    <select
                      value={draft.ownerId}
                      onChange={(event) =>
                        setDraft((current) => ({ ...current, ownerId: event.target.value }))
                      }
                    >
                      {team.map((member) => (
                        <option key={member.id} value={member.id}>
                          {member.name} · {member.focus}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>

                <div className="field-grid two-up">
                  <label>
                    <span>목표</span>
                    <input
                      value={draft.goal}
                      onChange={(event) => setDraft((current) => ({ ...current, goal: event.target.value }))}
                    />
                  </label>
                  <label>
                    <span>목표 일정</span>
                    <input
                      value={draft.dueDate}
                      onChange={(event) =>
                        setDraft((current) => ({ ...current, dueDate: event.target.value }))
                      }
                    />
                  </label>
                </div>

                <label>
                  <span>초안 본문</span>
                  <textarea
                    rows={8}
                    value={draft.body}
                    onChange={(event) => setDraft((current) => ({ ...current, body: event.target.value }))}
                  />
                </label>

                <div className="toolbar-row">
                  <button type="submit" className="secondary-button" disabled={loading}>
                    초안 잠그고 재분석
                  </button>
                  <p className="inline-note">
                    작성자 {draft.authorName} / 생성 {draft.createdAt}
                  </p>
                </div>
              </form>

              <div className="divider" />

              <form className="form-stack" onSubmit={submitChange}>
                <div className="field-grid two-up">
                  <label>
                    <span>변경 제목</span>
                    <input
                      value={changeForm.title}
                      onChange={(event) =>
                        setChangeForm((current) => ({ ...current, title: event.target.value }))
                      }
                    />
                  </label>
                  <label>
                    <span>요청자</span>
                    <input
                      value={changeForm.requestor}
                      onChange={(event) =>
                        setChangeForm((current) => ({ ...current, requestor: event.target.value }))
                      }
                    />
                  </label>
                </div>

                <div className="field-grid two-up">
                  <label>
                    <span>변경 이유</span>
                    <textarea
                      rows={3}
                      value={changeForm.reason}
                      onChange={(event) =>
                        setChangeForm((current) => ({ ...current, reason: event.target.value }))
                      }
                    />
                  </label>
                  <label>
                    <span>긴급도</span>
                    <select
                      value={changeForm.urgency}
                      onChange={(event) =>
                        setChangeForm((current) => ({
                          ...current,
                          urgency: event.target.value as ChangeRequest['urgency'],
                        }))
                      }
                    >
                      <option value="낮음">낮음</option>
                      <option value="보통">보통</option>
                      <option value="높음">높음</option>
                    </select>
                  </label>
                </div>

                <div className="toolbar-row">
                  <button type="submit" className="secondary-button" disabled={loading}>
                    변경 추가 후 재분석
                  </button>
                </div>
              </form>
            </div>
          </article>

          <article className="panel">
            <div className="panel-head">
              <div>
                <p className="eyebrow subtle">Translation</p>
                <h2>기획 ↔ 개발 번역</h2>
              </div>
              <span className="panel-caption">양방향 관점 재구성이 같은 화면에서 읽혀야 합니다.</span>
            </div>

            <div className="panel-body translation-grid">
              <section>
                <span className="label">기획자 관점</span>
                <p className="summary-copy">{analysis.plannerView.summary}</p>
                <h3>반드시 잠길 산출물</h3>
                <ul>
                  {analysis.plannerView.deliverables.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
                <h3>리스크</h3>
                <ul>
                  {analysis.plannerView.risks.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </section>

              <section>
                <span className="label">개발 리드 관점</span>
                <p className="summary-copy">{analysis.developerView.summary}</p>
                <h3>계약</h3>
                <ul>
                  {analysis.developerView.contracts.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
                <h3>구현 및 테스트</h3>
                <ul>
                  {[...analysis.developerView.implementation, ...analysis.developerView.tests].map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </section>
            </div>
          </article>

          <article className="panel">
            <div className="panel-head">
              <div>
                <p className="eyebrow subtle">Action queue</p>
                <h2>열린 질문 · 승인 대기 · 다음 액션</h2>
              </div>
              <span className="panel-caption">입력부터 실행까지 하나의 운영 흐름으로 연결합니다.</span>
            </div>

            <div className="panel-body queue-stack">
              <section>
                <span className="label">다음 액션</span>
                <ol>
                  {analysis.decision.nextActions.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ol>
              </section>

              <section>
                <span className="label">열린 질문</span>
                <ul>
                  {analysis.contractBoard.openQuestions.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </section>

              <section>
                <span className="label">핸드오프</span>
                <table className="handoff-table">
                  <thead>
                    <tr>
                      <th>담당</th>
                      <th>즉시 책임</th>
                    </tr>
                  </thead>
                  <tbody>
                    {analysis.contractBoard.handoffs.map((item) => (
                      <tr key={`${item.owner}-${item.responsibility}`}>
                        <td>{item.owner}</td>
                        <td>{item.responsibility}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>

              <section>
                <span className="label">최근 변경 큐</span>
                <table className="handoff-table">
                  <thead>
                    <tr>
                      <th>제목</th>
                      <th>요청자</th>
                      <th>긴급도</th>
                    </tr>
                  </thead>
                  <tbody>
                    {changes.map((item) => (
                      <tr key={item.id}>
                        <td>{item.title}</td>
                        <td>{item.requestor}</td>
                        <td>{item.urgency}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>
            </div>
          </article>
        </section>
      </main>
    </div>
  )
}

export default App
