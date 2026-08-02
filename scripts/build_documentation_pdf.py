from __future__ import annotations

import html
import re
from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_RIGHT
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import inch
from reportlab.platypus import (
    BaseDocTemplate, Frame, Image, KeepTogether, ListFlowable, ListItem,
    PageBreak, PageTemplate, Paragraph, Preformatted, Spacer, Table, TableStyle
)


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "docs" / "DOCUMENTACAO_TECNICA.md"
OUTPUT = ROOT / "docs" / "LensClick_Documentacao_Tecnica.pdf"
ASSETS = ROOT / "tmp" / "documentation"

PURPLE = colors.HexColor("#8B5CF6")
BLUE = colors.HexColor("#4E70A8")
NAVY = colors.HexColor("#17182A")
INK = colors.HexColor("#202033")
MUTED = colors.HexColor("#64647A")
LIGHT = colors.HexColor("#F2F0FA")
LIGHT_BLUE = colors.HexColor("#EAF5FF")
GRID = colors.HexColor("#D9D5E8")


class LensDocTemplate(BaseDocTemplate):
    def __init__(self, filename):
        super().__init__(filename, pagesize=letter, leftMargin=inch, rightMargin=inch,
                         topMargin=0.86 * inch, bottomMargin=0.72 * inch,
                         title="LensClick - Documentacao Tecnica do Sistema",
                         author="Equipe LensClick")
        frame = Frame(self.leftMargin, self.bottomMargin, self.width, self.height, id="content")
        self.addPageTemplates(PageTemplate(id="main", frames=frame, onPage=self.draw_page))

    def draw_page(self, canvas, doc):
        if doc.page > 1:
            canvas.saveState()
            canvas.setStrokeColor(GRID)
            canvas.setLineWidth(0.6)
            canvas.line(inch, letter[1] - 0.55 * inch, letter[0] - inch, letter[1] - 0.55 * inch)
            canvas.setFillColor(MUTED)
            canvas.setFont("Helvetica-Bold", 7.5)
            canvas.drawString(inch, letter[1] - 0.42 * inch, "LENSCLICK  |  DOCUMENTACAO TECNICA")
            canvas.setFont("Helvetica", 8)
            canvas.drawRightString(letter[0] - inch, 0.42 * inch, f"Pagina {doc.page}")
            canvas.restoreState()


def styles():
    base = getSampleStyleSheet()
    return {
        "body": ParagraphStyle("body", parent=base["BodyText"], fontName="Helvetica", fontSize=9.5,
                               leading=12.2, textColor=INK, spaceAfter=5),
        "h1": ParagraphStyle("h1", parent=base["Heading1"], fontName="Helvetica-Bold", fontSize=15,
                             leading=18, textColor=PURPLE, spaceBefore=0, spaceAfter=8, keepWithNext=True),
        "h2": ParagraphStyle("h2", parent=base["Heading2"], fontName="Helvetica-Bold", fontSize=12,
                             leading=14.5, textColor=BLUE, spaceBefore=10, spaceAfter=6, keepWithNext=True),
        "h3": ParagraphStyle("h3", parent=base["Heading3"], fontName="Helvetica-Bold", fontSize=10.5,
                             leading=13, textColor=colors.HexColor("#394A6A"), spaceBefore=7, spaceAfter=4,
                             keepWithNext=True),
        "code": ParagraphStyle("code", parent=base["Code"], fontName="Courier", fontSize=7.3,
                               leading=9.4, textColor=colors.HexColor("#332B45"), leftIndent=8,
                               rightIndent=8, spaceBefore=4, spaceAfter=7, backColor=LIGHT),
        "quote": ParagraphStyle("quote", parent=base["BodyText"], fontName="Helvetica", fontSize=9.3,
                                leading=12, textColor=colors.HexColor("#394A6A"), leftIndent=12,
                                rightIndent=12, borderColor=PURPLE, borderWidth=0.8, borderPadding=8,
                                backColor=LIGHT_BLUE, spaceBefore=5, spaceAfter=8),
        "caption": ParagraphStyle("caption", parent=base["BodyText"], fontName="Helvetica-Oblique",
                                  fontSize=7.8, leading=9.5, alignment=TA_CENTER, textColor=MUTED,
                                  spaceAfter=7),
    }


