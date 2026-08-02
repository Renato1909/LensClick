from __future__ import annotations

import re
import shutil
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont
from docx import Document
from docx.enum.section import WD_SECTION
from docx.enum.table import WD_ALIGN_VERTICAL, WD_TABLE_ALIGNMENT
from docx.enum.text import WD_ALIGN_PARAGRAPH, WD_BREAK, WD_LINE_SPACING
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Inches, Pt, RGBColor


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "docs" / "DOCUMENTACAO_TECNICA.md"
OUTPUT = ROOT / "docs" / "LensClick_Documentacao_Tecnica.docx"
ASSET_DIR = ROOT / "tmp" / "documentation"

PURPLE = "8B5CF6"
BLUE = "5BB3FF"
NAVY = "17182A"
INK = "202033"
MUTED = "64647A"
LIGHT = "F2F0FA"
LIGHT_BLUE = "EAF5FF"
GRID = "D9D5E8"
WHITE = "FFFFFF"
RED = "A23B3B"


def rgb(value: str) -> RGBColor:
    return RGBColor.from_string(value)


def set_font(run, name="Calibri", size=11, color=INK, bold=False, italic=False):
    run.font.name = name
    run._element.get_or_add_rPr().rFonts.set(qn("w:ascii"), name)
    run._element.get_or_add_rPr().rFonts.set(qn("w:hAnsi"), name)
    run.font.size = Pt(size)
    run.font.color.rgb = rgb(color)
    run.bold = bold
    run.italic = italic


def shade(element, fill: str):
    properties = element.get_or_add_tcPr() if hasattr(element, "get_or_add_tcPr") else element.get_or_add_pPr()
    shd = properties.find(qn("w:shd"))
    if shd is None:
        shd = OxmlElement("w:shd")
        properties.append(shd)
    shd.set(qn("w:fill"), fill)


def paragraph_border_bottom(paragraph, color=GRID, size="8"):
    p_pr = paragraph._p.get_or_add_pPr()
    p_bdr = p_pr.find(qn("w:pBdr"))
    if p_bdr is None:
        p_bdr = OxmlElement("w:pBdr")
        p_pr.append(p_bdr)
    bottom = OxmlElement("w:bottom")
    bottom.set(qn("w:val"), "single")
    bottom.set(qn("w:sz"), size)
    bottom.set(qn("w:space"), "4")
    bottom.set(qn("w:color"), color)
    p_bdr.append(bottom)


def set_cell_margins(cell, top=100, start=120, bottom=100, end=120):
    tc_pr = cell._tc.get_or_add_tcPr()
    tc_mar = tc_pr.first_child_found_in("w:tcMar")
    if tc_mar is None:
        tc_mar = OxmlElement("w:tcMar")
        tc_pr.append(tc_mar)
    for side, value in (("top", top), ("start", start), ("bottom", bottom), ("end", end)):
        node = tc_mar.find(qn(f"w:{side}"))
        if node is None:
            node = OxmlElement(f"w:{side}")
            tc_mar.append(node)
        node.set(qn("w:w"), str(value))
        node.set(qn("w:type"), "dxa")


def set_table_geometry(table, widths_dxa: list[int]):
    table.autofit = False
    table.alignment = WD_TABLE_ALIGNMENT.CENTER
    table_pr = table._tbl.tblPr
    tbl_w = table_pr.find(qn("w:tblW"))
    if tbl_w is None:
        tbl_w = OxmlElement("w:tblW")
        table_pr.append(tbl_w)
    tbl_w.set(qn("w:w"), str(sum(widths_dxa)))
    tbl_w.set(qn("w:type"), "dxa")
    tbl_ind = table_pr.find(qn("w:tblInd"))
    if tbl_ind is None:
        tbl_ind = OxmlElement("w:tblInd")
        table_pr.append(tbl_ind)
    tbl_ind.set(qn("w:w"), "120")
    tbl_ind.set(qn("w:type"), "dxa")
    grid = table._tbl.tblGrid
    for child in list(grid):
        grid.remove(child)
    for width in widths_dxa:
        col = OxmlElement("w:gridCol")
        col.set(qn("w:w"), str(width))
        grid.append(col)
    for row in table.rows:
        for index, cell in enumerate(row.cells):
            cell.width = Inches(widths_dxa[index] / 1440)
            tc_pr = cell._tc.get_or_add_tcPr()
            tc_w = tc_pr.find(qn("w:tcW"))
            if tc_w is None:
                tc_w = OxmlElement("w:tcW")
                tc_pr.append(tc_w)
            tc_w.set(qn("w:w"), str(widths_dxa[index]))
            tc_w.set(qn("w:type"), "dxa")
            set_cell_margins(cell)


