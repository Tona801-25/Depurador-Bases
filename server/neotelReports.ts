import crypto from "node:crypto";
import Papa from "papaparse";

export type NeotelReportType = "GESTIONES" | "PRODUCTIVIDAD";

export type GestionCommercialAction =
  | "EXCLUIR"
  | "BUZON"
  | "PRIORIZAR"
  | "REVISAR";

export type GestionRecordInput = {
  recordHash: string;
  ts: string;
  reportDate: string;
  base: string;
  idLote: string;
  descripcion: string;
  idContacto: string;
  titular: string;
  dniCuit: string;
  ani: string;
  usuario: string;
  resultado: string;
  subresultado: string;
  cantLlamados: number | null;
  precio: string;
  localidad: string;
  observaciones: string;
  duracionLlamadas: string;
  accionComercial: GestionCommercialAction;
  motivoAccion: string;
  rawJson: string;
};

export type ProductivityRecordInput = {
  recordHash: string;
  reportDate: string;
  usuario: string;
  usuarioId: string;
  loginSeconds: number;
  descansoSeconds: number;
  administrativeSeconds: number;
  conversationInboundSeconds: number;
  conversationOutboundSeconds: number;
  dialingSeconds: number;
  idleSeconds: number;
  connectedInbound: number;
  connectedOutbound: number;
  notConnectedOutbound: number;
  metricsJson: string;
};

export type ParsedNeotelReport =
  | {
      type: "GESTIONES";
      fileName: string;
      fileHash: string;
      reportDate: string;
      totalRows: number;
      rejectedRows: number;
      records: GestionRecordInput[];
      warnings: string[];
    }
  | {
      type: "PRODUCTIVIDAD";
      fileName: string;
      fileHash: string;
      reportDate: string;
      totalRows: number;
      rejectedRows: number;
      records: ProductivityRecordInput[];
      warnings: string[];
    };

function sha256(value: string | Buffer) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function normalizeText(value: unknown) {
  return String(value ?? "")
    .replace(/^\uFEFF/, "")
    .trim();
}

function normalizeCategory(value: unknown) {
  return normalizeText(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase();
}

function normalizeAni(value: unknown) {
  return normalizeText(value).replace(/\D/g, "");
}

function decodeReport(buffer: Buffer) {
  const utf8 = buffer.toString("utf8");
  const replacements = (utf8.match(/\uFFFD/g) || []).length;
  return replacements > 2 ? buffer.toString("latin1") : utf8;
}

function reportDateFromName(fileName: string) {
  const match = fileName.match(/(20\d{2})-(\d{2})-(\d{2})/);
  return match ? `${match[1]}-${match[2]}-${match[3]}` : "";
}

function parseGestionTimestamp(value: string) {
  const match = value.match(
    /^(\d{1,2})\/(\d{1,2})\/(20\d{2})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/,
  );
  if (!match) return "";

  const [, day, month, year, hour = "0", minute = "0", second = "0"] = match;
  const date = new Date(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour),
    Number(minute),
    Number(second),
  );

  return Number.isNaN(date.getTime()) ? "" : date.toISOString();
}

function parseDurationSeconds(value: unknown) {
  const text = normalizeText(value);
  const match = text.match(/^(\d+):(\d{2}):(\d{2})(?:\.(\d+))?$/);
  if (!match) return 0;
  return Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]);
}

function parseNumber(value: unknown) {
  const parsed = Number(String(value ?? "").replace(",", "."));
  return Number.isFinite(parsed) ? parsed : 0;
}

export function getGestionCommercialAction(
  resultado: string,
  subresultado: string,
): { action: GestionCommercialAction; reason: string } {
  const result = normalizeCategory(resultado);
  const subresult = normalizeCategory(subresultado);

  if (result === "COMPRA") {
    return { action: "EXCLUIR", reason: "Compra registrada" };
  }

  if (result.includes("FRAUDE") || subresult.includes("FRAUDE")) {
    return { action: "EXCLUIR", reason: "Catalogado como fraude" };
  }

  if (
    result.includes("CLIENTE MOLESTO") ||
    subresult.includes("CLIENTE MOLESTO")
  ) {
    return { action: "EXCLUIR", reason: "Catalogado como cliente molesto" };
  }

  if (
    subresult.includes("CONTESTADOR") ||
    subresult.includes("BUZON")
  ) {
    return { action: "BUZON", reason: "Catalogado como contestador o buzón" };
  }

  if (
    subresult.includes("INTERESADO") ||
    subresult.includes("WHATSAPP")
  ) {
    return { action: "PRIORIZAR", reason: "Gestión con señal comercial" };
  }

  return { action: "REVISAR", reason: "Catalogación informativa" };
}

