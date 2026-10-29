'use client';

import { ChangeEvent, DragEvent, useEffect, useMemo, useRef, useState } from 'react';
import type { RequiredPhotoRole, StationPhotoFiles } from './organizer';
import { pdfPageText } from './pdf-text';
import { addDocumentsToZip, blankDocuments, DOCUMENT_SLOTS, documentFileError, planDocumentsForZip } from './documents';
import type { DocumentFiles, DocumentRole } from './documents';
import {
  agencyFolderName,
  addPhotosToZip,
  stationNeedsPhotos,
  parseBoletaText,
  planPhotosForZip,
  photoOutputName,
  photoRoleLabel,
  requiredPhotoRoles,
  stationIssues,
  stationParts,
} from './organizer';

type Station = {
  id: string;
  hostname: string;
  ip: string;
  label: string;
  serial: string;
  datamatrix: string;
  files: StationPhotoFiles;
  separateIdentifiers?: boolean;
  collapsed?: boolean;
  editing?: boolean;
  nameMissing?: boolean;
};

const FILE_ACCEPT = '.heic,.heif,.jpg,.jpeg,.png,image/heic,image/heif,image/jpeg,image/png';

function blankFiles(): StationPhotoFiles {
  return { certificadora: null, serie: null, ubicacion: null, inventario: null, ubicacionInventario: null };
}

