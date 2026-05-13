from __future__ import annotations

import subprocess
from pathlib import Path

from PIL import Image
from pypdf import PdfReader, PdfWriter
from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas
from reportlab.platypus import Frame, Image as RLImage, Paragraph, Spacer, Table, TableStyle


ROOT = Path(__file__).resolve().parents[1]
TMP = ROOT / "tmp" / "pdfs" / "latest-form-bg-200"
OUT = ROOT / "output" / "pdf"
TMP.mkdir(parents=True, exist_ok=True)
OUT.mkdir(parents=True, exist_ok=True)

LATEST_FORM = Path(
    "/Users/gimdonghyeon/Downloads/2026 미래혁신 아이디어 챌린지 신청서류(재직자) (1) (1).pdf"
)
PROPOSAL_ONLY = OUT / "relai-idea-proposal-on-form-5p.pdf"
FINAL_PDF = OUT / "relai-idea-challenge-final-on-form.pdf"
FONT_PATH = "/System/Library/Fonts/Supplemental/AppleGothic.ttf"


def register_fonts() -> None:
    pdfmetrics.registerFont(TTFont("KR", FONT_PATH))
    pdfmetrics.registerFont(TTFont("KR-Bold", FONT_PATH))


def render_backgrounds() -> dict[int, Path]:
    # Render latest form pages used as exact backgrounds: detailed proposal pages 2, 3, 5, 6.
    existing = {
        2: TMP / "page-02.png",
        3: TMP / "page-03.png",
        5: TMP / "page-05.png",
        6: TMP / "page-06.png",
    }
    if all(p.exists() for p in existing.values()):
        return existing
    for p in TMP.glob("*.png"):
        p.unlink()
    subprocess.run(
        [
            "pdftoppm",
            "-png",
            "-r",
            "200",
            "-f",
            "2",
            "-l",
            "6",
            str(LATEST_FORM),
            str(TMP / "page"),
        ],
        check=True,
    )
    # pdftoppm numbers by real page number.
    return existing


def para(text: str, style: ParagraphStyle) -> Paragraph:
    return Paragraph(
        text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;"),
        style,
    )


def image_flow(path: Path, max_w: float, max_h: float) -> RLImage:
    with Image.open(path) as im:
        w, h = im.size
    scale = min(max_w / w, max_h / h)
    return RLImage(str(path), width=w * scale, height=h * scale)


def make_table(data: list[list[str]], widths: list[float], font_size: float = 6.6) -> Table:
    cell = ParagraphStyle("tc", fontName="KR", fontSize=font_size, leading=font_size + 2, wordWrap="CJK")
    head = ParagraphStyle(
        "th",
        fontName="KR-Bold",
        fontSize=font_size,
        leading=font_size + 2,
        wordWrap="CJK",
        alignment=TA_CENTER,
    )
    rows = [[para(v, head if i == 0 else cell) for v in row] for i, row in enumerate(data)]
    t = Table(rows, colWidths=widths, repeatRows=1)
    t.setStyle(
        TableStyle(
            [
                ("GRID", (0, 0), (-1, -1), 0.35, colors.black),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("LEFTPADDING", (0, 0), (-1, -1), 3),
                ("RIGHTPADDING", (0, 0), (-1, -1), 3),
                ("TOPPADDING", (0, 0), (-1, -1), 2.2),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 2.2),
            ]
        )
    )
    return t


def add_story(c: canvas.Canvas, story: list, *, x=63, y=74, w=470, h=650) -> None:
    copy = list(story)
    frame = Frame(x, y, w, h, leftPadding=0, rightPadding=0, topPadding=0, bottomPadding=0)
    frame.addFromList(copy, c)
    if copy:
        raise RuntimeError(f"Story overflow: {len(copy)} flowables remain")