function parseGestiones(buffer: Buffer, fileName: string): ParsedNeotelReport {
  const content = decodeReport(buffer);
  const parsed = Papa.parse<Record<string, unknown>>(content, {
    header: true,
    delimiter: ";",
    skipEmptyLines: true,
    transformHeader: (header) => normalizeText(header),
  });

  const reportDate = reportDateFromName(fileName);
  const warnings = parsed.errors.slice(0, 20).map(
    (error) => `Fila ${Number(error.row ?? 0) + 2}: ${error.message}`,
  );
  let rejectedRows = 0;

  const records = parsed.data.flatMap((row, index) => {
    const ani = normalizeAni(row.ANI_TELEFONO);
    const resultado = normalizeText(row.RESULTADO);
    const subresultado = normalizeText(row["SUB RESULTADO"]);
    const tsOriginal = normalizeText(row.TS);
    const ts = parseGestionTimestamp(tsOriginal);

    if (ani.length < 7 || (!resultado && !subresultado) || !ts) {
      rejectedRows++;
      if (warnings.length < 20) {
        warnings.push(`Fila ${index + 2}: faltan ANI, fecha o catalogación válida.`);
      }
      return [];
    }

    const action = getGestionCommercialAction(resultado, subresultado);
    const rawJson = JSON.stringify(row);
    const recordHash = sha256(
      [
        ts,
        ani,
        normalizeText(row.IDCONTACTO),
        resultado,
        subresultado,
        normalizeText(row["N USUARIO - USUARIO"]),
      ].join("|"),
    );

    return [
      {
        recordHash,
        ts,
        reportDate,
        base: normalizeText(row.BASE),
        idLote: normalizeText(row.IDLOTE),
        descripcion: normalizeText(row.DESCRIPCION),
        idContacto: normalizeText(row.IDCONTACTO),
        titular: normalizeText(row["TITULAR / RAZON SOCIAL"]),
        dniCuit: normalizeText(row["DNI / CUIT"]),
        ani,
        usuario: normalizeText(row["N USUARIO - USUARIO"]),
        resultado,
        subresultado,
        cantLlamados: normalizeText(row["CANT LLAMADOS"])
          ? parseNumber(row["CANT LLAMADOS"])
          : null,
        precio: normalizeText(row.CPRECIO),
        localidad: normalizeText(row.TXTLOCALIDAD),
        observaciones: normalizeText(row["Obs."]),
        duracionLlamadas: normalizeText(row["Duracion de llamadas"]),
        accionComercial: action.action,
        motivoAccion: action.reason,
        rawJson,
      },
    ];
  });

  return {
    type: "GESTIONES",
    fileName,
    fileHash: sha256(buffer),
    reportDate,
    totalRows: parsed.data.length,
    rejectedRows,
    records,
    warnings,
  };
}

function parseProductividad(
  buffer: Buffer,
  fileName: string,
): ParsedNeotelReport {
  const content = decodeReport(buffer);
  const lines = content.split(/\r?\n/).filter((line) => line.trim());
  const headers = (lines.shift() ?? "").split(",").map(normalizeText);
  const reportDate = reportDateFromName(fileName);
  const warnings: string[] = [];
  let rejectedRows = 0;

  const records = lines.flatMap((line, index) => {
    const values = line.split(",");
    const overflow = values.length - headers.length;

    if (overflow < 0) {
      rejectedRows++;
      warnings.push(`Fila ${index + 2}: tiene menos columnas que el encabezado.`);
      return [];
    }

    const usuario = values
      .slice(0, overflow + 1)
      .map(normalizeText)
      .join(", ");
    const alignedValues = [usuario, ...values.slice(overflow + 1)];
    const metrics = Object.fromEntries(
      headers.map((header, headerIndex) => [
        header,
        normalizeText(alignedValues[headerIndex]),
      ]),
    );
    const usuarioId = usuario.match(/^\d+/)?.[0] ?? "";

    if (!usuario) {
      rejectedRows++;
      warnings.push(`Fila ${index + 2}: no tiene asesor.`);
      return [];
    }

    return [
      {
        recordHash: sha256(`${fileName}|${reportDate}|${usuario}|${line}`),
        reportDate,
        usuario,
        usuarioId,
        loginSeconds: parseDurationSeconds(metrics["Tiempo de Login"]),
        descansoSeconds: parseDurationSeconds(metrics.Descanso),
        administrativeSeconds: parseDurationSeconds(metrics.AdministrativeTime),
        conversationInboundSeconds: parseDurationSeconds(
          metrics["Tiempo de Conversación (Entrante)"],
        ),
        conversationOutboundSeconds: parseDurationSeconds(
          metrics["Tiempo de Conversación (Saliente)"],
        ),
        dialingSeconds: parseDurationSeconds(metrics["Tiempo de Marcado"]),
        idleSeconds: parseDurationSeconds(metrics["Tiempo Ocioso"]),
        connectedInbound: parseNumber(metrics["Llamadas Conectadas (Entrante)"]),
        connectedOutbound: parseNumber(metrics["Llamadas Conectadas (Saliente)"]),
        notConnectedOutbound: parseNumber(
          metrics["Llamadas No Conectadas (Saliente)"],
        ),
        metricsJson: JSON.stringify(metrics),
      },
    ];
  });

  return {
    type: "PRODUCTIVIDAD",
    fileName,
    fileHash: sha256(buffer),
    reportDate,
    totalRows: lines.length,
    rejectedRows,
    records,
    warnings: warnings.slice(0, 20),
  };
}

export function parseNeotelReport(buffer: Buffer, fileName: string) {
  if (/^Gestiones_todas_/i.test(fileName)) {
    return parseGestiones(buffer, fileName);
  }

  if (/^Productividad_Usuarios_/i.test(fileName)) {
    return parseProductividad(buffer, fileName);
  }

  throw new Error(
    "El archivo no coincide con Gestiones_todas o Productividad_Usuarios.",
  );
}
