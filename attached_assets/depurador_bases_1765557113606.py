import pandas as pd

from typing import Optional, Tuple

def construir_resumen_por_ani(
    df: pd.DataFrame,
    col_estado: str,
    col_subestado: str,
    col_ani: str,
    col_fecha: Optional[str] = None,
) -> pd.DataFrame:
    """
    A partir de los llamados brutos arma un resumen por ANI con contadores
    de cada tipo de estado/subestado relevante.
    """
    work = df.copy()

    # Normalización básica
    work[col_ani] = work[col_ani].astype(str).str.strip()

    estado_norm = work[col_estado].astype(str).str.strip().str.lower()
    estado_norm_sin_espacios = estado_norm.str.replace(" ", "", regex=False)

    subestado_norm = (
        work[col_subestado].fillna("").astype(str).str.strip().str.lower()
    )
    subestado_norm_sin_espacios = subestado_norm.str.replace(" ", "", regex=False)

    work["_estado_norm"] = estado_norm
    work["_estado_norm_sin_espacios"] = estado_norm_sin_espacios
    work["_subestado_norm"] = subestado_norm
    work["_subestado_norm_sin_espacios"] = subestado_norm_sin_espacios

    # Fecha/hora
    if col_fecha is not None and col_fecha in work.columns:
        work[col_fecha] = pd.to_datetime(work[col_fecha], errors="coerce")
    else:
        # Creamos una columna dummy para poder usar min/max sin romper
        col_fecha = "_FECHA_DUMMY"
        work[col_fecha] = pd.NaT

    def resumen_por_grupo(x: pd.DataFrame) -> pd.Series:
        """
        Calcula los contadores para un ANI (grupo x).
        """
        est_sin = x["_estado_norm_sin_espacios"]
        sub_sin = x["_subestado_norm_sin_espacios"]
        sub_full = x["_subestado_norm"]  # mismo contenido pero con espacios

        # Máscaras por categoría
        # CONTACTADO: ANSWER con subestado que contenga la palabra "agent"
        mask_answer_agent = (est_sin == "answer") & (
            sub_full.str.contains(r"\bagent\b")
        )

        mask_answering_machine = (est_sin == "answer") & (
            sub_sin.str.contains("answering") | sub_sin.str.contains("machine")
        )
        mask_no_answer = est_sin == "noanswer"
        mask_busy = est_sin == "busy"
        # Unallocated: puede venir en estado o en subestado según Neotel
        mask_unallocated = (est_sin == "unallocated") | (sub_sin == "unallocated")
        mask_rejected = (est_sin == "rejected") | (sub_sin == "rejected")

        return pd.Series(
            {
                "intentos_totales": int(len(x)),
                "intentos_answer_agent": int(mask_answer_agent.sum()),
                "intentos_answering_machine": int(mask_answering_machine.sum()),
                "intentos_no_answer": int(mask_no_answer.sum()),
                "intentos_busy": int(mask_busy.sum()),
                "intentos_unallocated": int(mask_unallocated.sum()),
                "intentos_rejected": int(mask_rejected.sum()),
                "primer_llamado": x[col_fecha].min(),
                "ultimo_llamado": x[col_fecha].max(),
            }
        )

    resumen = (
        work.groupby(col_ani, dropna=True)
        .apply(resumen_por_grupo)
        .reset_index()
        .rename(columns={col_ani: "ANI"})
    )

    return resumen

def asignar_tag(row: pd.Series) -> str:
    """
    Reglas de clasificación por ANI.

    - INVALIDO:  >= 3 intentos unallocated
    - CONTACTADO: al menos 1 intento_answer_agent
    - SOLO_BUZON: >= 5 answering machine, sin answer_agent
    - NO_ATIENDE: >= 6 no answer, sin answer_agent ni answering machine
    - RECHAZA:    >= 3 rejected, sin answer_agent
    - SEGUIR_INTENTANDO: todo lo demás
    """
    if row["intentos_unallocated"] >= 3:
        return "INVALIDO"

    if row["intentos_answer_agent"] >= 1:
        return "CONTACTADO"

    if row["intentos_answering_machine"] >= 5 and row["intentos_answer_agent"] == 0:
        return "SOLO_BUZON"

    if (
        row["intentos_no_answer"] >= 6
        and row["intentos_answer_agent"] == 0
        and row["intentos_answering_machine"] == 0
    ):
        return "NO_ATIENDE"

    if row["intentos_rejected"] >= 3 and row["intentos_answer_agent"] == 0:
        return "RECHAZA"

    return "SEGUIR_INTENTANDO"

def etiquetar_resumen(resumen: pd.DataFrame) -> pd.DataFrame:
    """
    Agrega la columna 'tag_telefono' al resumen por ANI.
    """
    resumen = resumen.copy()
    resumen["tag_telefono"] = resumen.apply(asignar_tag, axis=1)
    return resumen

def generar_depurados_y_descartados(
    resumen: pd.DataFrame,
) -> Tuple[pd.DataFrame, pd.DataFrame]:
    """
    Separa:
    - base_depurada: ANIs 'SEGUIR_INTENTANDO'
    - descartados:   resto de tags
    """
    resumen = resumen.copy()
    base_depurada = resumen[resumen["tag_telefono"] == "SEGUIR_INTENTANDO"].copy()
    descartados = resumen[resumen["tag_telefono"] != "SEGUIR_INTENTANDO"].copy()
    return base_depurada, descartados

def procesar_desde_df(
    df: pd.DataFrame,
    col_estado: str,
    col_subestado: str,
    col_ani: str,
    col_fecha: Optional[str] = None,
) -> Tuple[pd.DataFrame, pd.DataFrame, pd.DataFrame]:
    """
    Flujo completo:
    - Construye resumen por ANI
    - Etiqueta con tag_telefono
    - Separa base_depurada y descartados
    """
    resumen = construir_resumen_por_ani(df, col_estado, col_subestado, col_ani, col_fecha)
    resumen = etiquetar_resumen(resumen)
    base_depurada, descartados = generar_depurados_y_descartados(resumen)
    return resumen, base_depurada, descartados