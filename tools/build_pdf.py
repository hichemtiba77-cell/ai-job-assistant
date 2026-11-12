from __future__ import annotations

import html
import re
from pathlib import Path
from urllib.parse import unquote

from PIL import Image as PILImage
from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_JUSTIFY, TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (
    BaseDocTemplate,
    CondPageBreak,
    Frame,
    HRFlowable,
    Image,
    KeepTogether,
    PageBreak,
    PageTemplate,
    Paragraph,
    Preformatted,
    Spacer,
    Table,
    TableStyle,
)
from reportlab.platypus.tableofcontents import TableOfContents


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "AI求职助手-项目实施手册.md"
OUTPUT_DIR = ROOT / "output" / "pdf"
OUTPUT = OUTPUT_DIR / "AI求职助手-项目实施手册.pdf"

INK = colors.HexColor("#172B4D")
MUTED = colors.HexColor("#5B6475")
BLUE = colors.HexColor("#2563EB")
NAVY = colors.HexColor("#102A43")
LIGHT_BLUE = colors.HexColor("#EAF2FF")
LIGHT_GRAY = colors.HexColor("#F5F7FA")
GRID = colors.HexColor("#D9E2EC")
WHITE = colors.white
ORANGE = colors.HexColor("#D97706")
GREEN = colors.HexColor("#0F9F77")
RED = colors.HexColor("#C2410C")

PAGE_W, PAGE_H = A4
MARGIN_X = 19 * mm
MARGIN_TOP = 20 * mm
MARGIN_BOTTOM = 18 * mm
CONTENT_W = PAGE_W - 2 * MARGIN_X


def register_fonts() -> None:
    regular = Path(r"C:\Windows\Fonts\msyh.ttc")
    bold = Path(r"C:\Windows\Fonts\msyhbd.ttc")
    if not regular.exists() or not bold.exists():
        raise FileNotFoundError("Microsoft YaHei fonts are required for the PDF.")
    pdfmetrics.registerFont(TTFont("MSYH", str(regular), subfontIndex=0))
    pdfmetrics.registerFont(TTFont("MSYH-Bold", str(bold), subfontIndex=0))
    pdfmetrics.registerFontFamily(
        "MSYH",
        normal="MSYH",
        bold="MSYH-Bold",
        italic="MSYH",
        boldItalic="MSYH-Bold",
    )


def inline_markup(value: str) -> str:
    value = html.escape(value, quote=False)
    value = re.sub(r"\*\*(.+?)\*\*", r"<b>\1</b>", value)
    value = re.sub(
        r"`([^`]+)`",
        r'<font name="MSYH" color="#334155" backColor="#F1F5F9">\1</font>',
        value,
    )
    return value


class SectionHeading(Paragraph):
    def __init__(self, text: str, style: ParagraphStyle, toc_level: int | None = None):
        super().__init__(inline_markup(text), style)
        self.toc_level = toc_level
        self._plain_text = text