def add_page_field(paragraph):
    paragraph.alignment = WD_ALIGN_PARAGRAPH.RIGHT
    run = paragraph.add_run("Pagina ")
    set_font(run, size=8.5, color=MUTED)
    fld_char1 = OxmlElement("w:fldChar")
    fld_char1.set(qn("w:fldCharType"), "begin")
    instr = OxmlElement("w:instrText")
    instr.set(qn("xml:space"), "preserve")
    instr.text = " PAGE "
    fld_char2 = OxmlElement("w:fldChar")
    fld_char2.set(qn("w:fldCharType"), "end")
    run._r.append(fld_char1)
    run._r.append(instr)
    run._r.append(fld_char2)


def draw_centered(draw, box, text, font, fill, spacing=6):
    left, top, right, bottom = box
    lines = text.split("\n")
    heights = [draw.textbbox((0, 0), line, font=font)[3] for line in lines]
    total = sum(heights) + spacing * (len(lines) - 1)
    y = top + (bottom - top - total) / 2
    for line, height in zip(lines, heights):
        bbox = draw.textbbox((0, 0), line, font=font)
        x = left + (right - left - (bbox[2] - bbox[0])) / 2
        draw.text((x, y), line, font=font, fill=fill)
        y += height + spacing


def rounded_box(draw, box, title, subtitle="", fill=NAVY, outline=PURPLE):
    title_font = ImageFont.truetype("C:/Windows/Fonts/arialbd.ttf", 30)
    body_font = ImageFont.truetype("C:/Windows/Fonts/arial.ttf", 21)
    draw.rounded_rectangle(box, radius=22, fill="#" + fill, outline="#" + outline, width=4)
    text = title if not subtitle else f"{title}\n{subtitle}"
    draw_centered(draw, box, text, title_font if not subtitle else body_font, "#FFFFFF", 7)


