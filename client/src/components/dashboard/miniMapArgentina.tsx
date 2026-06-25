import { useMemo, useState } from "react";
import { MapPin } from "lucide-react";
import type { AnalysisResult } from "@shared/schema";
import { extractPrefijoArgentina } from "@shared/prefijos";

interface MiniMapaArgentinaProps {
  data: AnalysisResult;
}

type RegionMeta = {
  ciudad: string;
  x: number;
  y: number;
};

type PuntoMapa = {
  prefijo: string;
  ciudad: string;
  x: number;
  y: number;
  anis: number;
  contactos: number;
  efectividad: number;
};

const REGION_BY_PREFIX: Record<string, RegionMeta> = {
  "11": { ciudad: "Buenos Aires / AMBA", x: 200, y: 245 },
  "221": { ciudad: "La Plata", x: 210, y: 260 },
  "223": { ciudad: "Mar del Plata", x: 220, y: 295 },
  "261": { ciudad: "Mendoza", x: 95, y: 240 },
  "260": { ciudad: "San Rafael", x: 90, y: 270 },
  "264": { ciudad: "San Juan", x: 105, y: 215 },
  "266": { ciudad: "San Luis", x: 130, y: 240 },
  "299": { ciudad: "Neuquén", x: 95, y: 320 },
  "341": { ciudad: "Rosario", x: 175, y: 215 },
  "342": { ciudad: "Santa Fe", x: 180, y: 195 },
  "343": { ciudad: "Paraná", x: 185, y: 205 },
  "351": { ciudad: "Córdoba", x: 145, y: 200 },
  "362": { ciudad: "Resistencia", x: 175, y: 130 },
  "376": { ciudad: "Misiones", x: 220, y: 115 },
  "379": { ciudad: "Corrientes", x: 185, y: 145 },
  "381": { ciudad: "Tucumán", x: 130, y: 130 },
  "385": { ciudad: "Santiago del Estero", x: 150, y: 150 },
  "387": { ciudad: "Salta", x: 125, y: 95 },
  "388": { ciudad: "Jujuy", x: 120, y: 75 },
  "2966": { ciudad: "Río Gallegos", x: 105, y: 430 },
  "2901": { ciudad: "Ushuaia", x: 120, y: 470 },
};

const argentinaPath = `
  M 175 50
  L 195 60 L 205 85 L 215 110 L 220 140
  L 235 165 L 240 195 L 245 225 L 240 255
  L 230 285 L 225 315 L 215 345 L 200 370
  L 185 395 L 170 415 L 155 435 L 140 455
  L 125 475 L 115 485 L 110 475 L 100 460
  L 90 440 L 85 415 L 80 385 L 85 355
  L 90 325 L 85 295 L 80 265 L 75 235
  L 70 205 L 75 175 L 85 145 L 95 115
  L 110 90 L 130 70 L 150 55 Z
`;

function extractPrefijo(ani?: unknown) {
  const prefijo = extractPrefijoArgentina(ani);
  return REGION_BY_PREFIX[prefijo] ? prefijo : "";
}

function normalizarAni(value?: unknown) {
  return String(value ?? "").replace(/\D/g, "");
}

function isContactoEfectivo(record: AnalysisResult["rawRecords"][number]) {
  const estado = String(record.estado ?? "").toUpperCase().trim();
  const subestado = String(record.subestado ?? "").toUpperCase().trim();

  return estado === "ANSWER" && subestado.includes("AGENT");
}