class ReportDocument(BaseDocTemplate):
    def __init__(self, filename: str):
        super().__init__(
            filename,
            pagesize=A4,
            leftMargin=MARGIN_X,
            rightMargin=MARGIN_X,
            topMargin=MARGIN_TOP,
            bottomMargin=MARGIN_BOTTOM,
            title="AI求职助手：项目实施手册",
            author="AI求职助手项目组",
            subject="郑州大学首届AI智能体创新应用大赛校园真实需求项目",
        )
        frame = Frame(
            MARGIN_X,
            MARGIN_BOTTOM,
            CONTENT_W,
            PAGE_H - MARGIN_TOP - MARGIN_BOTTOM,
            id="body",
            leftPadding=0,
            rightPadding=0,
            topPadding=0,
            bottomPadding=0,
        )
        self.addPageTemplates(
            [PageTemplate(id="main", frames=[frame], onPage=self.draw_page)]
        )
        self._section_no = 0

    def draw_page(self, canvas, doc) -> None:
        page_no = canvas.getPageNumber()
        canvas.saveState()
        if page_no == 1:
            self.draw_cover(canvas)
            canvas.restoreState()
            return

        canvas.setStrokeColor(GRID)
        canvas.setLineWidth(0.7)
        canvas.line(MARGIN_X, PAGE_H - 12 * mm, PAGE_W - MARGIN_X, PAGE_H - 12 * mm)
        canvas.setFont("MSYH", 8.2)
        canvas.setFillColor(MUTED)
        canvas.drawString(MARGIN_X, PAGE_H - 9.2 * mm, "AI求职助手 · 项目实施手册")
        canvas.drawRightString(PAGE_W - MARGIN_X, PAGE_H - 9.2 * mm, f"{page_no}")

        canvas.line(MARGIN_X, 10.5 * mm, PAGE_W - MARGIN_X, 10.5 * mm)
        canvas.setFont("MSYH", 7.6)
        canvas.drawString(
            MARGIN_X,
            6.8 * mm,
            "郑州大学首届AI智能体创新应用大赛 · 校园真实需求 B2",
        )
        canvas.drawRightString(PAGE_W - MARGIN_X, 6.8 * mm, "2026.10")
        canvas.restoreState()

    @staticmethod
    def draw_cover(canvas) -> None:
        canvas.setFillColor(NAVY)
        canvas.rect(0, 0, PAGE_W, PAGE_H, fill=1, stroke=0)

        canvas.setFillColor(colors.HexColor("#173B66"))
        canvas.circle(PAGE_W - 40, PAGE_H - 70, 125, fill=1, stroke=0)
        canvas.setFillColor(colors.HexColor("#22538A"))
        canvas.circle(PAGE_W - 15, PAGE_H - 30, 78, fill=1, stroke=0)

        canvas.setFillColor(colors.HexColor("#C7D7FE"))
        canvas.setFont("MSYH-Bold", 12)
        canvas.drawString(45 * mm, PAGE_H - 53 * mm, "郑州大学首届AI智能体创新应用大赛")
        canvas.setFont("MSYH", 9.5)
        canvas.drawString(45 * mm, PAGE_H - 61 * mm, "校园真实需求挑战 · B2 精准就业匹配与求职辅助")

        canvas.setFillColor(WHITE)
        canvas.setFont("MSYH-Bold", 33)
        canvas.drawString(45 * mm, PAGE_H - 92 * mm, "AI求职助手")
        canvas.setFont("MSYH-Bold", 17)
        canvas.drawString(45 * mm, PAGE_H - 106 * mm, "项目实施手册")

        canvas.setFillColor(colors.HexColor("#DCE8F8"))
        canvas.setFont("MSYH", 12)
        canvas.drawString(
            45 * mm,
            PAGE_H - 123 * mm,
            "从比赛需求、MVP开发到决赛演示的完整行动路线",
        )

        cards = [
            ("项目定位", "岗位匹配 + 简历诊断\n针对性模拟面试"),
            ("技术路线", "Next.js + Supabase\nDeepSeek API"),
            ("队内目标", "真实问题、可演示效果\n合规数据与清晰分工"),
        ]
        card_w = (PAGE_W - 90 * mm - 12 * mm) / 3
        y = 77 * mm
        for i, (head, body) in enumerate(cards):
            x = 45 * mm + i * (card_w + 6 * mm)
            canvas.setFillColor(colors.HexColor("#173B66"))
            canvas.roundRect(x, y, card_w, 42 * mm, 4 * mm, fill=1, stroke=0)
            canvas.setFillColor(colors.HexColor("#9FC4F8"))
            canvas.setFont("MSYH-Bold", 9)
            canvas.drawString(x + 5 * mm, y + 31 * mm, head)
            canvas.setFillColor(WHITE)
            canvas.setFont("MSYH", 9.3)
            for line_no, line in enumerate(body.split("\n")):
                canvas.drawString(x + 5 * mm, y + 21 * mm - line_no * 6 * mm, line)

        canvas.setFillColor(colors.HexColor("#B8C9DD"))
        canvas.setFont("MSYH", 9)
        canvas.drawString(45 * mm, 28 * mm, "项目组内部使用 · 2026年10月")
        canvas.drawRightString(PAGE_W - 45 * mm, 28 * mm, "以真实需求为导向 · 以可验证效果为目标")

    def afterFlowable(self, flowable) -> None:
        if not isinstance(flowable, SectionHeading):
            return
        self._section_no += 1
        key = f"section-{self._section_no}"
        self.canv.bookmarkPage(key)
        self.canv.addOutlineEntry(
            flowable._plain_text,
            key,
            level=0,
            closed=False,
        )
        if flowable.toc_level is not None:
            self.notify(
                "TOCEntry",
                (flowable.toc_level, flowable._plain_text, self.page),
            )


