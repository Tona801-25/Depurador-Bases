import os
import base64
import unicodedata
import io
import pandas as pd
import streamlit as st
import plotly.express as px
import numpy as np

from pathlib import Path
from st_aggrid import AgGrid, GridOptionsBuilder, GridUpdateMode
from datetime import datetime, timedelta

import depurador_bases

# ---------------------------------------------------------
# CONFIG DE PÁGINA
# ---------------------------------------------------------
st.set_page_config(
    page_title="DEPURADOR DE BASES",
    layout="wide",
    page_icon="iconoApp.png",
)

# Paleta de colores para los gráficos
OSAR_BLUE = "#042a51"
OSAR_BLUE_SOFT = "#00387c"
GOOD_GREEN = "#00c853"
NEUTRAL_GRAY = "#9e9e9e"
BAD_RED = "#d32f2f"
WARNING_ORANGE = "#ffb300"

STATE_COLOR_MAP = {
    "ANSWER": GOOD_GREEN,
    "NO ANSWER": NEUTRAL_GRAY,
    "BUSY": WARNING_ORANGE,
    "REJECTED": BAD_RED,
    "UNALLOCATED": BAD_RED,
}

TAG_COLOR_MAP = {
    "SEGUIR_INTENTANDO": OSAR_BLUE,
    "CONTACTADO": GOOD_GREEN,
    "INVALIDO": BAD_RED,
    "SOLO_BUZON": WARNING_ORANGE,
    "NO_ATIENDE": NEUTRAL_GRAY,
    "RECHAZA": "#e91e63",  # rojizo/rosa para rechazo
}

TURN_COLOR_MAP = {
    "Mañana": OSAR_BLUE,
    "Tarde": GOOD_GREEN,
}

# ---------------------------------------------------------
# FUNCIÓN PARA CARGAR CSS EXTERNO
# ---------------------------------------------------------
def cargar_css(path: str = "styles.css") -> None:
    if os.path.exists(path):
        with open(path, "r", encoding="utf-8") as f:
            css = f.read()
        st.markdown(f"<style>{css}</style>", unsafe_allow_html=True)
    else:
        st.warning(
            "No se encontró 'styles.css'. Se usará el estilo por defecto de Streamlit."
        )

# Cargamos los estilos
cargar_css()

# ---------------------------------------------------------
# ÍCONO PARA EL HEADER
# ---------------------------------------------------------
icon_b64 = ""
icon_path = Path("iconoApp.png")
if icon_path.exists():
    icon_b64 = base64.b64encode(icon_path.read_bytes()).decode()

# ---------------------------------------------------------
# HEADER (ÍCONO + TÍTULO)
# ---------------------------------------------------------
if icon_b64:
    st.markdown(
        f"""
        <div class="header-wrapper">
          <div class="header-inner">
            <img src="data:image/png;base64,{icon_b64}" alt="icono" style="width:64px;height:auto;" />
            <div>
              <h1 class="header-title">DEPURADOR DE BASES</h1>
              <p class="header-subtitle">
                Subí archivos de Neotel (CSV / TXT / XLS / XLSX) y filtrá como en Excel.
              </p>
            </div>
          </div>
        </div>
        """,
        unsafe_allow_html=True,
    )
else:
    st.markdown(
        """
        <div class="header-wrapper">
          <div class="header-inner">
            <div>
              <h1 class="header-title">DEPURADOR DE BASES</h1>
              <p class="header-subtitle">
                Subí archivos de Neotel (CSV / TXT / XLS / XLSX) y filtrá como en Excel.
              </p>
            </div>
          </div>
        </div>
        """,
        unsafe_allow_html=True,
    )

# ---------------------------------------------------------
# FUNCIONES AUXILIARES
# ---------------------------------------------------------
def normalizar_columna(col: str) -> str:
    col = col.strip()
    col = "".join(
        c
        for c in unicodedata.normalize("NFKD", col)
        if not unicodedata.combining(c)
    )
    col = col.upper()
    col = col.replace(" ", "").replace("-", "").replace("/", "")
    return col

def leer_archivo(file) -> pd.DataFrame | None:
    nombre = file.name.lower()
    try:
        if nombre.endswith((".csv", ".txt")):
            return pd.read_csv(file, sep=None, engine="python", encoding="latin1")
        if nombre.endswith((".xlsx", ".xlsm", ".xlsb")):
            return pd.read_excel(file, engine="openpyxl")
        if nombre.endswith(".xls"):
            return pd.read_excel(file, engine="xlrd")
    except Exception as e:
        st.error(f"❌ No se pudo leer {file.name}: {e}")
        return None

    st.error(f"❌ Formato no soportado: {file.name}")
    return None

def buscar_columna(df: pd.DataFrame, posibles: list[str]) -> str | None:
    for candidato in posibles:
        if candidato in df.columns:
            return candidato
    return None

@st.cache_data
def cargar_prefijos_tabla(
    ruta: str = "Prefijos interurbanos.csv",
) -> pd.DataFrame | None:
    """Carga el CSV de prefijos y agrega una columna PREFIJO_NUM solo dígitos."""
    if not os.path.exists(ruta):
        return None

    pref = None

    # 1) Probamos primero UTF-8 con BOM (lo más probable en tu archivo)
    for args in [
        dict(sep=None, engine="python", encoding="utf-8-sig"),
        dict(sep=";", encoding="utf-8-sig"),
        # 2) Si falla, probamos variantes en latin1
        dict(sep=None, engine="python", encoding="latin1"),
        dict(sep=";", encoding="latin1"),
        dict(encoding="latin1"),
    ]:
        try:
            pref = pd.read_csv(ruta, **args)
            break
        except Exception:
            continue

    if pref is None:
        return None

    # Limpiamos posibles espacios y el BOM de los nombres de columnas
    pref.columns = [c.strip() for c in pref.columns]
    pref = pref.rename(
        columns={
            "\ufeffPREFIJO": "PREFIJO",  # BOM al inicio
            "PREFIJO ": "PREFIJO",
            "ÁREA LOCAL": "AREA LOCAL",
            "ÁREA_LOCAL": "AREA LOCAL",
            "AREA_LOCAL": "AREA LOCAL",
        }
    )

    # Detectar columna de prefijo
    cols = list(pref.columns)
    col_pref = None

    # 1) Si existe "PREFIJO" exacto, usamos esa
    if "PREFIJO" in cols:
        col_pref = "PREFIJO"
    else:
        # 2) Buscar algo que contenga "PREF"
        for c in cols:
            if "PREF" in normalizar_columna(c):
                col_pref = c
                break
        # 3) Si no, usar la primera columna
        if col_pref is None and len(cols) > 0:
            col_pref = cols[0]

    if col_pref is None:
        return None

    # Normalizamos a string y creamos PREFIJO_NUM sólo con dígitos
    pref["PREFIJO_NUM"] = (
        pref[col_pref]
        .astype(str)
        .str.replace(r"\D", "", regex=True)
        .str.strip()
    )

    pref = pref[pref["PREFIJO_NUM"] != ""]
    if pref.empty:
        return None

    return pref

