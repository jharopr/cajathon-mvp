"""Genera el PDF desde el Markdown solicitado y el diagrama vectorial.
python -m pip install -r requirements-docs.txt
python scripts/build-documents.py
"""
from pathlib import Path
import html
import re
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'artifacts'
OUT.mkdir(exist_ok=True)
fonts=[(Path('C:/Windows/Fonts/segoeui.ttf'),Path('C:/Windows/Fonts/segoeuib.ttf')),
       (Path('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'),Path('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'))]
regular,bold=next((a,b) for a,b in fonts if a.exists() and b.exists())
pdfmetrics.registerFont(TTFont('Body',str(regular)))
pdfmetrics.registerFont(TTFont('BodyBold',str(bold)))
pdfmetrics.registerFontFamily('Body',normal='Body',bold='BodyBold',italic='Body',boldItalic='BodyBold')
INK=colors.HexColor('#19333b');GREEN=colors.HexColor('#147d64')
styles={
 'body':ParagraphStyle('body',fontName='Body',fontSize=9.5,leading=14,textColor=INK,spaceAfter=9),
 'h1':ParagraphStyle('h1',fontName='BodyBold',fontSize=32,leading=38,textColor=INK,spaceAfter=12),
 'h2':ParagraphStyle('h2',fontName='BodyBold',fontSize=20,leading=26,textColor=INK,spaceBefore=3,spaceAfter=16),
 'h3':ParagraphStyle('h3',fontName='BodyBold',fontSize=11.5,leading=16,textColor=GREEN,spaceBefore=12,spaceAfter=8,keepWithNext=True),
 'cell':ParagraphStyle('cell',fontName='Body',fontSize=8.5,leading=12,textColor=INK),
 'head':ParagraphStyle('head',fontName='BodyBold',fontSize=8.5,leading=12,textColor=colors.white),
}
def markup(text):
    text=html.escape(text)
    text=re.sub(r'\*\*(.+?)\*\*',r'<b>\1</b>',text)
    text=re.sub(r'`(.+?)`',r'\1',text)
    text=re.sub(r'\[([^\]]+)\]\((https?://[^)]+)\)',r'<link href="\2" color="#147d64">\1</link>',text)
    return text

def footer(canvas,doc):
    w,h=doc.pagesize
    canvas.setFillColor(GREEN);canvas.rect(0,h-10,w,10,fill=True,stroke=False)
    canvas.setFont('Body',8);canvas.setFillColor(colors.HexColor('#536771'))
    canvas.drawString(44,27,'ClimaShield AI · Cajathon 2026 · Clima oficial CENEPRED/SENAMHI · Cartera ficticia')
    canvas.drawRightString(w-44,27,f'{doc.page} / 5')

lines=(ROOT/'SOLUTION_CONCEPT.md').read_text(encoding='utf-8').splitlines()
story=[];i=0
while i<len(lines):
    line=lines[i].strip()
    if not line:i+=1;continue
    if line=='<!-- pagebreak -->':story.append(PageBreak());i+=1;continue
    if line.startswith('|'):
        rows=[]
        while i<len(lines) and lines[i].strip().startswith('|'):
            row=[c.strip() for c in lines[i].strip().strip('|').split('|')]
            if not all(re.fullmatch(r'[-: ]+',c) for c in row):rows.append(row)
            i+=1
        width=507.27
        table=Table([[Paragraph(markup(c),styles['head' if r==0 else 'cell']) for c in row] for r,row in enumerate(rows)],colWidths=[width*.29,width*.71],hAlign='LEFT',repeatRows=1)
        table.setStyle(TableStyle([('BACKGROUND',(0,0),(-1,0),INK),('ROWBACKGROUNDS',(0,1),(-1,-1),[colors.HexColor('#f1f6f5'),colors.white]),('VALIGN',(0,0),(-1,-1),'TOP'),('LEFTPADDING',(0,0),(-1,-1),10),('RIGHTPADDING',(0,0),(-1,-1),10),('TOPPADDING',(0,0),(-1,-1),8),('BOTTOMPADDING',(0,0),(-1,-1),8),('LINEBELOW',(0,0),(-1,-1),.4,colors.HexColor('#dce6e5'))]))
        story.extend([table,Spacer(1,10)]);continue
    match=re.match(r'^(#{1,3}) (.+)$',line)
    if match:
        story.append(Paragraph(markup(match[2]),styles['h'+str(len(match[1]))]));i+=1;continue
    paragraph=[line];i+=1
    while i<len(lines) and lines[i].strip() and not lines[i].startswith(('#','|','<!--')):
        paragraph.append(lines[i].strip());i+=1
    story.append(Paragraph(markup(' '.join(paragraph)),styles['body']))