def build_styles() -> dict[str, ParagraphStyle]:
    styles = getSampleStyleSheet()
    return {
        "body": ParagraphStyle(
            "BodyCN",
            parent=styles["BodyText"],
            fontName="MSYH",
            fontSize=9.8,
            leading=16,
            textColor=INK,
            alignment=TA_JUSTIFY,
            spaceAfter=5.8,
            wordWrap="CJK",
        ),
        "body_compact": ParagraphStyle(
            "BodyCompact",
            parent=styles["BodyText"],
            fontName="MSYH",
            fontSize=9.1,
            leading=14.5,
            textColor=INK,
            alignment=TA_JUSTIFY,
            spaceAfter=3.5,
            wordWrap="CJK",
        ),
        "h1": ParagraphStyle(
            "H1CN",
            parent=styles["Heading1"],
            fontName="MSYH-Bold",
            fontSize=19,
            leading=25,
            textColor=INK,
            spaceBefore=8,
            spaceAfter=8,
            keepWithNext=1,
            wordWrap="CJK",
        ),
        "h2": ParagraphStyle(
            "H2CN",
            parent=styles["Heading2"],
            fontName="MSYH-Bold",
            fontSize=12.7,
            leading=18,
            textColor=BLUE,
            spaceBefore=10,
            spaceAfter=5,
            keepWithNext=1,
            wordWrap="CJK",
        ),
        "h3": ParagraphStyle(
            "H3CN",
            parent=styles["Heading3"],
            fontName="MSYH-Bold",
            fontSize=10.7,
            leading=15.5,
            textColor=INK,
            spaceBefore=7,
            spaceAfter=3,
            keepWithNext=1,
            wordWrap="CJK",
        ),
        "quote": ParagraphStyle(
            "QuoteCN",
            parent=styles["BodyText"],
            fontName="MSYH",
            fontSize=9.2,
            leading=15,
            textColor=MUTED,
            alignment=TA_LEFT,
            spaceAfter=0,
            wordWrap="CJK",
        ),
        "caption": ParagraphStyle(
            "CaptionCN",
            parent=styles["BodyText"],
            fontName="MSYH",
            fontSize=8.3,
            leading=12,
            textColor=MUTED,
            alignment=TA_CENTER,
            spaceBefore=3,
            spaceAfter=8,
            wordWrap="CJK",
        ),
        "table_header": ParagraphStyle(
            "TableHeaderCN",
            parent=styles["BodyText"],
            fontName="MSYH-Bold",
            fontSize=8,
            leading=11.8,
            textColor=WHITE,
            alignment=TA_LEFT,
            wordWrap="CJK",
        ),
        "table_cell": ParagraphStyle(
            "TableCellCN",
            parent=styles["BodyText"],
            fontName="MSYH",
            fontSize=7.8,
            leading=11.6,
            textColor=INK,
            alignment=TA_LEFT,
            wordWrap="CJK",
        ),
        "code": ParagraphStyle(
            "CodeCN",
            parent=styles["Code"],
            fontName="MSYH",
            fontSize=8,
            leading=12,
            textColor=colors.HexColor("#243B53"),
            wordWrap="CJK",
        ),
        "toc_title": ParagraphStyle(
            "TOCTitleCN",
            parent=styles["Heading1"],
            fontName="MSYH-Bold",
            fontSize=24,
            leading=30,
            textColor=INK,
            spaceAfter=14,
        ),
        "toc_0": ParagraphStyle(
            "TOC0CN",
            parent=styles["Normal"],
            fontName="MSYH",
            fontSize=9.4,
            leading=16,
            textColor=INK,
            leftIndent=2,
            firstLineIndent=0,
            spaceBefore=0,
        ),
    }