def draw_page(
    c: canvas.Canvas,
    bg: Path,
    story: list,
    *,
    clear: list[tuple[float, float, float, float]],
    heading: str | None = None,
    frame: tuple[float, float, float, float] = (63, 74, 470, 650),
) -> None:
    c.drawImage(str(bg), 0, 0, width=A4[0], height=A4[1])
    c.setFillColor(colors.white)
    for x, y, w, h in clear:
        c.rect(x, y, w, h, stroke=0, fill=1)
    if heading:
        c.setFillColor(colors.white)
        c.rect(58, 752, 255, 35, stroke=0, fill=1)
        c.rect(308, 752, 230, 35, stroke=0, fill=1)
        c.setStrokeColor(colors.black)
        c.setLineWidth(0.8)
        c.rect(58, 755, 250, 28, stroke=1, fill=0)
        c.line(308, 755, 538, 755)
        c.setFillColor(colors.black)
        c.setFont("KR-Bold", 12)
        c.drawString(72, 764, heading)
    add_story(c, story, x=frame[0], y=frame[1], w=frame[2], h=frame[3])
    c.showPage()


def build_proposal() -> None:
    register_fonts()
    bgs = render_backgrounds()
    c = canvas.Canvas(str(PROPOSAL_ONLY), pagesize=A4)

    body = ParagraphStyle("body", fontName="KR", fontSize=7.4, leading=9.9, wordWrap="CJK", spaceAfter=4)
    small = ParagraphStyle("small", fontName="KR", fontSize=6.6, leading=8.3, wordWrap="CJK", spaceAfter=3)
    sub = ParagraphStyle("sub", fontName="KR-Bold", fontSize=8.5, leading=11, wordWrap="CJK", spaceAfter=4)
    cap = ParagraphStyle("cap", fontName="KR", fontSize=6.4, leading=8, alignment=TA_CENTER, wordWrap="CJK")
    img1 = ROOT / "Relai" / "step1.png"
    img2 = ROOT / "Relai" / "step5.png"
    img3 = ROOT / "Relai" / "step6,8.png"

    draw_page(
        c,
        bgs[2],
        [
            para("1-1. 현업에서 반복되는 요구사항 변경 문제", sub),
            para(
                "저는 AI 소프트웨어 개발자로 일하며 기획, 개발, 품질 검수 사이에서 반복되는 요구사항 변경 문제를 직접 경험했습니다. 기획 초안이 나오면 개발을 시작하지만, 개발 중간에 기획이 수정되고, 품질팀의 검수 과정에서 다시 예외 케이스와 수정 요청이 발생합니다. 이때 어려운 점은 단순히 변경이 많다는 것이 아니라, 무엇이 확정되었고 무엇이 다시 논의되어야 하며 어떤 개발 범위가 영향을 받는지 빠르게 파악하기 어렵다는 점입니다.",
                body,
            ),
            para(
                "이 문제는 특정 직군의 역량 부족으로 보기 어렵습니다. 기획, 개발, 품질 담당자는 각자의 책임과 관점에서 더 나은 결과를 만들기 위해 의견을 냅니다. 그러나 변경의 이유, 결정 근거, 영향 범위가 문서, 메신저, 회의록에 흩어져 있으면 같은 내용을 다시 확인하고 조율하는 비용이 반복됩니다.",
                body,
            ),
            para(
                "현재 많은 조직은 Mantis, Jira 같은 이슈 관리 도구와 Confluence, Notion 같은 문서 도구를 함께 사용합니다. 이러한 도구들은 이슈를 등록하고 문서를 축적하는 데는 효과적입니다. 그러나 변경 요청이 들어왔을 때 그 변경이 기존 합의와 충돌하는지, 어떤 직군이 어떤 방식으로 다시 이해해야 하는지, 화면·API·테스트·일정에 어떤 영향을 주는지를 자동으로 구조화해주지는 못합니다.",
                body,
            ),
            para(
                "따라서 현업에서 필요한 것은 문서나 이슈를 더 많이 남기는 도구가 아니라, 흩어진 논의와 변경 요청을 팀이 실행할 수 있는 합의 구조로 다시 정렬하는 시스템입니다.",
                body,
            ),
            make_table(
                [
                    ["현업 상황", "반복되는 문제", "필요한 변화"],
                    ["기획 변경", "변경 근거와 결정 이력이 흩어짐", "기존 합의와 충돌 여부 확인"],
                    ["개발 중 수정", "화면·API·테스트 영향 범위 확인 지연", "변경 영향 맵 제공"],
                    ["품질 검수", "예외 케이스가 뒤늦게 반영됨", "품질 관점을 개발·기획 언어로 변환"],
                    ["승인 단계", "누가 무엇을 결정해야 하는지 불명확", "승인 필요 항목과 보류 리스크 구조화"],
                ],
                [36 * mm, 63 * mm, 60 * mm],
            ),
        ],
        clear=[(58, 72, 480, 565)],
        frame=(63, 83, 470, 525),
    )

    draw_page(
        c,
        bgs[3],
        [
            para("1-2. AI 시대에 더 커지는 협업 간극", sub),
            para(
                "최근 생성형 AI의 확산으로 개인의 업무 속도는 더욱 빨라지고 있습니다. 기획자는 AI로 사용자 시나리오와 정책 문구를 빠르게 만들고, 개발자는 AI로 코드와 구현 방식을 설계하며, 품질 담당자는 AI로 테스트 케이스와 예외 상황을 확장합니다. 그러나 각자가 AI를 사용하는 목적과 방식이 다르기 때문에 같은 요구사항도 서로 다른 방향으로 빠르게 해석될 수 있습니다.",
                body,
            ),
            para(
                "개인 단위의 AI 활용은 늘어나고 있지만, 그 결과물을 팀 단위의 합의 구조로 다시 정렬하는 방식은 여전히 기존 문서, 메신저, 회의 중심에 머물러 있습니다.",
                body,
            ),
            make_table(
                [
                    ["근거", "수치", "의미"],
                    ["Microsoft 2024", "지식근로자 75% AI 사용, 사용자 78% BYOAI", "개인 AI 활용 확산"],
                    ["Atlassian 2025", "개발자 68%는 AI로 시간 절약, 50%는 협업 비효율로 시간 손실", "개인 생산성과 협업 병목의 간극"],
                    ["Atlassian/Loom 2026", "근로자 80%가 메시지 오해로 재작업 경험", "소통 오류가 재작업으로 연결"],
                    ["PMI 2021", "요구사항 수집 부실 40%, 목표 변경 38%, 커뮤니케이션 부실 28%", "요구사항·변경·소통 문제가 실패와 연결"],
                ],
                [38 * mm, 68 * mm, 53 * mm],
                6.25,
            ),
            Spacer(1, 4),
            para(
                "진정한 AX는 개인이 AI를 잘 쓰는 것에서 끝나지 않습니다. 조직 안에서 각자가 AI로 만든 산출물과 판단이 빠르게 공유되고, 서로 다른 직군의 언어로 변환되며, 변경의 영향이 명확히 전달되어야 합니다.",
                body,
            ),
            image_flow(img1, 142 * mm, 47 * mm),
            para("그림 1. AI 활용 확산과 요구사항 변경·커뮤니케이션 문제를 함께 보여주는 RelAi 화면", cap),
        ],
        clear=[(58, 72, 480, 680)],
        heading="1. 아이디어 개발 배경 및 필요성",
        frame=(63, 86, 470, 625),
    )

    draw_page(
        c,
        bgs[5],
        [
            para(
                "RelAi는 요구사항 문서, 팀 채팅, 회의 기록, AI 산출물을 하나의 프로젝트 메모리로 통합하고 이를 결정·질문·승인·영향·액션 단위로 구조화합니다.",
                body,
            ),
            para(
                "현업에서는 이미 Mantis와 Confluence 같은 도구를 사용하고 있습니다. 다만 이 도구들은 이슈와 문서를 남기는 데 강하고, 변경 요청이 들어왔을 때 그 변경을 누가 어떤 관점에서 다시 이해해야 하는지까지 정리해주지는 못합니다.",
                body,
            ),
            make_table(
                [
                    ["현업 도구", "실제 한계", "RelAi의 차별점"],
                    ["Mantis", "이슈는 남지만 변경 이유와 영향 범위가 역할별 실행 항목으로 풀리지 않음", "변경 요청을 화면, API, 테스트, 일정, 담당자 영향으로 분해"],
                    ["Confluence", "문서는 남지만 회의·채팅·이슈의 맥락이 다음 판단에 자동 반영되지 않음", "문서와 대화를 프로젝트 메모리로 연결해 다음 변경 분석에 재사용"],
                    ["회의/메신저", "합의가 대화 속에 흩어져 승인 필요 항목과 열린 질문이 늦게 드러남", "충돌을 감지하고 회의 안건, 결정, 액션으로 구조화"],
                ],
                [32 * mm, 44 * mm, 83 * mm],
                6.4,
            ),
            Spacer(1, 4),
            para(
                "즉 차별성은 도구를 하나 더 늘리는 것이 아니라, 이미 남아 있는 문서와 이슈를 AI가 읽고 기획자·개발자·품질 담당자·승인권자의 언어로 다시 정렬한다는 점입니다.",
                body,
            ),
            image_flow(img2, 142 * mm, 45 * mm),
            para("그림 2. 변경 요청이 화면, API, 데이터, 테스트, 일정, 담당자, 승인권자로 확산되는 구조", cap),
        ],
        clear=[(58, 72, 480, 680)],
        frame=(63, 87, 470, 635),
    )

    draw_page(
        c,
        bgs[6],
        [
            para(
                "RelAi는 현재 실제 업무 환경에서 활용하며 검증하기 위해 웹 기반 MVP로 개발 중이며, 주요 기능은 완성 단계에 가깝습니다. 사용자는 요구사항 초안, 변경 요청, 품질 피드백, 회의 기록을 프로젝트 단위로 등록할 수 있고, AI는 입력 내용을 결정, 질문, 승인, 영향, 액션으로 분류합니다.",
                body,
            ),
            para(
                "기획 관점에서는 사용자 가치와 정책 의도를, 개발 관점에서는 구현 범위와 API 영향을, 품질 관점에서는 테스트 시나리오와 예외 케이스를 중심으로 정리합니다. 이후 변경 영향 맵을 생성해 화면, API, 데이터, 테스트, 일정, 담당자, 승인권자에게 미치는 영향을 보여줍니다.",
                body,
            ),
            para(
                "프로젝트 메모리는 RelAi의 핵심 구조입니다. 회의 기록, 채팅, 기술 제약, 승인 이력은 메모리 카드로 저장됩니다. 새로운 변경 요청이 들어오면 AI는 현재 입력뿐 아니라 이전 메모리를 함께 참고하여 과거 합의와 충돌하는지 판단합니다.",
                body,
            ),
            make_table(
                [
                    ["구성 요소", "구현 내용"],
                    ["입력 관리", "요구사항 문서, 변경 요청, 채팅, 회의록 업로드"],
                    ["AI 분석 엔진", "결정·질문·승인·영향·액션 분류 및 역할별 관점 변환"],
                    ["프로젝트 메모리", "회의 결과, 기술 제약, 승인 이력, 반복 쟁점 저장 및 검색"],
                    ["변경 영향 맵", "화면, API, 데이터, 테스트, 일정, 담당자 영향 시각화"],
                    ["회의 오케스트레이션", "회의 필요성 판단, 안건 생성, 회의 결과 재구조화"],
                ],
                [37 * mm, 122 * mm],
                6.5,
            ),
            Spacer(1, 4),
            image_flow(img3, 142 * mm, 47 * mm),
            para("그림 3. 프로젝트 메모리와 AI 회의 개설 흐름", cap),
        ],
        clear=[(58, 72, 480, 680)],
        frame=(63, 87, 470, 635),
    )

    draw_page(
        c,
        bgs[6],
        [
            para(
                "RelAi가 해결하려는 문제는 개발 직군에만 한정되지 않습니다. 마케팅, 디자인, 운영, 영업, 고객지원 등 대부분의 조직 업무에서도 요청이 바뀌고, 해석이 달라지고, 승인과 품질 확인 과정에서 재조율이 발생합니다. AI 도구가 각 개인의 업무 속도를 높일수록, 조직 간 의사소통과 합의 구조도 함께 빨라져야 합니다.",
                body,
            ),
            para(
                "진정한 AX는 개인이 AI를 잘 쓰는 것에서 끝나지 않습니다. 조직 안에서 각자가 AI로 만든 산출물과 판단이 빠르게 공유되고, 서로 다른 직군의 언어로 변환되며, 변경의 영향이 명확히 전달되어야 합니다. RelAi는 이러한 조직 단위 AX를 가능하게 하는 협업 운영 레이어입니다.",
                body,
            ),
            make_table(
                [
                    ["기대효과", "내용"],
                    ["변경 검토 시간 단축", "변경 요청의 영향 범위를 빠르게 구조화"],
                    ["재작업 감소", "기존 결정과 충돌하는 항목을 조기에 발견"],
                    ["승인 지연 감소", "승인권자가 판단할 항목과 리스크를 명확히 확인"],
                    ["조직 지식 축적", "정책, 기술 제약, 품질 기준을 프로젝트 메모리로 보존"],
                ],
                [42 * mm, 117 * mm],
                6.7,
            ),
            Spacer(1, 5),
            para(
                "사업화는 팀 단위 SaaS 구독 모델을 우선 고려할 수 있습니다. 초기 고객은 제품팀, 개발팀, PM 조직, SI/외주 개발 조직, 사내 디지털 전환 조직이며, 이후에는 마케팅, 운영, 고객지원, 전략기획 등 여러 부서로 확장할 수 있습니다.",
                body,
            ),
            make_table(
                [
                    ["수익 모델", "대상", "내용"],
                    ["팀 단위 구독", "제품팀/개발팀", "프로젝트별 협업 공간 제공"],
                    ["프로젝트 과금", "외주/고객사 협업", "변경 관리와 의사결정 기록 제공"],
                    ["엔터프라이즈", "중견·대기업", "보안, 권한, 내부 시스템 연동 제공"],
                ],
                [32 * mm, 45 * mm, 82 * mm],
                6.7,
            ),
            Spacer(1, 5),
            para(
                "RelAi는 AI로 더 많은 문서를 만드는 도구가 아니라, AI 시대에 더 빠르게 발생하는 변경과 해석 차이를 팀 단위의 합의 구조로 바꾸는 업무혁신 시스템입니다. 개인의 AI 활용을 넘어 조직의 의사소통 속도를 AI 흐름에 맞게 높이는 것이 RelAi의 목표입니다.",
                body,
            ),
            para("참고자료: Microsoft Work Trend Index 2024, Gallup 2025, Atlassian 2025, Atlassian/Loom 2026, PMI 2021.", small),
        ],
        clear=[(58, 72, 480, 680)],
        heading="4. 사회적/경제적 파급 효과",
        frame=(63, 87, 470, 635),
    )

    c.save()


def merge_final() -> None:
    reader = PdfReader(str(LATEST_FORM))
    proposal = PdfReader(str(PROPOSAL_ONLY))
    writer = PdfWriter()
    writer.add_page(reader.pages[0])
    for page in proposal.pages:
        writer.add_page(page)
    for idx in range(7, len(reader.pages)):
        writer.add_page(reader.pages[idx])
    with FINAL_PDF.open("wb") as f:
        writer.write(f)


if __name__ == "__main__":
    build_proposal()
    merge_final()
    print(PROPOSAL_ONLY)
    print(FINAL_PDF)