def inline(text):
    escaped = html.escape(text)
    escaped = re.sub(r"`([^`]+)`", r'<font name="Courier" color="#4F3D7A">\1</font>', escaped)
    escaped = re.sub(r"\*\*([^*]+)\*\*", r"<b>\1</b>", escaped)
    escaped = re.sub(r"\[([^\]]+)\]\(([^)]+)\)", r'<font color="#315D9A">\1 (\2)</font>', escaped)
    return escaped


def widths(count):
    total = 6.5 * inch
    patterns = {
        2: [1.9 * inch, 4.6 * inch],
        3: [1.45 * inch, 1.65 * inch, 3.4 * inch],
        4: [1.2 * inch, 1.25 * inch, 1.45 * inch, 2.6 * inch],
        5: [0.72 * inch, 1.42 * inch, 1.0 * inch, 1.75 * inch, 1.61 * inch],
    }
    return patterns.get(count, [total / count] * count)


def make_table(rows, style):
    data = []
    for row_index, row in enumerate(rows):
        cell_style = ParagraphStyle("tablecell", parent=style["body"], fontSize=7.4 if len(row) >= 4 else 8.1,
                                    leading=9.2 if len(row) >= 4 else 10, spaceAfter=0,
                                    textColor=NAVY if row_index == 0 else INK)
        data.append([Paragraph(("<b>" if row_index == 0 else "") + inline(cell) + ("</b>" if row_index == 0 else ""), cell_style) for cell in row])
    table = Table(data, colWidths=widths(len(rows[0])), repeatRows=1, hAlign="CENTER")
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), LIGHT_BLUE),
        ("GRID", (0, 0), (-1, -1), 0.45, GRID),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("LEFTPADDING", (0, 0), (-1, -1), 5),
        ("RIGHTPADDING", (0, 0), (-1, -1), 5),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
    ]))
    return [table, Spacer(1, 5)]


def cover(story, style):
    story.extend([Spacer(1, 1.35 * inch)])
    kicker = ParagraphStyle("kicker", parent=style["body"], alignment=TA_CENTER, fontName="Helvetica-Bold",
                            fontSize=10, textColor=PURPLE, spaceAfter=16)
    title = ParagraphStyle("title", parent=style["body"], alignment=TA_CENTER, fontName="Helvetica-Bold",
                           fontSize=31, leading=34, textColor=NAVY, spaceAfter=7)
    subtitle = ParagraphStyle("subtitle", parent=style["body"], alignment=TA_CENTER, fontName="Helvetica-Bold",
                              fontSize=16, leading=20, textColor=BLUE, spaceAfter=18)
    center = ParagraphStyle("center", parent=style["body"], alignment=TA_CENTER, textColor=MUTED, spaceAfter=6)
    story += [
        Paragraph("FASE 9  |  MANUAL TECNICO", kicker),
        Paragraph("LensClick", title),
        Paragraph("Documentacao Tecnica do Sistema", subtitle),
        Table([[""]], colWidths=[6.5 * inch], rowHeights=[3], style=TableStyle([("BACKGROUND", (0, 0), (-1, -1), PURPLE)])),
        Spacer(1, 18),
        Paragraph("Arquitetura | Front-end | Back-end | D1 | R2 | Seguranca | Testes", center),
        Paragraph("Versao 1.0.0 - 2 de agosto de 2026", center),
        Spacer(1, 14),
        Paragraph('<font color="#8B5CF6"><b>lensclick.renato-aparecido-business.workers.dev</b></font>', center),
        PageBreak(),
        Paragraph("Como usar este manual", style["h1"]),
    ]
    bullets = [
        "Use as secoes 1 e 2 para apresentar o produto rapidamente.",
        "Use as secoes 3 a 14 para explicar as decisoes tecnicas.",
        "Use as secoes 15 a 19 para responder perguntas, demonstrar e ensaiar.",
        "Funcionalidades futuras aparecem separadas do que ja esta implementado.",
    ]
    story.append(ListFlowable([ListItem(Paragraph(inline(item), style["body"])) for item in bullets],
                              bulletType="bullet", leftIndent=18, bulletFontName="Helvetica"))
    story += [Spacer(1, 12), Paragraph("Conteudo", style["h2"])]
    contents = ["1-3 Produto e arquitetura", "4-6 Repositorio, front-end e Worker",
                "7-10 Autenticacao, dados, R2 e seguranca", "11-14 UX, testes, operacao e decisoes",
                "15-19 Roadmap, perguntas, demonstracao e glossario", "20 Fontes internas"]
    story.append(ListFlowable([ListItem(Paragraph(item, style["body"])) for item in contents],
                              bulletType="bullet", leftIndent=18))
    story.append(PageBreak())