def arrow(draw, start, end, label=""):
    draw.line([start, end], fill="#7D6CB7", width=5)
    angle_x = 1 if end[0] >= start[0] else -1
    angle_y = 1 if end[1] >= start[1] else -1
    if abs(end[0] - start[0]) >= abs(end[1] - start[1]):
        tip = [(end[0], end[1]), (end[0] - 16 * angle_x, end[1] - 10), (end[0] - 16 * angle_x, end[1] + 10)]
    else:
        tip = [(end[0], end[1]), (end[0] - 10, end[1] - 16 * angle_y), (end[0] + 10, end[1] - 16 * angle_y)]
    draw.polygon(tip, fill="#7D6CB7")
    if label:
        font = ImageFont.truetype("C:/Windows/Fonts/arial.ttf", 18)
        mid = ((start[0] + end[0]) // 2, (start[1] + end[1]) // 2 - 24)
        draw.text(mid, label, font=font, fill="#514878", anchor="mm")


def canvas(width=1800, height=1000):
    image = Image.new("RGB", (width, height), "#F8F7FC")
    return image, ImageDraw.Draw(image)


def diagram_architecture(path):
    image, draw = canvas()
    rounded_box(draw, (80, 360, 380, 600), "Navegador", "HTML + CSS + JS", PURPLE, PURPLE)
    rounded_box(draw, (610, 300, 1060, 660), "Cloudflare Worker", "Assets + API + seguranca", NAVY, BLUE)
    rounded_box(draw, (1320, 120, 1710, 370), "Cloudflare D1", "Dados estruturados", "283B62", BLUE)
    rounded_box(draw, (1320, 620, 1710, 870), "Cloudflare R2", "Fotos privadas", "283B62", PURPLE)
    arrow(draw, (380, 480), (610, 480), "HTTPS")
    arrow(draw, (1060, 390), (1320, 245), "SQL")
    arrow(draw, (1060, 570), (1320, 745), "Objetos")
    image.save(path)


def diagram_signup(path):
    image, draw = canvas(1800, 850)
    labels = [("Usuario", "Preenche formulario"), ("Front-end", "Valida e envia"), ("Worker", "Hash + regras"), ("D1", "Usuario + sessao"), ("Perfil", "Cookie autenticado")]
    xs = [60, 400, 740, 1080, 1420]
    for x, (title, subtitle) in zip(xs, labels):
        rounded_box(draw, (x, 270, x + 280, 570), title, subtitle, NAVY if title != "Worker" else PURPLE, BLUE)
    for x in xs[:-1]:
        arrow(draw, (x + 280, 420), (x + 340, 420))
    image.save(path)


def diagram_mer(path):
    image, draw = canvas(1800, 950)
    rounded_box(draw, (650, 330, 1150, 620), "Usuario", "Entidade principal", PURPLE, PURPLE)
    rounded_box(draw, (70, 90, 470, 330), "Visitante", "Contato e newsletter", "283B62", BLUE)
    rounded_box(draw, (70, 620, 470, 860), "Rate limit", "Controle tecnico", "283B62", BLUE)
    rounded_box(draw, (1330, 70, 1730, 310), "Sessao", "0..N por usuario", NAVY, BLUE)
    rounded_box(draw, (1330, 355, 1730, 595), "Foto R2", "0..1 por usuario", NAVY, PURPLE)
    rounded_box(draw, (1330, 650, 1730, 890), "Contato / Newsletter", "Registros independentes", NAVY, BLUE)
    arrow(draw, (1150, 420), (1330, 190), "possui")
    arrow(draw, (1150, 485), (1330, 475), "possui")
    arrow(draw, (470, 250), (650, 400), "pode criar")
    arrow(draw, (470, 740), (650, 560), "protege")
    arrow(draw, (470, 210), (1330, 770), "envia")
    image.save(path)


def entity_box(draw, box, name, fields, accent):
    left, top, right, bottom = box
    draw.rounded_rectangle(box, radius=18, fill="#FFFFFF", outline="#" + accent, width=4)
    draw.rounded_rectangle((left, top, right, top + 62), radius=18, fill="#" + accent)
    draw.rectangle((left, top + 42, right, top + 62), fill="#" + accent)
    title_font = ImageFont.truetype("C:/Windows/Fonts/arialbd.ttf", 25)
    body_font = ImageFont.truetype("C:/Windows/Fonts/consola.ttf", 17)
    draw.text((left + 18, top + 17), name, font=title_font, fill="#FFFFFF")
    y = top + 78
    for field in fields:
        draw.text((left + 18, y), field, font=body_font, fill="#29283A")
        y += 30


def diagram_der(path):
    image, draw = canvas(2000, 1350)
    entity_box(draw, (70, 80, 850, 550), "USERS", ["PK id", "name", "UK email", "phone", "password_hash", "role", "age", "gender", "profile_pic_key", "created_at", "updated_at"], PURPLE)
    entity_box(draw, (1180, 100, 1900, 380), "SESSIONS", ["PK token_hash", "FK user_id -> users.id", "expires_at", "created_at"], BLUE)
    entity_box(draw, (70, 730, 850, 1120), "CONTACT_MESSAGES", ["PK id", "name", "phone", "email", "service_type", "event_date", "message", "created_at"], BLUE)
    entity_box(draw, (1070, 680, 1900, 970), "NEWSLETTER_SUBSCRIPTIONS", ["PK id", "UK email", "created_at"], PURPLE)
    entity_box(draw, (1070, 1050, 1900, 1270), "RATE_LIMITS", ["PK bucket_key", "request_count", "expires_at"], "54506F")
    arrow(draw, (850, 290), (1180, 240), "1 : N")
    font = ImageFont.truetype("C:/Windows/Fonts/arial.ttf", 20)
    draw.text((920, 470), "As demais tabelas nao possuem\nchave estrangeira no esquema atual.", font=font, fill="#5D5970", anchor="ma")
    image.save(path)


def diagram_r2(path):
    image, draw = canvas(1800, 900)
    labels = [("Perfil", "Seleciona imagem"), ("Worker", "Valida sessao e 450 KB"), ("R2", "Grava objeto privado"), ("D1", "Salva a chave"), ("API", "Entrega ao dono")]
    xs = [50, 400, 750, 1100, 1450]
    for x, (title, subtitle) in zip(xs, labels):
        rounded_box(draw, (x, 280, x + 300, 590), title, subtitle, PURPLE if title == "Worker" else NAVY, BLUE)
    for x in xs[:-1]:
        arrow(draw, (x + 300, 435), (x + 350, 435))
    image.save(path)


def diagram_deploy(path):
    image, draw = canvas(1800, 800)
    labels = ["Codigo", "35 testes", "Dry run", "Migracao D1", "Deploy", "Monitoramento"]
    xs = [40, 330, 620, 910, 1200, 1490]
    for x, label in zip(xs, labels):
        rounded_box(draw, (x, 275, x + 250, 525), label, "", PURPLE if label == "Deploy" else NAVY, BLUE)
    for x in xs[:-1]:
        arrow(draw, (x + 250, 400), (x + 290, 400))
    image.save(path)


def generate_diagrams():
    ASSET_DIR.mkdir(parents=True, exist_ok=True)
    makers = [diagram_architecture, diagram_signup, diagram_mer, diagram_der, diagram_r2, diagram_deploy]
    paths = []
    for index, maker in enumerate(makers, start=1):
        path = ASSET_DIR / f"diagram-{index}.png"
        maker(path)
        paths.append(path)
    return paths


def configure_document(doc: Document):
    section = doc.sections[0]
    section.page_width = Inches(8.5)
    section.page_height = Inches(11)
    section.top_margin = Inches(1)
    section.bottom_margin = Inches(0.85)
    section.left_margin = Inches(1)
    section.right_margin = Inches(1)
    section.header_distance = Inches(0.492)
    section.footer_distance = Inches(0.492)

    styles = doc.styles
    normal = styles["Normal"]
    normal.font.name = "Calibri"
    normal._element.rPr.rFonts.set(qn("w:ascii"), "Calibri")
    normal._element.rPr.rFonts.set(qn("w:hAnsi"), "Calibri")
    normal.font.size = Pt(11)
    normal.font.color.rgb = rgb(INK)
    normal.paragraph_format.space_before = Pt(0)
    normal.paragraph_format.space_after = Pt(6)
    normal.paragraph_format.line_spacing = 1.25

    for name, size, color, before, after in (
        ("Heading 1", 16, PURPLE, 18, 10),
        ("Heading 2", 13, "4E70A8", 14, 7),
        ("Heading 3", 12, "394A6A", 10, 5),
    ):
        style = styles[name]
        style.font.name = "Calibri"
        style._element.rPr.rFonts.set(qn("w:ascii"), "Calibri")
        style._element.rPr.rFonts.set(qn("w:hAnsi"), "Calibri")
        style.font.size = Pt(size)
        style.font.bold = True
        style.font.color.rgb = rgb(color)
        style.paragraph_format.space_before = Pt(before)
        style.paragraph_format.space_after = Pt(after)
        style.paragraph_format.keep_with_next = True

    for name in ("List Bullet", "List Number"):
        style = styles[name]
        style.font.name = "Calibri"
        style.font.size = Pt(11)
        style.paragraph_format.left_indent = Inches(0.375)
        style.paragraph_format.first_line_indent = Inches(-0.188)
        style.paragraph_format.space_after = Pt(4)
        style.paragraph_format.line_spacing = 1.25

    header = section.header
    hp = header.paragraphs[0]
    hp.alignment = WD_ALIGN_PARAGRAPH.LEFT
    run = hp.add_run("LENSCLICK  |  DOCUMENTACAO TECNICA")
    set_font(run, size=8.5, color=MUTED, bold=True)
    paragraph_border_bottom(hp, GRID, "6")
    footer = section.footer
    add_page_field(footer.paragraphs[0])


def add_rich_text(paragraph, text, size=11, color=INK):
    pattern = re.compile(r"(`[^`]+`|\*\*[^*]+\*\*|\[[^\]]+\]\([^)]+\))")
    cursor = 0
    for match in pattern.finditer(text):
        if match.start() > cursor:
            run = paragraph.add_run(text[cursor:match.start()])
            set_font(run, size=size, color=color)
        token = match.group(0)
        if token.startswith("`"):
            run = paragraph.add_run(token[1:-1])
            set_font(run, name="Consolas", size=size - 0.5, color="4F3D7A")
            shade(paragraph._p, LIGHT)
        elif token.startswith("**"):
            run = paragraph.add_run(token[2:-2])
            set_font(run, size=size, color=color, bold=True)
        else:
            label, url = re.match(r"\[([^\]]+)\]\(([^)]+)\)", token).groups()
            run = paragraph.add_run(f"{label} ({url})")
            set_font(run, size=size, color="315D9A")
        cursor = match.end()
    if cursor < len(text):
        run = paragraph.add_run(text[cursor:])
        set_font(run, size=size, color=color)


def add_cover(doc: Document):
    for _ in range(4):
        doc.add_paragraph()
    kicker = doc.add_paragraph()
    kicker.alignment = WD_ALIGN_PARAGRAPH.CENTER
    kicker.paragraph_format.space_after = Pt(18)
    set_font(kicker.add_run("FASE 9  |  MANUAL TECNICO"), size=11, color=PURPLE, bold=True)
    title = doc.add_paragraph()
    title.alignment = WD_ALIGN_PARAGRAPH.CENTER
    title.paragraph_format.space_after = Pt(8)
    set_font(title.add_run("LensClick"), size=34, color=NAVY, bold=True)
    subtitle = doc.add_paragraph()
    subtitle.alignment = WD_ALIGN_PARAGRAPH.CENTER
    subtitle.paragraph_format.space_after = Pt(22)
    set_font(subtitle.add_run("Documentacao Tecnica do Sistema"), size=18, color="4E70A8", bold=True)
    rule = doc.add_paragraph()
    paragraph_border_bottom(rule, PURPLE, "18")
    meta = doc.add_paragraph()
    meta.alignment = WD_ALIGN_PARAGRAPH.CENTER
    meta.paragraph_format.space_before = Pt(18)
    meta.paragraph_format.space_after = Pt(6)
    set_font(meta.add_run("Arquitetura | Front-end | Back-end | D1 | R2 | Seguranca | Testes"), size=10.5, color=MUTED)
    meta2 = doc.add_paragraph()
    meta2.alignment = WD_ALIGN_PARAGRAPH.CENTER
    set_font(meta2.add_run("Versao 1.0.0 - 2 de agosto de 2026"), size=10.5, color=MUTED)
    url = doc.add_paragraph()
    url.alignment = WD_ALIGN_PARAGRAPH.CENTER
    url.paragraph_format.space_before = Pt(18)
    set_font(url.add_run("lensclick.renato-aparecido-business.workers.dev"), size=10.5, color=PURPLE, bold=True)
    doc.add_page_break()

    heading = doc.add_paragraph(style="Heading 1")
    heading.add_run("Como usar este manual")
    for text in (
        "Use as secoes 1 e 2 para apresentar o produto rapidamente.",
        "Use as secoes 3 a 14 para explicar as decisoes tecnicas.",
        "Use as secoes 15 a 19 para responder perguntas, demonstrar e ensaiar.",
        "Funcionalidades futuras aparecem separadas do que ja esta implementado.",
    ):
        p = doc.add_paragraph(style="List Bullet")
        add_rich_text(p, text)
    toc = doc.add_paragraph()
    toc.paragraph_format.space_before = Pt(12)
    toc.paragraph_format.space_after = Pt(8)
    set_font(toc.add_run("Conteudo"), size=13, color=NAVY, bold=True)
    sections = [
        "1-3  Produto e arquitetura", "4-6  Repositorio, front-end e Worker", "7-10  Autenticacao, dados, R2 e seguranca",
        "11-14  UX, testes, operacao e decisoes", "15-19  Roadmap, perguntas, demonstracao e glossario", "20  Fontes internas"
    ]
    for item in sections:
        p = doc.add_paragraph(style="List Bullet")
        add_rich_text(p, item)
    doc.add_page_break()


def table_widths(headers):
    count = len(headers)
    if count == 2:
        return [2700, 6660]
    if count == 3:
        return [2200, 2400, 4760]
    if count == 4:
        return [1800, 1800, 2100, 3660]
    if count == 5:
        return [1050, 2050, 1450, 2500, 2310]
    return [9360 // count] * count


def add_table(doc, rows):
    headers = rows[0]
    table = doc.add_table(rows=len(rows), cols=len(headers))
    table.style = "Table Grid"
    set_table_geometry(table, table_widths(headers))
    for row_index, values in enumerate(rows):
        for col_index, value in enumerate(values):
            cell = table.cell(row_index, col_index)
            cell.vertical_alignment = WD_ALIGN_VERTICAL.CENTER
            if row_index == 0:
                shade(cell._tc, LIGHT_BLUE)
            paragraph = cell.paragraphs[0]
            paragraph.paragraph_format.space_before = Pt(0)
            paragraph.paragraph_format.space_after = Pt(0)
            paragraph.paragraph_format.line_spacing = 1.08
            add_rich_text(paragraph, value, size=9.2 if len(headers) >= 4 else 9.8, color=NAVY if row_index == 0 else INK)
            for run in paragraph.runs:
                if row_index == 0:
                    run.bold = True
    after = doc.add_paragraph()
    after.paragraph_format.space_after = Pt(2)


def parse_markdown(doc: Document, diagrams: list[Path]):
    lines = SOURCE.read_text(encoding="utf-8").splitlines()
    start = next(i for i, line in enumerate(lines) if line.startswith("## 1."))
    lines = lines[start:]
    diagram_index = 0
    index = 0
    first_h1 = True
    while index < len(lines):
        line = lines[index]
        if line.startswith("```mermaid"):
            index += 1
            while index < len(lines) and not lines[index].startswith("```"):
                index += 1
            image_path = diagrams[diagram_index]
            diagram_index += 1
            paragraph = doc.add_paragraph()
            paragraph.alignment = WD_ALIGN_PARAGRAPH.CENTER
            paragraph.paragraph_format.space_before = Pt(6)
            paragraph.paragraph_format.space_after = Pt(8)
            paragraph.add_run().add_picture(str(image_path), width=Inches(6.25))
            index += 1
            continue
        if line.startswith("```"):
            index += 1
            code = []
            while index < len(lines) and not lines[index].startswith("```"):
                code.append(lines[index])
                index += 1
            paragraph = doc.add_paragraph()
            paragraph.paragraph_format.left_indent = Inches(0.12)
            paragraph.paragraph_format.right_indent = Inches(0.12)
            paragraph.paragraph_format.space_before = Pt(4)
            paragraph.paragraph_format.space_after = Pt(8)
            paragraph.paragraph_format.line_spacing = 1.05
            shade(paragraph._p, LIGHT)
            run = paragraph.add_run("\n".join(code))
            set_font(run, name="Consolas", size=8.3, color="332B45")
            index += 1
            continue
        if line.startswith("## "):
            if not first_h1:
                doc.add_page_break()
            first_h1 = False
            p = doc.add_paragraph(style="Heading 1")
            add_rich_text(p, line[3:], size=16, color=PURPLE)
            index += 1
            continue
        if line.startswith("### "):
            p = doc.add_paragraph(style="Heading 2")
            add_rich_text(p, line[4:], size=13, color="4E70A8")
            index += 1
            continue
        if line.startswith("#### "):
            p = doc.add_paragraph(style="Heading 3")
            add_rich_text(p, line[5:], size=12, color="394A6A")
            index += 1
            continue
        if line.startswith("> "):
            p = doc.add_paragraph()
            p.paragraph_format.left_indent = Inches(0.18)
            p.paragraph_format.right_indent = Inches(0.18)
            p.paragraph_format.space_before = Pt(6)
            p.paragraph_format.space_after = Pt(10)
            shade(p._p, LIGHT_BLUE)
            add_rich_text(p, line[2:], color="394A6A")
            index += 1
            continue
        if line.startswith("| "):
            table_lines = []
            while index < len(lines) and lines[index].startswith("|"):
                table_lines.append(lines[index])
                index += 1
            parsed = []
            for row_index, table_line in enumerate(table_lines):
                cells = [cell.strip() for cell in table_line.strip().strip("|").split("|")]
                if row_index == 1 and all(re.fullmatch(r":?-{3,}:?", c) for c in cells):
                    continue
                parsed.append(cells)
            add_table(doc, parsed)
            continue
        if line.startswith("- "):
            p = doc.add_paragraph(style="List Bullet")
            add_rich_text(p, line[2:])
            index += 1
            continue
        if re.match(r"^\d+\. ", line):
            p = doc.add_paragraph(style="List Number")
            add_rich_text(p, re.sub(r"^\d+\. ", "", line))
            index += 1
            continue
        if line.startswith("**") and line.endswith("**"):
            p = doc.add_paragraph()
            p.paragraph_format.space_before = Pt(6)
            p.paragraph_format.space_after = Pt(4)
            add_rich_text(p, line, color=NAVY)
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
        p = doc.add_paragraph()
        add_rich_text(p, " ".join(paragraph_lines))


def build():
    diagrams = generate_diagrams()
    doc = Document()
    configure_document(doc)
    add_cover(doc)
    parse_markdown(doc, diagrams)
    properties = doc.core_properties
    properties.title = "LensClick - Documentacao Tecnica do Sistema"
    properties.subject = "Fase 9 - Arquitetura, codigo, dados, seguranca e apresentacao"
    properties.author = "Equipe LensClick"
    properties.keywords = "LensClick, Cloudflare Workers, D1, R2, DER, MER, arquitetura"
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    doc.save(OUTPUT)
    print(OUTPUT)


if __name__ == "__main__":
    build()
