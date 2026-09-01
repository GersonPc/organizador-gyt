export type RequiredPhotoRole = 'certificadora' | 'serie' | 'ubicacion';
export type PhotoRole = RequiredPhotoRole | 'cableado';

export type ParsedStation = {
  hostname: string;
  ip: string;
  label: string;
};

export type ParsedBoleta = {
  agencyCode: string;
  agencyName: string;
  stations: ParsedStation[];
  warnings: string[];
};

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
  const hostnames = Array.from(
    equipmentText.matchAll(/HOSTNAME\s+([A-Z0-9_-]+)/gi),
    (match) => match[1].toUpperCase(),
  ).filter((value, index, values) => values.indexOf(value) === index);
  const ips = Array.from(
    equipmentText.matchAll(/\b((?:\d{1,3}\.){3}\d{1,3})\b/g),
    (match) => match[1],
  );

  const stationCount = Math.max(hostnames.length, ips.length);
  const stations = Array.from({ length: stationCount }, (_, index) => {
    const hostname = hostnames[index] || '';
    return {
      hostname,
      ip: ips[index] || '',
      label: stationLabelFromHostname(hostname, index),
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