@st.cache_data
def obtener_lista_prefijos(ruta: str = "Prefijos interurbanos.csv") -> list[str] | None:
    """Devuelve lista de prefijos numéricos ordenados de mayor a menor longitud."""
    pref = cargar_prefijos_tabla(ruta)
    if pref is None or pref.empty:
        return None

    lista = (
        pref["PREFIJO_NUM"]
        .dropna()
        .astype(str)
        .str.strip()
        .unique()
        .tolist()
    )
    lista = sorted(lista, key=len, reverse=True)
    return lista

# ---------------------------------------------------------
# CARGA DE ARCHIVOS
# ---------------------------------------------------------
st.markdown(
    """
    <h2 class="section-title" style="text-align:center; margin-top:0.5rem;">
        <span class="emoji">📂</span>Carga de archivos
    </h2>
    """,
    unsafe_allow_html=True,
)

uploaded_files = st.file_uploader(
    "Elegí uno o varios archivos",
    type=["csv", "txt", "xls", "xlsx", "xlsm", "xlsb"],
    accept_multiple_files=True,
)

if not uploaded_files:
    st.info("Subí al menos un archivo para habilitar las pestañas de análisis.")
    st.stop()

dfs: list[pd.DataFrame] = []
for f in uploaded_files:
    df_tmp = leer_archivo(f)
    if df_tmp is not None:
        dfs.append(df_tmp)

if not dfs:
    st.error("No se pudo leer ningún archivo válido.")
    st.stop()

data = pd.concat(dfs, ignore_index=True)

# ---------------------------------------------------------
# NORMALIZAR COLUMNAS Y DETECTAR CLAVES
# ---------------------------------------------------------
columnas_originales = list(data.columns)
columnas_normalizadas = [normalizar_columna(c) for c in columnas_originales]
data.columns = columnas_normalizadas

mapa_headers = {
    norm: orig for norm, orig in zip(columnas_normalizadas, columnas_originales)
}

col_estado = buscar_columna(data, ["ESTADO", "STATUS", "STATE"])
col_subestado = buscar_columna(data, ["SUBESTADO", "SUBESTATUS", "SUBSTATE"])
col_ani = buscar_columna(data, ["ANI", "ANITELEFONO", "TELEFONO", "PHONE"])
col_base = buscar_columna(data, ["BASE", "NOMBREBASE", "ORIGEN"])
col_duracion = buscar_columna(
    data,
    ["DURACION", "DURACIONENSEGUNDOS", "SEGUNDOS", "DURATION"],
)

# Columna fecha/hora para turnos y resumen ANI
posibles_fechas = ["FECHAINICIO", "FECHAHORA", "INICIO", "LOGTIME", "FECHALLAMADA"]
col_fecha = buscar_columna(data, posibles_fechas)

faltan = []
if not col_estado:
    faltan.append("ESTADO")
if not col_subestado:
    faltan.append("SUBESTADO")
if not col_ani:
    faltan.append("ANI / TELÉFONO")
if not col_duracion:
    faltan.append("DURACIÓN (segundos)")
if not col_base:
    faltan.append("BASE")

if faltan:
    st.error(f"Faltan columnas necesarias en el archivo: {faltan}")
    st.stop()

# ---------------------------------------------------------
# FILTRO DE FECHA: solo lunes a viernes y últimas 2 semanas
# ---------------------------------------------------------
if col_fecha:
    data[col_fecha] = pd.to_datetime(data[col_fecha], errors="coerce")
    data = data.dropna(subset=[col_fecha])

    # Solo lunes a viernes (0 = lunes, 6 = domingo)
    data = data[data[col_fecha].dt.dayofweek < 5]

    # Opcional: últimas 2 semanas desde hoy
    hoy = datetime.today().date()
    limite = hoy - timedelta(days=14)
    data = data[data[col_fecha].dt.date >= limite]
else:
    st.warning(
        "No se encontró una columna de fecha/hora (FECHAINICIO, INICIO, LOGTIME, etc.). "
        "Se analiza todo el período cargado."
    )

# A partir de acá, TODO el análisis usa data ya filtrado
data[col_subestado] = data[col_subestado].fillna("VACIO")
data[col_duracion] = pd.to_numeric(data[col_duracion], errors="coerce")

data[col_subestado] = data[col_subestado].fillna("VACIO")
data[col_duracion] = pd.to_numeric(data[col_duracion], errors="coerce")

dur_min_global = int(data[col_duracion].min(skipna=True))
dur_max_global = int(data[col_duracion].max(skipna=True))

# ---------------------------------------------------------
# RESUMEN POR ANI (para depuración y tablero visual)
# ---------------------------------------------------------
resumen_ani, base_depurada, descartados = depurador_bases.procesar_desde_df(
    data,
    col_estado=col_estado,
    col_subestado=col_subestado,
    col_ani=col_ani,
    col_fecha=col_fecha,
)

# ---------------------------------------------------------
# TABS PRINCIPALES
# ---------------------------------------------------------

(
    tab_dashboard,
    tab_turnos,
    tab_dep,
    tab_filtros,
    tab_prefijos_info,
    tab_simulador,
) = st.tabs(
    [
        "📊 Tablero visual",
        "📈 Turnos y prefijos",
        "🧹 Depuración sugerida",
        "🎛 Filtro detallado",
        "📚 Catálogo de prefijos",
        "⚙️ Simulador de cortes",
    ]
)

# =========================================================
# GRÁFICOS
# =========================================================

