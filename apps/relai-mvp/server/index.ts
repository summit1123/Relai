import 'dotenv/config'

import cors from 'cors'
import express from 'express'
import OpenAI from 'openai'

type Role = 'planner' | 'developer' | 'pm'

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

type AnalyzeMode = 'auto' | 'demo'
type AnalysisMode = 'live' | 'demo'
type AnalysisSource = 'openai' | 'heuristic'
type FallbackReason = 'forced_demo' | 'missing_api_key' | 'ai_error' | 'invalid_ai_response' | null

type Handoff = {
  owner: string
  responsibility: string
}

type Analysis = {
  schemaVersion: '2026-04-20'
  mode: 'live' | 'demo'
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

type AnalyzeRequestBody = {
  mode?: AnalyzeMode
  draft?: DraftRecord
  changes?: ChangeRequest[]
  team?: TeamMember[]
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

const app = express()
const port = Number(process.env.PORT ?? 8787)
const model = process.env.OPENAI_MODEL ?? 'gpt-5-mini'
const apiKey = process.env.OPENAI_API_KEY
const client = apiKey ? new OpenAI({ apiKey }) : null

app.use(cors())
app.use(express.json({ limit: '2mb' }))

app.get('/api/health', (_request, response) => {
  response.json({ ok: true, aiEnabled: Boolean(client), model: client ? model : null })
})

app.post('/api/analyze', async (request, response) => {
  const { mode = 'auto', draft, changes, team } = request.body as AnalyzeRequestBody
  const validation = validateAnalyzePayload({ draft, changes, team })

  if (validation.length > 0) {
    response.status(400).json({
      error: {
        code: 'INVALID_PAYLOAD',
        message: '분석에 필요한 draft, changes, team 형식이 올바르지 않습니다.',
        details: validation,
      },
    })
    return
  }

  if (!team.some((member) => member.id === draft.ownerId)) {
    response.status(422).json({
      error: {
        code: 'INVALID_OWNER',
        message: 'draft.ownerId와 일치하는 담당자가 team에 있어야 합니다.',
      },
    })
    return
  }

  if (!draft.body.trim() || !draft.goal.trim()) {
    response.status(422).json({
      error: {
        code: 'INSUFFICIENT_DRAFT',
        message: 'draft.goal과 draft.body는 비어 있을 수 없습니다.',
      },
    })
    return
  }

  try {
    const result = await analyzeDraft({ requestedMode: mode, draft, changes, team })

    response.json(result)
  } catch (error) {
    response.status(500).json({
      error: {
        code: 'ANALYSIS_FAILED',
        message: error instanceof Error ? error.message : '분석 중 오류가 발생했습니다.',
      },
    })
  }
})

function validateAnalyzePayload({
  draft,
  changes,
  team,
}: Pick<AnalyzeRequestBody, 'draft' | 'changes' | 'team'>) {
  const details: string[] = []

  if (!draft) details.push('draft 객체가 필요합니다.')
  if (!Array.isArray(changes)) details.push('changes 배열이 필요합니다.')
  if (!Array.isArray(team)) details.push('team 배열이 필요합니다.')

  if (draft) {
    const requiredDraftFields: Array<keyof DraftRecord> = [
      'id',
      'title',
      'authorName',
      'authorRole',
      'ownerId',
      'goal',
      'body',
      'dueDate',
      'createdAt',
    ]

    for (const field of requiredDraftFields) {
      if (typeof draft[field] !== 'string' || !draft[field].trim()) {
        details.push(`draft.${field} 값이 필요합니다.`)
      }
    }
  }

  if (Array.isArray(changes)) {
    changes.forEach((change, index) => {
      if (!change.title.trim()) details.push(`changes[${index}].title 값이 필요합니다.`)
      if (!change.reason.trim()) details.push(`changes[${index}].reason 값이 필요합니다.`)
      if (!change.requestor.trim()) details.push(`changes[${index}].requestor 값이 필요합니다.`)
    })
  }

  if (Array.isArray(team) && team.length === 0) {
    details.push('team에는 최소 1명의 담당자가 필요합니다.')
  }

  return details
}

function extractKeywords(text: string) {
  const keywords: string[] = []
  const rules: Array<[RegExp, string]> = [
    [/승인|approve|approval/i, '승인 단계'],
    [/변경|change/i, '변경 관리'],
    [/api|backend|server/i, '백엔드 계약'],
    [/화면|ui|frontend/i, '프론트엔드 화면'],
    [/테스트|qa|검증/i, '검증 조건'],
    [/알림|notification/i, '담당자 알림'],
    [/로그|history|audit/i, '결정 로그'],
  ]

  for (const [pattern, label] of rules) {
    if (pattern.test(text)) keywords.push(label)
  }

  return keywords.length ? keywords : ['요구사항 계약', '담당자 연결', '출시 범위']
}

function buildReopenedItems(changes: ChangeRequest[]) {
  if (changes.length === 0) {
    return ['아직 다시 열린 계약 항목이 없어서 다음 변경 입력을 기다립니다.']
  }

  return changes.slice(0, 3).map((change) => `${change.title}: ${change.reason}`)
}

function buildPendingApprovalItems(changes: ChangeRequest[]) {
  const highPriority = changes.filter((change) => change.urgency === '높음')
  const queue = (highPriority.length ? highPriority : changes).slice(0, 3)

  if (queue.length === 0) {
    return ['새 승인 대기 항목이 없지만 다음 변경이 들어오면 승인 기준을 함께 잠가야 합니다.']
  }

  return queue.map((change) => `${change.title}: ${change.requestor} 승인/보류 결정 필요`)
}

function buildNeedsConfirmation(
  draft: DraftRecord,
  changes: ChangeRequest[],
  affectedAreas: string[],
  owner?: TeamMember,
) {
  const items: string[] = []

  if (!owner) {
    items.push('담당자가 연결되지 않아 실제 확인 주체를 추가 지정해야 합니다.')
  }

  if (changes.some((change) => change.reason.trim().length < 12)) {
    items.push('변경 이유가 짧아 의도와 승인 조건을 추가 확인해야 합니다.')
  }

  if (!affectedAreas.includes('백엔드 계약')) {
    items.push('API 계약 영향은 원문만으로 확정할 수 없어 추가 확인이 필요합니다.')
  }

  if (!affectedAreas.includes('검증 조건')) {
    items.push('테스트 범위 영향은 QA 또는 개발 리드 확인이 필요합니다.')
  }

  if (!draft.body.includes('승인')) {
    items.push('승인 기준 문구가 부족해 착수 가능 조건을 다시 확인해야 합니다.')
  }

  return items.slice(0, 3)
}

function buildUnresolvedImpact(affectedAreas: string[], needsConfirmation: string[]) {
  const unresolved: string[] = []

  if (!affectedAreas.includes('프론트엔드 화면')) {
    unresolved.push('화면 영향은 미확정 영향으로 남기고 상세 흐름 확인이 필요합니다.')
  }

  if (!affectedAreas.includes('백엔드 계약')) {
    unresolved.push('API 영향은 미확정 영향으로 남기고 엔드포인트 재검토가 필요합니다.')
  }

  if (!affectedAreas.includes('검증 조건')) {
    unresolved.push('테스트 영향은 미확정 영향으로 남기고 수용 기준 보완이 필요합니다.')
  }

  return [...unresolved, ...needsConfirmation].slice(0, 4)
}

function normalizeStringList(value: unknown, fallback: string[]) {
  if (!Array.isArray(value)) return fallback

  const items = value
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim())
    .filter(Boolean)

  return items.length ? items.slice(0, 3) : fallback
}

function normalizeHandoffs(value: unknown, fallback: Handoff[]) {
  if (!Array.isArray(value)) return fallback

  const items = value
    .map((item) => {
      if (!item || typeof item !== 'object') return null
      const owner = typeof item.owner === 'string' ? item.owner.trim() : ''
      const responsibility = typeof item.responsibility === 'string' ? item.responsibility.trim() : ''
      if (!owner || !responsibility) return null
      return { owner, responsibility }
    })
    .filter((item): item is Handoff => Boolean(item))

  return items.length ? items.slice(0, 3) : fallback
}

function normalizeAnalysis(
  partial: Partial<Analysis>,
  draft: DraftRecord,
  changes: ChangeRequest[],
  team: TeamMember[],
  source: AnalysisSource,
  mode: AnalysisMode,
  fallbackReason: FallbackReason,
): Analysis {
  const owner = team.find((member) => member.id === draft.ownerId)
  const affectedAreas = normalizeStringList(
    partial.impact?.affectedAreas,
    extractKeywords(`${draft.title}\n${draft.goal}\n${draft.body}`),
  )
  const baseNeedsConfirmation = buildNeedsConfirmation(draft, changes, affectedAreas, owner)
  const needsConfirmation = normalizeStringList(
    partial.contractBoard?.needsConfirmation,
    baseNeedsConfirmation.length
      ? baseNeedsConfirmation
      : ['현재 입력만으로 확정할 수 없는 항목은 추가 확인 필요로 남깁니다.'],
  )
  const unresolvedImpact = normalizeStringList(
    partial.impact?.unresolvedImpact,
    buildUnresolvedImpact(affectedAreas, needsConfirmation),
  )
  const lockedFallback = [
    '기획 원문, 담당자, 변경 이유를 같은 계약 단위로 묶어 관리합니다.',
    '승인 전 상태와 승인 후 상태를 구분해 착수 조건을 잠급니다.',
    '확정하지 못한 항목은 추가 확인 필요로 남깁니다.',
  ]

  return {
    schemaVersion: '2026-04-20',
    mode,
    source,
    fallbackReason,
    generatedAt: new Date().toLocaleString('ko-KR'),
    plannerView: {
      summary:
        partial.plannerView?.summary?.trim() ||
        `이 초안은 "${draft.goal}"를 중심으로 변경 영향과 승인 조건을 먼저 잠가야 합니다.`,
      deliverables: normalizeStringList(partial.plannerView?.deliverables, [
        '변경 영향 맵과 합의 잠금 보드를 같은 화면에서 보여줍니다.',
        '변경 이유, 담당자, 승인 조건을 하나의 계약 단위로 저장합니다.',
        '확정 불가 항목을 추가 확인 필요로 남깁니다.',
      ]),
      risks: normalizeStringList(partial.plannerView?.risks, [
        '승인 조건이 약하면 개발 착수 기준이 다시 흔들릴 수 있습니다.',
        '변경 이유 근거가 약하면 영향 범위가 과소 또는 과대 해석될 수 있습니다.',
        '확신이 낮은 영향은 추가 확인 필요로 남기지 않으면 오판 위험이 커집니다.',
      ]),
    },
    developerView: {
      summary:
        partial.developerView?.summary?.trim() ||
        `개발자는 ${owner?.name ?? '담당자'} 기준으로 계약 상태, 영향 범위, 테스트 조건을 먼저 확인해야 합니다.`,
      contracts: normalizeStringList(partial.developerView?.contracts, [
        '초안 등록 시 작성자 역할, 담당자, 목표 시점을 함께 저장합니다.',
        '승인 전 상태와 승인 후 상태를 분리해 착수 가능 여부를 판단합니다.',
        '변경 요청마다 이유, 요청자, 긴급도를 남깁니다.',
      ]),
      implementation: normalizeStringList(partial.developerView?.implementation, [
        '같은 원문에서 기획자/개발자 관점을 병렬 생성합니다.',
        `영향 범위는 ${affectedAreas.join(', ')} 축으로 정리합니다.`,
        '미확정 영향은 별도 목록으로 남겨 추가 확인 흐름에 연결합니다.',
      ]),
      tests: normalizeStringList(partial.developerView?.tests, [
        '초안 업로드 후 담당자 연결이 유지되는지 확인합니다.',
        '변경 요청 추가 시 영향 범위와 미확정 영향이 함께 갱신되는지 확인합니다.',
        'AI 실패 또는 키 부재 시 데모 fallback이 유지되는지 확인합니다.',
      ]),
    },
    contractBoard: {
      locked: normalizeStringList(partial.contractBoard?.locked, lockedFallback),
      reopened: normalizeStringList(partial.contractBoard?.reopened, buildReopenedItems(changes)),
      pendingApproval: normalizeStringList(
        partial.contractBoard?.pendingApproval,
        buildPendingApprovalItems(changes),
      ),
      openQuestions: normalizeStringList(partial.contractBoard?.openQuestions, [
        '누가 승인 완료를 잠글지 정해야 합니다.',
        '담당자 변경 이력을 감사 로그에 포함할지 정해야 합니다.',
        '외부 협업툴 연동 범위를 어디까지 열지 정해야 합니다.',
      ]),
      needsConfirmation,
      handoffs: normalizeHandoffs(partial.contractBoard?.handoffs, [
        {
          owner: owner?.name ?? '개발 담당자',
          responsibility: '영향 범위와 구현 비용, 테스트 기준을 검증합니다.',
        },
        {
          owner: '기획 담당',
          responsibility: '변경 이유와 승인 조건 근거를 보완합니다.',
        },
        {
          owner: '승인권자',
          responsibility: '반영 시점과 출시 범위를 최종 결정합니다.',
        },
      ]),
    },
    impact: {
      severity:
        partial.impact?.severity === '낮음' ||
        partial.impact?.severity === '보통' ||
        partial.impact?.severity === '높음'
          ? partial.impact.severity
          : changes.some((item) => item.urgency === '높음')
            ? '높음'
            : '보통',
      affectedAreas,
      unresolvedImpact,
      scheduleNote:
        partial.impact?.scheduleNote?.trim() ||
        (changes.some((item) => item.urgency === '높음')
          ? '높은 긴급도의 변경이 있어 현재 스프린트 범위를 다시 잠가야 합니다.'
          : '현재 변경은 다음 배치 전까지 묶어서 검토할 수 있습니다.'),
      rollbackNote:
        partial.impact?.rollbackNote?.trim() ||
        '승인 전 개발 착수를 막고, 반영 단위를 초안 버전과 연결하면 재작업 폭을 줄일 수 있습니다.',
    },
    decision: {
      recommendation:
        partial.decision?.recommendation?.trim() ||
        (changes.some((item) => item.urgency === '높음')
          ? '승인 규칙을 먼저 잠근 뒤 변경을 분리 반영하세요.'
          : '현재 변경은 계약 문구를 보완한 뒤 다음 구현 단위로 합쳐도 됩니다.'),
      reasons: normalizeStringList(partial.decision?.reasons, [
        '변경 이유와 영향 범위를 함께 남겨야 재작업 판단이 쉬워집니다.',
        '같은 초안을 기획자/개발자 관점으로 병렬 번역하면 오해 비용이 줄어듭니다.',
        '확정할 수 없는 항목을 추가 확인 필요로 남겨야 과도한 자동화를 막을 수 있습니다.',
      ]),
      nextActions: normalizeStringList(partial.decision?.nextActions, [
        '승인 상태 필드를 추가하고 개발 착수 조건을 UI에 표시합니다.',
        '미확정 영향 노드를 영향 맵에 별도 레일로 표시합니다.',
        '실사용 팀 기준 샘플 프로젝트 2개로 검증합니다.',
      ]),
    },
  }
}

async function analyzeDraft({
  requestedMode,
  draft,
  changes,
  team,
}: {
  requestedMode: AnalyzeMode
  draft: DraftRecord
  changes: ChangeRequest[]
  team: TeamMember[]
}) {
  let analysis: Analysis
  let status: AnalyzeMeta['status'] = 'success'

  if (requestedMode === 'demo') {
    analysis = buildHeuristicAnalysis(draft, changes, team, 'forced_demo')
    status = 'fallback'
  } else if (!client) {
    analysis = buildHeuristicAnalysis(draft, changes, team, 'missing_api_key')
    status = 'fallback'
  } else {
    try {
      analysis = await buildAiAnalysis(draft, changes, team)
    } catch (error) {
      const reason: FallbackReason =
        error instanceof SyntaxError ? 'invalid_ai_response' : 'ai_error'
      analysis = buildHeuristicAnalysis(draft, changes, team, reason)
      status = 'fallback'
    }
  }

  const meta: AnalyzeMeta = {
    schemaVersion: '2026-04-20',
    requestedMode,
    resolvedMode: analysis.mode,
    source: analysis.source,
    status,
    aiEnabled: Boolean(client),
    fallbackReason: analysis.fallbackReason,
    needsConfirmationCount: analysis.contractBoard.needsConfirmation.length,
    unresolvedImpactCount: analysis.impact.unresolvedImpact.length,
  }

  return { analysis, meta }
}

function buildHeuristicAnalysis(
  draft: DraftRecord,
  changes: ChangeRequest[],
  team: TeamMember[],
  fallbackReason: FallbackReason,
): Analysis {
  const owner = team.find((member) => member.id === draft.ownerId)
  const latestChange = changes[0]
  const mergedText = `${draft.title}\n${draft.goal}\n${draft.body}\n${changes
    .map((item) => `${item.title} ${item.reason}`)
    .join('\n')}`
  const affectedAreas = extractKeywords(mergedText)
  const highUrgency = changes.some((item) => item.urgency === '높음')
  const needsConfirmation = buildNeedsConfirmation(draft, changes, affectedAreas, owner)

  return normalizeAnalysis(
    {
    plannerView: {
      summary: `이 초안은 "${draft.goal}"를 중심으로 담당자 연결과 승인 흐름을 먼저 잠그려는 문서입니다.`,
      deliverables: [
        '기획 초안 등록 화면과 담당자 지정 규칙',
        '기획자 관점 설명과 개발자 관점 설명을 나란히 보여주는 계약 보드',
        '변경 이유, 영향 범위, 승인 여부를 남기는 결정 로그',
      ],
      risks: [
        '승인 상태가 명확하지 않으면 개발 착수 기준이 다시 흐려질 수 있습니다.',
        '변경 이유가 짧게만 남으면 AI 추천의 신뢰도가 떨어집니다.',
        latestChange
          ? `최근 변경 "${latestChange.title}"는 일정 재조정이 필요한지 별도 판단이 필요합니다.`
          : '최근 변경 요청이 아직 없습니다.',
      ],
    },
    developerView: {
      summary: `개발자는 ${owner?.name ?? '담당자'}를 기준으로 요구사항 계약, 영향 범위, 테스트 기준을 먼저 확인해야 합니다.`,
      contracts: [
        '초안 등록 시 작성자 역할, 담당자, 완료 목표일이 함께 저장되어야 합니다.',
        '승인 전 상태와 승인 후 상태를 구분할 수 있어야 합니다.',
        '변경 요청마다 이유와 요청자, 긴급도가 남아야 합니다.',
      ],
      implementation: [
        '기획자와 개발자 관점 요약은 같은 원본 초안을 기반으로 생성합니다.',
        `영향 범위는 ${affectedAreas.join(', ')} 축으로 요약합니다.`,
        '릴리즈 전에는 변경 요청과 테스트 항목이 같이 보이도록 묶습니다.',
      ],
      tests: [
        '초안 업로드 후 담당자가 정확히 연결되는지 확인합니다.',
        '변경 요청 추가 시 영향 범위와 추천 액션이 같이 갱신되는지 확인합니다.',
        'AI 키가 없을 때도 데모 분석이 정상 동작하는지 확인합니다.',
      ],
    },
    contractBoard: {
      locked: [
        '기획자가 먼저 초안을 올리고 담당자와 연결한다.',
        '양측 관점 번역은 같은 원본을 기준으로 생성한다.',
        '변경 요청에는 이유와 긴급도를 함께 남긴다.',
      ],
      reopened: buildReopenedItems(changes),
      pendingApproval: buildPendingApprovalItems(changes),
      openQuestions: [
        '승인 완료를 누구의 액션으로 잠글지 정해야 합니다.',
        '담당자 변경 이력도 감사 로그에 포함할지 정해야 합니다.',
        '외부 협업툴과 연결할지 자체 워크스페이스로 닫을지 정해야 합니다.',
      ],
      needsConfirmation,
      handoffs: [
        {
          owner: owner?.name ?? '개발 담당자',
          responsibility: '영향 범위와 구현 비용을 검증하고 테스트 기준을 잠근다.',
        },
        {
          owner: '기획 담당',
          responsibility: '변경 이유와 우선순위 근거를 보완한다.',
        },
        {
          owner: '승인권자',
          responsibility: '반영 시점과 출시 범위를 최종 결정한다.',
        },
      ],
    },
    impact: {
      severity: highUrgency ? '높음' : '보통',
      affectedAreas,
      unresolvedImpact: buildUnresolvedImpact(affectedAreas, needsConfirmation),
      scheduleNote: highUrgency
        ? '높은 긴급도의 변경이 있어 현재 스프린트 범위를 다시 잠가야 합니다.'
        : '현재 변경은 다음 배치 전까지 묶어서 검토할 수 있습니다.',
      rollbackNote:
        '승인 전 개발 착수를 막고, 반영 단위를 초안 버전과 연결하면 재작업 폭을 줄일 수 있습니다.',
    },
    decision: {
      recommendation: highUrgency
        ? '승인 규칙을 먼저 잠근 뒤 변경을 분리 반영하세요.'
        : '현재 변경은 계약 문구를 보완한 뒤 다음 구현 단위로 합쳐도 됩니다.',
      reasons: [
        '기획 변경의 이유와 영향 범위를 함께 남겨야 재작업 판단이 쉬워집니다.',
        '같은 초안을 기획자/개발자 관점으로 병렬 번역하면 오해 비용이 줄어듭니다.',
        '담당자 연결이 빠지면 변경 대응이 다시 개인 대화로 흩어집니다.',
      ],
      nextActions: [
        '승인 상태 필드를 추가하고 개발 착수 조건을 UI에 표시합니다.',
        '변경 요청과 릴리즈 단위를 연결하는 정책을 정합니다.',
        '실사용 팀 기준 샘플 프로젝트 2개로 테스트합니다.',
      ],
    },
    },
    draft,
    changes,
    team,
    'heuristic',
    'demo',
    fallbackReason,
  )
}

async function buildAiAnalysis(
  draft: DraftRecord,
  changes: ChangeRequest[],
  team: TeamMember[],
): Promise<Analysis> {
  const response = await client!.responses.create({
    model,
    reasoning: { effort: 'low' },
    instructions:
      '당신은 기획-개발 계약 관리 도우미다. 반드시 JSON만 반환한다. 설명 문장이나 마크다운을 붙이지 않는다.',
    input: [
      {
        role: 'developer',
        content:
          'plannerView, developerView, contractBoard, impact, decision 구조를 가진 JSON을 반환하라. contractBoard에는 locked, reopened, pendingApproval, openQuestions, needsConfirmation, handoffs를 포함하라. impact에는 severity, affectedAreas, unresolvedImpact, scheduleNote, rollbackNote를 포함하라. AI가 확정할 수 없는 정보는 needsConfirmation 또는 unresolvedImpact로만 보내고 확정 문구를 쓰지 마라. 각 배열은 3개 이내로 간결하게 작성하라. severity는 낮음/보통/높음 중 하나만 사용하라.',
      },
      {
        role: 'user',
        content: JSON.stringify({ draft, changes, team }),
      },
    ],
  })

  const raw = response.output_text.trim()
  const parsed = JSON.parse(raw) as Partial<Analysis>

  return normalizeAnalysis(parsed, draft, changes, team, 'openai', 'live', null)
}

app.listen(port, () => {
  console.log(`Relai API listening on http://127.0.0.1:${port}`)
})
