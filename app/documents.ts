import type JSZip from 'jszip';

export const DOCUMENT_SLOTS = [
  {
    role: 'boleta',
    label: 'Boleta de servicio firmada',
    folder: 'BOLETA DE SERVICIO FIRMADA',
    accept: '.pdf,.jpg,.jpeg,.png,.heic,.heif',
  },
  {
    role: 'informe',
    label: 'Informe de finalización firmado',
    folder: 'INFORME DE FINALIZACIÓN FIRMADO',
    accept: '.pdf,.jpg,.jpeg,.png,.heic,.heif',
  },
  {
    role: 'word',
    label: 'Informe de finalización en Word',
    folder: 'INFORME DE FINALIZACIÓN EN WORD',
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

export async function addDocumentsToZip(root: JSZip, files: DocumentFiles) {
  for (const slot of DOCUMENT_SLOTS) {
    const file = files[slot.role];
    if (!file) continue;
    // Separate folders preserve identical original names without overwriting files.
    root.file(`DOCUMENTOS/${slot.folder}/${file.name}`, await file.arrayBuffer(), {
      binary: true,
      compression: 'STORE',
    });
  }
}
