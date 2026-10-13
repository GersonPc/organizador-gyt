import type JSZip from 'jszip';
import { archiveNameKey, reserveArchiveName } from './archive.ts';

export const DOCUMENT_SLOTS = [
  {
    role: 'boleta',
    label: 'Boleta de servicio firmada',
    accept: '.pdf,.jpg,.jpeg,.png,.heic,.heif',
  },
  {
    role: 'informe',
    label: 'Informe de finalización firmado',
    accept: '.pdf,.jpg,.jpeg,.png,.heic,.heif',
  },
  {
    role: 'word',
    label: 'Informe de finalización en Word',
    accept: '.doc,.docx',
  },
] as const;

export type DocumentRole = (typeof DOCUMENT_SLOTS)[number]['role'];
export type DocumentFiles = Record<DocumentRole, File | null>;

export function blankDocuments(): DocumentFiles {
  return { boleta: null, informe: null, word: null };
}

export function documentFileError(role: DocumentRole, file: File): string | null {
  const slot = DOCUMENT_SLOTS.find((item) => item.role === role)!;
  const extension = file.name.slice(file.name.lastIndexOf('.')).toLowerCase();
  if (!slot.accept.split(',').includes(extension)) {
    return role === 'word'
      ? 'Selecciona un archivo de Word (.doc o .docx).'
      : 'Selecciona un PDF o una imagen (.jpg, .jpeg, .png, .heic o .heif).';
  }
  return null;
}

export function missingDocumentsWarning(files: DocumentFiles): string | null {
  const missing = DOCUMENT_SLOTS.filter((slot) => !files[slot.role]);
  if (!missing.length) return null;
  return `No se adjuntaron los siguientes documentos opcionales:\n\n${missing.map((slot) => `• ${slot.label}`).join('\n')}\n\nAl pulsar Aceptar se generará el ZIP con los archivos disponibles.`;
}

export function documentNamesError(files: DocumentFiles): string | null {
  const names = new Set<string>();
  for (const slot of DOCUMENT_SLOTS) {
    const file = files[slot.role];
    if (!file) continue;
    const name = file.name.normalize('NFC').toLowerCase();
    if (names.has(name)) {
      return `Hay documentos con el mismo nombre: «${file.name}». Se añadirá un número al nombre repetido para conservar ambos en la raíz del ZIP. Puedes reemplazarlos por archivos con nombres distintos.`;
    }
    names.add(name);
  }
  return null;
}

export function planDocumentsForZip(files: DocumentFiles, reservedNames: string[] = []) {
  const entries: { name: string; file: File }[] = [];
  const warnings: string[] = [];
  const names = new Set(reservedNames.map(archiveNameKey));
  for (const slot of DOCUMENT_SLOTS) {
    const file = files[slot.role];
    if (!file) continue;
    const name = reserveArchiveName(file.name, names);
    if (name !== file.name) warnings.push(`El documento «${file.name}» tiene un nombre repetido. Se guardará como «${name}» para conservar ambos archivos.`);
    entries.push({ name, file });
  }
  return { entries, warnings };
}

export async function addDocumentsToZip(zip: JSZip, files: DocumentFiles) {
  const plan = planDocumentsForZip(files, Object.keys(zip.files));
  for (const { name, file } of plan.entries) {
    zip.file(name, await file.arrayBuffer(), {
      binary: true,
      compression: 'STORE',
    });
  }
  return plan.warnings;
}