with tab_dashboard:
    st.markdown(
        '''
        <h2 class="section-title"
            style="text-align:center; margin-top:1.5rem;">
            <span class="emoji">📊</span>Tablero visual de calidad de base
        </h2>
        ''',
        unsafe_allow_html=True,
    )

    # =======================
    # 1) KPIs globales
    # =======================
    total_anis = resumen_ani["ANI"].nunique()
    anis_descartar = descartados["ANI"].nunique()
    pct_anis_descartar = (anis_descartar * 100 / total_anis) if total_anis > 0 else 0
    # ANIs que alguna vez llegaron a ANSWER-AGENT
    anis_contactados = (resumen_ani["intentos_answer_agent"] > 0).sum()
    pct_contactados = (anis_contactados * 100 / total_anis) if total_anis > 0 else 0

    estados_norm = data[col_estado].astype(str).str.upper().str.replace(" ", "")
    total_llamados = len(data)
    tot_answer = (estados_norm == "ANSWER").sum()
    tot_noanswer = (estados_norm == "NOANSWER").sum()
    pct_answer = (tot_answer * 100 / total_llamados) if total_llamados > 0 else 0
    pct_noanswer = (tot_noanswer * 100 / total_llamados) if total_llamados > 0 else 0

    c1, c2, c3, c4, c5 = st.columns(5)
    with c1:
        st.metric("ANIs totales", f"{total_anis:,}")
    with c2:
        st.metric(
            "ANIs contactados (ANSWER-AGENT)",
            f"{anis_contactados:,}",
            f"{pct_contactados:.1f}%",
        )
    with c3:
        st.metric(
            "ANIs a depurar",
            f"{anis_descartar:,}",
            f"{pct_anis_descartar:.1f}%",
        )
    with c4:
        st.metric("% ANSWER", f"{pct_answer:.1f}%")
    with c5:
        st.metric("% NO ANSWER", f"{pct_noanswer:.1f}%")

    st.markdown("---")

    # =======================
    # 2) Estados y TAGs
    # =======================

    c5, c6 = st.columns(2)

    # 2.1 Donut de estados (ANSWER / NO ANSWER / etc.)
    with c5:
        st.markdown("#### 🧩 Distribución de estados de llamada")

        estados_counts = (
            data[col_estado]
            .astype(str)
            .str.strip()
            .value_counts()
            .reset_index()
        )
        estados_counts.columns = ["Estado", "Cantidad"]

        if not estados_counts.empty:
            fig_estados = px.pie(
                estados_counts,
                names="Estado",
                values="Cantidad",
                hole=0.4,
                color="Estado",
                color_discrete_map=STATE_COLOR_MAP,
            )

            fig_estados.update_layout(
                legend=dict(
                    orientation="h",      # horizontal
                    yanchor="top",
                    y=-0.1,               # un poquito abajo del gráfico
                    xanchor="center",
                    x=0.5,                # centrada
                ),
                margin=dict(l=0, r=0, t=40, b=0),
            )
            st.plotly_chart(fig_estados, width="stretch")

        else:
            st.info("No hay datos de estados para mostrar.")

    # 2.2 Barras por TAG (ResumenANI)
    with c6:
        st.markdown("#### 🏷️ ANIs por TAG de depuración")

        tag_counts = (
            resumen_ani["tag_telefono"]
            .value_counts()
            .rename_axis("TAG")
            .reset_index(name="Cantidad_ANIs")
        )

        if not tag_counts.empty:
            fig_tags = px.bar(
                tag_counts,
                x="TAG",
                y="Cantidad_ANIs",
                text="Cantidad_ANIs",
                color="TAG",
                color_discrete_map=TAG_COLOR_MAP,
            )
            fig_tags.update_traces(textposition="outside")
            fig_tags.update_layout(xaxis_title="", yaxis_title="ANIs")
            st.plotly_chart(fig_tags, width="stretch")

        else:
            st.info("No hay información de TAGs para mostrar.")

    st.markdown("---")

        # =======================
    # 3) Estrategia de reintentos
    # =======================

    st.markdown("### 🎯 Estrategia de reintentos")

    # 3.1 ¿En qué intento atienden por primera vez? (ANSWER-AGENT)
    st.markdown("#### 📞 Intento del primer ANSWER-AGENT")

    df_tmp = data.copy()
    if col_fecha:
        df_tmp[col_fecha] = pd.to_datetime(df_tmp[col_fecha], errors="coerce")
        df_tmp = df_tmp.dropna(subset=[col_fecha])

        df_tmp = df_tmp.sort_values([col_ani, col_fecha])
        df_tmp["intento_n"] = df_tmp.groupby(col_ani).cumcount() + 1

        est_norm = (
            df_tmp[col_estado]
            .astype(str)
            .str.strip()
            .str.lower()
            .str.replace(" ", "")
        )
        sub_norm = (
            df_tmp[col_subestado]
            .fillna("")
            .astype(str)
            .str.strip()
            .str.lower()
        )

        # ANSWER con subestado que contenga "agent" (ANSWER-AGENT)
        mask_aa = (est_norm == "answer") & (sub_norm.str.contains(r"\bagent\b"))
        df_aa = df_tmp[mask_aa]

        if not df_aa.empty:
            primer_intento = df_aa.groupby(col_ani)["intento_n"].min()
            dist_intentos = (
                primer_intento.value_counts()
                .sort_index()
                .reset_index()
            )
            dist_intentos.columns = ["Intento", "Cantidad_ANIs"]

            fig_curva = px.bar(
                dist_intentos,
                x="Intento",
                y="Cantidad_ANIs",
                text="Cantidad_ANIs",
            )
            fig_curva.update_traces(
                textposition="outside",
                marker_color=OSAR_BLUE,
            )
            fig_curva.update_layout(
                xaxis_title="Intento del primer ANSWER-AGENT",
                yaxis_title="ANIs",
            )
            st.plotly_chart(fig_curva, width="stretch")

            st.markdown(
                """
                <p style="text-align:center; color:#9e9e9e; font-size:0.9rem; margin-top:0.5rem;">
                Este gráfico muestra en qué intento atienden por primera vez los ANIs
                que llegan a hablar con un agente (ANSWER-AGENT).
                </p>
                """,
                unsafe_allow_html=True,
            )

        else:
            st.info("No se encontraron registros con ANSWER-AGENT.")
    else:
        st.info("No hay columna de fecha/hora para calcular la curva de intentos.")

    st.markdown("---")

    # 3.2 ¿Cuántos intentos totales hacemos por ANI?
    st.markdown("#### 📊 Distribución de intentos totales por ANI")

    if not resumen_ani.empty:
        # Distribución: cuántos ANIs tienen 1,2,3,... intentos
        dist_totales = (
            resumen_ani["intentos_totales"]
            .value_counts()
            .sort_index()
            .reset_index()
        )
        dist_totales.columns = ["intentos_totales", "Cantidad_ANIs"]

        total_anis = dist_totales["Cantidad_ANIs"].sum()
        dist_totales["Pct"] = (
            dist_totales["Cantidad_ANIs"] * 100 / total_anis
        ).round(1)
        dist_totales["label"] = (
            dist_totales["Cantidad_ANIs"].astype(str)
            + " (" + dist_totales["Pct"].astype(str) + "%)"
        )

        fig_hist = px.bar(
            dist_totales,
            x="intentos_totales",
            y="Cantidad_ANIs",
            text="label",
        )
        fig_hist.update_traces(
            textposition="outside",
            marker_color=OSAR_BLUE_SOFT,
        )
        fig_hist.update_layout(
            xaxis_title="Intentos totales por ANI",
            yaxis_title="Cantidad de ANIs",
        )
        st.plotly_chart(fig_hist, width="stretch")

        st.markdown(
            """
            <p style="text-align:center; color:#9e9e9e; font-size:0.9rem; margin-top:0.5rem;">
            Aquí vemos cuántos ANIs reciben 1, 2, 3... intentos en total.
            La etiqueta de cada barra muestra cantidad y porcentaje del total de ANIs.
            </p>
            """,
            unsafe_allow_html=True,
        )

        # Selector de intentos para ver detalle
        opciones_intentos = dist_totales["intentos_totales"].tolist()
        intentos_sel = st.select_slider(
            "Elegí una cantidad de intentos para ver el detalle de ANIs:",
            options=opciones_intentos,
            value=opciones_intentos[0],
        )

        st.markdown(f"**Detalle de ANIs con `{intentos_sel}` intentos totales:**")

        detalle = resumen_ani[resumen_ani["intentos_totales"] == intentos_sel]

        cols_mostrar = [
            "ANI",
            "intentos_totales",
            "intentos_answer_agent",
            "intentos_no_answer",
            "intentos_answering_machine",
            "intentos_unallocated",
            "intentos_rejected",
            "tag_telefono",
        ]
        cols_mostrar = [c for c in cols_mostrar if c in detalle.columns]

        st.dataframe(detalle[cols_mostrar], use_container_width=True)
    else:
        st.info("No hay datos de resumen por ANI para mostrar.")

    # =======================
    # 4) Prefijos y turnos
    # =======================

    st.markdown("### 🌎 Origen y horario de la base")

    c9, c10 = st.columns(2)

        # 4.1 Prefijos – intento del primer contacto (un solo gráfico)
    with c9:
        st.markdown("#### ☎️ Prefijos según intento del primer contacto")

        if not col_fecha:
            st.info(
                "No se encontró una columna de fecha/hora para calcular el intento del primer contacto por prefijo."
            )
        else:
            df_tmp = data.copy()
            df_tmp[col_fecha] = pd.to_datetime(df_tmp[col_fecha], errors="coerce")
            df_tmp = df_tmp.dropna(subset=[col_fecha])

            # Normalizamos ANI
            df_tmp["ANI_norm"] = df_tmp[col_ani].astype(str).str.strip()

            # Ordenamos por ANI + fecha y numeramos intentos
            df_tmp = df_tmp.sort_values(["ANI_norm", col_fecha])
            df_tmp["intento_n"] = df_tmp.groupby("ANI_norm").cumcount() + 1

            est_norm = (
                df_tmp[col_estado]
                .astype(str)
                .str.strip()
                .str.lower()
                .str.replace(" ", "", regex=False)
            )
            sub_norm = (
                df_tmp[col_subestado]
                .fillna("")
                .astype(str)
                .str.strip()
                .str.lower()
            )

            # ANSWER con subestado que contenga "agent" (ANSWER-AGENT)
            mask_aa = (est_norm == "answer") & (sub_norm.str.contains(r"\bagent\b"))
            df_aa = df_tmp[mask_aa]

            if df_aa.empty:
                st.info(
                    "No se encontraron registros con ANSWER-AGENT para analizar por prefijo."
                )
            else:
                # Primer intento donde atendió cada ANI
                primer_intento = (
                    df_aa.groupby("ANI_norm")["intento_n"]
                    .min()
                    .reset_index()
                    .rename(columns={"intento_n": "primer_intento"})
                )

                # ---- Asignamos prefijo a cada ANI ----
                df_pref = df_tmp[["ANI_norm"]].drop_duplicates().copy()
                df_pref["ANI_digits"] = df_pref["ANI_norm"].str.replace(
                    r"\D", "", regex=True
                )

                lista_prefijos = obtener_lista_prefijos()

                if lista_prefijos:
                    def buscar_prefijo_numero(numero: str) -> str | None:
                        for p in lista_prefijos:
                            if numero.startswith(p):
                                return p
                        return None

                    df_pref["Prefijo"] = df_pref["ANI_digits"].apply(
                        buscar_prefijo_numero
                    )
                else:
                    # Plan B: primeros 3 dígitos
                    df_pref["Prefijo"] = df_pref["ANI_digits"].str.slice(0, 3)

                df_pref = df_pref.dropna(subset=["Prefijo"])

                # Join: primer intento + prefijo
                df_join = primer_intento.merge(df_pref, on="ANI_norm", how="inner")

                if df_join.empty:
                    st.info(
                        "No se pudieron cruzar ANIs con prefijos para este análisis."
                    )
                else:
                    # Bucket: hasta 3 intentos vs más de 3
                    df_join["Rango"] = np.where(
                        df_join["primer_intento"] <= 3,
                        "≤ 3 intentos",
                        "> 3 intentos",
                    )

                    # Conteo de ANIs por prefijo y rango
                    pref_agg = (
                        df_join.groupby(["Prefijo", "Rango"])["ANI_norm"]
                        .nunique()
                        .reset_index(name="ANIs")
                    )

                    # Total por prefijo para armar % y seleccionar TOP 10
                    pref_agg["total_prefijo"] = pref_agg.groupby("Prefijo")[
                        "ANIs"
                    ].transform("sum")

                    top_prefijos = (
                        pref_agg.sort_values("total_prefijo", ascending=False)
                        .drop_duplicates("Prefijo")
                        .head(10)["Prefijo"]
                        .tolist()
                    )

                    pref_agg_top = pref_agg[pref_agg["Prefijo"].isin(top_prefijos)].copy()

                    # % dentro de cada prefijo
                    pref_agg_top["Pct"] = (
                        pref_agg_top["ANIs"] * 100 / pref_agg_top["total_prefijo"]
                    ).round(1)

                    # *** CLAVE: tratar prefijo como categoría, no número ***
                    pref_agg_top["Prefijo"] = pref_agg_top["Prefijo"].astype(str)

                    fig_pref_rangos = px.bar(
                        pref_agg_top,
                        x="Prefijo",
                        y="Pct",
                        color="Rango",
                        text="Pct",
                        barmode="stack",
                        color_discrete_map={
                            "≤ 3 intentos": GOOD_GREEN,
                            "> 3 intentos": NEUTRAL_GRAY,
                        },
                    )
                    fig_pref_rangos.update_traces(textposition="inside")
                    fig_pref_rangos.update_layout(
                        yaxis_title="% de ANIs con contacto",
                        xaxis_title="Prefijo",
                        yaxis_range=[0, 100],
                        xaxis_type="category",
                        xaxis_categoryorder="category ascending",
                    )
                    st.plotly_chart(fig_pref_rangos, width="stretch")
  
    # 4.2 Turnos: mañana vs tarde
    with c10:
        st.markdown("#### ⏰ Contactabilidad por turno")

        if col_fecha:
            df_turnos_dash = data.copy()
            df_turnos_dash[col_fecha] = pd.to_datetime(
                df_turnos_dash[col_fecha], errors="coerce"
            )
            df_turnos_dash = df_turnos_dash.dropna(subset=[col_fecha])

            hdec = df_turnos_dash[col_fecha].dt.hour + df_turnos_dash[col_fecha].dt.minute / 60.0

            def clasificar_turno(h):
                if 10.0 <= h < 15.0:
                    return "Mañana"
                elif 16.5 <= h < 20.5:
                    return "Tarde"
                else:
                    return "Fuera de rango"

            df_turnos_dash["Turno"] = hdec.apply(clasificar_turno)
            df_turnos_dash = df_turnos_dash[df_turnos_dash["Turno"] != "Fuera de rango"]

            if not df_turnos_dash.empty:
                est_norm2 = (
                    df_turnos_dash[col_estado]
                    .astype(str)
                    .str.upper()
                    .str.replace(" ", "")
                )
                df_turnos_dash["ES_ANSWER"] = est_norm2 == "ANSWER"

                turno_stats = (
                    df_turnos_dash.groupby("Turno")
                    .agg(
                        Llamados=("Turno", "size"),
                        ANSWER=("ES_ANSWER", "sum"),
                    )
                    .reset_index()
                )
                turno_stats["% ANSWER"] = (
                    turno_stats["ANSWER"] * 100 / turno_stats["Llamados"]
                ).round(1)

                fig_turno = px.bar(
                    turno_stats,
                    x="Turno",
                    y="% ANSWER",
                    text="% ANSWER",
                    color="Turno",
                    color_discrete_map=TURN_COLOR_MAP,
                )
                fig_turno.update_traces(textposition="outside")
                fig_turno.update_layout(
                    yaxis_title="% ANSWER",
                    xaxis_title="Turno",
                    yaxis_range=[0, 100],
                )
                st.plotly_chart(fig_turno, width="stretch")
            else:
                st.info("No hay llamadas dentro del rango horario definido para turnos.")
        else:
            st.info("No hay columna de fecha/hora para analizar turnos.")

