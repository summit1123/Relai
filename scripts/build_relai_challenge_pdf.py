from __future__ import annotations

from pathlib import Path

from PIL import Image
from pypdf import PdfReader, PdfWriter
from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (
    Image as RLImage,
    PageBreak,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)


ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "output" / "pdf"
OUT.mkdir(parents=True, exist_ok=True)

LATEST_FORM = Path(
    "/Users/gimdonghyeon/Downloads/2026 미래혁신 아이디어 챌린지 신청서류(재직자) (1) (1).pdf"
)
PROPOSAL_PDF = OUT / "relai-idea-proposal-5p.pdf"
FINAL_PDF = OUT / "relai-idea-challenge-final.pdf"

FONT_PATH = "/System/Library/Fonts/Supplemental/AppleGothic.ttf"


def register_fonts() -> None:
    pdfmetrics.registerFont(TTFont("AppleSD", FONT_PATH))
    pdfmetrics.registerFont(TTFont("AppleSD-Bold", FONT_PATH))


def p(text: str, style: ParagraphStyle) -> Paragraph:
    text = (
        text.replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace("\n", "<br/>")
    )
    return Paragraph(text, style)


def bullet(text: str, style: ParagraphStyle) -> Paragraph:
    return p(f"- {text}", style)


def image_flow(path: Path, max_w: float, max_h: float) -> RLImage:
    with Image.open(path) as im:
        w, h = im.size
    scale = min(max_w / w, max_h / h)
    return RLImage(str(path), width=w * scale, height=h * scale)


def table(data: list[list[str]], widths: list[float], font_size: float = 7.3) -> Table:
    cell = ParagraphStyle(
        "table-cell",
        fontName="AppleSD",
        fontSize=font_size,
        leading=font_size + 2.3,
        wordWrap="CJK",
        alignment=TA_LEFT,
    )
    head = ParagraphStyle(
        "table-head",
        fontName="AppleSD-Bold",
        fontSize=font_size,
        leading=font_size + 2.3,
        wordWrap="CJK",
        alignment=TA_CENTER,
    )
    rows = []
    for r, row in enumerate(data):
        rows.append([p(str(v), head if r == 0 else cell) for v in row])
    t = Table(rows, colWidths=widths, repeatRows=1)
    t.setStyle(
        TableStyle(
            [
                ("GRID", (0, 0), (-1, -1), 0.45, colors.black),
                ("BACKGROUND", (0, 0), (-1, 0), colors.white),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("LEFTPADDING", (0, 0), (-1, -1), 4),
                ("RIGHTPADDING", (0, 0), (-1, -1), 4),
                ("TOPPADDING", (0, 0), (-1, -1), 3),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
            ]
        )
    )
    return t


def add_footer(canvas, doc) -> None:
    canvas.saveState()
    canvas.setFont("AppleSD", 7)
    canvas.drawRightString(A4[0] - 14 * mm, 9 * mm, f"{doc.page}")
    canvas.restoreState()