path=OUT/'ClimaShield_AI_Solution_Concept.pdf'
SimpleDocTemplate(str(path),pagesize=(595.27,841.89),rightMargin=44,leftMargin=44,topMargin=38,bottomMargin=46,title='ClimaShield AI · Solution Concept',author='Equipo ClimaShield AI').build(story,onFirstPage=footer,onLaterPages=footer)

# Diagrama SVG autocontenido, editable y exportable sin dependencias de red.
layers=[('Fuentes de información','CENEPRED SHAPE 102 · Avisos SENAMHI (WFS) · Open-Meteo · Cartera ficticia','#6397b0'),
 ('Integración y datos','NestJS / Zod · Lector shapefile · Migraciones SQL · PostGIS / Supabase','#778b93'),
 ('Inteligencia climática','ST_Covers zonas y distritos · Vulnerabilidad · Índice explicable','#b18b35'),
 ('Inteligencia financiera','Decimal.js · Caja mensual · Optimización bajo recursos limitados','#ba7962'),
 ('Asistente de inteligencia artificial','Gemini · Herramientas validadas · Explicaciones con evidencia','#9777b2'),
 ('Aplicaciones de negocio','React / MapLibre · Riesgo · Simulador · Bandeja del coordinador','#409a86')]
svg=['<svg xmlns="http://www.w3.org/2000/svg" width="960" height="1010" viewBox="0 0 960 1010">',
 '<rect width="960" height="1010" fill="#f3f6f7"/>',
 '<g font-family="Segoe UI,Arial,sans-serif"><text x="48" y="53" font-size="28" fill="#19333b" font-weight="700">ClimaShield AI</text>',
 '<text x="48" y="83" font-size="16" fill="#536771">Arquitectura tecnológica · NestJS + React + PostgreSQL/PostGIS</text>']
for idx,(title,sub,color) in enumerate(layers):
    y=115+idx*126
    svg.extend([f'<rect x="48" y="{y}" width="864" height="102" rx="8" fill="white" stroke="#d6e2e5"/>',
        f'<rect x="48" y="{y}" width="5" height="102" rx="2" fill="{color}"/>',
        f'<circle cx="78" cy="{y+32}" r="5" fill="{color}"/>',
        f'<text x="96" y="{y+39}" font-size="21" fill="#19333b" font-weight="600">{html.escape(title)}</text>',
        f'<text x="78" y="{y+75}" font-size="16" fill="#536771">{html.escape(sub)}</text>'])
    if idx<5:svg.append(f'<path d="M480 {y+105}v18m-5-6 5 6 5-6" fill="none" stroke="#9eb4bc" stroke-width="2"/>')
svg.extend(['<rect x="48" y="886" width="864" height="74" rx="6" fill="#e7f3ec" stroke="#bcd8ca"/>',
 '<text x="480" y="916" text-anchor="middle" font-size="18" fill="#25674f" font-weight="600">Seguridad · Auditoría · Trazabilidad · Supervisión humana</text>',
 '<text x="480" y="941" text-anchor="middle" font-size="14" fill="#536771">Clima oficial con procedencia y vigencia. Cartera ficticia. Autenticación institucional: futura.</text></g></svg>'])
(ROOT/'docs'/'architecture.svg').write_text('\n'.join(svg),encoding='utf-8')

import fitz
pdf=fitz.open(path)
assert len(pdf)==5,f'PDF debe tener 5 páginas, obtuvo {len(pdf)}'
qa=OUT/'qa';qa.mkdir(exist_ok=True)
for n,page in enumerate(pdf):page.get_pixmap(matrix=fitz.Matrix(1.2,1.2)).save(qa/f'solution-page-{n+1}.png')
print(f'PDF verificado: {len(pdf)} páginas; SVG generado y páginas renderizadas en artifacts/qa.')