function formatBytes(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function newStation(label: string): Station {
  return { id: crypto.randomUUID(), hostname: '', ip: '', label, serial: '', datamatrix: '', files: blankFiles() };
}

function SlideSwitch({ label, accessibleLabel, checked, controls, onChange }: {
  label: string;
  accessibleLabel?: string;
  checked: boolean;
  controls?: string;
  onChange: () => void;
}) {
  return (
    <button type="button" role="switch" aria-checked={checked} aria-label={accessibleLabel || label} aria-controls={controls} onClick={onChange} className="slide-switch">
      <span className="slide-switch-track" aria-hidden="true"><span /></span>
      <span>{label}</span>
    </button>
  );
}

function CollapseButton({ station, onClick }: { station: Station; onClick: () => void }) {
  const [tooltipDismissed, setTooltipDismissed] = useState(false);
  const action = station.collapsed ? 'Expandir' : 'Contraer';
  return (
    <span className="collapse-control">
      <button
        type="button"
        aria-expanded={!station.collapsed}
        aria-controls={`station-${station.id}`}
        aria-label={`${action} ${station.label || 'estación'}`}
        aria-describedby={`collapse-tip-${station.id}`}
        onClick={onClick}
        onMouseEnter={() => setTooltipDismissed(false)}
        onFocus={() => setTooltipDismissed(false)}
        onKeyDown={(event) => { if (event.key === 'Escape') setTooltipDismissed(true); }}
        className="collapse-button"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={`collapse-arrow ${station.collapsed ? 'is-collapsed' : ''}`}>
          <path d="M12 19V5m-6 6 6-6 6 6" />
        </svg>
      </button>
      <span id={`collapse-tip-${station.id}`} role="tooltip" className="collapse-tooltip" hidden={tooltipDismissed}>{action}</span>
    </span>
  );
}

function FileSlot({
  label,
  accept = FILE_ACCEPT,
  file,
  onFile,
  validateFile,
}: {
  label: string;
  accept?: string;
  file: File | null;
  onFile: (file: File | null) => void;
  validateFile?: (file: File) => string | null;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState('');

  const takeFile = (files: FileList | null) => {
    const next = files?.[0];
    if (!next) return;
    if (files.length !== 1) {
      setError('Selecciona un solo archivo para este espacio.');
      return;
    }
    const validationError = validateFile?.(next);
    setError(validationError || '');
    if (!validationError) onFile(next);
  };

  const drop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragging(false);
    takeFile(event.dataTransfer.files);
  };

  return (
    <div
      className={`group rounded-xl border p-3 transition ${
        dragging
          ? 'border-[#d7193f] bg-[#fff3f5]'
          : file
            ? 'border-[#bdd9ca] bg-[#f4faf6]'
            : 'border-[#dedbd3] bg-[#faf9f6]'
      }`}
      onDragEnter={(event) => {
        event.preventDefault();
        setDragging(true);
      }}
      onDragOver={(event) => event.preventDefault()}
      onDragLeave={() => setDragging(false)}
      onDrop={drop}
    >
      <input
        ref={inputRef}
        className="sr-only"
        type="file"
        accept={accept}
        aria-label={label}
        onChange={(event) => {
          takeFile(event.target.files);
          event.target.value = '';
        }}
      />
      <div className="flex min-w-0 items-center gap-3">
        <button
          type="button"
          className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg text-sm font-black ${
            file ? 'bg-[#dff1e6] text-[#17663f]' : 'bg-white text-[#7b818d] shadow-sm'
          }`}
          onClick={() => inputRef.current?.click()}
          aria-label={`Seleccionar ${label}`}
        >
          {file ? '✓' : '+'}
        </button>
        <button type="button" className="min-w-0 flex-1 text-left" onClick={() => inputRef.current?.click()}>
          <span className="block text-sm font-bold text-[#273044]">{label}</span>
          <span title={file?.name} className="mt-0.5 block truncate text-sm text-[#757c89]">
            {file ? `${file.name} · ${formatBytes(file.size)}` : 'Seleccionar o arrastrar'}
          </span>
        </button>
        {file && (
          <button
            type="button"
            className="rounded-md px-2 py-1 text-xs font-bold text-[#8a5360] hover:bg-white"
            aria-label={`Quitar ${label}`}
            onClick={() => {
              onFile(null);
              setError('');
            }}
          >
            Quitar
          </button>
        )}
      </div>
      {error && <p role="alert" className="mt-2 text-sm text-[#b91435]">{error}</p>}
    </div>
  );
}

export default function Home() {
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [agencyCode, setAgencyCode] = useState('');
  const [agencyName, setAgencyName] = useState('');
  const [agencyEditing, setAgencyEditing] = useState(false);
  const [stations, setStations] = useState<Station[]>([]);
  const [excludedStationLabels, setExcludedStationLabels] = useState<string[]>([]);
  const [cableFiles, setCableFiles] = useState<File[]>([]);
  const [documents, setDocuments] = useState<DocumentFiles>(blankDocuments);
  const [cableDragging, setCableDragging] = useState(false);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [message, setMessage] = useState('');
  const [parsing, setParsing] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [progress, setProgress] = useState(0);
  const [reviewOpen, setReviewOpen] = useState(false);
  const reviewRef = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = reviewRef.current;
    if (reviewOpen && dialog && !dialog.open) dialog.showModal();
    if (!reviewOpen && dialog?.open) dialog.close();
  }, [reviewOpen]);

  const requiredTotal = stations.reduce((total, station) => total + requiredPhotoRoles(station.separateIdentifiers).length, 0);
  const documentsReady = DOCUMENT_SLOTS.filter((slot) => documents[slot.role]).length;
  const requiredReady = stations.reduce(
    (total, station) => total + requiredPhotoRoles(station.separateIdentifiers).filter((role) => station.files[role]).length,
    0,
  );
  const canGenerate = Boolean(pdfFile && !parsing);
  const issuesByStation = new Map(stations.map((station) => [station.id, stationIssues(station)]));
  const documentPlan = planDocumentsForZip(documents);
  const photoPlan = planPhotosForZip(stations, cableFiles, documentPlan.entries.map((entry) => entry.name));
  const agencyIssues = [
    ...(!agencyCode.trim() ? ['Falta el código de agencia. El ZIP usará SIN CODIGO si no lo completas.'] : []),
    ...(!agencyName.trim() ? ['Falta el nombre de agencia. El ZIP usará SIN NOMBRE si no lo completas.'] : []),
  ];
  const dataIssues = [
    ...warnings, ...agencyIssues,
    ...stations.flatMap((station) => (issuesByStation.get(station.id) || []).map((issue) => `${station.label || 'BACKUP'}: ${issue.message}`)),
    ...documentPlan.warnings, ...photoPlan.warnings,
    ...(!stations.length && !excludedStationLabels.length ? ['No se detectaron estaciones. Puedes agregarlas manualmente o descargar los archivos disponibles.'] : []),
  ];
  const missingDocuments = DOCUMENT_SLOTS.filter((slot) => !documents[slot.role]);
  const reviewMessages = [
    ...dataIssues,
    ...(missingDocuments.length ? [`No se adjuntaron estos documentos opcionales: ${missingDocuments.map((slot) => slot.label).join(', ')}.`] : []),
    ...(!photoPlan.entries.length && !documentPlan.entries.length ? ['No hay archivos seleccionados para incluir en el ZIP.'] : []),
  ];

  const outputName = useMemo(
    () => agencyFolderName(agencyCode || 'SIN CODIGO', agencyName || 'SIN NOMBRE'),
    [agencyCode, agencyName],
  );

  const handlePdf = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setPdfFile(file);
    setAgencyEditing(false);
    setDocuments(blankDocuments());
    setExcludedStationLabels([]);
    setParsing(true);
    setWarnings([]);
    setMessage('');
    setReviewOpen(false);

    try {
      const pdfjs = await import('pdfjs-dist');
      pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';
      const document = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
      const pageTexts: string[] = [];
      for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
        const page = await document.getPage(pageNumber);
        const content = await page.getTextContent();
        pageTexts.push(pdfPageText(content.items));
      }
      const parsed = parseBoletaText(pageTexts.join('\n'), file.name);
      setAgencyCode(parsed.agencyCode);
      setAgencyName(parsed.agencyName);
      const withCertificadora = parsed.stations.filter(stationNeedsPhotos);
      setExcludedStationLabels(parsed.stations.filter((station) => !stationNeedsPhotos(station)).map((station) => station.label));
      setStations(
        withCertificadora.map((station) => ({
          ...station,
          id: crypto.randomUUID(),
          files: blankFiles(),
        })),
      );
      setWarnings(parsed.warnings.filter((warning) => !warning.startsWith('Revisa el código') && !warning.startsWith('Hay certificadoras con solo') && !warning.startsWith('No se detectaron estaciones')));
      setMessage(
        withCertificadora.length
          ? `${withCertificadora.length} estaciones con certificadora. Ya puedes cargar las fotos.`
          : parsed.stations.length
            ? 'Las cajas detectadas no tienen número de serie ni código DATAMATRIX. Puedes descargar el ZIP sin fotografías de certificadoras.'
          : 'Agrega las estaciones manualmente.',
      );
    } catch {
      setWarnings(['No fue posible leer el contenido del PDF. Puedes completar la agencia y las estaciones manualmente.']);
      setStations([]);
    } finally {
      setParsing(false);
    }
  };

  const updateStation = (id: string, patch: Partial<Station>) => {
    setStations((current) => current.map((station) => (station.id === id ? {
      ...station, ...patch,
      ...(patch.label !== undefined ? { nameMissing: !patch.label.trim() } : {}),
    } : station)));
  };

  const updateFile = (id: string, role: RequiredPhotoRole, file: File | null) => {
    setStations((current) =>
      current.map((station) => {
        if (station.id !== id) return station;
        const files = { ...station.files, [role]: file };
        return { ...station, files, collapsed: requiredPhotoRoles(station.separateIdentifiers).every((requiredRole) => files[requiredRole]) };
      }),
    );
    setMessage('');
  };

  const updateDocument = (role: DocumentRole, file: File | null) => {
    setDocuments((current) => ({ ...current, [role]: file }));
    setMessage('');
  };

  const assignPhotos = (id: string, fileList: FileList | null) => {
    const station = stations.find((item) => item.id === id);
    if (!station || !fileList?.length) return;
    const roles = requiredPhotoRoles(station.separateIdentifiers);
    const files = Array.from(fileList || []).sort((a, b) =>
      a.name.localeCompare(b.name, 'es', { numeric: true, sensitivity: 'base' }),
    );
    if (files.length !== roles.length) {
      setMessage(`La carga rápida requiere exactamente ${roles.length} fotografías, nombradas en orden del 1 al ${roles.length}.`);
      return;
    }
    setStations((current) =>
      current.map((station) =>
        station.id === id
          ? {
              ...station,
              collapsed: true,
              files: {
                ...station.files,
                ...Object.fromEntries(roles.map((role, index) => [role, files[index]])),
              },
            }
          : station,
      ),
    );
    setMessage(`Las ${roles.length} fotografías se asignaron en orden del 1 al ${roles.length}. Puedes reemplazar cualquiera antes de descargar.`);
  };

  const addStation = () => {
    const numbers = [...stations.map((station) => station.label), ...excludedStationLabels]
      .map((label) => Number(label.match(/\d+/)?.[0]))
      .filter((number) => Number.isFinite(number));
    const next = numbers.length ? Math.max(...numbers) + 1 : 1;
    setStations((current) => [...current, newStation(`CAJA ${next}`)]);
  };

  const addCableFiles = (fileList: FileList | null) => {
    const incoming = Array.from(fileList || []).filter(
      (file) => file.type.startsWith('image/') || /\.(heic|heif|jpe?g|png)$/i.test(file.name),
    );
    if (!incoming.length) {
      setMessage('Selecciona archivos de imagen para el estado de cableado.');
      return;
    }
    setCableFiles((current) => {
      const known = new Set(current.map((file) => `${file.name}|${file.size}|${file.lastModified}`));
      const additions = incoming.filter((file) => !known.has(`${file.name}|${file.size}|${file.lastModified}`));
      return [...current, ...additions];
    });
    setMessage(`${incoming.length} fotografía${incoming.length === 1 ? '' : 's'} de cableado seleccionada${incoming.length === 1 ? '' : 's'}.`);
  };

  const reset = () => {
    setPdfFile(null);
    setAgencyCode('');
    setAgencyName('');
    setAgencyEditing(false);
    setStations([]);
    setExcludedStationLabels([]);
    setCableFiles([]);
    setDocuments(blankDocuments());
    setWarnings([]);
    setMessage('');
    setProgress(0);
    setReviewOpen(false);
  };

  const generateZip = async (continueWithIssues = false) => {
    if (generating) return;
    if (!canGenerate || !pdfFile) {
      setMessage('Selecciona la boleta y espera a que termine de leerse.');
      return;
    }

    if (!continueWithIssues && reviewMessages.length) {
      setReviewOpen(true);
      return;
    }

    setReviewOpen(false);
    setGenerating(true);
    setProgress(0);
    setMessage('Preparando el ZIP sin modificar los archivos originales…');
    try {
      const JSZip = (await import('jszip')).default;
      const zip = new JSZip();
      await addDocumentsToZip(zip, documents);
      await addPhotosToZip(zip, stations, cableFiles);

      const blob = await zip.generateAsync(
        { type: 'blob', compression: 'STORE', streamFiles: true },
        ({ percent }) => setProgress(Math.round(percent)),
      );
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `${outputName}.zip`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setProgress(100);
      setMessage('ZIP generado correctamente, con las fotografías en la carpeta de cada caja. Los archivos conservaron su contenido original y los documentos adjuntos conservaron sus nombres.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No fue posible generar el ZIP. Revisa los archivos e inténtalo nuevamente.');
    } finally {
      setGenerating(false);
    }
  };

  return (
    <main className="min-h-screen bg-[#f4f3ef] text-[#172033]">
      <header className="sticky top-0 z-30 border-b border-[#d9d7d0] bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3 sm:px-7">
          <div className="flex min-w-0 items-center gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#d7193f] text-sm font-black text-white shadow-sm">G&amp;T</span>
            <div className="min-w-0">
              <p className="truncate font-bold tracking-[-0.02em]">Organizador GyT</p>
              <p className="hidden text-xs text-[#667085] sm:block">Documentación de certificadoras</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="hidden rounded-full border border-[#b8dbc9] bg-[#edf8f2] px-3 py-1.5 text-xs font-semibold text-[#17663f] md:inline-flex">Privado · Sin base de datos</span>
            {pdfFile && (
              <button type="button" onClick={reset} className="rounded-lg border border-[#d8d6cf] bg-white px-3 py-2 text-xs font-bold hover:bg-[#f7f6f2]">Nueva agencia</button>
            )}
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-7 sm:py-10">
        <div className="mb-8 grid gap-6 lg:grid-cols-[1fr_420px] lg:items-end">
          <div>
            <p className="mb-3 text-xs font-black uppercase tracking-[0.18em] text-[#d7193f]">Etapa 1 · Preparar agencia</p>
            <h1 className="max-w-3xl text-3xl font-black leading-tight tracking-[-0.04em] sm:text-5xl">Fotografias para el informe ordenadas sin tanto que hacer</h1>
            <p className="mt-4 max-w-2xl leading-7 text-[#626a78]">Lee la boleta, asigna 3 o 5 evidencias por estación y descarga un ZIP con las fotografías organizadas en la carpeta de cada caja, listo para entregar.</p>
          </div>
          <div className="grid grid-cols-3 gap-2 text-center text-xs">
            {['1. Boleta', '2. Evidencias', '3. ZIP'].map((step, index) => {
              const active = index === 0 ? Boolean(pdfFile) : index === 1 ? requiredReady > 0 || documentsReady > 0 : canGenerate;
              return <span key={step} className={`rounded-lg px-2 py-2.5 font-bold ${active ? 'bg-[#172033] text-white' : 'bg-white text-[#7b818d]'}`}>{step}</span>;
            })}
          </div>
        </div>

        <section className="rounded-[26px] border border-[#d9d7d0] bg-white p-5 shadow-[0_16px_50px_rgba(23,32,51,0.06)] sm:p-7">
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-[360px_minmax(0,1fr)]">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.14em] text-[#8a909c]">1 · Boleta de Servicio de agencia</p>
              <h2 className="mt-2 text-xl font-black tracking-[-0.02em]">Detectar agencia y estaciones</h2>
              <p className="mt-2 text-sm leading-6 text-[#717885]">El PDF se lee en este dispositivo para identificar cajas y series. Solo sirve como referencia y no se incluye en el ZIP.</p>
            </div>
            <div className="min-w-0">
              <label className="block cursor-pointer rounded-2xl border-2 border-dashed border-[#cbc8c0] bg-[#faf9f6] p-5 transition hover:border-[#d7193f] hover:bg-[#fff7f8]">
                <input className="sr-only" type="file" accept="application/pdf,.pdf" aria-label="Boleta de Servicio de agencia" onChange={handlePdf} />
                <div className="flex items-center gap-4">
                  <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-white text-xl font-black shadow-sm">{parsing ? '…' : pdfFile ? '✓' : '↑'}</span>
                  <div className="min-w-0">
                    <span className="block truncate font-bold">{pdfFile?.name || 'Boleta de Servicio de agencia'}</span>
                    <span className="mt-1 block text-xs text-[#777e8c]">{parsing ? 'Leyendo datos…' : pdfFile ? 'Selecciona otra para reemplazarla' : 'Solo se conserva durante esta sesión'}</span>
                  </div>
                </div>
              </label>

              {pdfFile && (
                <div className="mt-4 rounded-xl border border-[#e5e2da] bg-[#fbfaf7] p-4">
                  <div className="flex flex-wrap items-center justify-between gap-x-5 gap-y-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-[#717885]">Agencia detectada</p>
                      <p className="mt-1 break-words text-sm font-bold">{agencyCode || 'Sin código'} · {agencyName || 'Sin nombre'}</p>
                    </div>
                    <SlideSwitch label="Editar datos" accessibleLabel="Editar datos de agencia" checked={agencyEditing} controls="agency-details" onChange={() => setAgencyEditing((current) => !current)} />
                  </div>
                  <div id="agency-details" hidden={!agencyEditing} className="edit-panel mt-4 border-t border-[#e5e2da] pt-4">
                    <div className="grid gap-3 sm:grid-cols-[160px_1fr]">
                      <label className="field-label">Código de agencia
                        <input value={agencyCode} onChange={(event) => setAgencyCode(event.target.value)} className="data-input" placeholder="539" />
                      </label>
                      <label className="field-label">Nombre de agencia
                        <input value={agencyName} onChange={(event) => setAgencyName(event.target.value)} className="data-input uppercase" placeholder="C.C PORTALES" />
                      </label>
                    </div>
                    {agencyIssues.length > 0 && <div className="mt-3 text-xs leading-5 text-[#795410]">{agencyIssues.map((issue) => <p key={issue}>{issue}</p>)}</div>}
                  </div>
                </div>
              )}
            </div>
          </div>
        </section>

        {message && (
          <div className="mt-4 space-y-2" aria-live="polite">
            <p className="rounded-xl border border-[#cfdbe9] bg-[#f3f7fb] px-4 py-3 text-sm text-[#385777]">{message}</p>
          </div>
        )}

        {pdfFile && !parsing && (
          <section className="mt-7">
            <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.14em] text-[#8a909c]">2 · Evidencias</p>
                <h2 className="mt-1 text-2xl font-black tracking-[-0.03em]">Estaciones con certificadora</h2>
                {stations.length > 0 && <p className="mt-1 text-sm text-[#717885]">Carga 3 fotos por estación. Activa 5 fotos cuando la serie y el inventario/DATAMATRIX estén separados. El cableado se carga aparte.</p>}
              </div>
              <button type="button" onClick={addStation} className="rounded-xl border border-[#c9c7c0] bg-white px-4 py-2.5 text-sm font-bold shadow-sm hover:border-[#172033]">+ Agregar estación</button>
            </div>

            {excludedStationLabels.length > 0 && (
              <p className="mb-4 rounded-xl border border-[#d9d7d0] bg-[#faf9f6] px-4 py-3 text-sm leading-6 text-[#626a78]">
                <strong>Sin certificadora:</strong> {excludedStationLabels.join(', ')}. No tienen número de serie ni código DATAMATRIX y no requieren fotografías.
              </p>
            )}

            <div className="grid items-start gap-5 xl:grid-cols-2">
              {stations.map((station, stationIndex) => {
                const roles = requiredPhotoRoles(station.separateIdentifiers);
                const ready = roles.filter((role) => station.files[role]).length;
                const complete = ready === roles.length;
                const fieldIssues = (issuesByStation.get(station.id) || []).filter((issue) => issue.field !== 'photos');
                return (
                  <article key={station.id} aria-labelledby={`station-title-${station.id}`} className="station-card rounded-[22px] border border-[#d9d7d0] bg-white shadow-[0_10px_35px_rgba(23,32,51,0.045)]">
                    <div className="rounded-t-[22px] border-b border-[#ebe9e3] bg-[#fbfaf7] p-5">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex min-w-0 items-center gap-3">
                          <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl text-sm font-black ${complete ? 'bg-[#e2f2e8] text-[#17663f]' : 'bg-[#172033] text-white'}`} aria-hidden="true">{complete ? '✓' : stationIndex + 1}</span>
                          <div className="min-w-0">
                            <h3 id={`station-title-${station.id}`} className="break-words font-black">{stationParts(station.label).folder}</h3>
                            <p className="mt-1 break-words text-xs text-[#626a78]">{station.ip || 'Sin IP · las fotos se nombrarán sin IP'}</p>
                          </div>
                        </div>
                        <CollapseButton station={station} onClick={() => updateStation(station.id, { collapsed: !station.collapsed })} />
                      </div>
                      {station.hostname && <p className="mt-3 break-all text-xs text-[#717885]">{station.hostname}</p>}
                      <dl className="mt-4 grid grid-cols-2 gap-4 border-t border-[#e5e2da] pt-3 text-xs">
                        <div className="min-w-0"><dt className="text-[#717885]">Serie esperada</dt><dd className="mt-1 break-all font-semibold text-[#273044]">{station.serial || 'No especificada'}</dd></div>
                        <div className="min-w-0"><dt className="text-[#717885]">DATAMATRIX / inventario</dt><dd className="mt-1 break-all font-semibold text-[#273044]">{station.datamatrix || 'No especificado'}</dd></div>
                      </dl>
                    </div>

                    <div id={`station-${station.id}`} hidden={station.collapsed} className="p-5">
                      <div className="mb-4 flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
                        <SlideSwitch label="5 fotos" accessibleLabel={`5 fotos: serie e inventario separados en ${station.label || 'estación'}`} checked={Boolean(station.separateIdentifiers)} onChange={() => {
                          updateStation(station.id, { separateIdentifiers: !station.separateIdentifiers });
                          setMessage('');
                        }} />
                        <SlideSwitch label="Editar datos" accessibleLabel={`Editar datos de ${station.label || 'estación'}`} checked={Boolean(station.editing)} controls={`station-data-${station.id}`} onChange={() => updateStation(station.id, { editing: !station.editing })} />
                      </div>

                      <div id={`station-data-${station.id}`} hidden={!station.editing} className="edit-panel mb-5 rounded-xl border border-[#e5e2da] bg-[#faf9f6] p-4">
                        <p className="mb-4 text-xs text-[#626a78]">Los cambios se aplican a esta estación y a los nombres del ZIP.</p>
                        <div className="grid gap-3 sm:grid-cols-2">
                          <label className="field-label">Nombre de carpeta
                            <input value={station.label} placeholder="BACKUP" aria-invalid={fieldIssues.some((issue) => issue.field === 'label')} onChange={(event) => updateStation(station.id, { label: event.target.value.toUpperCase() })} className="data-input" />
                          </label>
                          <label className="field-label">Dirección IP
                            <input value={station.ip} aria-invalid={fieldIssues.some((issue) => issue.field === 'ip')} onChange={(event) => updateStation(station.id, { ip: event.target.value.trim() })} className="data-input" placeholder="192.168.1.10" inputMode="decimal" />
                          </label>
                          <label className="field-label">No. de serie
                            <input value={station.serial} onChange={(event) => updateStation(station.id, { serial: event.target.value })} className="data-input" placeholder="No especificada" />
                          </label>
                          <label className="field-label">Código DATAMATRIX / inventario
                            <input value={station.datamatrix} onChange={(event) => updateStation(station.id, { datamatrix: event.target.value })} className="data-input" placeholder="No especificado" />
                          </label>
                        </div>
                        {fieldIssues.length > 0 && <div className="mt-3 text-xs leading-5 text-[#795410]">{fieldIssues.map((issue) => <p key={issue.field}>{issue.message}</p>)}</div>}
                      </div>

                      <label className="quick-upload flex cursor-pointer items-center justify-between gap-3 rounded-xl bg-[#172033] px-4 py-3 text-sm font-bold text-white transition hover:bg-[#26324a]">
                        <span><span className="block">Cargar {roles.length} fotos juntas</span><span className="mt-1 block text-xs font-normal text-[#c9d0df]">En orden {station.separateIdentifiers ? '1–2–3–4–5' : '1–2–3'}</span></span>
                        <span className="shrink-0 rounded-lg bg-white/12 px-3 py-2 text-xs">Elegir</span>
                        <input className="sr-only" type="file" accept={FILE_ACCEPT} multiple onChange={(event) => {
                          assignPhotos(station.id, event.target.files);
                          event.target.value = '';
                        }} />
                      </label>

                      <div className="mt-3 grid gap-2">
                        {roles.map((role, index) => (
                          <FileSlot key={role} label={`${index + 1}. ${photoRoleLabel(role, station.separateIdentifiers)}`} file={station.files[role]} onFile={(file) => updateFile(station.id, role, file)} />
                        ))}
                      </div>

                      {ready > 0 && (
                        <div className="mt-4 break-words rounded-xl bg-[#f4f3ef] p-3 text-[11px] leading-5 text-[#646b78]">
                          <strong className="block text-[#333c4e]">Ejemplo de nombre final</strong>
                          {photoOutputName(station.label, station.ip, 'certificadora', station.files.certificadora?.name || 'foto.jpg')}
                        </div>
                      )}
                    </div>
                    <div className="flex items-center justify-between gap-4 rounded-b-[22px] border-t border-[#ebe9e3] px-5 py-3">
                      <div className="flex min-w-0 flex-1 items-center gap-3" aria-live="polite">
                        <span className={`shrink-0 text-xs font-bold ${complete ? 'text-[#17663f]' : 'text-[#626a78]'}`}>{ready}/{roles.length} fotos{complete ? ' · Listo' : ''}</span>
                        <span className="h-1.5 max-w-24 flex-1 overflow-hidden rounded-full bg-[#ebe9e3]" aria-hidden="true"><span className={`block h-full rounded-full transition-all ${complete ? 'bg-[#3b8a60]' : 'bg-[#aab0bb]'}`} style={{ width: `${ready / roles.length * 100}%` }} /></span>
                      </div>
                      <button type="button" aria-label={`Eliminar ${station.label || 'estación'}`} onClick={() => setStations((current) => current.filter((item) => item.id !== station.id))} className="station-delete flex min-h-10 shrink-0 items-center gap-1.5 rounded-lg px-2 text-xs font-semibold text-[#99606b] hover:bg-[#fff0f3] hover:text-[#b91435]">
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7" /></svg>
                        Eliminar
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>

            <article className="mt-6 rounded-[22px] border border-[#d9d7d0] bg-white p-5 shadow-[0_10px_35px_rgba(23,32,51,0.045)] sm:p-6">
              <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="mb-2 text-sm font-bold text-[#d7193f]">Documentos opcionales</p>
                  <h3 className="text-xl font-black tracking-[-0.025em]">Documentos firmados y archivo Word</h3>
                  <p className="mt-2 text-sm leading-6 text-[#717885]">Puedes adjuntar solo los documentos que tengas. Se incluyen directamente en el ZIP con su nombre original. Si falta alguno, aparecerá un aviso; elige «Descargar de todas formas» para generar el ZIP con los archivos disponibles.</p>
                  <p className="mt-1 text-sm text-[#717885]">Firmados: PDF o imagen. Word: .doc o .docx.</p>
                </div>
                <span className="shrink-0 rounded-full bg-[#f4f3ef] px-3 py-1.5 text-sm font-bold text-[#505867]" aria-live="polite">{documentsReady} documento{documentsReady === 1 ? '' : 's'} adjunto{documentsReady === 1 ? '' : 's'}</span>
              </div>
              <div className="grid gap-3 lg:grid-cols-3">
                {DOCUMENT_SLOTS.map((slot) => (
                  <FileSlot
                    key={slot.role}
                    label={slot.label}
                    accept={slot.accept}
                    file={documents[slot.role]}
                    onFile={(file) => updateDocument(slot.role, file)}
                    validateFile={(file) => documentFileError(slot.role, file)}
                  />
                ))}
              </div>
            </article>

            <article className="mt-6 overflow-hidden rounded-[22px] border border-[#d9d7d0] bg-white shadow-[0_10px_35px_rgba(23,32,51,0.045)]">
              <div className="grid gap-5 p-5 sm:p-6 lg:grid-cols-[300px_1fr]">
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.14em] text-[#d7193f]">Estado de cableado · Opcional</p>
                  <h3 className="mt-2 text-xl font-black tracking-[-0.025em]">Todas las fotos en un solo lugar</h3>
                  <p className="mt-2 text-sm leading-6 text-[#717885]">Selecciona o arrastra todas las fotografías de cableado juntas. Se guardarán dentro de la carpeta <strong>CABLEADO</strong> con nombres <strong>1, 2, 3…</strong> y su extensión original.</p>
                </div>

                <div>
                  <label
                    className={`block cursor-pointer rounded-2xl border-2 border-dashed p-6 text-center transition ${
                      cableDragging ? 'border-[#d7193f] bg-[#fff3f5]' : 'border-[#cbc8c0] bg-[#faf9f6] hover:border-[#d7193f] hover:bg-[#fff7f8]'
                    }`}
                    onDragEnter={(event) => {
                      event.preventDefault();
                      setCableDragging(true);
                    }}
                    onDragOver={(event) => event.preventDefault()}
                    onDragLeave={() => setCableDragging(false)}
                    onDrop={(event) => {
                      event.preventDefault();
                      setCableDragging(false);
                      addCableFiles(event.dataTransfer.files);
                    }}
                  >
                    <input className="sr-only" type="file" accept={FILE_ACCEPT} multiple onChange={(event) => addCableFiles(event.target.files)} />
                    <span className="mx-auto grid h-11 w-11 place-items-center rounded-xl bg-white text-xl font-black shadow-sm">+</span>
                    <span className="mt-3 block font-black">Seleccionar todas las fotos de cableado</span>
                    <span className="mt-1 block text-xs text-[#777e8c]">Puedes añadir más fotografías en varias selecciones</span>
                  </label>

                  {cableFiles.length > 0 && (
                    <div className="mt-3 rounded-xl border border-[#bdd9ca] bg-[#f4faf6] p-3">
                      <div className="mb-2 flex items-center justify-between gap-3">
                        <p className="text-sm font-black text-[#17663f]">{cableFiles.length} fotografía{cableFiles.length === 1 ? '' : 's'} seleccionada{cableFiles.length === 1 ? '' : 's'}</p>
                        <button type="button" onClick={() => setCableFiles([])} className="rounded-md px-2 py-1 text-xs font-bold text-[#8a5360] hover:bg-white">Quitar todas</button>
                      </div>
                      <div className="max-h-32 space-y-1 overflow-auto pr-1">
                        {cableFiles.map((file, index) => (
                          <div key={`${file.name}-${file.size}-${file.lastModified}`} className="flex items-center justify-between gap-3 rounded-lg bg-white/70 px-3 py-2 text-xs">
                            <span className="min-w-0 truncate"><strong>{index + 1}.</strong> {file.name} · {formatBytes(file.size)}</span>
                            <button type="button" onClick={() => setCableFiles((current) => current.filter((_, itemIndex) => itemIndex !== index))} className="shrink-0 font-bold text-[#8a5360]">Quitar</button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </article>
          </section>
        )}

        {pdfFile && !parsing && (
          <section className="sticky bottom-4 z-20 mt-7 rounded-[22px] border border-[#c9c7c0] bg-white/95 p-4 shadow-[0_18px_55px_rgba(23,32,51,0.16)] backdrop-blur sm:p-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
              <div className="min-w-0">
                <p className="hidden text-xs font-black uppercase tracking-[0.12em] text-[#8a909c] sm:block">3 · Descargar</p>
                <p className="mt-1 truncate font-black">{outputName}.zip</p>
                <p className="mt-1 text-xs text-[#707785]">{requiredReady}/{requiredTotal} fotos · {cableFiles.length} de cableado · {documentsReady} documento{documentsReady === 1 ? '' : 's'}</p>
                {dataIssues.length > 0 && <p className="mt-1 text-xs font-bold text-[#795410]">{dataIssues.length} aviso{dataIssues.length === 1 ? '' : 's'} antes de descargar</p>}
                <div className="mt-2 h-1.5 w-full max-w-md overflow-hidden rounded-full bg-[#ebe9e3]">
                  <div className="h-full rounded-full bg-[#d7193f] transition-all" style={{ width: `${requiredTotal ? (requiredReady / requiredTotal) * 100 : canGenerate ? 100 : 0}%` }} />
                </div>
              </div>
              <button type="button" disabled={!canGenerate || generating} onClick={() => generateZip()} className="shrink-0 rounded-xl bg-[#d7193f] px-6 py-3.5 text-sm font-black text-white shadow-[0_8px_22px_rgba(215,25,63,0.25)] transition hover:bg-[#b91435] disabled:cursor-not-allowed disabled:bg-[#b8b5ae] disabled:shadow-none">
                {generating ? `Generando ${progress}%` : 'Descargar ZIP ordenado'}
              </button>
            </div>
          </section>
        )}

        <dialog ref={reviewRef} onCancel={() => setReviewOpen(false)} aria-labelledby="download-review-title" className="m-auto max-h-[85vh] w-[calc(100%_-_2rem)] max-w-2xl overflow-auto rounded-[22px] border-0 bg-white p-5 text-[#172033] shadow-xl backdrop:bg-[#172033]/60 sm:p-6">
            <h2 id="download-review-title" className="text-xl font-black">Revisar antes de descargar</h2>
            <p className="mt-2 text-sm leading-6 text-[#626a78]">Puedes volver a corregir los datos o descargar de todas formas. El ZIP incluirá los archivos disponibles de las estaciones que aparecen en la lista.</p>
            <ul className="mt-4 list-disc space-y-2 rounded-xl bg-[#fff8e7] p-4 pl-8 text-sm leading-6 text-[#795410]">
              {reviewMessages.map((warning, index) => <li key={`${index}-${warning}`}>{warning}</li>)}
            </ul>
            <div className="mt-5 flex flex-wrap justify-end gap-3">
              <button type="button" autoFocus onClick={() => setReviewOpen(false)} className="rounded-xl border border-[#d8d6cf] px-4 py-3 text-sm font-bold">Volver a corregir</button>
              <button type="button" onClick={() => generateZip(true)} className="rounded-xl bg-[#d7193f] px-4 py-3 text-sm font-bold text-white">Descargar de todas formas</button>
            </div>
        </dialog>

        <footer className="mt-10 flex flex-col justify-between gap-2 border-t border-[#d9d7d0] py-6 text-xs text-[#747b88] sm:flex-row">
          <p>Los archivos permanecen en tu dispositivo y conservan su calidad original.</p>
          <p>Sin cuentas · Sin historial · Sin almacenamiento</p>
        </footer>
      </div>
    </main>
  );
}