# =========================================================
# TAB 1: TURNOS Y PREFIJOS
# =========================================================
with tab_turnos:
    st.markdown(
        '<h2 class="section-title" style="text-align:center; margin-top:1.5rem;">'
        '<span class="emoji">📈</span>Análisis por turnos y prefijos'
        '</h2>',
        unsafe_allow_html=True,
    )

    # ---------- 1) TURNOS ----------
    df_turnos = data.copy()

    if not col_fecha:
        st.warning(
            "No se encontró una columna de fecha/hora (por ej. FECHAINICIO, INICIO, LOGTIME) "
            "para armar los turnos."
        )
    else:
        df_turnos[col_fecha] = pd.to_datetime(df_turnos[col_fecha], errors="coerce")
        df_turnos = df_turnos.dropna(subset=[col_fecha])

        # Hora en formato decimal (ej: 16:30 -> 16.5)
        df_turnos["HORA_DECIMAL"] = (
            df_turnos[col_fecha].dt.hour
            + df_turnos[col_fecha].dt.minute / 60.0
        )

        # Turnos reales:
        # Mañana 10:00–14:59 (≈ 10–15)
        # Tarde  16:30–20:29 (≈ 16.5–20.5)
        def clasificar_turno(hdec: float) -> str | None:
            if 10.0 <= hdec < 15.0:
                return "Mañana"
            elif 16.5 <= hdec < 20.5:
                return "Tarde"
            else:
                return None

        df_turnos["TURNO"] = df_turnos["HORA_DECIMAL"].apply(clasificar_turno)
        df_turnos = df_turnos.dropna(subset=["TURNO"])

        if df_turnos.empty:
            st.info(
                "No hay registros dentro de los rangos definidos de turno "
                "(Mañana 10–15, Tarde 16:30–20:30)."
            )
        else:
            estados_norm = (
                df_turnos[col_estado]
                .astype(str)
                .str.upper()
                .str.replace(" ", "")
            )
            df_turnos["ES_ANSWER"] = estados_norm == "ANSWER"
            df_turnos["ES_NOANSWER"] = estados_norm == "NOANSWER"

            turno_stats = (
                df_turnos.groupby("TURNO")
                .agg(
                    TOTAL=("TURNO", "size"),
                    ANSWER=("ES_ANSWER", "sum"),
                    NOANSWER=("ES_NOANSWER", "sum"),
                )
                .reset_index()
            )

            # Siempre mostrar ambas filas (Mañana / Tarde)
            orden = ["Mañana", "Tarde"]
            turno_stats = (
                turno_stats.set_index("TURNO")
                .reindex(orden)
                .fillna(0)
                .reset_index()
            )

            for col_num in ["TOTAL", "ANSWER", "NOANSWER"]:
                turno_stats[col_num] = turno_stats[col_num].astype(int)

            turno_stats["% ANSWER"] = (
                turno_stats["ANSWER"] * 100
                / turno_stats["TOTAL"].replace(0, pd.NA)
            ).round(1)
            turno_stats["% NOANSWER"] = (
                turno_stats["NOANSWER"] * 100
                / turno_stats["TOTAL"].replace(0, pd.NA)
            ).round(1)

            turno_stats["% ANSWER"] = turno_stats["% ANSWER"].fillna(0)
            turno_stats["% NOANSWER"] = turno_stats["% NOANSWER"].fillna(0)

            st.subheader("📊 Distribución por turno")
            st.dataframe(turno_stats, width="stretch")

    # ---------- 2) PREFIJOS ----------
    st.subheader("📞 Análisis por prefijos")

    df_pref = data.copy()
    df_pref[col_ani] = df_pref[col_ani].astype(str).str.replace(
        r"\D", "", regex=True
    )

    lista_prefijos = obtener_lista_prefijos()

    if lista_prefijos:
        def buscar_prefijo_numero(numero: str) -> str | None:
            for p in lista_prefijos:
                if numero.startswith(p):
                    return p
            return None

        df_pref["PREFIJO"] = df_pref[col_ani].apply(buscar_prefijo_numero)
        df_pref = df_pref.dropna(subset=["PREFIJO"])

        if df_pref.empty:
            st.info(
                "No se pudo asignar ningún prefijo del archivo 'Prefijos interurbanos.csv' "
                "a los ANI de la base."
            )
        else:
            pref_stats = (
                df_pref.groupby("PREFIJO")
                .size()
                .reset_index(name="TOTAL")
                .sort_values("TOTAL", ascending=False)
            )
            total_global_pref = pref_stats["TOTAL"].sum()
            pref_stats["% SOBRE_TOTAL"] = (
                pref_stats["TOTAL"] * 100 / total_global_pref
            ).round(2)

            st.write(
                "Prefijos con mayor volumen de llamados (según catálogo de prefijos):"
            )
            st.dataframe(pref_stats, width="stretch")
    else:
        st.warning(
            "No se pudo usar 'Prefijos interurbanos.csv'. "
            "Se muestra el análisis simple por los primeros 3 dígitos del ANI."
        )

        df_pref["PREFIJO"] = df_pref[col_ani].str.extract(
            r"(\d{3})", expand=False
        )

        pref_stats = (
            df_pref.groupby("PREFIJO")
            .agg(TOTAL=("PREFIJO", "size"))
            .reset_index()
            .dropna(subset=["PREFIJO"])
        )

        total_global_pref = pref_stats["TOTAL"].sum()
        if total_global_pref > 0:
            pref_stats["% SOBRE_TOTAL"] = (
                pref_stats["TOTAL"] * 100 / total_global_pref
            ).round(2)
        else:
            pref_stats["% SOBRE_TOTAL"] = 0

        pref_stats = pref_stats.sort_values("TOTAL", ascending=False)

        st.write(
            "Prefijos con mayor volumen de llamados (primeros 3 dígitos):"
        )
        st.dataframe(pref_stats, use_container_width=True)