def quote_block(lines: list[str], styles: dict[str, ParagraphStyle]):
    text = " ".join(line.lstrip(">").strip() for line in lines).strip()
    paragraph = Paragraph(inline_markup(text), styles["quote"])
    return Table(
        [[paragraph]],
        colWidths=[CONTENT_W],
        style=TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, -1), LIGHT_BLUE),
                ("BOX", (0, 0), (-1, -1), 0.5, colors.HexColor("#CDE0FA")),
                ("LINEBEFORE", (0, 0), (0, -1), 3, BLUE),
                ("LEFTPADDING", (0, 0), (-1, -1), 9),
                ("RIGHTPADDING", (0, 0), (-1, -1), 9),
                ("TOPPADDING", (0, 0), (-1, -1), 7),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
            ]
        ),
        hAlign="LEFT",
        spaceAfter=8,
    )


def code_block(lines: list[str], styles: dict[str, ParagraphStyle]):
    code = Preformatted("\n".join(lines), styles["code"], maxLineLength=110)
    return Table(
        [[code]],
        colWidths=[CONTENT_W],
        style=TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, -1), LIGHT_GRAY),
                ("BOX", (0, 0), (-1, -1), 0.5, GRID),
                ("LEFTPADDING", (0, 0), (-1, -1), 8),
                ("RIGHTPADDING", (0, 0), (-1, -1), 8),
                ("TOPPADDING", (0, 0), (-1, -1), 7),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
            ]
        ),
        hAlign="LEFT",
        spaceBefore=3,
        spaceAfter=8,
    )


def image_flowable(path: Path, caption: str, styles: dict[str, ParagraphStyle]):
    if not path.exists():
        return Paragraph(
            inline_markup(f"图片未找到：{path.name}"),
            styles["body"],
        )
    with PILImage.open(path) as img:
        width, height = img.size
    max_w = CONTENT_W
    max_h = 315
    scale = min(max_w / width, max_h / height)
    draw_w = width * scale
    draw_h = height * scale
    return KeepTogether(
        [
            Spacer(1, 3),
            Image(str(path), width=draw_w, height=draw_h),
            Paragraph(inline_markup(caption), styles["caption"]),
        ]
    )


def parse_table(lines: list[str], styles: dict[str, ParagraphStyle]):
    rows = []
    for raw in lines:
        stripped = raw.strip().strip("|")
        cells = [cell.strip() for cell in stripped.split("|")]
        rows.append(cells)
    if len(rows) < 2:
        return Spacer(1, 1)
    rows.pop(1)

    max_cols = max(len(row) for row in rows)
    rows = [row + [""] * (max_cols - len(row)) for row in rows]
    if max_cols <= 2:
        ratios = [0.31, 0.69]
    elif max_cols == 3:
        ratios = [0.23, 0.29, 0.48]
    elif max_cols == 4:
        ratios = [0.16, 0.24, 0.28, 0.32]
    elif max_cols == 5:
        if rows[0] and rows[0][0] == "工作":
            ratios = [0.32, 0.14, 0.17, 0.18, 0.19]
        else:
            ratios = [0.08, 0.18, 0.22, 0.18, 0.34]
    else:
        ratios = [1 / max_cols] * max_cols

    table_data = []
    for r_idx, row in enumerate(rows):
        style = styles["table_header"] if r_idx == 0 else styles["table_cell"]
        table_data.append([Paragraph(inline_markup(cell), style) for cell in row])

    table = Table(
        table_data,
        colWidths=[CONTENT_W * ratio for ratio in ratios],
        repeatRows=1,
        rowSplitRange=None,
        splitByRow=1,
        hAlign="LEFT",
    )
    style_commands = [
        ("BACKGROUND", (0, 0), (-1, 0), NAVY),
        ("TEXTCOLOR", (0, 0), (-1, 0), WHITE),
        ("GRID", (0, 0), (-1, -1), 0.4, GRID),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 4),
        ("RIGHTPADDING", (0, 0), (-1, -1), 4),
        ("TOPPADDING", (0, 0), (-1, -1), 4.3),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4.3),
    ]
    for row_no in range(1, len(table_data)):
        if row_no % 2 == 0:
            style_commands.append(
                ("BACKGROUND", (0, row_no), (-1, row_no), colors.HexColor("#F8FAFD"))
            )
    table.setStyle(TableStyle(style_commands))
    return KeepTogether([table, Spacer(1, 7)])


