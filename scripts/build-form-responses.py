# -*- coding: utf-8 -*-
"""Build the Word document with ready-to-paste Cajathon form responses."""

from pathlib import Path

from docx import Document
from docx.enum.section import WD_SECTION
from docx.enum.table import WD_CELL_VERTICAL_ALIGNMENT, WD_TABLE_ALIGNMENT
from docx.enum.text import WD_ALIGN_PARAGRAPH, WD_BREAK, WD_LINE_SPACING
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Inches, Pt, RGBColor


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "Respuestas_formulario_Cajathon_ClimaShield_AI_final.docx"

BLACK = "111111"
DARK = "23343A"
MUTED = "5F6B70"
RED = "C83A32"
PALE_RED = "F9E9E7"
PALE_BLUE = "EEF4F6"
LINE = "D5DDE0"
WHITE = "FFFFFF"


def set_cell_shading(cell, fill):
    tc_pr = cell._tc.get_or_add_tcPr()
    shd = tc_pr.find(qn("w:shd"))
    if shd is None:
        shd = OxmlElement("w:shd")
        tc_pr.append(shd)
    shd.set(qn("w:fill"), fill)


def set_cell_margins(cell, top=100, start=120, bottom=100, end=120):
    tc = cell._tc
    tc_pr = tc.get_or_add_tcPr()
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


def set_table_borders(table, color=LINE, size="6"):
    tbl = table._tbl
    tbl_pr = tbl.tblPr
    borders = tbl_pr.first_child_found_in("w:tblBorders")
    if borders is None:
        borders = OxmlElement("w:tblBorders")
        tbl_pr.append(borders)
    for edge in ("top", "left", "bottom", "right", "insideH", "insideV"):
        tag = f"w:{edge}"
        element = borders.find(qn(tag))
        if element is None:
            element = OxmlElement(tag)
            borders.append(element)
        element.set(qn("w:val"), "single")
        element.set(qn("w:sz"), size)
        element.set(qn("w:space"), "0")
        element.set(qn("w:color"), color)


def set_repeat_table_header(row):
    tr_pr = row._tr.get_or_add_trPr()
    tbl_header = OxmlElement("w:tblHeader")
    tbl_header.set(qn("w:val"), "true")
    tr_pr.append(tbl_header)


def set_font(run, name="Aptos", size=10.5, bold=False, color=BLACK, italic=False):
    run.font.name = name
    run._element.rPr.rFonts.set(qn("w:ascii"), name)
    run._element.rPr.rFonts.set(qn("w:hAnsi"), name)
    run.font.size = Pt(size)
    run.font.bold = bold
    run.font.italic = italic
    run.font.color.rgb = RGBColor.from_string(color)


def set_para(paragraph, before=0, after=7, line=1.12, keep=False):
    fmt = paragraph.paragraph_format
    fmt.space_before = Pt(before)
    fmt.space_after = Pt(after)
    fmt.line_spacing = line
    fmt.keep_with_next = keep
    return paragraph


def add_text(paragraph, text, bold=False, italic=False, color=BLACK, size=10.5):
    run = paragraph.add_run(text)
    set_font(run, size=size, bold=bold, color=color, italic=italic)
    return run


def add_body(doc, text, after=8):
    p = doc.add_paragraph()
    set_para(p, after=after)
    add_text(p, text)
    return p


def add_bullet(doc, text, level=0):
    p = doc.add_paragraph(style="List Bullet" if level == 0 else "List Bullet 2")
    set_para(p, after=4)
    add_text(p, text)
    return p


def add_label(doc, label, text=None):
    p = doc.add_paragraph()
    set_para(p, before=5, after=5, keep=True)
    add_text(p, label, bold=True, color=DARK, size=10)
    if text:
        add_text(p, "  " + text, color=MUTED, size=10)
    return p


def add_ready_answer(doc, paragraphs):
    add_label(doc, "Texto listo para pegar")
    for text in paragraphs:
        add_body(doc, text, after=7)


