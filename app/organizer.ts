import type JSZip from 'jszip';
import { archiveNameKey, reserveArchiveName } from './archive.ts';

export type RequiredPhotoRole = 'certificadora' | 'serie' | 'ubicacion' | 'inventario' | 'ubicacionInventario';
export type PhotoRole = RequiredPhotoRole | 'cableado';
export type StationPhotoFiles = Record<RequiredPhotoRole, File | null>;
export type ExportStation = {
  label: string;
  ip: string;
  serial?: string;
  datamatrix?: string;
  separateIdentifiers?: boolean;
  excluded?: boolean;
  nameMissing?: boolean;
  files: StationPhotoFiles;
};

export function stationIssues(station: ExportStation) {
  if (station.excluded) return [];
  const issues: { field: 'label' | 'ip' | 'identifiers' | 'photos'; message: string }[] = [];
  if (!cleanSegment(station.label, '') || station.nameMissing) {
    issues.push({ field: 'label', message: `No se identificó el nombre de la carpeta. Se usará ${stationParts(station.label).folder}; puedes escribir el nombre correcto.` });
  } else if (station.label.match(INVALID_WINDOWS_CHARS)) {
    issues.push({ field: 'label', message: `El nombre contiene caracteres que no se pueden usar en una carpeta. Se guardará como «${stationParts(station.label).folder}»; puedes corregirlo.` });
  }
  const ip = station.ip.trim();
  if (!ip) {
    issues.push({ field: 'ip', message: 'Falta la IP. Puedes completarla o descargar usando SIN_IP en los nombres.' });
  } else if (!/^(?:\d{1,3}\.){3}\d{1,3}$/.test(ip) || ip.split('.').some((part) => Number(part) > 255)) {
    issues.push({ field: 'ip', message: 'La IP no tiene un formato válido. Puedes corregirla o descargar con el valor escrito.' });
  }
  if (station.serial !== undefined && station.datamatrix !== undefined && (!station.serial.trim() || !station.datamatrix.trim())) {
    issues.push({ field: 'identifiers', message: 'Falta la serie o el DATAMATRIX en los datos leídos. Puedes completarlos; las fotos se incluirán de todos modos.' });
  }
  const roles = requiredPhotoRoles(station.separateIdentifiers);
  const missing = roles.filter((role) => !station.files[role]);
  if (missing.length) {
    issues.push({ field: 'photos', message: `Faltan ${missing.length} de ${roles.length} fotos. Se incluirán las disponibles. Si esta estación se detectó de más, puedes excluirla del ZIP.` });
  }
  return issues;
}

export function requiredPhotoRoles(separateIdentifiers = false): RequiredPhotoRole[] {
  return separateIdentifiers
    ? ['certificadora', 'serie', 'ubicacion', 'inventario', 'ubicacionInventario']
    : ['certificadora', 'serie', 'ubicacion'];
}

export function photoRoleLabel(role: RequiredPhotoRole, separateIdentifiers = false) {
  const labels: Record<RequiredPhotoRole, string> = {
    certificadora: 'Fotografía certificadora',
    serie: separateIdentifiers ? 'No. de serie' : 'No. serie y código DATAMATRIX',
    ubicacion: separateIdentifiers ? 'Ubicación del No. de serie' : 'Ubicación, serie y DATAMATRIX',
    inventario: 'No. de inventario / código DATAMATRIX',
    ubicacionInventario: 'Ubicación del inventario / DATAMATRIX',
  };
  return labels[role];
}

export type ParsedStation = {
  hostname: string;
  ip: string;
  label: string;
  serial: string;
  datamatrix: string;
  nameMissing?: boolean;
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
  const numeric = label.trim().match(/^(?:CAJA\s*)?(\d+)$/i)?.[1];
  if (numeric) {
    const number = String(Number(numeric));
    return {
      folder: `CAJA ${number}`,
      prefix: `Caja${number}`,
      cable: number,
    };
  }

  if (/^(?:CAJA\s+)?AUTOBANCO$/i.test(label.trim())) {
    return {
      folder: 'CAJA AUTOBANCO',
      prefix: 'Autobanco',
      cable: 'AUTOBANCO',
    };
  }

  const safe = cleanSegment(label.toUpperCase(), 'BACKUP');
  return {
    folder: safe,
    prefix: cleanSegment(label, 'BACKUP').replace(/\s+/g, ''),
    cable: safe.replace(/\s+/g, '_'),
  };
}