def parse_markdown(
    text: str, styles: dict[str, ParagraphStyle]
) -> tuple[list, TableOfContents]:
    toc = TableOfContents()
    toc.levelStyles = [styles["toc_0"]]
    toc.dotsMinLevel = 0

    story: list = [
        Spacer(1, 1),
        PageBreak(),
        Paragraph("目录", styles["toc_title"]),
        Paragraph(
            inline_markup("以下目录页码在PDF生成时自动计算。"),
            styles["quote"],
        ),
        Spacer(1, 10),
        toc,
        PageBreak(),
    ]

    lines = text.splitlines()
    i = 0
    skip_first_h1 = True
    while i < len(lines):
        raw = lines[i]
        line = raw.strip()

        if not line:
            i += 1
            continue

        if line.startswith("# ") and skip_first_h1:
            skip_first_h1 = False
            i += 1
            continue

        if line.startswith("```"):
            code_lines = []
            i += 1
            while i < len(lines) and not lines[i].strip().startswith("```"):
                code_lines.append(lines[i])
                i += 1
            if i < len(lines):
                i += 1
            story.append(code_block(code_lines, styles))
            continue

        image_match = re.fullmatch(r"!\[(.*?)\]\((.*?)\)", line)
        if image_match:
            caption = image_match.group(1).strip()
            target = unquote(image_match.group(2).strip())
            path = (ROOT / target).resolve()
            story.append(image_flowable(path, caption, styles))
            i += 1
            continue

        if line.startswith("|") and i + 1 < len(lines):
            separator = lines[i + 1].strip()
            if re.fullmatch(r"\|?[\s:\-\|]+\|?", separator):
                table_lines = [raw, lines[i + 1]]
                i += 2
                while i < len(lines) and lines[i].strip().startswith("|"):
                    table_lines.append(lines[i])
                    i += 1
                story.append(parse_table(table_lines, styles))
                continue

        if line.startswith(">"):
            quote_lines = []
            while i < len(lines) and lines[i].strip().startswith(">"):
                quote_lines.append(lines[i])
                i += 1
            story.append(quote_block(quote_lines, styles))
            continue

        if line.startswith("## "):
            heading_text = line[3:].strip()
            if heading_text == "结论":
                story.append(PageBreak())
            else:
                story.append(CondPageBreak(150))
            story.append(SectionHeading(heading_text, styles["h1"], toc_level=0))
            i += 1
            continue

        if line.startswith("### "):
            heading_text = line[4:].strip()
            story.append(CondPageBreak(360 if heading_text.startswith("图") else 90))
            story.append(SectionHeading(heading_text, styles["h2"]))
            i += 1
            continue

        if line.startswith("#### "):
            story.append(CondPageBreak(65))
            story.append(SectionHeading(line[5:].strip(), styles["h3"]))
            i += 1
            continue

        if line in {"---", "***", "___"}:
            story.append(
                HRFlowable(
                    width="100%",
                    thickness=0.5,
                    color=GRID,
                    spaceBefore=3,
                    spaceAfter=6,
                )
            )
            i += 1
            continue

        ordered = re.match(r"^(\d+)\.\s+(.*)$", line)
        bullet = re.match(r"^-\s+(.*)$", line)
        if ordered:
            marker = ordered.group(1) + "."
            content = ordered.group(2)
            story.append(
                Paragraph(
                    f'<font color="#2563EB"><b>{marker}</b></font> {inline_markup(content)}',
                    styles["body_compact"],
                )
            )
            i += 1
            continue
        if bullet:
            content = bullet.group(1)
            if content.startswith("[ ] "):
                content = "□ " + content[4:]
            elif content.startswith("[x] ") or content.startswith("[X] "):
                content = "☑ " + content[4:]
            story.append(
                Paragraph(
                    f'<font color="#2563EB">•</font> {inline_markup(content)}',
                    styles["body_compact"],
                )
            )
            i += 1
            continue

        story.append(Paragraph(inline_markup(line), styles["body"]))
        i += 1

    return story, toc


def main() -> None:
    register_fonts()
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    styles = build_styles()
    text = SOURCE.read_text(encoding="utf-8")
    story, _ = parse_markdown(text, styles)
    doc = ReportDocument(str(OUTPUT))
    doc.multiBuild(story)
    print(OUTPUT)


if __name__ == "__main__":
    main()
