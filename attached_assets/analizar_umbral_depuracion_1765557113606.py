import sys
import pandas as pd
import depurador_bases  # usamos las funciones de resumen por ANI

from pathlib import Path

# ============================
# CONFIGURACIÓN BÁSICA
# ============================

COL_ESTADO = "Estado"
COL_SUBESTADO = "Sub-Estado"
COL_ANI = "ANI/Teléfono"
COL_FECHA = "Inicio"  # o FECHAHORA, INICIO, etc.

def leer_ticket(ruta: Path) -> pd.DataFrame:
    """
    Lee el ticket de Neotel. Soporta xls/xlsx/csv.
    Ajustá si tu formato es fijo.
    """
    nombre = ruta.name.lower()

    if nombre.endswith((".xlsx", ".xlsm", ".xlsb", ".xls")):
        df = pd.read_excel(ruta)
    elif nombre.endswith((".csv", ".txt")):
        df = pd.read_csv(ruta, sep=None, engine="python", encoding="latin1")
    else:
        raise ValueError(f"Formato no soportado: {nombre}")

    return df

def analizar_umbral_uno(resumen: pd.DataFrame, col: str, etiqueta: str) -> None:
    """
    Muestra cómo se distribuye la cantidad de intentos por ANI para una columna
    (por ejemplo: intentos_unallocated, intentos_answering_machine, etc.).
    """
    print("\n" + "=" * 60)
    print(f"Distribución de {etiqueta} por ANI ({col})")
    print("=" * 60)

    vc = resumen[col].value_counts().sort_index()
    print("\nCantidad de ANI según N° de intentos:")
    print(vc.to_string())

    total_ani = len(resumen)
    print(f"\nTotal de ANI: {total_ani}")

    # Probamos distintos cortes para ver impacto
    for t in [1, 2, 3, 4, 5, 6, 8, 10]:
        cant = (resumen[col] >= t).sum()
        if cant == 0:
            continue
        pct = cant * 100.0 / total_ani
        print(f"ANI con {etiqueta} >= {t}: {cant} ({pct:.1f}%)")

def analizar_curva_contacto(df: pd.DataFrame) -> None:
    """
    Analiza en qué intento se logra el primer ANSWER-AGENT por ANI.
    Esto sirve para definir hasta qué intento conviene insistir.
    """
    print("\n" + "=" * 60)
    print("Curva de contactación: intento del primer AGENT")
    print("=" * 60)

    df = df.copy()

    df["__estado_norm"] = (
        df[COL_ESTADO].astype(str).str.strip().str.lower().str.replace(" ", "")
    )
    df["__subestado_norm"] = (
        df[COL_SUBESTADO].fillna("").astype(str).str.strip().str.lower()
    )

    df[COL_FECHA] = pd.to_datetime(df[COL_FECHA], errors="coerce")
    df = df.dropna(subset=[COL_FECHA])

    # Ordenamos por ANI + fecha
    df = df.sort_values([COL_ANI, COL_FECHA])

    # Calculamos número de intento dentro de cada ANI
    df["__intento_n"] = df.groupby(COL_ANI).cumcount() + 1

    # Filtramos sólo filas donde realmente hubo ANSWER-AGENT
    mask_answer_agent = (
        (df["__estado_norm"] == "answer")
        & (df["__subestado_norm"].str.contains("agent"))
    )
    df_aa = df[mask_answer_agent]

    if df_aa.empty:
        print("No se encontraron registros con AGENT.")
        return

    # ¿En qué intento se logró por primera vez?
    primer_intento = df_aa.groupby(COL_ANI)["__intento_n"].min()
    dist = primer_intento.value_counts().sort_index()

    print("\nIntento en que se logra el primer AGENT:")
    print(dist.to_string())

    total_contactados = len(primer_intento)
    print(f"\nTotal de ANI que llegaron a AGENT al menos una vez: {total_contactados}")

    for t in [1, 2, 3, 4, 5, 6, 8, 10]:
        cant = (primer_intento <= t).sum()
        pct = cant * 100.0 / total_contactados
        print(f"ANI que atienden en intento ≤ {t}: {cant} ({pct:.1f}%)")

def main():
    if len(sys.argv) < 2:
        print("Uso: python analizar_umbral_depuracion.py <ruta_ticket>")
        sys.exit(1)

    ruta = Path(sys.argv[1])
    if not ruta.exists():
        print(f"No se encontró el archivo: {ruta}")
        sys.exit(1)

    print(f"Leyendo ticket: {ruta}")
    df = leer_ticket(ruta)

    # Armamos el resumen por ANI con el módulo depurador_bases
    resumen = depurador_bases.construir_resumen_por_ani(
        df,
        col_estado=COL_ESTADO,
        col_subestado=COL_SUBESTADO,
        col_ani=COL_ANI,
        col_fecha=COL_FECHA,
    )

    print("\nColumnas disponibles en el resumen:")
    print(resumen.columns.tolist())

    # Analizamos cada "familia" de intentos
    analizar_umbral_uno(resumen, "intentos_unallocated", "UNALLOCATED")
    analizar_umbral_uno(resumen, "intentos_answering_machine", "ANSWERING MACHINE")
    analizar_umbral_uno(resumen, "intentos_no_answer", "NO ANSWER")
    analizar_umbral_uno(resumen, "intentos_rejected", "REJECTED")

    # Curva de contactación por intento
    analizar_curva_contacto(df)

if __name__ == "__main__":
    main()