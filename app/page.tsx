'use client';

import { ChangeEvent, DragEvent, useMemo, useRef, useState } from 'react';
import type { RequiredPhotoRole, PhotoRole } from './organizer';
import {
  agencyFolderName,
  cleanSegment,
  extensionOf,
  parseBoletaText,
  photoOutputName,
  stationParts,
} from './organizer';

type StationFiles = Record<PhotoRole, File | null>;
type Station = {
  id: string;
  hostname: string;
  ip: string;
  label: string;
  files: StationFiles;
};

const REQUIRED_ROLES: RequiredPhotoRole[] = ['certificadora', 'serie', 'ubicacion'];
const ROLE_LABELS: Record<PhotoRole, string> = {
  certificadora: 'Fotografía certificadora',
  serie: 'No. serie y código DATAMATRIX',
  ubicacion: 'Ubicación, serie y DATAMATRIX',
  cableado: 'Estado de cableado',
};
const FILE_ACCEPT = '.heic,.heif,.jpg,.jpeg,.png,image/heic,image/heif,image/jpeg,image/png';

function blankFiles(): StationFiles {
  return { certificadora: null, serie: null, ubicacion: null, cableado: null };
}

function formatBytes(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function newStation(label: string): Station {
  return { id: crypto.randomUUID(), hostname: '', ip: '', label, files: blankFiles() };
}

function FileSlot({
  role,
  file,
  onFile,
  optional = false,
}: {
  role: PhotoRole;
  file: File | null;
  onFile: (file: File | null) => void;
  optional?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const takeFile = (files: FileList | null) => {
    const next = files?.[0];
    if (next) onFile(next);
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
        accept={FILE_ACCEPT}
        onChange={(event) => takeFile(event.target.files)}
      />
      <div className="flex min-w-0 items-center gap-3">
        <button
          type="button"
          className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg text-sm font-black ${
            file ? 'bg-[#dff1e6] text-[#17663f]' : 'bg-white text-[#7b818d] shadow-sm'
          }`}
          onClick={() => inputRef.current?.click()}
          aria-label={`Seleccionar ${ROLE_LABELS[role]}`}
        >
          {file ? '✓' : '+'}
        </button>
        <button type="button" className="min-w-0 flex-1 text-left" onClick={() => inputRef.current?.click()}>
          <span className="block truncate text-sm font-bold text-[#273044]">{ROLE_LABELS[role]}</span>
          <span className="mt-0.5 block truncate text-xs text-[#757c89]">
            {file ? `${file.name} · ${formatBytes(file.size)}` : optional ? 'Opcional' : 'Seleccionar o arrastrar'}
          </span>
        </button>
        {file && (
          <button
            type="button"
            className="rounded-md px-2 py-1 text-xs font-bold text-[#8a5360] hover:bg-white"
            onClick={() => onFile(null)}
          >
            Quitar
          </button>
        )}
      </div>
    </div>
  );
}

export default function Home() {
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [agencyCode, setAgencyCode] = useState('');
  const [agencyName, setAgencyName] = useState('');
  const [stations, setStations] = useState<Station[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [message, setMessage] = useState('');
  const [parsing, setParsing] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [progress, setProgress] = useState(0);

  const requiredTotal = stations.length * REQUIRED_ROLES.length;
  const requiredReady = stations.reduce(
    (total, station) => total + REQUIRED_ROLES.filter((role) => station.files[role]).length,
    0,
  );
  const validStationCount = stations.filter((station) => station.ip.trim() && station.label.trim()).length;
  const canGenerate = Boolean(
    pdfFile &&
      agencyCode.trim() &&
      agencyName.trim() &&
      stations.length &&
      requiredReady === requiredTotal &&
      validStationCount === stations.length,
  );

  const outputName = useMemo(
    () => agencyFolderName(agencyCode || 'SIN CODIGO', agencyName || 'SIN NOMBRE'),
    [agencyCode, agencyName],
  );

  const handlePdf = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setPdfFile(file);
    setParsing(true);
    setWarnings([]);
    setMessage('');

    try {
      const pdfjs = await import('pdfjs-dist');
      pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';
      const document = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
      const pageTexts: string[] = [];
      for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
        const page = await document.getPage(pageNumber);
        const content = await page.getTextContent();
        pageTexts.push(content.items.map((item) => ('str' in item ? item.str : '')).join(' '));
      }
      const parsed = parseBoletaText(pageTexts.join(' '), file.name);
      setAgencyCode(parsed.agencyCode);
      setAgencyName(parsed.agencyName);
      setStations(
        parsed.stations.map((station) => ({
          ...station,
          id: crypto.randomUUID(),
          files: blankFiles(),
        })),
      );
      setWarnings(parsed.warnings);
      setMessage(
        parsed.stations.length
          ? `${parsed.stations.length} estaciones detectadas. Revisa los datos antes de asignar fotos.`
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
    setStations((current) => current.map((station) => (station.id === id ? { ...station, ...patch } : station)));
  };

  const updateFile = (id: string, role: PhotoRole, file: File | null) => {
    setStations((current) =>
      current.map((station) =>
        station.id === id ? { ...station, files: { ...station.files, [role]: file } } : station,
      ),
    );
    setMessage('');
  };

  const assignThree = (id: string, fileList: FileList | null) => {
    const files = Array.from(fileList || []).sort((a, b) =>
      a.name.localeCompare(b.name, 'es', { numeric: true, sensitivity: 'base' }),
    );
    if (files.length !== 3) {
      setMessage('La carga rápida requiere exactamente tres fotografías, nombradas u ordenadas como 1, 2 y 3.');
      return;
    }
    setStations((current) =>
      current.map((station) =>
        station.id === id
          ? {
              ...station,
              files: {
                ...station.files,
                certificadora: files[0],
                serie: files[1],
                ubicacion: files[2],
              },
            }
          : station,
      ),
    );
    setMessage('Las tres fotografías se asignaron en orden 1, 2 y 3. Puedes reemplazar cualquiera antes de descargar.');
  };

  const addStation = () => {
    const numbers = stations
      .map((station) => Number(station.label.match(/\d+/)?.[0]))
      .filter((number) => Number.isFinite(number));
    const next = numbers.length ? Math.max(...numbers) + 1 : 1;
    setStations((current) => [...current, newStation(`CAJA ${next}`)]);
  };

  const reset = () => {
    setPdfFile(null);
    setAgencyCode('');
    setAgencyName('');
    setStations([]);
    setWarnings([]);
    setMessage('');
    setProgress(0);
  };

  const generateZip = async () => {
    if (!canGenerate || !pdfFile) {
      setMessage('Completa los datos y las tres fotografías obligatorias de cada estación.');
      return;
    }

    setGenerating(true);
    setProgress(0);
    setMessage('Preparando el ZIP sin modificar los archivos originales…');
    try {
      const JSZip = (await import('jszip')).default;
      const zip = new JSZip();
      const root = zip.folder(outputName);
      if (!root) throw new Error('No se pudo crear la carpeta principal.');

      const safeCode = cleanSegment(agencyCode, 'SIN CODIGO');
      const safeName = cleanSegment(agencyName.toUpperCase(), 'SIN NOMBRE');
      root.file(`Boleta de Servicio AG${safeCode} ${safeName}.pdf`, pdfFile, {
        binary: true,
        compression: 'STORE',
      });
      const cableFolder = root.folder('ESTADO CABLEADO');

      stations.forEach((station) => {
        const parts = stationParts(station.label);
        const stationFolder = root.folder(parts.folder);
        REQUIRED_ROLES.forEach((role) => {
          const file = station.files[role];
          if (file) {
            stationFolder?.file(photoOutputName(station.label, station.ip, role, file.name), file, {
              binary: true,
              compression: 'STORE',
            });
          }
        });
        const cable = station.files.cableado;
        if (cable) {
          cableFolder?.file(`${parts.cable}${extensionOf(cable.name)}`, cable, {
            binary: true,
            compression: 'STORE',
          });
        }
      });

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
      setMessage('ZIP generado correctamente. La calidad y los bytes de cada imagen se conservaron.');
    } catch {
      setMessage('No fue posible generar el ZIP. Revisa los archivos e inténtalo nuevamente.');
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
            <h1 className="max-w-3xl text-3xl font-black leading-tight tracking-[-0.04em] sm:text-5xl">Fotografías ordenadas, sin perder calidad.</h1>
            <p className="mt-4 max-w-2xl leading-7 text-[#626a78]">Lee la boleta, asigna tres evidencias por estación y descarga una carpeta ZIP lista para entregar.</p>
          </div>
          <div className="grid grid-cols-3 gap-2 text-center text-xs">
            {['1. Boleta', '2. Fotografías', '3. ZIP'].map((step, index) => {
              const active = index === 0 ? Boolean(pdfFile) : index === 1 ? requiredReady > 0 : canGenerate;
              return <span key={step} className={`rounded-lg px-2 py-2.5 font-bold ${active ? 'bg-[#172033] text-white' : 'bg-white text-[#7b818d]'}`}>{step}</span>;
            })}
          </div>
        </div>

        <section className="rounded-[26px] border border-[#d9d7d0] bg-white p-5 shadow-[0_16px_50px_rgba(23,32,51,0.06)] sm:p-7">
          <div className="grid gap-6 lg:grid-cols-[360px_1fr]">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.14em] text-[#8a909c]">1 · Boleta de servicio</p>
              <h2 className="mt-2 text-xl font-black tracking-[-0.02em]">Detectar agencia y estaciones</h2>
              <p className="mt-2 text-sm leading-6 text-[#717885]">El PDF se lee en este dispositivo. Nunca se envía al alojamiento del sitio.</p>
            </div>
            <div>
              <label className="block cursor-pointer rounded-2xl border-2 border-dashed border-[#cbc8c0] bg-[#faf9f6] p-5 transition hover:border-[#d7193f] hover:bg-[#fff7f8]">
                <input className="sr-only" type="file" accept="application/pdf,.pdf" onChange={handlePdf} />
                <div className="flex items-center gap-4">
                  <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-white text-xl font-black shadow-sm">{parsing ? '…' : pdfFile ? '✓' : '↑'}</span>
                  <div className="min-w-0">
                    <span className="block truncate font-bold">{pdfFile?.name || 'Seleccionar boleta PDF'}</span>
                    <span className="mt-1 block text-xs text-[#777e8c]">{parsing ? 'Leyendo datos…' : pdfFile ? 'Selecciona otra para reemplazarla' : 'Solo se conserva durante esta sesión'}</span>
                  </div>
                </div>
              </label>

              {pdfFile && (
                <div className="mt-4 grid gap-3 sm:grid-cols-[160px_1fr]">
                  <label className="text-xs font-bold text-[#505867]">Código de agencia
                    <input value={agencyCode} onChange={(event) => setAgencyCode(event.target.value)} className="mt-1.5 w-full rounded-xl border border-[#d8d6cf] bg-white px-3 py-2.5 text-sm font-medium outline-none focus:border-[#d7193f]" placeholder="539" />
                  </label>
                  <label className="text-xs font-bold text-[#505867]">Nombre de agencia
                    <input value={agencyName} onChange={(event) => setAgencyName(event.target.value)} className="mt-1.5 w-full rounded-xl border border-[#d8d6cf] bg-white px-3 py-2.5 text-sm font-medium uppercase outline-none focus:border-[#d7193f]" placeholder="C.C PORTALES" />
                  </label>
                </div>
              )}
            </div>
          </div>
        </section>

        {(warnings.length > 0 || message) && (
          <div className="mt-4 space-y-2" aria-live="polite">
            {warnings.map((warning) => <p key={warning} className="rounded-xl border border-[#efd59c] bg-[#fff8e7] px-4 py-3 text-sm text-[#795410]">{warning}</p>)}
            {message && <p className="rounded-xl border border-[#cfdbe9] bg-[#f3f7fb] px-4 py-3 text-sm text-[#385777]">{message}</p>}
          </div>
        )}

        {pdfFile && !parsing && (
          <section className="mt-7">
            <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.14em] text-[#8a909c]">2 · Evidencias</p>
                <h2 className="mt-1 text-2xl font-black tracking-[-0.03em]">Estaciones detectadas</h2>
                <p className="mt-1 text-sm text-[#717885]">Carga rápida: selecciona 1) certificadora, 2) serie y 3) ubicación. Cableado es opcional.</p>
              </div>
              <button type="button" onClick={addStation} className="rounded-xl border border-[#c9c7c0] bg-white px-4 py-2.5 text-sm font-bold shadow-sm hover:border-[#172033]">+ Agregar estación</button>
            </div>

            <div className="grid gap-5 xl:grid-cols-2">
              {stations.map((station, stationIndex) => (
                <article key={station.id} className="overflow-hidden rounded-[22px] border border-[#d9d7d0] bg-white shadow-[0_10px_35px_rgba(23,32,51,0.045)]">
                  <div className="flex items-start justify-between gap-4 border-b border-[#ebe9e3] bg-[#fbfaf7] px-5 py-4">
                    <div className="flex min-w-0 items-center gap-3">
                      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[#172033] text-sm font-black text-white">{stationIndex + 1}</span>
                      <div className="min-w-0">
                        <p className="truncate font-black">{station.label || 'Sin nombre'}</p>
                        <p className="mt-0.5 truncate text-xs text-[#7b818d]">{station.hostname || 'Agregada manualmente'}</p>
                      </div>
                    </div>
                    <button type="button" onClick={() => setStations((current) => current.filter((item) => item.id !== station.id))} className="rounded-lg px-2 py-1 text-xs font-bold text-[#9b5261] hover:bg-[#fff0f3]">Eliminar</button>
                  </div>

                  <div className="p-5">
                    <div className="grid gap-3 sm:grid-cols-2">
                      <label className="text-xs font-bold text-[#505867]">Ubicación
                        <input value={station.label} onChange={(event) => updateStation(station.id, { label: event.target.value.toUpperCase() })} className="mt-1.5 w-full rounded-xl border border-[#d8d6cf] px-3 py-2.5 text-sm font-semibold outline-none focus:border-[#d7193f]" />
                      </label>
                      <label className="text-xs font-bold text-[#505867]">Dirección IP
                        <input value={station.ip} onChange={(event) => updateStation(station.id, { ip: event.target.value.trim() })} className="mt-1.5 w-full rounded-xl border border-[#d8d6cf] px-3 py-2.5 text-sm font-semibold outline-none focus:border-[#d7193f]" placeholder="192.168.1.10" inputMode="decimal" />
                      </label>
                    </div>

                    <label className="mt-4 flex cursor-pointer items-center justify-between gap-3 rounded-xl bg-[#172033] px-4 py-3 text-sm font-bold text-white transition hover:bg-[#26324a]">
                      <span>Cargar las 3 fotos en orden 1–2–3</span>
                      <span className="rounded-md bg-white/12 px-2 py-1 text-xs">Elegir</span>
                      <input className="sr-only" type="file" accept={FILE_ACCEPT} multiple onChange={(event) => assignThree(station.id, event.target.files)} />
                    </label>

                    <div className="mt-3 grid gap-2">
                      {REQUIRED_ROLES.map((role) => (
                        <FileSlot key={role} role={role} file={station.files[role]} onFile={(file) => updateFile(station.id, role, file)} />
                      ))}
                      <div className="my-1 h-px bg-[#ebe9e3]" />
                      <FileSlot role="cableado" file={station.files.cableado} onFile={(file) => updateFile(station.id, 'cableado', file)} optional />
                    </div>

                    {station.ip && REQUIRED_ROLES.some((role) => station.files[role]) && (
                      <div className="mt-4 rounded-xl bg-[#f4f3ef] p-3 text-[11px] leading-5 text-[#646b78]">
                        <strong className="block text-[#333c4e]">Ejemplo de nombre final</strong>
                        {photoOutputName(station.label, station.ip, 'certificadora', station.files.certificadora?.name || 'foto.jpg')}
                      </div>
                    )}
                  </div>
                </article>
              ))}
            </div>
          </section>
        )}

        {pdfFile && !parsing && (
          <section className="sticky bottom-4 z-20 mt-7 rounded-[22px] border border-[#c9c7c0] bg-white/95 p-4 shadow-[0_18px_55px_rgba(23,32,51,0.16)] backdrop-blur sm:p-5">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <p className="text-xs font-black uppercase tracking-[0.12em] text-[#8a909c]">3 · Descargar</p>
                <p className="mt-1 truncate font-black">{outputName}.zip</p>
                <p className="mt-1 text-xs text-[#707785]">{requiredReady} de {requiredTotal} fotografías obligatorias · {stations.filter((station) => station.files.cableado).length} de cableado</p>
                <div className="mt-2 h-1.5 w-full max-w-md overflow-hidden rounded-full bg-[#ebe9e3]">
                  <div className="h-full rounded-full bg-[#d7193f] transition-all" style={{ width: `${requiredTotal ? (requiredReady / requiredTotal) * 100 : 0}%` }} />
                </div>
              </div>
              <button type="button" disabled={!canGenerate || generating} onClick={generateZip} className="shrink-0 rounded-xl bg-[#d7193f] px-6 py-3.5 text-sm font-black text-white shadow-[0_8px_22px_rgba(215,25,63,0.25)] transition hover:bg-[#b91435] disabled:cursor-not-allowed disabled:bg-[#b8b5ae] disabled:shadow-none">
                {generating ? `Generando ${progress}%` : canGenerate ? 'Descargar ZIP ordenado' : 'Completa las fotografías'}
              </button>
            </div>
          </section>
        )}

        <footer className="mt-10 flex flex-col justify-between gap-2 border-t border-[#d9d7d0] py-6 text-xs text-[#747b88] sm:flex-row">
          <p>Los archivos permanecen en tu dispositivo y conservan su calidad original.</p>
          <p>Sin cuentas · Sin historial · Sin almacenamiento</p>
        </footer>
      </div>
    </main>
  );
}