function reserveBackupFolder(names: Set<string>) {
  let number = 1;
  let label = 'BACKUP';
  while (names.has(archiveNameKey(label))) label = `BACKUP ${++number}`;
  names.add(archiveNameKey(label));
  return label;
}

function stationLabelFromHostname(hostname: string) {
  const caja = hostname.match(/CAJA([\p{L}\p{N}_-]+)$/iu)?.[1];
  if (caja) return /^\d+$/.test(caja) ? `CAJA ${Number(caja)}` : `CAJA ${caja.replace(/[_-]+/g, ' ').trim()}`;
  if (/AUTOBANCO$/i.test(hostname)) return 'CAJA AUTOBANCO';
  if (/BACKUP$/i.test(hostname)) return 'BACKUP';
  return '';
}

function stationNamesFromText(text: string) {
  const fields = String.raw`(?:HOSTNAME\b|(?:DIRECCI[ÓO]N\s+)?IP\b|No\.?\s*(?:de\s+)?Serie\b|(?:C[ÓO]DIGO\s+)?DATAMATRIX\b|MARCA\b|MODELO\b|PROCESADOR\b|MEMORIA\b|DISCO\b|CERTIFICADORA\b|UBICACI[ÓO]N\b|NOMBRE\s+(?:DE\s+)?(?:CAJA|ESTACI[ÓO]N)\b|(?:\d{1,3}\.){3}\d{1,3}\b)`;
  const end = `(?=\\s+${fields}|[\\r\\n]|$)`;
  const explicit = new RegExp(`\\b(?:UBICACI[ÓO]N|NOMBRE\\s+(?:DE\\s+)?(?:CAJA|ESTACI[ÓO]N|CARPETA))\\s*[:：]\\s*([^\\r\\n]+?)${end}`, 'giu');
  const heading = new RegExp(`(?<![\\p{L}\\p{N}_-])(CAJA\\s+[\\p{L}\\p{N}][\\p{L}\\p{N} ._-]*?|AUTOBANCO|BACKUP)${end}`, 'giu');
  const names = Array.from(text.matchAll(explicit), (match) => ({
    index: match.index,
    end: match.index + match[0].length,
    label: match[1].trim(),
    explicit: true,
  }));
  for (const match of text.matchAll(heading)) {
    if (!names.some((name) => match.index >= name.index && match.index < name.end)) {
      names.push({ index: match.index, end: match.index + match[0].length, label: match[1].trim(), explicit: false });
    }
  }
  return names.sort((a, b) => a.index - b.index).map((name) => ({
    ...name,
    label: /^(?:N\/?A|SIN NOMBRE|NO ESPECIFICAD[OA]|[-—]+)$/i.test(name.label)
      ? '' : stationParts(name.label).folder,
  }));
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
  const text = rawText.replace(/\u00a0/g, ' ').replace(/[^\S\r\n]+/g, ' ').trim();
  const warnings: string[] = [];
  const fileAgency = agencyFromFilename(fileName);
  const contentAgency = text.replace(/\s+/g, ' ').match(/\bAgencia\s+(\d{2,5})\s+(.+?)\s+Direcci[oó]n\b/i);

  const agencyCode = fileAgency?.code || contentAgency?.[1] || '';
  const agencyName = fileAgency?.name || contentAgency?.[2]?.trim() || '';

  // PDF.js can return table cells before their visual section headings, so the
  // whole document is scanned. HOSTNAME and IPv4 tokens are specific enough
  // to the equipment table in the supplied boleta format.
  const equipmentText = text;
  const hostnameMatches = Array.from(equipmentText.matchAll(/\bHOSTNAME\s*:?\s+(?!IP\b|No\.?\s|DATAMATRIX\b)([\p{L}\p{N}_-]+)/giu));
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

  const names = stationNamesFromText(equipmentText);
  const stationCount = Math.max(hostnames.length, ips.length);
  const labelsByHost = new Map<number, string>();
  if (names.length === stationCount) {
    names.forEach((name, index) => labelsByHost.set(index, name.label));
  } else {
    for (const name of names) {
      const nextIndex = hostnameMatches.findIndex((match) => match.index >= name.end);
      const immediatelyBeforeNext = nextIndex >= 0 && !equipmentText.slice(name.end, hostnameMatches[nextIndex].index).trim();
      const index = immediatelyBeforeNext ? nextIndex : nextIndex === -1 ? hostnameMatches.length - 1 : Math.max(0, nextIndex - 1);
      if (!labelsByHost.has(index) || name.explicit) labelsByHost.set(index, name.label);
    }
  }
  const reservedLabels = new Set<string>([
    ...Array.from(labelsByHost.values()), ...hostnames.map(stationLabelFromHostname),
  ].filter(Boolean).map(archiveNameKey));
  const stations = Array.from({ length: stationCount }, (_, index) => {
    const hostname = hostnames[index] || '';
    const block = isStationOrdered ? stationBlocks[index] : undefined;
    const followingHostname = hostnameMatches[index]
      ? equipmentText.slice(hostnameMatches[index].index + hostnameMatches[index][0].length, hostnameMatches[index + 1]?.index)
      : '';
    const spacedCajaName = /CAJA$/i.test(hostname)
      ? followingHostname.match(/^\s+([\p{L}\p{N}_ -]+?)(?=\s+(?:IP\b|No\.?\s|DATAMATRIX\b|(?:\d{1,3}\.){3}\d{1,3}\b)|[\r\n]|$)/iu)?.[1]?.trim()
      : '';
    const detectedLabel = labelsByHost.get(index) || (spacedCajaName ? stationParts(`CAJA ${spacedCajaName}`).folder : stationLabelFromHostname(hostname));
    return {
      hostname,
      ip: block === undefined ? ips[index] || '' : block.match(/\b(?:\d{1,3}\.){3}\d{1,3}\b/)?.[0] || '',
      label: detectedLabel || reserveBackupFolder(reservedLabels),
      nameMissing: !detectedLabel,
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
  if (serials.length > stationCount || datamatrices.length > stationCount) {
    warnings.push('La boleta contiene más campos de certificadora que estaciones identificadas. Revisa las estaciones; puedes agregar, corregir o excluir las que correspondan.');
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

export function photoOutputName(label: string, ip: string, role: RequiredPhotoRole, originalName: string, separateIdentifiers = false) {
  const { prefix } = stationParts(label);
  const safeIp = cleanSegment(ip, 'SIN_IP');
  const suffix: Record<RequiredPhotoRole, string> = {
    certificadora: 'Fotografia Certificadora',
    serie: `Fotografia No. Serie y Código DATAMATRIX${separateIdentifiers ? ' 1' : ''}`,
    ubicacion: `Fotografia Ubicación No. Serie y Código DATAMATRIX${separateIdentifiers ? ' 1' : ''}`,
    inventario: 'Fotografia No. Serie y Código DATAMATRIX 2',
    ubicacionInventario: 'Fotografia Ubicación No. Serie y Código DATAMATRIX 2',
  };
  return `${prefix}_IP_${safeIp} ${suffix[role]}${extensionOf(originalName)}`;
}

export function agencyFolderName(code: string, name: string) {
  return `AGENCIA ${cleanSegment(code, 'SIN CODIGO')} ${cleanSegment(name.toUpperCase(), 'SIN NOMBRE')}`;
}

export function planPhotosForZip(
  stations: ExportStation[],
  cableFiles: File[],
  reservedNames: string[] = [],
) {
  const entries: { name: string; file: File }[] = [];
  const warnings: string[] = [];
  const names = new Set(reservedNames.map(archiveNameKey));
  const addEntry = (name: string, file: File) => {
    const available = reserveArchiveName(name, names);
    if (available !== name) warnings.push(`Se repite «${name}». Para conservar ambas fotos, la siguiente se guardará como «${available}». Puedes corregir el nombre de carpeta o la IP.`);
    entries.push({ name: available, file });
  };
  const folders = new Set(stations.filter((station) => !station.excluded && cleanSegment(station.label, '')).map((station) => archiveNameKey(stationParts(station.label).folder)));
  for (const station of stations) {
    if (station.excluded) continue;
    const label = cleanSegment(station.label, '') ? station.label : reserveBackupFolder(folders);
    for (const role of requiredPhotoRoles(station.separateIdentifiers)) {
      const file = station.files[role];
      if (file) addEntry(`${stationParts(label).folder}/${photoOutputName(label, station.ip, role, file.name, station.separateIdentifiers)}`, file);
    }
  }
  cableFiles.forEach((file, index) => addEntry(`CABLEADO/${index + 1}${extensionOf(file.name)}`, file));
  return { entries, warnings };
}

export async function addPhotosToZip(zip: JSZip, stations: ExportStation[], cableFiles: File[]) {
  const plan = planPhotosForZip(stations, cableFiles, Object.keys(zip.files));
  for (const { name, file } of plan.entries) {
    zip.file(name, await file.arrayBuffer(), { binary: true, compression: 'STORE', createFolders: true });
  }
  return plan.warnings;
}
