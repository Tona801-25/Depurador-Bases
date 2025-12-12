import tkinter as tk
import unicodedata
import pandas as pd
import depurador_bases  # módulo de lógica

from tkinter import ttk, filedialog, messagebox
from pathlib import Path

# ============================
# HELPERS PARA COLUMNAS
# ============================

def normalizar_columna(col: str) -> str:
    """Normaliza nombres de columna (similar a tu main.py)."""
    col = col.strip()
    col = "".join(
        c
        for c in unicodedata.normalize("NFKD", col)
        if not unicodedata.combining(c)
    )
    col = col.upper()
    col = col.replace(" ", "").replace("-", "").replace("/", "")
    return col

def detectar_columnas(df: pd.DataFrame):
    """
    Detecta automáticamente columnas de ESTADO, SUBESTADO, ANI y FECHA
    usando nombres normalizados.
    """
    cols_orig = list(df.columns)
    cols_norm = [normalizar_columna(c) for c in cols_orig]

    mapa = {n: o for n, o in zip(cols_norm, cols_orig)}

    def buscar(posibles: list[str], nombre_logico: str) -> str:
        for p in posibles:
            if p in mapa:
                return mapa[p]
        raise KeyError(
            f"No se encontró columna para {nombre_logico}. "
            f"Columnas disponibles (normalizadas): {cols_norm}"
        )

    col_estado = buscar(["ESTADO", "STATUS", "STATE"], "ESTADO")
    col_subestado = buscar(["SUBESTADO", "SUBESTATUS", "SUBSTATE"], "SUBESTADO")
    col_ani = buscar(
        ["ANI", "ANITELEFONO", "TELEFONO", "NUMEROTELEFONO", "NUMEROLLAMADO", "NUMERO"],
        "ANI / TELÉFONO",
    )
    col_fecha = buscar(
        ["FECHAINICIO", "FECHAHORA", "INICIO", "LOGTIME", "FECHALLAMADA"],
        "FECHA / HORA",
    )

    return col_estado, col_subestado, col_ani, col_fecha

# ============================
# LECTURA DEL TICKET
# ============================

def leer_ticket_generico(ruta: Path) -> pd.DataFrame:
    """
    Lectura genérica de ticket Neotel.
    Soporta xls/xlsx/csv/txt.
    """
    nombre = ruta.name.lower()
    if nombre.endswith((".xlsx", ".xlsm", ".xlsb", ".xls")):
        df = pd.read_excel(ruta)
    elif nombre.endswith((".csv", ".txt")):
        df = pd.read_csv(ruta, sep=None, engine="python", encoding="latin1")
    else:
        raise ValueError(f"Formato de archivo no soportado: {nombre}")

    return df

# ============================
# CLASE PRINCIPAL TKINTER
# ============================