def build_proposal() -> None:
    register_fonts()

    doc = SimpleDocTemplate(
        str(PROPOSAL_PDF),
        pagesize=A4,
        rightMargin=15 * mm,
        leftMargin=15 * mm,
        topMargin=14 * mm,
        bottomMargin=13 * mm,
    )

    styles = getSampleStyleSheet()
    title = ParagraphStyle(
        "title",
        parent=styles["Title"],
        fontName="AppleSD-Bold",
        fontSize=15,
        leading=20,
        alignment=TA_CENTER,
        wordWrap="CJK",
        spaceAfter=6,
    )
    subtitle = ParagraphStyle(
        "subtitle",
        fontName="AppleSD",
        fontSize=8,
        leading=10,
        alignment=TA_CENTER,
        wordWrap="CJK",
        spaceAfter=7,
    )
    h = ParagraphStyle(
        "heading",
        fontName="AppleSD-Bold",
        fontSize=11.2,
        leading=14,
        spaceBefore=2,
        spaceAfter=6,
        wordWrap="CJK",
    )
    h2 = ParagraphStyle(
        "subheading",
        fontName="AppleSD-Bold",
        fontSize=9,
        leading=12,
        spaceBefore=2,
        spaceAfter=4,
        wordWrap="CJK",
    )
    body = ParagraphStyle(
        "body",
        fontName="AppleSD",
        fontSize=8.25,
        leading=11.1,
        spaceAfter=5,
        wordWrap="CJK",
    )
    small = ParagraphStyle(
        "small",
        fontName="AppleSD",
        fontSize=7.1,
        leading=9.1,
        spaceAfter=3,
        wordWrap="CJK",
    )
    caption = ParagraphStyle(
        "caption",
        fontName="AppleSD",
        fontSize=7.0,
        leading=8.5,
        alignment=TA_CENTER,
        textColor=colors.black,
        wordWrap="CJK",
        spaceBefore=2,
    )

    img1 = ROOT / "Relai" / "step1.png"
    img2 = ROOT / "Relai" / "step5.png"
    img3 = ROOT / "Relai" / "step6,8.png"
    max_w = A4[0] - 30 * mm

    story = []

    # Page 1
    story += [
        p("「2026 미래혁신 Idea 챌린지」 아이디어 상세 기획서/제안서", title),
        p("팀명: Summit    아이디어 명: RelAi", subtitle),
        p("1. 아이디어 개발 배경 및 필요성", h),
        p("1-1. 현업에서 반복되는 요구사항 변경 문제", h2),
        p(
            "저는 AI 소프트웨어 개발자로 일하며 기획, 개발, 품질 검수 사이에서 반복되는 요구사항 변경 문제를 직접 경험했습니다. 기획 초안이 나오면 개발을 시작하지만, 개발 중간에 기획이 수정되고, 품질팀의 검수 과정에서 다시 예외 케이스와 수정 요청이 발생합니다. 이때 어려운 점은 단순히 변경이 많다는 것이 아니라, 무엇이 확정되었고 무엇이 다시 논의되어야 하며 어떤 개발 범위가 영향을 받는지 빠르게 파악하기 어렵다는 점입니다.",
            body,
        ),
        p(
            "이 문제는 특정 직군의 역량 부족으로 보기 어렵습니다. 기획, 개발, 품질 담당자는 각자의 책임과 관점에서 더 나은 결과를 만들기 위해 의견을 냅니다. 그러나 변경의 이유, 결정 근거, 영향 범위가 문서, 메신저, 회의록에 흩어져 있으면 같은 내용을 다시 확인하고 조율하는 비용이 반복됩니다.",
            body,
        ),
        p(
            "현재 많은 조직은 Mantis, Jira 같은 이슈 관리 도구와 Confluence, Notion 같은 문서 도구를 함께 사용합니다. 이러한 도구들은 이슈를 등록하고 문서를 축적하는 데는 효과적입니다. 그러나 변경 요청이 들어왔을 때 그 변경이 기존 합의와 충돌하는지, 어떤 직군이 어떤 방식으로 다시 이해해야 하는지, 화면·API·테스트·일정에 어떤 영향을 주는지를 자동으로 구조화해주지는 못합니다.",
            body,
        ),
        p(
            "예를 들어 Mantis에는 결함이나 요청 사항이 남고, Confluence에는 회의록과 요구사항 문서가 남을 수 있습니다. 그러나 두 도구에 흩어진 정보를 바탕으로 이번 변경이 기존 결정 중 무엇을 다시 여는지, 개발자에게 어떤 구현 조건으로 전달되어야 하는지, 품질팀은 어떤 테스트 범위를 다시 봐야 하는지, 승인권자는 무엇을 결정해야 하는지를 연결하는 작업은 여전히 사람이 수행해야 합니다.",
            body,
        ),
        p(
            "따라서 현업에서 필요한 것은 문서나 이슈를 더 많이 남기는 도구가 아니라, 흩어진 논의와 변경 요청을 팀이 실행할 수 있는 합의 구조로 다시 정렬하는 시스템입니다.",
            body,
        ),
        Spacer(1, 4),
        p("RelAi가 해결하려는 핵심 병목", h2),
        table(
            [
                ["현업 상황", "반복되는 문제", "필요한 변화"],
                ["기획 변경", "변경 근거와 결정 이력이 흩어짐", "기존 합의와 충돌 여부 확인"],
                ["개발 중 수정", "화면·API·테스트 영향 범위 확인 지연", "변경 영향 맵 제공"],
                ["품질 검수", "예외 케이스가 뒤늦게 반영됨", "품질 관점을 개발·기획 언어로 변환"],
                ["승인 단계", "누가 무엇을 결정해야 하는지 불명확", "승인 필요 항목과 보류 리스크 구조화"],
            ],
            [37 * mm, 65 * mm, 58 * mm],
        ),
        PageBreak(),
    ]

    # Page 2
    story += [
        p("1. 아이디어 개발 배경 및 필요성", h),
        p("1-2. AI 시대에 더 커지는 협업 간극", h2),
        p(
            "최근 생성형 AI의 확산으로 개인의 업무 속도는 더욱 빨라지고 있습니다. 기획자는 AI로 사용자 시나리오와 정책 문구를 빠르게 만들고, 개발자는 AI로 코드와 구현 방식을 설계하며, 품질 담당자는 AI로 테스트 케이스와 예외 상황을 확장합니다. 그러나 각자가 AI를 사용하는 목적과 방식이 다르기 때문에 같은 요구사항도 서로 다른 방향으로 빠르게 해석될 수 있습니다.",
            body,
        ),
        p(
            "즉, AI 도입의 문제는 더 이상 AI를 쓰느냐 쓰지 않느냐에만 있지 않습니다. 개인 단위의 AI 활용은 늘어나고 있지만, 그 결과물을 팀 단위의 합의 구조로 다시 정렬하는 방식은 여전히 기존의 문서, 메신저, 회의 중심에 머물러 있습니다.",
            body,
        ),
        table(
            [
                ["근거", "수치", "RelAi 관점의 의미"],
                ["Microsoft Work Trend Index 2024", "지식근로자 75% AI 사용, AI 사용자 78% BYOAI", "개인 단위 AI 활용은 빠르게 확산 중"],
                ["Gallup 2025", "업무상 AI 사용 2023년 21% -> 2025년 40%", "조직 내 AI 사용이 빠르게 증가"],
                ["Atlassian DevEx 2025", "개발자 68%는 AI로 주 10시간 이상 절약, 50%는 조직 비효율로 주 10시간 이상 손실", "개인 생산성과 협업 병목 사이의 간극 존재"],
                ["Atlassian/Loom 2026", "근로자 80%가 메시지 오해로 재작업 경험", "의사소통 오류가 실제 재작업으로 연결"],
                ["PMI 2021", "요구사항 수집 부실 40%, 목표 변경 38%, 커뮤니케이션 부실 28%", "요구사항·변경·소통 문제가 프로젝트 실패와 연결"],
            ],
            [45 * mm, 58 * mm, 57 * mm],
            font_size=6.8,
        ),
        Spacer(1, 6),
        p(
            "따라서 진정한 AX는 개인이 AI를 잘 쓰는 것에서 끝나지 않습니다. 조직 안에서 각자가 AI로 만든 산출물과 판단이 빠르게 공유되고, 서로 다른 직군의 언어로 변환되며, 변경의 영향이 명확히 전달되어야 합니다. RelAi는 요구사항 변경과 팀 논의 기록을 AI가 하나의 프로젝트 맥락으로 정리하고, 기획-개발-품질-승인자가 같은 변경을 같은 기준으로 이해하도록 돕는 AI 업무혁신 시스템입니다.",
            body,
        ),
        image_flow(img1, max_w, 176),
        p("그림 1. AI 활용 확산과 요구사항 변경·커뮤니케이션 문제를 함께 보여주는 RelAi 첫 화면", caption),
        PageBreak(),
    ]

    # Page 3
    story += [
        p("2. 아이디어의 혁신성 및 차별성", h),
        p(
            "RelAi는 요구사항 문서, 팀 채팅, 회의 기록, AI 산출물을 하나의 프로젝트 메모리로 통합하고 이를 결정·질문·승인·영향·액션 단위로 구조화합니다.",
            body,
        ),
        p(
            "가장 큰 차별점은 직군 간 언어 변환입니다. 기획자의 요구사항은 개발자가 판단할 수 있는 구현 범위, API 영향, 예외 처리, 테스트 조건으로 변환됩니다. 반대로 개발자의 기술 제약과 리스크는 기획자와 승인권자가 이해할 수 있는 사용자 영향, 일정 영향, 정책 선택지, 승인 필요 항목으로 변환됩니다. 품질 담당자의 테스트 관점은 사용자 리스크와 회귀 테스트 범위로 정리됩니다.",
            body,
        ),
        table(
            [
                ["입력한 사람", "AI가 변환해주는 대상", "변환 결과"],
                ["기획자", "개발자", "구현 범위, API 영향, 예외 처리, 테스트 조건"],
                ["개발자", "기획자/승인권자", "기술 제약, 일정 영향, 사용자 영향, 정책 선택지"],
                ["품질 담당자", "기획자/개발자", "결함 가능성, 사용자 리스크, 회귀 테스트 범위"],
                ["승인권자", "실무자", "우선순위, 승인 조건, 보류 시 리스크"],
            ],
            [32 * mm, 48 * mm, 80 * mm],
            font_size=7.1,
        ),
        Spacer(1, 5),
        p(
            "또한 RelAi는 변경 영향 맵을 제공합니다. 요구사항 변경은 단순한 문장 수정으로 끝나지 않고 화면, API, 데이터, 테스트, 일정, 담당자, 승인권자에게 연쇄적으로 영향을 줄 수 있습니다. RelAi는 이 영향을 시각화하여 재작업 범위와 필요한 의사결정을 빠르게 파악하게 합니다.",
            body,
        ),
        p(
            "RelAi는 기존 협업 도구를 대체하기보다, 그 위에 올라가는 AI 정렬 레이어로 작동합니다. Mantis, Confluence, Jira, Notion, Slack, Teams 등에 흩어진 요구사항, 이슈, 회의 기록, 채팅을 AI가 하나의 프로젝트 맥락으로 연결하고, 이를 결정·질문·승인·영향·액션 단위로 재구성합니다. 기존 도구가 정보를 저장한다면 RelAi는 그 정보가 어떤 합의 상태이고 어디까지 영향을 주는지를 해석합니다.",
            body,
        ),
        image_flow(img2, max_w, 165),
        p("그림 2. 변경 요청이 화면, API, 데이터, 테스트, 일정, 담당자, 승인권자로 확산되는 구조", caption),
        PageBreak(),
    ]

    # Page 4
    story += [
        p("3. 기술 구현 방안 및 실현 가능성", h),
        p(
            "RelAi는 현재 실제 업무 환경에서 활용하며 검증하기 위해 웹 기반 MVP로 개발 중이며, 주요 기능은 완성 단계에 가깝습니다. 사용자는 요구사항 초안, 변경 요청, 품질 피드백, 회의 기록을 프로젝트 단위로 등록할 수 있고, AI는 입력 내용을 결정, 질문, 승인, 영향, 액션으로 분류합니다.",
            body,
        ),
        p(
            "기획 관점에서는 사용자 가치와 정책 의도를, 개발 관점에서는 구현 범위와 API 영향을, 품질 관점에서는 테스트 시나리오와 예외 케이스를 중심으로 정리합니다. 이후 변경 영향 맵을 생성해 화면, API, 데이터, 테스트, 일정, 담당자, 승인권자에게 미치는 영향을 보여줍니다.",
            body,
        ),
        p(
            "프로젝트 메모리는 RelAi의 핵심 구조입니다. 회의 기록, 채팅, 기술 제약, 승인 이력은 메모리 카드로 저장됩니다. 새로운 변경 요청이 들어오면 AI는 현재 입력뿐 아니라 이전 메모리를 함께 참고하여 과거 합의와 충돌하는지 판단합니다.",
            body,
        ),
        p(
            "회의 오케스트레이션 기능은 채팅과 보드의 상태를 기반으로 동작합니다. AI가 충돌 신호, 미결정 승인 항목, 반복되는 질문, 일정 영향이 큰 변경을 감지하면 회의 개설을 제안합니다. 이때 회의 제목, 참석 대상, 핵심 안건, 사전 확인 자료, 결정해야 할 항목을 자동으로 정리합니다.",
            body,
        ),
        table(
            [
                ["구성 요소", "구현 내용"],
                ["입력 관리", "요구사항 문서, 변경 요청, 채팅, 회의록 업로드"],
                ["AI 분석 엔진", "결정·질문·승인·영향·액션 분류 및 역할별 관점 변환"],
                ["프로젝트 메모리", "회의 결과, 기술 제약, 승인 이력, 반복 쟁점 저장 및 검색"],
                ["변경 영향 맵", "화면, API, 데이터, 테스트, 일정, 담당자 영향 시각화"],
                ["합의 잠금 보드", "확정 항목, 열린 질문, 승인 필요, 착수 조건 관리"],
                ["회의 오케스트레이션", "회의 필요성 판단, 안건 생성, 회의 결과 재구조화"],
            ],
            [40 * mm, 120 * mm],
            font_size=7.0,
        ),
        Spacer(1, 5),
        image_flow(img3, max_w, 147),
        p("그림 3. 프로젝트 메모리와 AI 회의 개설 흐름", caption),
        PageBreak(),
    ]

    # Page 5
    story += [
        p("4. 사회적/경제적 파급 효과", h),
        p(
            "RelAi가 해결하려는 문제는 개발 직군에만 한정되지 않습니다. 마케팅, 디자인, 운영, 영업, 고객지원 등 대부분의 조직 업무에서도 요청이 바뀌고, 해석이 달라지고, 승인과 품질 확인 과정에서 재조율이 발생합니다. AI 도구가 각 개인의 업무 속도를 높일수록, 조직 간 의사소통과 합의 구조도 함께 빨라져야 합니다.",
            body,
        ),
        p(
            "진정한 AX는 개인이 AI를 잘 쓰는 것에서 끝나지 않습니다. 조직 안에서 각자가 AI로 만든 산출물과 판단이 빠르게 공유되고, 서로 다른 직군의 언어로 변환되며, 변경의 영향이 명확히 전달되어야 합니다. RelAi는 이러한 조직 단위 AX를 가능하게 하는 협업 운영 레이어입니다.",
            body,
        ),
        p(
            "RelAi를 활용하면 변경 요청이 들어왔을 때 영향 범위를 빠르게 확인하고, 기존 결정과 충돌하는 항목을 조기에 발견할 수 있습니다. 승인권자는 변경 요약, 영향 범위, 보류 시 리스크, 지금 결정해야 할 항목을 한눈에 확인할 수 있습니다. 회의가 필요한 경우에는 AI가 안건 중심으로 회의를 제안하고, 회의 후 결정과 액션을 다시 프로젝트 메모리에 반영합니다.",
            body,
        ),
        table(
            [
                ["기대효과", "내용"],
                ["변경 검토 시간 단축", "변경 요청의 영향 범위를 빠르게 구조화"],
                ["재작업 감소", "기존 결정과 충돌하는 항목을 조기에 발견"],
                ["승인 지연 감소", "승인권자가 판단할 항목과 리스크를 명확히 확인"],
                ["회의 효율 개선", "필요한 회의만 안건 중심으로 제안"],
                ["조직 지식 축적", "정책, 기술 제약, 품질 기준을 프로젝트 메모리로 보존"],
            ],
            [45 * mm, 115 * mm],
            font_size=7.1,
        ),
        Spacer(1, 5),
        p(
            "사업화는 팀 단위 SaaS 구독 모델을 우선 고려할 수 있습니다. 초기 고객은 제품팀, 개발팀, PM 조직, SI/외주 개발 조직, 사내 디지털 전환 조직이며, 이후에는 마케팅, 운영, 고객지원, 전략기획 등 여러 부서로 확장할 수 있습니다.",
            body,
        ),
        table(
            [
                ["수익 모델", "대상", "내용"],
                ["팀 단위 구독", "제품팀/개발팀", "프로젝트별 협업 공간 제공"],
                ["프로젝트 과금", "외주/고객사 협업", "변경 관리와 의사결정 기록 제공"],
                ["엔터프라이즈", "중견·대기업", "보안, 권한, 내부 시스템 연동 제공"],
            ],
            [34 * mm, 44 * mm, 82 * mm],
            font_size=7.1,
        ),
        Spacer(1, 5),
        p(
            "RelAi는 AI로 더 많은 문서를 만드는 도구가 아니라, AI 시대에 더 빠르게 발생하는 변경과 해석 차이를 팀 단위의 합의 구조로 바꾸는 업무혁신 시스템입니다. 개인의 AI 활용을 넘어 조직의 의사소통 속도를 AI 흐름에 맞게 높이는 것이 RelAi의 목표입니다.",
            body,
        ),
        Spacer(1, 5),
        p(
            "참고자료: Microsoft Work Trend Index 2024, Gallup 2025, Atlassian State of Developer Experience 2025, Atlassian/Loom 2026, PMI Pulse of the Profession 2021.",
            small,
        ),
    ]

    doc.build(story, onFirstPage=add_footer, onLaterPages=add_footer)


def merge_final() -> None:
    reader = PdfReader(str(LATEST_FORM))
    proposal = PdfReader(str(PROPOSAL_PDF))
    writer = PdfWriter()

    # Keep latest filled participant application page.
    writer.add_page(reader.pages[0])
    # Replace the half-filled proposal section with freshly generated 5 pages.
    for page in proposal.pages:
        writer.add_page(page)
    # Keep pledge and privacy pages from the latest form.
    for i in range(7, len(reader.pages)):
        writer.add_page(reader.pages[i])

    with FINAL_PDF.open("wb") as f:
        writer.write(f)


if __name__ == "__main__":
    build_proposal()
    merge_final()
    print(PROPOSAL_PDF)
    print(FINAL_PDF)