def build_story(style):
    story = []
    cover(story, style)
    lines = SOURCE.read_text(encoding="utf-8").splitlines()
    start = next(i for i, line in enumerate(lines) if line.startswith("## 1."))
    lines = lines[start:]
    index = 0
    diagram = 1
    first_section = True
    while index < len(lines):
        line = lines[index]
        if line.startswith("```mermaid"):
            index += 1
            while index < len(lines) and not lines[index].startswith("```"):
                index += 1
            image_path = ASSETS / f"diagram-{diagram}.png"
            diagram += 1
            img = Image(str(image_path), width=6.25 * inch, height=3.35 * inch if diagram != 5 else 4.2 * inch)
            story += [KeepTogether([img, Paragraph("Diagrama gerado a partir da implementacao atual.", style["caption"])])]
            index += 1
            continue
        if line.startswith("```"):
            index += 1
            code = []
            while index < len(lines) and not lines[index].startswith("```"):
                code.append(lines[index])
                index += 1
            story.append(Preformatted("\n".join(code), style["code"], maxLineLength=95))
            index += 1
            continue
        if line.startswith("## "):
            if not first_section:
                story.append(PageBreak())
            first_section = False
            story.append(Paragraph(inline(line[3:]), style["h1"]))
            index += 1
            continue
        if line.startswith("### "):
            story.append(Paragraph(inline(line[4:]), style["h2"]))
            index += 1
            continue
        if line.startswith("#### "):
            story.append(Paragraph(inline(line[5:]), style["h3"]))
            index += 1
            continue
        if line.startswith("> "):
            story.append(Paragraph(inline(line[2:]), style["quote"]))
            index += 1
            continue
        if line.startswith("| "):
            table_lines = []
            while index < len(lines) and lines[index].startswith("|"):
                table_lines.append(lines[index])
                index += 1
            rows = []
            for row_index, table_line in enumerate(table_lines):
                cells = [cell.strip() for cell in table_line.strip().strip("|").split("|")]
                if row_index == 1 and all(re.fullmatch(r":?-{3,}:?", c) for c in cells):
                    continue
                rows.append(cells)
            story.extend(make_table(rows, style))
            continue
        if line.startswith("- "):
            items = []
            while index < len(lines) and lines[index].startswith("- "):
                items.append(ListItem(Paragraph(inline(lines[index][2:]), style["body"])))
                index += 1
            story.append(ListFlowable(items, bulletType="bullet", leftIndent=18, bulletFontName="Helvetica"))
            story.append(Spacer(1, 4))
            continue
        if re.match(r"^\d+\. ", line):
            items = []
            while index < len(lines) and re.match(r"^\d+\. ", lines[index]):
                items.append(ListItem(Paragraph(inline(re.sub(r"^\d+\. ", "", lines[index])), style["body"])))
                index += 1
            story.append(ListFlowable(items, bulletType="1", leftIndent=20))
            story.append(Spacer(1, 4))
            continue
        if line.startswith("**") and line.endswith("**"):
            story.append(Paragraph(inline(line), style["h3"]))
            index += 1
            continue
        if not line.strip():
            index += 1
            continue
        paragraph_lines = [line]
        index += 1
        while index < len(lines) and lines[index].strip() and not re.match(r"^(#{2,4} |```|> |\| |- |\d+\. |\*\*)", lines[index]):
            paragraph_lines.append(lines[index])
            index += 1
        story.append(Paragraph(inline(" ".join(paragraph_lines)), style["body"]))
    return story


def main():
    style = styles()
    doc = LensDocTemplate(str(OUTPUT))
    doc.build(build_story(style))
    print(OUTPUT)


if __name__ == "__main__":
    main()