class DepuradorGUI(tk.Tk):
    def __init__(self):
        super().__init__()

        self.title("DEPURADOR DE BASES – ANTONELLA")
        self.geometry("900x650")
        self.minsize(820, 580)

        # Datos en memoria
        self.df_raw: pd.DataFrame | None = None
        self.resumen_ani: pd.DataFrame | None = None
        self.base_depurada: pd.DataFrame | None = None
        self.descartados: pd.DataFrame | None = None

        # Columnas detectadas
        self.col_estado: str | None = None
        self.col_subestado: str | None = None
        self.col_ani: str | None = None
        self.col_fecha: str | None = None

        self._configurar_estilos()
        self._build_ui()

    # ---------------- ESTILOS ----------------
    def _configurar_estilos(self):
        style = ttk.Style(self)
        # Podés probar otros temas: "clam", "alt", "default", "vista"
        style.theme_use("clam")

        # Colores base
        azul = "#042a51"
        gris_claro = "#f4f6f8"

        self.configure(bg=gris_claro)

        style.configure(
            "Title.TLabel",
            font=("Segoe UI", 16, "bold"),
            foreground=azul,
            background=gris_claro,
        )
        style.configure(
            "Subtitle.TLabel",
            font=("Segoe UI", 9),
            foreground="#444444",
            background=gris_claro,
        )
        style.configure(
            "Step.TLabelframe",
            font=("Segoe UI", 9, "bold"),
            foreground=azul,
            background=gris_claro,
        )
        style.configure(
            "Step.TLabelframe.Label",
            foreground=azul,
            background=gris_claro,
        )
        style.configure(
            "Step.TLabelframe.Label",
            font=("Segoe UI", 9, "bold"),
        )

        style.configure(
            "Kpi.TLabelframe",
            font=("Segoe UI", 9, "bold"),
            foreground=azul,
            background=gris_claro,
        )
        style.configure(
            "Kpi.TLabelframe.Label",
            foreground=azul,
            background=gris_claro,
        )
        style.configure(
            "KpiValue.TLabel",
            font=("Segoe UI", 13, "bold"),
            foreground=azul,
            background="white",
        )
        style.configure(
            "KpiText.TLabel",
            font=("Segoe UI", 9),
            foreground="#666666",
            background="white",
        )

        style.configure(
            "Primary.TButton",
            font=("Segoe UI", 9, "bold"),
            foreground="white",
            background=azul,
        )
        style.map(
            "Primary.TButton",
            background=[("active", "#07417c")],
        )

        style.configure(
            "Export.TButton",
            font=("Segoe UI", 9),
        )

        style.configure(
            "Tags.TLabelframe",
            font=("Segoe UI", 9, "bold"),
            foreground=azul,
        )

    # ---------------- UI ----------------
    def _build_ui(self):
        # ---- HEADER ----
        header = ttk.Frame(self, padding=(12, 10))
        header.pack(side=tk.TOP, fill=tk.X)

        lbl_title = ttk.Label(
            header,
            text="DEPURADOR DE BASES – ANTONELLA",
            style="Title.TLabel",
        )
        lbl_title.pack(anchor="w")

        lbl_sub = ttk.Label(
            header,
            text="Pensado para limpiar bases de Neotel por comportamiento de ANI "
                 "(ANSWER, NO ANSWER, busy, unallocated, rejected).",
            style="Subtitle.TLabel",
            wraplength=750,
            justify="left",
        )
        lbl_sub.pack(anchor="w", pady=(2, 0))

        # ---- PASOS / BOTÓN CARGA ----
        pasos = ttk.Labelframe(
            self,
            text="Pasos",
            style="Step.TLabelframe",
            padding=(10, 8),
        )
        pasos.pack(side=tk.TOP, fill=tk.X, padx=12, pady=(0, 6))

        pasos.columnconfigure(0, weight=1)
        pasos.columnconfigure(1, weight=3)

        frame_btn = ttk.Frame(pasos)
        frame_btn.grid(row=0, column=0, sticky="w", padx=(0, 12))

        btn_cargar = ttk.Button(
            frame_btn,
            text="📂  Paso 1 – Cargar ticket Neotel",
            style="Primary.TButton",
            command=self.cargar_ticket,
        )
        btn_cargar.pack(side=tk.LEFT)

        self.lbl_archivo = ttk.Label(
            pasos,
            text="Paso 2 – El sistema analiza ANI por ANI y muestra el resumen.",
            style="Subtitle.TLabel",
        )
        self.lbl_archivo.grid(row=0, column=1, sticky="w")

        lbl_paso3 = ttk.Label(
            pasos,
            text="Paso 3 – Exportar: resumen por ANI, base depurada y ANIs descartados.",
            style="Subtitle.TLabel",
        )
        lbl_paso3.grid(row=1, column=0, columnspan=2, sticky="w", pady=(4, 0))

        # ---- PANEL CENTRAL (KPIs + TAGS) ----
        center = ttk.Frame(self, padding=(12, 6))
        center.pack(side=tk.TOP, fill=tk.BOTH, expand=True)

        # KPIs
        kpi_frame = ttk.Labelframe(
            center,
            text="Resumen general",
            style="Kpi.TLabelframe",
            padding=(10, 8),
        )
        kpi_frame.pack(side=tk.TOP, fill=tk.X)

        kpi_frame.columnconfigure(0, weight=1)
        kpi_frame.columnconfigure(1, weight=1)
        kpi_frame.columnconfigure(2, weight=2)

        # KPI 1
        card1 = ttk.Frame(kpi_frame, relief="groove", borderwidth=1)
        card1.grid(row=0, column=0, sticky="nsew", padx=4, pady=4)
        card1.configure(style="Card.TFrame")
        card1.grid_columnconfigure(0, weight=1)

        ttk.Label(
            card1,
            text="ANIs totales en el ticket",
            style="KpiText.TLabel",
        ).grid(row=0, column=0, sticky="w", padx=8, pady=(6, 0))

        self.var_total_ani = tk.StringVar(value="0")
        ttk.Label(
            card1,
            textvariable=self.var_total_ani,
            style="KpiValue.TLabel",
        ).grid(row=1, column=0, sticky="w", padx=8, pady=(0, 8))

        # KPI 2
        card2 = ttk.Frame(kpi_frame, relief="groove", borderwidth=1)
        card2.grid(row=0, column=1, sticky="nsew", padx=4, pady=4)
        card2.grid_columnconfigure(0, weight=1)

        ttk.Label(
            card2,
            text="ANIs sugeridos para depurar",
            style="KpiText.TLabel",
        ).grid(row=0, column=0, sticky="w", padx=8, pady=(6, 0))

        self.var_descartar_ani = tk.StringVar(value="0")
        ttk.Label(
            card2,
            textvariable=self.var_descartar_ani,
            style="KpiValue.TLabel",
        ).grid(row=1, column=0, sticky="w", padx=8, pady=(0, 8))

        # Explicación rápida
        card3 = ttk.Frame(kpi_frame, relief="groove", borderwidth=1)
        card3.grid(row=0, column=2, sticky="nsew", padx=4, pady=4)
        card3.grid_columnconfigure(0, weight=1)

        texto_exp = (
            "Reglas actuales (resumen):\n"
            "• INVALIDO: muchos 'unallocated'.\n"
            "• CONTACTADO: al menos 1 ANSWER-AGENT.\n"
            "• SOLO_BUZON: repite ANSWERING MACHINE.\n"
            "• NO_ATIENDE: muchos NO ANSWER sin contacto.\n"
            "• RECHAZA: rechaza llamadas.\n"
            "• SEGUIR_INTENTANDO: sigue siendo vendible."
        )
        ttk.Label(
            card3,
            text=texto_exp,
            style="Subtitle.TLabel",
            justify="left",
            wraplength=320,
        ).grid(row=0, column=0, sticky="w", padx=8, pady=6)

        # ---- TABLA TAGS ----
        tags_frame = ttk.Labelframe(
            center,
            text="Distribución por TAG (ANI)",
            style="Tags.TLabelframe",
            padding=(10, 4),
        )
        tags_frame.pack(side=tk.TOP, fill=tk.BOTH, expand=True, pady=(8, 0))

        columns = ("TAG", "CANTIDAD")
        self.tree_tags = ttk.Treeview(
            tags_frame,
            columns=columns,
            show="headings",
            height=12,
        )
        self.tree_tags.heading("TAG", text="TAG")
        self.tree_tags.heading("CANTIDAD", text="Cantidad de ANIs")
        self.tree_tags.column("TAG", anchor="center", width=160)
        self.tree_tags.column("CANTIDAD", anchor="center", width=140)

        self.tree_tags.pack(side=tk.LEFT, fill=tk.BOTH, expand=True)

        scrollbar = ttk.Scrollbar(
            tags_frame,
            orient="vertical",
            command=self.tree_tags.yview,
        )
        self.tree_tags.configure(yscrollcommand=scrollbar.set)
        scrollbar.pack(side=tk.RIGHT, fill=tk.Y)

        lbl_aclaracion = ttk.Label(
            center,
            text="Tip: arrancá mirando cuántos ANIs se van por cada TAG. "
                 "Después abrí los archivos exportados para ver detalle.",
            style="Subtitle.TLabel",
        )
        lbl_aclaracion.pack(side=tk.TOP, anchor="w", pady=(4, 0))

        # ---- BOTONES EXPORTACIÓN ----
        bottom = ttk.Frame(self, padding=(12, 8))
        bottom.pack(side=tk.BOTTOM, fill=tk.X)

        ttk.Button(
            bottom,
            text="⬇️ Exportar resumen ANI (XLSX)",
            style="Export.TButton",
            command=self.exportar_resumen,
        ).pack(side=tk.LEFT, padx=4)

        ttk.Button(
            bottom,
            text="⬇️ Exportar base depurada (XLSX)",
            style="Export.TButton",
            command=self.exportar_base,
        ).pack(side=tk.LEFT, padx=4)

        ttk.Button(
            bottom,
            text="⬇️ Exportar ANIs descartados (XLSX)",
            style="Export.TButton",
            command=self.exportar_descartados,
        ).pack(side=tk.LEFT, padx=4)

    # ---------------- LÓGICA ----------------
    def cargar_ticket(self):
        ruta_str = filedialog.askopenfilename(
            title="Seleccionar ticket Neotel",
            filetypes=(
                ("Excel / CSV", "*.xls *.xlsx *.xlsm *.xlsb *.csv *.txt"),
                ("Todos los archivos", "*.*"),
            ),
        )
        if not ruta_str:
            return

        ruta = Path(ruta_str)

        try:
            df = leer_ticket_generico(ruta)
        except Exception as e:
            messagebox.showerror(
                "Error al leer archivo",
                f"No se pudo leer el archivo:\n{e}",
            )
            return

        self.df_raw = df

        # Detectar columnas reales del ticket
        try:
            col_estado, col_subestado, col_ani, col_fecha = detectar_columnas(df)
        except Exception as e:
            messagebox.showerror(
                "Error detectando columnas",
                f"No se pudieron identificar las columnas clave:\n{e}",
            )
            return

        self.col_estado = col_estado
        self.col_subestado = col_subestado
        self.col_ani = col_ani
        self.col_fecha = col_fecha

        try:
            resumen, base_depurada, descartados = depurador_bases.procesar_desde_df(
                df,
                col_estado=col_estado,
                col_subestado=col_subestado,
                col_ani=col_ani,
                col_fecha=col_fecha,
            )
        except Exception as e:
            messagebox.showerror(
                "Error en depuración",
                f"Ocurrió un error al procesar el ticket:\n{e}",
            )
            return

        self.resumen_ani = resumen
        self.base_depurada = base_depurada
        self.descartados = descartados

        self.lbl_archivo.config(
            text=(
                f"Archivo: {ruta.name}  |  ANI: {col_ani}  |  "
                f"ESTADO: {col_estado}  |  SUBESTADO: {col_subestado}"
            )
        )

        total_ani = resumen["ANI"].nunique()
        anis_descartar = descartados["ANI"].nunique()

        self.var_total_ani.set(f"{total_ani:,}".replace(",", "."))
        self.var_descartar_ani.set(f"{anis_descartar:,}".replace(",", "."))

        # Tabla por TAG
        for row in self.tree_tags.get_children():
            self.tree_tags.delete(row)

        dist_tags = (
            resumen["tag_telefono"]
            .value_counts()
            .rename_axis("TAG")
            .reset_index(name="CANTIDAD")
        )

        for _, row in dist_tags.iterrows():
            self.tree_tags.insert(
                "",
                tk.END,
                values=(row["TAG"], int(row["CANTIDAD"])),
            )

        messagebox.showinfo(
            "Depuración lista",
            "El análisis por ANI se completó.\n"
            "Ahora podés exportar los archivos desde los botones de abajo.",
        )

    def exportar_resumen(self):
        if self.resumen_ani is None:
            messagebox.showwarning(
                "Sin datos",
                "Primero cargá un ticket y dejá que se procese.",
            )
            return

        ruta_str = filedialog.asksaveasfilename(
            title="Guardar resumen por ANI",
            defaultextension=".xlsx",
            filetypes=(("Excel", "*.xlsx"),),
            initialfile="resumen_ani_depuracion.xlsx",
        )
        if not ruta_str:
            return

        try:
            self.resumen_ani.to_excel(ruta_str, index=False)
            messagebox.showinfo(
                "Exportación completada",
                f"Archivo guardado:\n{ruta_str}",
            )
        except Exception as e:
            messagebox.showerror(
                "Error al exportar",
                f"No se pudo guardar el archivo:\n{e}",
            )

    def exportar_base(self):
        if self.base_depurada is None:
            messagebox.showwarning(
                "Sin datos",
                "Primero cargá un ticket y dejá que se procese.",
            )
            return

        ruta_str = filedialog.asksaveasfilename(
            title="Guardar base depurada",
            defaultextension=".xlsx",
            filetypes=(("Excel", "*.xlsx"),),
            initialfile="base_depurada_seguir_intentando.xlsx",
        )
        if not ruta_str:
            return

        try:
            self.base_depurada.to_excel(ruta_str, index=False)
            messagebox.showinfo(
                "Exportación completada",
                f"Archivo guardado:\n{ruta_str}",
            )
        except Exception as e:
            messagebox.showerror(
                "Error al exportar",
                f"No se pudo guardar el archivo:\n{e}",
            )

    def exportar_descartados(self):
        if self.descartados is None:
            messagebox.showwarning(
                "Sin datos",
                "Primero cargá un ticket y dejá que se procese.",
            )
            return

        ruta_str = filedialog.asksaveasfilename(
            title="Guardar ANIs descartados",
            defaultextension=".xlsx",
            filetypes=(("Excel", "*.xlsx"),),
            initialfile="anis_descartados.xlsx",
        )
        if not ruta_str:
            return

        try:
            self.descartados.to_excel(ruta_str, index=False)
            messagebox.showinfo(
                "Exportación completada",
                f"Archivo guardado:\n{ruta_str}",
            )
        except Exception as e:
            messagebox.showerror(
                "Error al exportar",
                f"No se pudo guardar el archivo:\n{e}",
            )

if __name__ == "__main__":
    app = DepuradorGUI()
    app.mainloop()