def add_question(doc, number, question, selection=None, answer=None, note=None):
    p = doc.add_paragraph()
    set_para(p, before=13, after=4, keep=True)
    add_text(p, number + "  ", bold=True, color=RED, size=12)
    add_text(p, question, bold=True, color=BLACK, size=12)
    if selection:
        add_label(doc, "Selección recomendada", selection)
    if answer:
        add_ready_answer(doc, answer)
    if note:
        add_label(doc, "Nota de carga", note)


def add_heading(doc, text, level=1):
    p = doc.add_paragraph(style=f"Heading {level}")
    set_para(p, before=14 if level == 1 else 10, after=7, keep=True)
    run = p.add_run(text)
    set_font(run, size=17 if level == 1 else 12.5, bold=True, color=BLACK)
    return p


def add_step_intro(doc, step, title, description):
    p = doc.add_paragraph()
    set_para(p, before=15, after=3, keep=True)
    add_text(p, f"PASO {step} DE 6", bold=True, color=RED, size=9.5)
    add_heading(doc, title, 1)
    add_body(doc, description, after=12)


def add_page_break(doc):
    p = doc.add_paragraph()
    p.add_run().add_break(WD_BREAK.PAGE)


def add_table(doc, rows, widths=None, header=True):
    table = doc.add_table(rows=len(rows), cols=len(rows[0]))
    table.alignment = WD_TABLE_ALIGNMENT.CENTER
    table.autofit = True
    set_table_borders(table)
    for r_idx, row_data in enumerate(rows):
        row = table.rows[r_idx]
        if header and r_idx == 0:
            set_repeat_table_header(row)
        for c_idx, value in enumerate(row_data):
            cell = row.cells[c_idx]
            cell.vertical_alignment = WD_CELL_VERTICAL_ALIGNMENT.CENTER
            set_cell_margins(cell)
            if header and r_idx == 0:
                set_cell_shading(cell, DARK)
            elif r_idx % 2 == 0:
                set_cell_shading(cell, PALE_BLUE)
            p = cell.paragraphs[0]
            set_para(p, after=0, line=1.05)
            add_text(p, value, bold=(header and r_idx == 0), color=WHITE if header and r_idx == 0 else BLACK, size=9.4)
            if widths:
                cell.width = Inches(widths[c_idx])
    doc.add_paragraph().paragraph_format.space_after = Pt(2)
    return table


def configure_styles(doc):
    styles = doc.styles
    normal = styles["Normal"]
    normal.font.name = "Aptos"
    normal._element.rPr.rFonts.set(qn("w:ascii"), "Aptos")
    normal._element.rPr.rFonts.set(qn("w:hAnsi"), "Aptos")
    normal.font.size = Pt(10.5)
    normal.font.color.rgb = RGBColor.from_string(BLACK)
    normal.paragraph_format.space_after = Pt(7)
    normal.paragraph_format.line_spacing = 1.12
    for style_name in ("Title", "Subtitle", "Heading 1", "Heading 2", "Heading 3"):
        style = styles[style_name]
        style.font.name = "Aptos Display" if style_name in ("Title", "Heading 1") else "Aptos"
        style._element.rPr.rFonts.set(qn("w:ascii"), style.font.name)
        style._element.rPr.rFonts.set(qn("w:hAnsi"), style.font.name)
        style.font.color.rgb = RGBColor.from_string(BLACK)
        # Word's built-in Title style may carry a blue paragraph border.
        # Remove it so the document title remains plain black typography.
        p_pr = style._element.pPr
        if p_pr is not None:
            p_bdr = p_pr.find(qn("w:pBdr"))
            if p_bdr is not None:
                p_pr.remove(p_bdr)
    styles["Title"].font.size = Pt(25)
    styles["Title"].font.bold = True
    styles["Subtitle"].font.size = Pt(13)
    styles["Subtitle"].font.color.rgb = RGBColor.from_string(MUTED)