const MiniMapaArgentina = ({ data }: MiniMapaArgentinaProps) => {
  const [hover, setHover] = useState<PuntoMapa | null>(null);

  const puntos = useMemo<PuntoMapa[]>(() => {
    const agrupado = new Map<
      string,
      {
        anis: Set<string>;
        contactos: Set<string>;
      }
    >();

    for (const record of data.rawRecords ?? []) {
      const prefijo = extractPrefijo(record.ani);
      const meta = REGION_BY_PREFIX[prefijo];

      if (!prefijo || !meta) continue;

      const ani = normalizarAni(record.ani);

      if (!ani) continue;

      const current =
        agrupado.get(prefijo) ??
        {
          anis: new Set<string>(),
          contactos: new Set<string>(),
        };

      current.anis.add(ani);

      if (isContactoEfectivo(record)) {
        current.contactos.add(ani);
      }

      agrupado.set(prefijo, current);
    }

    return Array.from(agrupado.entries())
      .map(([prefijo, values]) => {
        const meta = REGION_BY_PREFIX[prefijo];
        const anis = values.anis.size;
        const contactos = values.contactos.size;

        return {
          prefijo,
          ciudad: meta.ciudad,
          x: meta.x,
          y: meta.y,
          anis,
          contactos,
          efectividad: anis > 0 ? (contactos / anis) * 100 : 0,
        };
      })
      .filter((item) => item.anis > 0)
      .sort((a, b) => b.anis - a.anis)
      .slice(0, 14);
  }, [data.rawRecords]);

  const maxAnis = useMemo(
    () => Math.max(...puntos.map((punto) => punto.anis), 1),
    [puntos]
  );

  const totalAnis = useMemo(
    () => puntos.reduce((acc, punto) => acc + punto.anis, 0),
    [puntos]
  );

  const radius = (anis: number) => 5 + (anis / maxAnis) * 18;

  const colorByEfectividad = (efectividad: number) => {
    if (efectividad >= 16) return "hsl(var(--success))";
    if (efectividad >= 8) return "hsl(var(--warning))";
    return "hsl(var(--destructive))";
  };

  if (puntos.length === 0) {
    return (
      <div className="glass-card p-5 animate-slide-up hover-elevate">
        <h3 className="mb-1 flex items-center gap-2 text-sm font-display font-semibold">
          <MapPin className="h-4 w-4 text-primary" />
          Mapa de cobertura · ANIs por región
        </h3>

        <p className="py-8 text-center text-sm text-muted-foreground">
          No hay prefijos mapeables suficientes para construir el mapa.
        </p>
      </div>
    );
  }

  return (
    <div className="glass-card p-5 animate-slide-up hover-elevate">
      <h3 className="mb-1 flex items-center gap-2 text-sm font-display font-semibold">
        <MapPin className="h-4 w-4 text-primary" />
        Mapa de cobertura · ANIs por región
      </h3>

      <p className="mb-4 text-xs text-muted-foreground">
        Tamaño = volumen real de ANIs · Color = efectividad de contactación.
      </p>

      <div className="grid grid-cols-1 gap-4 items-start md:grid-cols-[1fr_230px]">
        <div className="relative rounded-xl border border-glass-border bg-muted/20 p-3">
          <svg viewBox="0 0 300 500" className="h-auto max-h-[480px] w-full">
            <path
              d={argentinaPath}
              fill="hsl(var(--primary) / 0.08)"
              stroke="hsl(var(--primary) / 0.45)"
              strokeWidth="1.5"
              strokeDasharray="3 3"
            />

            {puntos.map((punto) => {
              const color = colorByEfectividad(punto.efectividad);

              return (
                <g
                  key={punto.prefijo}
                  onMouseEnter={() => setHover(punto)}
                  onMouseLeave={() => setHover(null)}
                  className="cursor-pointer"
                >
                  <circle
                    cx={punto.x}
                    cy={punto.y}
                    r={radius(punto.anis) + 4}
                    fill={color}
                    opacity={hover?.prefijo === punto.prefijo ? 0.35 : 0.14}
                  />

                  <circle
                    cx={punto.x}
                    cy={punto.y}
                    r={radius(punto.anis)}
                    fill={color}
                    stroke="hsl(var(--background))"
                    strokeWidth="1.5"
                    style={{
                      filter:
                        hover?.prefijo === punto.prefijo
                          ? "drop-shadow(0 0 8px hsl(var(--primary)))"
                          : undefined,
                    }}
                  />

                  <text
                    x={punto.x}
                    y={punto.y + 3}
                    textAnchor="middle"
                    fontSize="8"
                    fontWeight="700"
                    fill="hsl(var(--background))"
                    className="pointer-events-none tabular-nums"
                  >
                    {punto.prefijo}
                  </text>
                </g>
              );
            })}
          </svg>

          {hover && (
            <div className="absolute right-3 top-3 min-w-[190px] rounded-xl border border-glass-border bg-card/95 p-3 shadow-xl backdrop-blur-md pointer-events-none">
              <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
                Prefijo {hover.prefijo}
              </div>

              <div className="mb-2 text-sm font-display font-bold">
                {hover.ciudad}
              </div>

              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">ANIs</span>
                <span className="font-semibold tabular-nums">
                  {hover.anis.toLocaleString("es-AR")}
                </span>
              </div>

              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Contactos</span>
                <span className="font-semibold tabular-nums">
                  {hover.contactos.toLocaleString("es-AR")}
                </span>
              </div>

              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Efectividad</span>
                <span
                  className="font-semibold tabular-nums"
                  style={{ color: colorByEfectividad(hover.efectividad) }}
                >
                  {hover.efectividad.toFixed(1)}%
                </span>
              </div>
            </div>
          )}
        </div>

        <div className="space-y-3">
          <div className="glass-card p-3 soft-cyan-hover">
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
              Total ANIs mapeados
            </div>

            <div className="text-2xl font-display font-extrabold tabular-nums">
              {totalAnis.toLocaleString("es-AR")}
            </div>
          </div>

          <div className="glass-card p-3 space-y-2 soft-cyan-hover">
            <div className="mb-1 text-[10px] uppercase tracking-widest text-muted-foreground">
              Efectividad
            </div>

            {[
              { label: "Alta ≥16%", color: "hsl(var(--success))" },
              { label: "Media 8–16%", color: "hsl(var(--warning))" },
              { label: "Baja <8%", color: "hsl(var(--destructive))" },
            ].map((item) => (
              <div key={item.label} className="flex items-center gap-2 text-xs">
                <span
                  className="h-3 w-3 rounded-full border border-glass-border"
                  style={{ backgroundColor: item.color }}
                />
                <span className="text-muted-foreground">{item.label}</span>
              </div>
            ))}
          </div>

          <div className="glass-card p-3 soft-cyan-hover">
            <div className="mb-2 text-[10px] uppercase tracking-widest text-muted-foreground">
              Top 3 regiones
            </div>

            <div className="space-y-1.5">
              {puntos.slice(0, 3).map((punto, index) => (
                <div
                  key={punto.prefijo}
                  className="flex items-center justify-between rounded px-1 py-0.5 text-xs transition hover:bg-primary/5"
                >
                  <span className="flex min-w-0 items-center gap-1.5">
                    <span className="w-3 tabular-nums text-muted-foreground">
                      {index + 1}.
                    </span>

                    <span className="truncate font-semibold">
                      {punto.ciudad}
                    </span>
                  </span>

                  <span className="tabular-nums text-muted-foreground">
                    {punto.anis.toLocaleString("es-AR")}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default MiniMapaArgentina;