# =========================================================
# TAB 2: DEPURACIÓN SUGERIDA (NUEVA LÓGICA POR TAGS)
# =========================================================
with tab_dep:
    st.markdown(
        '''
        <h2 class="section-title"
            style="text-align:center; margin-top:1.5rem;">
            <span class="emoji">🧹</span>Depuración sugerida de contactos
        </h2>
        ''',
        unsafe_allow_html=True,
    )

    st.write(
        "Este módulo analiza **ANI por ANI** y los clasifica según su comportamiento "
        "en los estados: ANSWER, NO ANSWER, busy, unallocated, rejected y subestados. "
        "La idea es identificar qué números conviene **sacar de las bases** "
        "para no seguir quemando intentos."
    )

    # Procesamos con el módulo externo
    resumen_ani, base_depurada, descartados = depurador_bases.procesar_desde_df(
        data,
        col_estado=col_estado,
        col_subestado=col_subestado,
        col_ani=col_ani,
        col_fecha=col_fecha,
    )

    # Totales
    total_anis = resumen_ani["ANI"].nunique()
    # ANIs a depurar (todos los TAG ≠ SEGUIR_INTENTANDO)
    anis_descartar = descartados["ANI"].nunique()
    pct_anis_descartar = (
        anis_descartar * 100 / total_anis if total_anis > 0 else 0
    )
    # ANIs contactados: tuvieron al menos un ANSWER-AGENT
    anis_contactados = (resumen_ani["intentos_answer_agent"] > 0).sum()
    pct_contactados = (
        anis_contactados * 100 / total_anis if total_anis > 0 else 0
    )
    # ANIs que seguimos usando en la base (solo TAG = SEGUIR_INTENTANDO)
    anis_seguir = base_depurada["ANI"].nunique()
    # ANIs no contactados pero igual a depurar
    anis_no_contact_depurar = max(anis_descartar - anis_contactados, 0)
    pct_no_contact_depurar = (
        anis_no_contact_depurar * 100 / total_anis if total_anis > 0 else 0
    )
    # ANIs no contactados y a seguir intentando (toda la base_depurada)
    anis_no_contact_seguir = anis_seguir
    pct_no_contact_seguir = (
        anis_no_contact_seguir * 100 / total_anis if total_anis > 0 else 0
    )
    
    st.markdown(
        f"""
        <div class="kpi-wrapper">

          <div class="kpi-card">
            <div class="kpi-label">ANIs totales en la base</div>
            <div class="kpi-value">{total_anis:,}</div>
          </div>

          <div class="kpi-card">
            <div class="kpi-label">ANIs contactados (ANSWER-AGENT)</div>
            <div class="kpi-value kpi-ok">{anis_contactados:,}
              <span class="kpi-percent"> ({pct_contactados:.1f}%)</span>
            </div>
          </div>

          <div class="kpi-card">
            <div class="kpi-label">ANIs a depurar (tags ≠ SEGUIR_INTENTANDO)</div>
            <div class="kpi-value kpi-bad">{anis_descartar:,}
              <span class="kpi-percent"> ({pct_anis_descartar:.1f}%)</span>
            </div>
          </div>

          <div class="kpi-card">
            <div class="kpi-label">ANIs no contactados y a depurar</div>
            <div class="kpi-value kpi-bad">{anis_no_contact_depurar:,}
              <span class="kpi-percent"> ({pct_no_contact_depurar:.1f}%)</span>
            </div>
          </div>

          <div class="kpi-card">
            <div class="kpi-label">ANIs no contactados y a seguir intentando</div>
            <div class="kpi-value">{anis_no_contact_seguir:,}
              <span class="kpi-percent"> ({pct_no_contact_seguir:.1f}%)</span>
            </div>
          </div>

        </div>
        """,
        unsafe_allow_html=True,
    )

    # Distribución por tag
    st.markdown(
        '<h3 class="section-title"><span class="emoji">🏷️</span>Distribución por tag</h3>',
        unsafe_allow_html=True,
    )
    dist_tags = (
        resumen_ani["tag_telefono"]
        .value_counts()
        .rename_axis("TAG")
        .reset_index(name="CANTIDAD")
    )
    st.dataframe(dist_tags, use_container_width=True)
    
        # ------------------------------
    # Filtro rápido por TAGs para exportar bases
    # ------------------------------
    st.markdown("### 🎛 Filtro rápido por TAG para exportar")

    # Tags disponibles en el resumen
    tags_disponibles = sorted(resumen_ani["tag_telefono"].dropna().unique().tolist())

    # Default: sólo SEGUIR_INTENTANDO si existe, si no todos
    if "SEGUIR_INTENTANDO" in tags_disponibles:
        default_tags = ["SEGUIR_INTENTANDO"]
    else:
        default_tags = tags_disponibles

    tags_seleccionados = st.multiselect(
        "Elegí qué TAGs querés **mantener** en la base de salida:",
        options=tags_disponibles,
        default=default_tags,
    )

    if not tags_seleccionados:
        st.info("Seleccioná al menos un TAG para armar la base filtrada.")
    else:
        # 1) Resumen filtrado por ANI
        resumen_filtrado = resumen_ani[
            resumen_ani["tag_telefono"].isin(tags_seleccionados)
        ].copy()

        # 2) Base de llamados filtrada: todos los intentos de esos ANIs
        anis_filtrados = resumen_filtrado["ANI"].astype(str).unique().tolist()
        base_llamadas_filtrada = data[
            data[col_ani].astype(str).isin(anis_filtrados)
        ].copy()

        st.write(
            f"**ANIs en la base filtrada:** {len(anis_filtrados):,}  "
            f" |  **Llamados (filtrados):** {len(base_llamadas_filtrada):,}"
        )

        col_exp1, col_exp2 = st.columns(2)

        # --- Botón 1: resumen por ANI filtrado ---
        with col_exp1:
            csv_resumen = resumen_filtrado.to_csv(index=False).encode("utf-8-sig")
            st.download_button(
                "📥 Descargar resumen por ANI (CSV)",
                data=csv_resumen,
                file_name="resumen_ani_filtrado.csv",
                mime="text/csv",
            )

        # --- Botón 2: base de llamados filtrada ---
        with col_exp2:
            csv_detalle = base_llamadas_filtrada.to_csv(index=False).encode("utf-8-sig")
            st.download_button(
                "📥 Descargar base de llamados filtrada (CSV)",
                data=csv_detalle,
                file_name="llamados_filtrados.csv",
                mime="text/csv",
            )

    # Tabla de ANIs descartados
    st.markdown(
        '<h3 class="section-title"><span class="emoji">🗑️</span>ANIs sugeridos para depurar</h3>',
        unsafe_allow_html=True,
    )

    if descartados.empty:
        st.info(
            "Con las reglas actuales no hay ANIs que deban depurarse. "
            "Se podría ajustar la lógica en el módulo 'depurador_bases.py' si hiciera falta."
        )
    else:
        st.write(
            "Esta tabla resume, por ANI, cuántos intentos tuvo en cada categoría "
            "y qué tag final se le asignó."
        )

        st.dataframe(
            descartados.sort_values(
                ["tag_telefono", "intentos_totales"],
                ascending=[True, False],
            ),
            use_container_width=True,
        )

        # Detalle de un ANI específico
        ani_sel = st.selectbox(
            "Ver detalle de llamados para un ANI descartado:",
            options=descartados["ANI"].sort_values().tolist(),
        )

        detalle_ani = data[
            data[col_ani].astype(str).str.strip() == str(ani_sel)
        ].copy()

        st.markdown(
            f"<h4 class='section-title'>Detalle de llamados para ANI: {ani_sel}</h4>",
            unsafe_allow_html=True,
        )

        cols_detalle = [col_estado, col_subestado]
        for extra in [col_base, col_duracion]:
            if extra:
                cols_detalle.append(extra)

        st.dataframe(
            detalle_ani[cols_detalle],
            use_container_width=True,
        )

        # Descarga de archivos de depuración
        st.markdown(
            '<h3 class="section-title"><span class="emoji">📥</span>Descarga de archivos de depuración</h3>',
            unsafe_allow_html=True,
        )

        # Generamos buffers XLSX
        buf_resumen = io.BytesIO()
        with pd.ExcelWriter(buf_resumen, engine="xlsxwriter") as writer:
            resumen_ani.to_excel(writer, index=False, sheet_name="Resumen_ANI")
        buf_resumen.seek(0)

        buf_base = io.BytesIO()
        with pd.ExcelWriter(buf_base, engine="xlsxwriter") as writer:
            base_depurada.to_excel(writer, index=False, sheet_name="Base_depurada")
        buf_base.seek(0)

        buf_desc = io.BytesIO()
        with pd.ExcelWriter(buf_desc, engine="xlsxwriter") as writer:
            descartados.to_excel(writer, index=False, sheet_name="Descartados")
        buf_desc.seek(0)

        d1, d2, d3 = st.columns(3)
        with d1:
            st.download_button(
                "⬇️ Descargar resumen por ANI (XLSX)",
                data=buf_resumen,
                file_name="resumen_ani_depuracion.xlsx",
                mime="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            )
        with d2:
            st.download_button(
                "⬇️ Descargar base depurada (XLSX)",
                data=buf_base,
                file_name="base_depurada_seguir_intentando.xlsx",
                mime="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            )
        with d3:
            st.download_button(
                "⬇️ Descargar ANIs descartados (XLSX)",
                data=buf_desc,
                file_name="anis_descartados.xlsx",
                mime="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            )

# =========================================================
# TAB 3: FILTRO DETALLADO
# =========================================================
with tab_filtros:
    st.markdown(
        '''
        <h2 class="section-title"
            style="text-align:center; margin-top:1.5rem;">
            <span class="emoji">🔍</span>Filtros
        </h2>
        ''',
        unsafe_allow_html=True,
    )

    c1, c2, c3 = st.columns(3)

    with c1:
        estados = sorted(data[col_estado].dropna().unique())
        filtro_estado = st.multiselect("Estado", estados, default=estados)

    with c2:
        subestados = sorted(data[col_subestado].dropna().unique())
        filtro_subestado = st.multiselect(
            "Subestado", subestados, default=subestados
        )

    with c3:
        bases = sorted(data[col_base].dropna().unique())
        filtro_base = st.multiselect("Base", bases, default=bases)

    c4, c5 = st.columns([2, 1])

    with c4:
        filtro_ani = st.text_input("Buscar ANI / Teléfono (contiene):")

    with c5:
        dur_min, dur_max = st.slider(
            "Duración (segundos)",
            min_value=dur_min_global,
            max_value=dur_max_global,
            value=(dur_min_global, dur_max_global),
        )

    df = data.copy()
    df = df[df[col_estado].isin(filtro_estado)]
    df = df[df[col_subestado].isin(filtro_subestado)]
    df = df[df[col_base].isin(filtro_base)]
    df = df[
        (df[col_duracion] >= dur_min) & (df[col_duracion] <= dur_max)
    ]

    if filtro_ani.strip():
        df = df[
            df[col_ani].astype(str).str.contains(
                filtro_ani, case=False, na=False
            )
        ]

    total_llamados = len(df)

    if total_llamados > 0:
        estados_norm = (
            df[col_estado].astype(str).str.upper().str.replace(" ", "")
        )
        tot_answer = (estados_norm == "ANSWER").sum()
        tot_noanswer = (estados_norm == "NOANSWER").sum()
        pct_answer = tot_answer * 100.0 / total_llamados
        pct_noanswer = tot_noanswer * 100.0 / total_llamados
    else:
        tot_answer = tot_noanswer = 0
        pct_answer = pct_noanswer = 0.0

    st.markdown(
        f"""
        <h2 class="section-title"
            style="text-align:center; margin-top:2rem;">
            <span class="emoji">📊</span>Resumen de KPIs
        </h2>
        <div class="kpi-wrapper">
          <div class="kpi-card">
            <div class="kpi-label">Total llamados</div>
            <div class="kpi-value">{total_llamados:,}</div>
          </div>
          <div class="kpi-card">
            <div class="kpi-label">ANSWER</div>
            <div class="kpi-value kpi-ok">{tot_answer:,}<span class="kpi-percent"> ({pct_answer:.1f}%)</span></div>
          </div>
          <div class="kpi-card">
            <div class="kpi-label">NO ANSWER</div>
            <div class="kpi-value kpi-bad">{tot_noanswer:,}<span class="kpi-percent"> ({pct_noanswer:.1f}%)</span></div>
          </div>
        </div>
        """,
        unsafe_allow_html=True,
    )

    st.markdown(
        '<h2 class="section-title"><span class="emoji">📋</span>Resultados filtrados</h2>',
        unsafe_allow_html=True,
    )
    st.write(f"Filas resultantes: **{len(df)}**")

    if len(df) > 0:
        csv_bytes = df.to_csv(index=False).encode("utf-8-sig")
        txt_bytes = df.to_csv(index=False, sep="\t").encode("utf-8-sig")

        xlsx_buffer = io.BytesIO()
        with pd.ExcelWriter(xlsx_buffer, engine="xlsxwriter") as writer:
            df.to_excel(writer, index=False, sheet_name="Filtrado")
        xlsx_buffer.seek(0)

        st.markdown(
            '<h3 class="section-title"><span class="emoji">📥</span>Descarga de resultados filtrados</h3>',
            unsafe_allow_html=True,
        )

        d1, d2, d3 = st.columns(3)
        with d1:
            st.download_button(
                "⬇️ Descargar CSV",
                data=csv_bytes,
                file_name="depuracion_filtrada.csv",
                mime="text/csv",
            )
        with d2:
            st.download_button(
                "⬇️ Descargar TXT",
                data=txt_bytes,
                file_name="depuracion_filtrada.txt",
                mime="text/plain",
            )
        with d3:
            st.download_button(
                "⬇️ Descargar XLSX",
                data=xlsx_buffer,
                file_name="depuracion_filtrada.xlsx",
                mime=(
                    "application/vnd.openxmlformats-officedocument."
                    "spreadsheetml.sheet"
                ),
            )
    else:
        st.write(
            "No hay registros para descargar con los filtros actuales."
        )

    columnas_ocultas_raw = [
        "ID.LLAMADA",
        "DISPOSITIVO",
        "SERVIDOR",
        "PLACA",
        "SLOT",
        "APLICACION",
        "ID.APLICACION",
        "USUARIO",
        "COLA",
        "DNIS",
        "TIPO",
        "PAISPROVINCIA",
        "CIUDADLOCALIDAD",
        "COSTO",
        "PRECIO",
        "IMPORTECOSTO",
        "IMPORTEPRECIO",
        "PROVEEDOR",
        "SUBPARTES",
    ]
    columnas_ocultas_norm = [
        normalizar_columna(c) for c in columnas_ocultas_raw
    ]

    gb = GridOptionsBuilder.from_dataframe(df)
    gb.configure_default_column(
        editable=False,
        filter=True,
        sortable=True,
        resizable=True,
        floatingFilter=True,
        menuTabs=["filterMenuTab", "generalMenuTab", "columnsMenuTab"],
    )

    for col in df.columns:
        header_name = mapa_headers.get(col, col)
        if col in columnas_ocultas_norm:
            gb.configure_column(col, headerName=header_name, hide=True)
        else:
            if col == col_estado:
                gb.configure_column(
                    col, headerName=header_name, filter="agSetColumnFilter"
                )
            else:
                gb.configure_column(col, headerName=header_name)

    grid_options = gb.build()

    AgGrid(
        df,
        gridOptions=grid_options,
        enable_enterprise_modules=True,
        update_mode=GridUpdateMode.NO_UPDATE,
        theme="streamlit",
        fit_columns_on_grid_load=True,
        height=600,
    )

# =========================================================
# TAB 4: CATÁLOGO DE PREFIJOS
# =========================================================
with tab_prefijos_info:
    st.markdown(
        '''
        <h2 class="section-title"
            style="text-align:center; margin-top:1.5rem;">
            <span class="emoji">📚</span>Catálogo de prefijos interurbanos
        </h2>
        ''',
        unsafe_allow_html=True,
    )

    pref_tabla = cargar_prefijos_tabla()
    if pref_tabla is None:
        st.warning(
            "No se pudo leer 'Prefijos interurbanos.csv'. "
            "Verificá que el archivo exista en la misma carpeta que el programa."
        )
    else:
        if "PREFIJO" in pref_tabla.columns:
            cols_show = ["PREFIJO"] + [
                c
                for c in pref_tabla.columns
                if c not in ("PREFIJO", "PREFIJO_NUM", "LONG")
            ]
            st.dataframe(
                pref_tabla[cols_show].drop_duplicates(),
                use_container_width=True,
            )
        else:
            st.dataframe(
                pref_tabla.drop(
                    columns=["PREFIJO_NUM", "LONG"], errors="ignore"
                )
                .drop_duplicates(),
                use_container_width=True,
            )
            
# =======================
# 5) Simulador de cortes por intentos
# =======================
with tab_simulador:
    st.markdown("### ⚙️ Simulador de corte de intentos por ANI")

    if resumen_ani.empty:
        st.info("Cargá un ticket para usar el simulador.")
    else:
        # --- Selección de campaña (base/origen) opcional ---
        if col_base:
            bases_disponibles = (
                data[col_base]
                .dropna()
                .astype(str)
                .unique()
                .tolist()
            )
            bases_disponibles = sorted(bases_disponibles)
            base_sel = st.selectbox(
                "Filtrar por campaña / base (opcional):",
                options=["(Todas)"] + bases_disponibles,
                index=0,
            )
        else:
            base_sel = "(Todas)"

        # Construimos el resumen en el ámbito elegido (todas o una base)
        resumen_scope = resumen_ani.copy()

        if base_sel != "(Todas)" and col_base:
            # Cruzamos ANI con base para quedarnos solo con esa campaña
            ani_base = (
                data[[col_ani, col_base]]
                .drop_duplicates()
                .astype({col_ani: str})
            )
            ani_camp = ani_base[ani_base[col_base].astype(str) == str(base_sel)]
            resumen_scope = resumen_scope.merge(
                ani_camp[[col_ani]],
                left_on="ANI",
                right_on=col_ani,
                how="inner",
            )

        if resumen_scope.empty:
            st.warning("No hay ANIs para esa campaña con los datos actuales.")
        else:
            st.markdown(
                f"**ANIs en el ámbito seleccionado:** {resumen_scope['ANI'].nunique():,}"
            )

            # --- Parámetros del simulador ---
            max_intentos_real = int(resumen_scope["intentos_totales"].max())
            nuevo_corte = st.slider(
                "Elegí el nuevo corte máximo de intentos por ANI (solo ANIs sin ANSWER-AGENT se cortarían):",
                min_value=1,
                max_value=max(3, max_intentos_real),
                value=min(6, max_intentos_real),
            )

            # --- Escenario actual (real) ---
            total_anis_scope = resumen_scope["ANI"].nunique()
            # ANIs sin contacto (nunca tuvieron ANSWER-AGENT) con la regla actual
            anis_sin_contacto = resumen_scope[
                resumen_scope["intentos_answer_agent"] == 0
            ].copy()

            # --- Escenario simulado con nuevo corte ---
            # Se cortan: sin contacto y con intentos_totales > nuevo_corte
            mask_corte = (
                (anis_sin_contacto["intentos_totales"] > nuevo_corte)
            )
            anis_cortados_sim = anis_sin_contacto[mask_corte]["ANI"].nunique()
            anis_sin_contacto_tot = anis_sin_contacto["ANI"].nunique()

            # ANIs que seguirían en la base bajo la nueva regla
            anis_seguir_sim = total_anis_scope - anis_cortados_sim

            pct_cortados = (
                anis_cortados_sim * 100 / total_anis_scope
                if total_anis_scope > 0
                else 0
            )
            pct_seguir = (
                anis_seguir_sim * 100 / total_anis_scope
                if total_anis_scope > 0
                else 0
            )

            st.markdown("#### Resultado del escenario simulado")

            c1, c2 = st.columns(2)
            with c1:
                st.metric(
                    f"ANIs sin contacto (actualmente)",
                    f"{anis_sin_contacto_tot:,}",
                )
                st.metric(
                    f"ANIs que se cortarían con corte > {nuevo_corte} intentos",
                    f"{anis_cortados_sim:,}",
                    f"{pct_cortados:.1f}% de los ANIs del ámbito",
                )
            with c2:
                st.metric(
                    "ANIs que seguirían en la base",
                    f"{anis_seguir_sim:,}",
                    f"{pct_seguir:.1f}% del total",
                )

            # Pequeño gráfico comparativo
            df_sim = pd.DataFrame(
                {
                    "Categoria": ["Se cortan", "Siguen en base"],
                    "ANIs": [anis_cortados_sim, anis_seguir_sim],
                }
            )
            fig_sim = px.bar(
                df_sim,
                x="Categoria",
                y="ANIs",
                text="ANIs",
                color="Categoria",
                color_discrete_map={
                    "Se cortan": BAD_RED,
                    "Siguen en base": GOOD_GREEN,
                },
            )
            fig_sim.update_traces(textposition="outside")
            fig_sim.update_layout(
                yaxis_title="Cantidad de ANIs",
                xaxis_title="",
                showlegend=False,
            )
            st.plotly_chart(fig_sim, width="stretch")

            st.markdown(
                """
                <p style="text-align:center; color:#9e9e9e; font-size:0.9rem; margin-top:0.5rem;">
                Este simulador solo corta ANIs que <strong>nunca tuvieron ANSWER-AGENT</strong>.
                Sirve para evaluar el impacto de bajar o subir el corte de intentos máximos por ANI.
                </p>
                """,
                unsafe_allow_html=True,
            )          
    