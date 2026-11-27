# -*- coding: utf-8 -*-
from pathlib import Path
from zipfile import ZipFile
import re

from docx import Document


path = Path("Respuestas_formulario_Cajathon_ClimaShield_AI_final.docx")
doc = Document(path)
text = "\n".join(p.text for p in doc.paragraphs)
text += "\n" + "\n".join(cell.text for table in doc.tables for row in table.rows for cell in row.cells)
required = ["2.1", "2.2", "2.3", "3.1", "4.1", "4.2", "4.3", "5.1", "5.2", "5.3", "6.1"]
with ZipFile(path) as zf:
    styles = zf.read("word/styles.xml").decode("utf-8")
    title_style = re.search(r'<w:style[^>]*w:styleId="Title".*?</w:style>', styles, re.S)
    title_has_border = bool(title_style and re.search(r"<w:pBdr", title_style.group(0)))

print("paragraphs", len(doc.paragraphs))
print("tables", len(doc.tables))
print("characters", len(text))
print("steps", sum(1 for p in doc.paragraphs if p.text.startswith("PASO ")))
print("required_markers", all(marker in text for marker in required))
print("placeholders", re.findall(r"(?i)describan|mínimo 100|https://", text))
print("title_has_pBdr", title_has_border)
print("size_bytes", path.stat().st_size)