def build_document():
    doc = Document()
    configure_styles(doc)
    section = doc.sections[0]
    section.page_width = Inches(8.5)
    section.page_height = Inches(11)
    section.top_margin = Inches(0.7)
    section.bottom_margin = Inches(0.7)
    section.left_margin = Inches(0.78)
    section.right_margin = Inches(0.78)

    # Cover and quick reference.
    title = doc.add_paragraph(style="Title")
    set_para(title, before=34, after=8, keep=True)
    add_text(title, "Respuestas para el formulario del Cajathon", bold=True, size=25)
    subtitle = doc.add_paragraph(style="Subtitle")
    set_para(subtitle, after=18, keep=True)
    add_text(subtitle, "Inteligencia Predictiva de Riesgo Climático y Crediticio para Microfinanzas", size=13, color=MUTED)

    add_body(doc, "Documento de apoyo para completar la propuesta RIE-01. Incluye selecciones sugeridas y textos redactados en primera persona plural, listos para copiar y pegar en cada campo del formulario.", after=13)

    add_heading(doc, "Resumen de la propuesta", 1)
    add_table(doc, [
        ["Campo", "Respuesta"],
        ["Equipo", "SinergIA"],
        ["Desafío", "RIE-01 - Inteligencia Predictiva de Riesgo Climático y Crediticio para Microfinanzas"],
        ["Nombre de la solución", "Jharonaky"],
        ["Nombre técnico del prototipo", "ClimaShield AI"],
        ["Ciudad y perfil", "Lima · estudiantes de Ingeniería de Sistemas"],
        ["Base de datos", "Cartera, pagos y perfiles completamente sintéticos; fuentes climáticas públicas con procedencia"],
        ["Punto de partida", "Desarrollo a partir de soluciones o componentes preexistentes, declarados como base previa al presencial"],
    ], widths=[1.65, 5.25])

    add_heading(doc, "Integrantes registrados", 1)
    add_table(doc, [
        ["Integrante", "Rol o especialidad"],
        ["Benjamín Francis Arancibia Ynga", "Coordinación · innovación y negocio"],
        ["Anthony Josue Erazo Llacsahuanga", "Desarrollo tecnológico · integración, cloud y DevOps"],
        ["Sebastian Sandy Martinez Quisocala", "Desarrollo tecnológico · datos, machine learning y automatización"],
        ["Jharolym Friendly Paucarcaja Ramos", "Desarrollo tecnológico · desarrollo web, backend y APIs"],
    ], widths=[2.9, 4.0])

    add_body(doc, "Criterio de consistencia: la propuesta presenta a Jharonaky como el nombre visible del formulario y a ClimaShield AI como el nombre técnico del prototipo. Si el equipo decide usar una sola marca, reemplacen ambos nombres de forma uniforme antes de enviar.", after=12)

    add_heading(doc, "Antes de pegar las respuestas", 1)
    add_bullet(doc, "Conservar el desafío RIE-01 y el nombre Jharonaky si ya están registrados en la plataforma.")
    add_bullet(doc, "En el paso 4, marcar el desarrollo a partir de soluciones o componentes preexistentes. La base técnica actual fue preparada antes de las jornadas presenciales y debe declararse así.")
    add_bullet(doc, "Usar los resultados numéricos como referencias de una demostración sintética, nunca como ahorro real, probabilidad institucional de mora o desempeño productivo.")
    add_bullet(doc, "No adjuntar claves, archivos .env, datos de clientes ni capturas que expongan credenciales.")

    add_page_break(doc)

    # Step 1.
    add_step_intro(doc, 1, "Identificación de la propuesta", "Seleccionen el desafío y asignen el nombre visible de la solución.")
    add_question(doc, "1.1", "Desafío seleccionado", selection="RIE-01 - Inteligencia Predictiva de Riesgo Climático y Crediticio para Microfinanzas", note="La pregunta reto asociada es: ¿Cómo podríamos anticipar el impacto de eventos climáticos sobre los negocios de nuestros clientes, identificando aquellos con mayor vulnerabilidad económica y crediticia, para generar alertas tempranas y decisiones preventivas en los clientes de la cartera de Caja Trujillo?")
    add_question(doc, "1.2", "Nombre de la solución", selection="Jharonaky", note="El prototipo se presenta técnicamente como ClimaShield AI. Si la plataforma permite una descripción adicional, puede indicarse: Jharonaky es un prototipo de ClimaShield AI para prevención climática por evento.")

    add_heading(doc, "Presentación breve sugerida", 2)
    add_body(doc, "Jharonaky ayuda a Caja Trujillo a pasar de una alerta climática general a una cartera priorizada para revisión humana. Integra avisos y cartografía climática con una cartera ficticia, estima exposición, muestra un indicador climático explicativo y un modelo experimental separado, calcula escenarios financieros y propone acciones operativas sujetas a presupuesto, tiempo y aprobación del equipo responsable.")

    add_page_break(doc)

    # Step 2.
    add_step_intro(doc, 2, "Concepto de solución", "Describan qué hace la solución, cómo funciona y qué la diferencia.")
    add_question(doc, "2.1", "¿En qué consiste su solución y cómo aborda la problemática del desafío?", answer=[
        "Jharonaky es un prototipo de apoyo a la prevención climática para Caja Trujillo. Su objetivo es ayudar a los equipos de riesgo y negocio a entender qué parte de una cartera podría estar expuesta ante un evento climático y qué casos conviene revisar primero. La solución no reemplaza el criterio del analista ni toma decisiones crediticias automáticas: organiza evidencia, prioriza la revisión y deja trazabilidad de los supuestos.",
        "El prototipo conecta avisos de SENAMHI y cartografía de susceptibilidad de CENEPRED con una cartera completamente ficticia de micro y pequeñas empresas. Para cada negocio, relaciona ubicación, exposición espacial, comportamiento de pagos sintético y sensibilidad sectorial. Luego muestra por separado un índice climático explicativo y una estimación experimental de entrada en atraso mayor a 30 días dentro de 90 días. Esta separación evita presentar el clima como una probabilidad de mora y permite interpretar mejor cada resultado.",
        "Con esa evidencia, Jharonaky modela el impacto financiero bajo supuestos explícitos y propone un plan de atención revisable, como una reprogramación de cuotas o una visita de liquidez. Los casos con información insuficiente, ubicación desconocida o deterioro previo se identifican para revisión o derivación. La propuesta responde así a la necesidad de anticipar impactos sin convertir un escenario experimental en una promesa de pérdida, ahorro o decisión institucional."
    ])
    add_question(doc, "2.2", "¿Cómo funcionaría su solución?", answer=[
        "El flujo comienza con la recepción o selección de un aviso climático y la creación de una versión del evento con su fuente, fecha, vigencia y geometría. La solución combina esa evidencia con cartografía oficial y una cartera sintética previamente versionada. La relación espacial se calcula en PostgreSQL/PostGIS; los bordes se consideran incluidos y una ubicación ausente queda marcada como UNKNOWN, sin inventar una exposición.",
        "Después se construye un corte de cartera anterior al evento y se consulta la historia mensual ficticia de pagos y endeudamiento. El motor deduplica por negocio antes de sumar créditos, estima la exposición y calcula dos señales separadas: un índice climático de referencia y un modelo logístico experimental para atraso mayor a 30 días en 90 días. El usuario puede consultar los factores, la evidencia y los grupos de revisión asociados a cada resultado.",
        "Con las señales y los supuestos financieros, el sistema simula escenarios pareados de caja, pérdida modelada y efecto hipotético de acciones. Un optimizador compara alternativas bajo presupuesto, minutos disponibles y cobertura mínima, y genera propuestas que deben ser revisadas por una persona. Finalmente, guarda el análisis, crea una alerta interna y permite registrar el seguimiento. Gemini puede redactar un informe contextual desde NestJS usando herramientas de lectura acotadas; no ejecuta SQL libre, no contacta clientes, no aprueba acciones y no calcula importes."
    ])
    add_question(doc, "2.3", "¿Qué diferencia su solución de otras alternativas existentes?", answer=[
        "La principal diferencia es que Jharonaky no se queda en un mapa de amenazas ni en un score aislado. Integra el recorrido completo aviso, exposición, evaluación experimental, impacto financiero, plan operativo, alerta interna y revisión humana. De esta forma, el equipo puede entender qué ocurrió, qué supuestos se usaron y qué decisión queda pendiente.",
        "También hace explícitas distinciones que suelen confundirse: el índice climático no es una probabilidad de mora; el saldo expuesto no es una pérdida; la pérdida modelada no es una provisión regulatoria; y una acción propuesta no es una facilidad aprobada. La plataforma conserva la procedencia de las fuentes, versiona los cortes y modelos, identifica datos faltantes y evita duplicar el saldo cuando un negocio tiene más de un crédito o peligro.",
        "El valor adicional está en convertir una alerta amplia en una agenda priorizada y explicable, con restricciones de presupuesto y tiempo. La demostración usa datos sintéticos reproducibles, simulaciones pareadas y revisión autenticada para que el equipo pueda probar el flujo sin exponer información de clientes. La solución está diseñada para aprender con evidencia institucional futura, no para afirmar que ya existe eficacia causal o rendimiento productivo."
    ])
    add_question(doc, "2.4", "Material visual complementario", selection="Adjuntar hasta tres capturas del prototipo, si la plataforma lo permite", note="Sugerencia de archivos: vista Eventos y alertas; vista Impacto de cartera; vista Fuentes. Los materiales deben mostrar la interfaz sin credenciales, tokens ni datos reales.")
    add_question(doc, "2.5", "Enlace complementario", selection="Dejar vacío si no cuentan con un enlace público autorizado", note="No colocar rutas locales, enlaces inventados ni repositorios privados sin permiso. Si después tienen un enlace real a un prototipo o repositorio, añadirlo y verificar que pueda ser consultado por los evaluadores.")

    add_page_break(doc)

    # Step 3.
    add_step_intro(doc, 3, "Impacto esperado", "Expliquen el valor que generaría la propuesta para Caja Trujillo y cómo se evaluaría.")
    add_question(doc, "3.1", "¿Qué impacto generaría su solución y cómo contribuiría al resultado esperado del desafío?", answer=[
        "Jharonaky podría reducir el tiempo de preparación de una revisión climática y mejorar la calidad de la conversación entre riesgo, negocio y operaciones. En lugar de revisar una alerta regional sin contexto, el equipo tendría una lista priorizada de negocios, la evidencia espacial que sustenta la exposición, los factores del modelo, el impacto financiero modelado y las acciones posibles bajo un presupuesto definido. Esto favorece decisiones preventivas más ordenadas y permite dejar registro de qué se revisó, quién lo aprobó y qué resultado se obtuvo.",
        "Como referencia de la ejecución sintética actual, la demostración contiene 1,000 negocios y 1,001 créditos ficticios. En un evento reproducido se identificaron 719 negocios con exposición espacial y un saldo expuesto deduplicado de S/ 20,070,200.00; este saldo representa la magnitud de la cartera en riesgo de escenario y no es una pérdida. El motor produjo 13 propuestas dentro de un presupuesto sintético de S/ 1,500 y 480 minutos, utilizando S/ 1,480 y 375 minutos.",
        "En esa misma ejecución, la pérdida modelada pasó de S/ 856,139.86 sin plan a S/ 844,906.79 con plan, una reducción bruta modelada de S/ 11,233.07 y neta de S/ 9,753.07 después del costo operativo. Estos valores no son ahorros observados ni resultados de Caja Trujillo; sirven para verificar que el prototipo concilia cifras, compara alternativas y respeta restricciones. El impacto real deberá medirse en una etapa posterior con datos autorizados, validación del modelo, seguimiento de acciones y comparación contra resultados observados."
    ])
    add_heading(doc, "Supuestos que acompañan la estimación", 2)
    add_bullet(doc, "La cartera, la historia de pagos, los costos, la severidad y los efectos de las acciones son sintéticos.")
    add_bullet(doc, "Las simulaciones expresan escenarios y percentiles; no son intervalos de confianza ni una probabilidad de mora institucional.")
    add_bullet(doc, "La pérdida de escenario no es una provisión regulatoria ni un resultado contable certificado.")
    add_bullet(doc, "El beneficio se calcula para comparar alternativas dentro de la demo, no para prometer eficacia causal.")

    add_page_break(doc)

    # Step 4.
    add_step_intro(doc, 4, "Enfoque tecnológico", "Describan la arquitectura, el punto de partida y los riesgos técnicos.")
    add_question(doc, "4.1", "¿Cuál será el enfoque tecnológico de su solución?", answer=[
        "La solución utiliza una arquitectura web separada por responsabilidades. El frontend se construye con React 19, TypeScript y Vite, y presenta cinco vistas operativas: Eventos y alertas, Clientes, Impacto de cartera, Plan y seguimiento, y Fuentes. El backend se implementa con NestJS 11 y TypeScript; valida contratos con Zod y accede a PostgreSQL mediante consultas parametrizadas. La interfaz no accede directamente a credenciales ni a la base de datos.",
        "La persistencia usa PostgreSQL 16 con PostGIS para eventos, geometrías, exposición y versiones. El despliegue local se ejecuta en Docker y el destino previsto es Supabase mediante variables de entorno, manteniendo PostGIS y conexiones seguras. Los importes se calculan con Decimal.js y se persisten como NUMERIC; la política de asignación usa centavos y BigInt para evitar errores de redondeo. Las migraciones SQL son versionadas, verifican checksum y se aplican en transacciones sin sincronización automática ni reset destructivo.",
        "El modelo experimental es una regresión logística entrenada e inferida en TypeScript con datos sintéticos reproducibles y artefacto versionado. La simulación de escenarios mantiene un componente regional compartido y reporta percentiles y brechas de caja como referencias de escenario. Gemini se consume únicamente desde NestJS mediante el SDK oficial de Google, con herramientas de lectura validadas y acotadas; el asistente no recibe SQL libre, no abre URLs arbitrarias, no aprueba acciones, no contacta personas y no registra secretos.",
        "Para mapas y capas se usa MapLibre con cartografía cuya atribución y condiciones de uso deben conservarse. CENEPRED y SENAMHI se muestran con procedencia y vigencia; sus condiciones de uso, leyendas y actualizaciones deben confirmarse antes de un piloto. Se mantendrán fuera de Git las variables .env y cualquier clave de proveedor. No se reintroducirán una API Python, SQLite ni claves de Gemini en el frontend."
    ])
    add_question(doc, "4.2", "¿Cuál será el punto de partida para construir su solución?", selection="Desarrollo a partir de soluciones o componentes preexistentes", answer=[
        "Partiremos de una base técnica preexistente que incluye el frontend React, la API NestJS, la persistencia PostgreSQL/PostGIS, el flujo de eventos y análisis, el modelo sintético, el optimizador, las pruebas y la documentación. Esta base se declara como previa a las jornadas presenciales. Durante el hackathon se propone realizar una adaptación nueva y verificable sobre esa base, con alcance, commits y evidencias diferenciados.",
        "La adaptación presencial se enfocará en validar el recorrido con el Challenge Owner, ajustar la narrativa y los parámetros del caso de uso, reforzar la evidencia de resultados y dejar una demostración reproducible. No presentaremos como avance presencial componentes que ya existían antes del evento."
    ], note="Si la plataforma muestra opciones de radio, marcar la segunda opción. Esta selección es la más consistente con la base técnica actualmente disponible y con la obligación de declarar componentes previos.")
    add_question(doc, "4.3", "¿Identifican alguna limitación o riesgo técnico relevante para el desarrollo de su solución?", answer=[
        "El primer riesgo es la validez externa: el modelo, la cartera, la historia de pagos, los costos y los efectos de las acciones son sintéticos. Las métricas actuales muestran una señal experimental, no una capacidad validada para clientes reales. Lo abordaremos manteniendo separación temporal, evaluación con clientes no vistos, métricas por grupo, ficha de modelo y una revisión humana antes de cualquier uso operativo.",
        "El segundo riesgo es la calidad y vigencia de las fuentes climáticas. La cartografía de CENEPRED requiere revisión humana y confirmación de leyenda; la vigencia de SENAMHI se trata como una regla que debe validarse. Mitigaremos mostrando fuente, versión, fecha, estado de disponibilidad y etiqueta de reproducción histórica cuando corresponda. Una caída o dato vacío no se convertirá en una alerta vigente.",
        "También existen riesgos de integración, rendimiento y seguridad: el procesamiento completo puede tardar varios segundos, MapLibre puede depender de WebGL o teselas, la autenticación actual es local y Gemini puede no estar disponible. El prototipo conserva una ruta determinista sin IA, permite continuar con tablas sin mapa, limita las herramientas del asistente, no registra secretos y mantiene las acciones como borradores sujetos a autorización. Quedan fuera del prototipo la autenticación institucional, la concurrencia productiva, el core bancario y los contactos externos."
    ])

    add_page_break(doc)

    # Step 5.
    add_step_intro(doc, 5, "Alcance del prototipo", "Definan qué construirán, qué demostrarán y qué quedará para una etapa posterior.")
    add_question(doc, "5.1", "¿Qué construirán durante el hackathon?", answer=[
        "Durante el hackathon construiremos una adaptación demostrable de la base previa, enfocada en un caso de uso acordado con Caja Trujillo. La funcionalidad crítica será recorrer de principio a fin un evento de lluvia o inundación con cartera sintética: seleccionar el evento, revisar su procedencia, identificar exposición, observar las dos señales separadas, consultar el impacto modelado, comparar alternativas y dejar una propuesta de atención para revisión humana.",
        "La adaptación incluirá el ajuste de la historia de usuario y de los parámetros visibles para el caso elegido, la preparación de un conjunto de evidencia reproducible, la revisión de etiquetas y supuestos, y una ruta de demostración que pueda repetirse sin depender de una llamada real a Gemini. También registraremos qué componentes son previos y qué cambios se incorporan durante las jornadas mediante commits y evidencias nuevas.",
        "Al finalizar, el entregable esperado será una demostración operativa y entendible, no un sistema productivo. La cartera seguirá siendo ficticia; cualquier decisión de atención quedará como propuesta revisable y no ejecutará contratos, pagos, reprogramaciones ni comunicaciones externas."
    ])
    add_question(doc, "5.2", "¿Qué resultado funcional esperan demostrar al finalizar el hackathon?", answer=[
        "Esperamos demostrar un caso representativo en el que un aviso climático se convierte en un evento trazable y, a partir de él, el equipo puede revisar una cartera sintética priorizada. La demostración mostrará la fuente y vigencia del evento, los negocios expuestos, la distinción entre índice climático, estimación experimental y saldo expuesto, el impacto financiero bajo supuestos explícitos y dos alternativas de plan con presupuesto y tiempo limitados.",
        "La validación funcional consistirá en repetir el recorrido con un dataset controlado, conciliar los totales entre API e interfaz, comprobar que un negocio con varios créditos no duplique el saldo, verificar que una ubicación ausente quede como UNKNOWN y revisar que los casos ya deteriorados se deriven. También se probará que las propuestas requieran autorización, que el seguimiento quede auditado y que el recorrido pueda continuar con el informe determinista cuando Gemini no esté disponible.",
        "El resultado no se considerará evidencia de ahorro, precisión institucional ni eficacia causal. Se considerará exitoso si el equipo puede explicar de dónde sale cada cifra, qué incertidumbre tiene, qué acción se propone y qué parte de la decisión sigue siendo humana."
    ])
    add_question(doc, "5.3", "¿Qué funcionalidades o capacidades quedarán fuera del alcance del prototipo?", answer=[
        "Quedarán fuera del alcance la conexión con una cartera real o con datos personales, la aprobación de créditos, la ejecución de contratos, el cálculo de provisiones regulatorias y cualquier envío automático a clientes. Las propuestas de reprogramación o visita serán únicamente borradores para revisión; no constituyen facilidades preaprobadas ni compromisos de la Caja.",
        "Tampoco construiremos en esta etapa autenticación institucional con permisos por rol, integración con el core bancario, fondeo de contingencia, canales de WhatsApp, SMS, correo o call center, ni un despliegue productivo en Supabase. No se incorporarán importadores generales de CSV o Parquet, operación concurrente certificada, nuevos segmentos validados ni una evaluación causal de la eficacia de las intervenciones.",
        "La cobertura climática se mantendrá acotada a los eventos y fuentes disponibles para la demostración. Sequía, friaje y temperaturas extremas quedan para una fase posterior. También quedan fuera el chat abierto, las consultas SQL libres, las URLs arbitrarias y cualquier automatización que publique una fuente oficial sin revisión humana."
    ])

    add_page_break(doc)

    # Step 6.
    add_step_intro(doc, 6, "Datos e insumos", "Declaren qué datos necesitan para construir y validar el prototipo.")
    add_question(doc, "6.1", "¿Qué tipo de requerimiento de datos e insumos tiene su propuesta?", selection="No requerimos datos ni insumos", answer=[
        "Podemos construir y demostrar la funcionalidad crítica con datos sintéticos reproducibles y con fuentes públicas de clima y cartografía, sin solicitar una cartera real ni información personal. La demostración utilizará negocios, créditos, historial de pagos y perfiles de endeudamiento ficticios, además de snapshots versionados de SENAMHI y recortes de cartografía de CENEPRED con su procedencia.",
        "Si Caja Trujillo desea aportar orientación sobre el proceso, criterios de priorización o condiciones de uso de sus fuentes, esa información sería deseable para una etapa posterior, pero no es indispensable para construir el prototipo ni para validar su recorrido funcional. Cualquier dato institucional futuro deberá entregarse con autorización, minimización, controles de acceso y condiciones de seguridad previamente acordadas."
    ], note="Marcar la primera opción. No seleccionar un requerimiento indispensable: la solución fue diseñada para funcionar con datos sintéticos y fuentes públicas, evitando que la entrega de información de Caja Trujillo sea una condición de éxito.")

    add_heading(doc, "Revisión final antes de enviar", 1)
    add_body(doc, "Usen esta lista como control de consistencia después de copiar las respuestas en la plataforma:")
    for item in [
        "RIE-01 está seleccionado y el nombre visible es Jharonaky.",
        "Las respuestas de los pasos 2 al 5 no presentan el índice climático como probabilidad de mora ni el saldo expuesto como pérdida.",
        "El paso 4.2 declara componentes preexistentes y distingue las adaptaciones nuevas propuestas para el presencial.",
        "El paso 5 delimita el prototipo y no promete integración productiva, cartera real, contactos externos ni ahorros observados.",
        "El paso 6 marca que no se requieren datos ni insumos indispensables.",
        "Los adjuntos visuales no incluyen credenciales, archivos .env, información personal ni datos reales.",
        "Los números de impacto aparecen como referencias sintéticas y están acompañados por sus supuestos y limitaciones.",
        "Si se agrega un enlace, es real, accesible para evaluadores y no expone información privada."
    ]:
        add_bullet(doc, item)

    add_heading(doc, "Mensaje corto para la presentación", 1)
    add_body(doc, "Jharonaky convierte una alerta climática en una agenda de revisión para la cartera: muestra dónde está la exposición, qué señales experimentales la acompañan, cuánto representa en un escenario y qué acciones podrían evaluarse con recursos limitados. Todo queda trazable, con datos sintéticos, fuentes identificadas y decisión final en manos de las personas responsables.")

    # Keep the document metadata neutral and avoid exposing machine paths.
    props = doc.core_properties
    props.title = "Respuestas para el formulario del Cajathon"
    props.subject = "Contenido listo para completar la propuesta RIE-01"
    props.author = "Equipo SinergIA"
    props.keywords = "Cajathon, RIE-01, Jharonaky, ClimaShield AI, microfinanzas"
    props.comments = ""

    doc.save(OUTPUT)
    print(OUTPUT)


if __name__ == "__main__":
    build_document()
