export type RequiredPhotoRole = 'certificadora' | 'serie' | 'ubicacion';
export type PhotoRole = RequiredPhotoRole | 'cableado';

export type ParsedStation = {
  hostname: string;
  ip: string;
  label: string;
  serial: string;
  datamatrix: string;
};

export type ParsedBoleta = {
  agencyCode: string;
  agencyName: string;
  stations: ParsedStation[];
  warnings: string[];
};

export function hasCertificadora(station: Pick<ParsedStation, 'serial' | 'datamatrix'>) {
  return Boolean(station.serial.trim() || station.datamatrix.trim());
}

const INVALID_WINDOWS_CHARS = /[<>:"/\\|?*\u0000-\u001f]/g;

export function cleanSegment(value: string, fallback: string) {
  const cleaned = value
    .replace(INVALID_WINDOWS_CHARS, ' ')
    .replace(/\s+/g, ' ')
    .replace(/[. ]+$/g, '')
    .trim();
  return cleaned || fallback;
}

export function stationParts(label: string) {
  const numeric = label.match(/(?:CAJA\s*)?(\d+)/i)?.[1];
  if (numeric) {
    const number = String(Number(numeric));
    return {
      folder: `CAJA ${number}`,
      prefix: `Caja${number}`,
      cable: number,
    };
  }

  if (/AUTOBANCO/i.test(label)) {
    return {
      folder: 'CAJA AUTOBANCO',
      prefix: 'Autobanco',
      cable: 'AUTOBANCO',
    };
  }

  const safe = cleanSegment(label.toUpperCase(), 'ESTACION');
  return {
    folder: safe,
    prefix: cleanSegment(label, 'Estacion').replace(/\s+/g, ''),
    cable: safe.replace(/\s+/g, '_'),
  };
}

function stationLabelFromHostname(hostname: string, index: number) {
  const caja = hostname.match(/CAJA\s*0*(\d+)/i)?.[1];
  if (caja) return `CAJA ${Number(caja)}`;
  if (/AUTOBANCO/i.test(hostname)) return 'CAJA AUTOBANCO';
  return `ESTACION ${index + 1}`;
}

function agencyFromFilename(fileName: string) {
  const base = fileName
    .replace(/\.pdf$/i, '')
    .replace(/^\s*BOLETA\s+DE\s+SERVICIO\s*/i, '')
    .replace(/^\s*AGENCIA\s*/i, '')
    .replace(/^\s*AG\s*/i, '')
    .trim();
  const match = base.match(/^(\d{2,5})\s+(.+)$/);
  return match ? { code: match[1], name: match[2].trim() } : null;
}

export function parseBoletaText(rawText: string, fileName: string): ParsedBoleta {
  const text = rawText.replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
  const warnings: string[] = [];
  const fileAgency = agencyFromFilename(fileName);
  const contentAgency = text.match(/\bAgencia\s+(\d{2,5})\s+(.+?)\s+Direcci[oó]n\b/i);

  const agencyCode = fileAgency?.code || contentAgency?.[1] || '';
  const agencyName = fileAgency?.name || contentAgency?.[2]?.trim() || '';

  // PDF.js can return table cells before their visual section headings, so the
  // whole document is scanned. HOSTNAME and IPv4 tokens are specific enough
  // to the equipment table in the supplied boleta format.
  const equipmentText = text;
  const hostnameMatches = Array.from(equipmentText.matchAll(/HOSTNAME\s*:?\s+([A-Z0-9_-]+)/gi));
  const hostnames = hostnameMatches.map((match) => match[1].toUpperCase());
  const ips = Array.from(
    equipmentText.matchAll(/\b((?:\d{1,3}\.){3}\d{1,3})\b/g),
    (match) => match[1],
  );
  // Keep one entry per label, including blank values. Dropping blanks shifts
  // the identifiers of later boxes onto boxes without a certificadora.
  const serialPattern = /\bNo\.?\s*(?:de\s+)?Serie\b\s*:?\s*(\d{5,})?/gi;
  const datamatrixPattern = /\bDATAMATRIX\b\s*:?\s*(GTC[A-Z0-9-]+)?/gi;
  const serials = Array.from(equipmentText.matchAll(serialPattern), (match) => match[1] || '');
  const datamatrices = Array.from(equipmentText.matchAll(datamatrixPattern), (match) => match[1]?.toUpperCase() || '');

  const stationBlocks = hostnameMatches.map((match, index) =>
    equipmentText.slice(match.index, hostnameMatches[index + 1]?.index),
  );
  // When PDF text is ordered by station, use its own block even if the serial
  // or DATAMATRIX label is absent. Column-ordered text uses the label slots.
  const isStationOrdered = stationBlocks.length > 1 && stationBlocks.every((block) =>
    /\b(?:\d{1,3}\.){3}\d{1,3}\b/.test(block),
  );

  const stationCount = Math.max(hostnames.length, ips.length);
  const stations = Array.from({ length: stationCount }, (_, index) => {
    const hostname = hostnames[index] || '';
    const block = isStationOrdered ? stationBlocks[index] : undefined;
    return {
      hostname,
      ip: block === undefined ? ips[index] || '' : block.match(/\b(?:\d{1,3}\.){3}\d{1,3}\b/)?.[0] || '',
      label: stationLabelFromHostname(hostname, index),
      serial: block === undefined || serials.length === hostnames.length
        ? serials[index] || ''
        : Array.from(block.matchAll(serialPattern))[0]?.[1] || '',
      datamatrix: block === undefined || datamatrices.length === hostnames.length
        ? datamatrices[index] || ''
        : Array.from(block.matchAll(datamatrixPattern))[0]?.[1]?.toUpperCase() || '',
    };
  });

  if (!agencyCode || !agencyName) {
    warnings.push('Revisa el código y nombre de la agencia; no fue posible obtenerlos completamente.');
  }
  if (!stations.length) {
    warnings.push('No se detectaron estaciones. Puedes agregarlas manualmente.');
  }
  if (hostnames.length !== ips.length) {
    warnings.push('La cantidad de hostnames e IP no coincide. Revisa las estaciones antes de continuar.');
  }
  if (stations.some((station) => hasCertificadora(station) && (!station.serial || !station.datamatrix))) {
    warnings.push('Hay certificadoras con solo número de serie o código DATAMATRIX. Revisa el dato faltante; estas estaciones sí requieren fotografías.');
  }

  return { agencyCode, agencyName, stations, warnings };
}

export function extensionOf(fileName: string) {
  const match = fileName.match(/(\.[A-Za-z0-9]{1,8})$/);
  return match?.[1] || '';
}

export function photoOutputName(label: string, ip: string, role: RequiredPhotoRole, originalName: string) {
  const { prefix } = stationParts(label);
  const safeIp = cleanSegment(ip, 'SIN_IP');
  const suffix: Record<RequiredPhotoRole, string> = {
    certificadora: 'Fotografia Certificadora',
    serie: 'Fotografia No. Serie y Código DATAMATRIX',
    ubicacion: 'Fotografia Ubicación No. Serie y Código DATAMATRIX',
  };
  return `${prefix}_IP_${safeIp} ${suffix[role]}${extensionOf(originalName)}`;
}

export function agencyFolderName(code: string, name: string) {
  return `AGENCIA ${cleanSegment(code, 'SIN CODIGO')} ${cleanSegment(name.toUpperCase(), 'SIN NOMBRE')}`;
}
