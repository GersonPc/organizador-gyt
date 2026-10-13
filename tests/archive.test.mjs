import assert from 'node:assert/strict';
import test from 'node:test';
import JSZip from 'jszip';
import { addPhotosToZip, agencyFolderName, planPhotosForZip, stationIssues } from '../app/organizer.ts';
import { addDocumentsToZip, blankDocuments } from '../app/documents.ts';

const photoBytes = new Uint8Array([255, 216, 255, 128, 0, 10]);
const station = (label, separateIdentifiers = false) => ({
  label,
  ip: '10.0.0.1',
  separateIdentifiers,
  files: {
    certificadora: new File([photoBytes], '1.JPG'),
    serie: new File([photoBytes], '2.heic'),
    ubicacion: new File([photoBytes], '3.png'),
    inventario: new File([photoBytes], '4.jpg'),
    ubicacionInventario: new File([photoBytes], '5.heif'),
  },
});

test('a mixed agency groups photos by box and cable photos in CABLEADO, with documents at the ZIP root', async () => {
  const zip = new JSZip();
  const documents = {
    boleta: new File(['signed receipt'], 'Boleta firmada.pdf'),
    informe: new File(['signed report'], 'Informe firmado.pdf'),
    word: new File(['word report'], 'Informe.docx'),
  };
  await addDocumentsToZip(zip, documents);
  await addPhotosToZip(zip, [station('CAJA 1'), station('CAJA 2', true)], [
    new File([photoBytes], 'IMG_283.jpg'),
    new File([photoBytes], 'IMG_284.heic'),
  ]);
  const saved = await JSZip.loadAsync(await zip.generateAsync({ type: 'uint8array' }));
  assert.equal(agencyFolderName('539', 'Portales'), 'AGENCIA 539 PORTALES');
  assert.deepEqual(Object.keys(saved.files).sort(), [
    'Boleta firmada.pdf', 'Informe firmado.pdf', 'Informe.docx',
    'CAJA 1/',
    'CAJA 1/Caja1_IP_10.0.0.1 Fotografia Certificadora.JPG',
    'CAJA 1/Caja1_IP_10.0.0.1 Fotografia No. Serie y Código DATAMATRIX.heic',
    'CAJA 1/Caja1_IP_10.0.0.1 Fotografia Ubicación No. Serie y Código DATAMATRIX.png',
    'CAJA 2/',
    'CAJA 2/Caja2_IP_10.0.0.1 Fotografia Certificadora.JPG',
    'CAJA 2/Caja2_IP_10.0.0.1 Fotografia No. Serie y Código DATAMATRIX 1.heic',
    'CAJA 2/Caja2_IP_10.0.0.1 Fotografia Ubicación No. Serie y Código DATAMATRIX 1.png',
    'CAJA 2/Caja2_IP_10.0.0.1 Fotografia No. Serie y Código DATAMATRIX 2.jpg',
    'CAJA 2/Caja2_IP_10.0.0.1 Fotografia Ubicación No. Serie y Código DATAMATRIX 2.heif',
    'CABLEADO/', 'CABLEADO/1.jpg', 'CABLEADO/2.heic',
  ].sort());
  for (const entry of Object.values(saved.files)) {
    if (entry.dir) continue;
    const document = Object.values(documents).find((file) => file.name === entry.name);
    assert.deepEqual(await entry.async('uint8array'), document ? new Uint8Array(await document.arrayBuffer()) : photoBytes);
  }
});

test('switching back to three photos excludes retained extra images from the ZIP', async () => {
  const item = station('CAJA AUTOBANCO', true);
  for (const [separateIdentifiers, count] of [[true, 5], [false, 3], [true, 5]]) {
    item.separateIdentifiers = separateIdentifiers;
    const zip = new JSZip();
    await addPhotosToZip(zip, [item], []);
    assert.equal(Object.values(zip.files).filter((entry) => !entry.dir).length, count);
    assert.ok(Object.keys(zip.files).every((name) => name.startsWith('CAJA AUTOBANCO/')));
    assert.equal(Object.keys(zip.files).some((name) => / [12]\.(heic|png|jpg|heif)$/.test(name)), separateIdentifiers);
  }
});

test('a ZIP without certificadoras or cable photos creates no empty folders', async () => {
  const zip = new JSZip();
  await addDocumentsToZip(zip, blankDocuments());
  await addPhotosToZip(zip, [], []);
  const saved = await JSZip.loadAsync(await zip.generateAsync({ type: 'uint8array' }));
  assert.deepEqual(Object.keys(saved.files), []);
});

test('duplicate names are reported and exported without losing any photo', async () => {
  const zip = new JSZip();
  const warnings = await addPhotosToZip(zip, [station('CAJA 1'), station('CAJA 01')], []);
  assert.equal(warnings.length, 3);
  const saved = await JSZip.loadAsync(await zip.generateAsync({ type: 'uint8array' }));
  const photos = Object.values(saved.files).filter((entry) => !entry.dir);
  assert.equal(photos.length, 6);
  assert.equal(photos.filter((entry) => entry.name.includes(' (2).')).length, 3);
  for (const photo of photos) assert.deepEqual(await photo.async('uint8array'), photoBytes);
  const cableZip = new JSZip();
  const original = new File(['original photo'], 'CABLEADO/1.JPG');
  cableZip.file(original.name, await original.arrayBuffer(), { createFolders: false });
  const cableWarnings = await addPhotosToZip(cableZip, [], [new File([photoBytes], 'cable.jpg')]);
  assert.equal(cableWarnings.length, 1);
  assert.equal(await cableZip.file(original.name).async('string'), 'original photo');
  assert.deepEqual(await cableZip.file('CABLEADO/1 (2).jpg').async('uint8array'), photoBytes);
});

test('missing metadata and incomplete or extra stations remain downloadable with explicit warnings', async () => {
  const backup = { ...station(''), ip: '', serial: '', datamatrix: '' };
  const reportes = { ...station('CAJA REPORTES'), files: { ...station('CAJA REPORTES').files, serie: null } };
  const extra = { ...station('CAJA 3'), excluded: true };
  const issues = stationIssues(backup);
  assert.deepEqual(issues.map((issue) => issue.field), ['label', 'ip', 'identifiers']);
  assert.ok(stationIssues(reportes).some((issue) => issue.field === 'photos'));
  assert.deepEqual(stationIssues(extra), []);
  const plan = planPhotosForZip([backup, reportes, extra], []);
  assert.equal(plan.entries.length, 5);
  const zip = new JSZip();
  await addPhotosToZip(zip, [backup, reportes, extra], []);
  const saved = await JSZip.loadAsync(await zip.generateAsync({ type: 'uint8array' }));
  assert.ok(saved.file('BACKUP/BACKUP_IP_SIN_IP Fotografia Certificadora.JPG'));
  assert.ok(saved.file('CAJA REPORTES/CAJAREPORTES_IP_10.0.0.1 Fotografia Certificadora.JPG'));
  assert.equal(Object.keys(saved.files).some((name) => name.startsWith('CAJA 3/')), false);
  assert.equal(Object.values(saved.files).filter((entry) => !entry.dir).length, 5);
});

test('multiple unnamed stations get distinct BACKUP folders and keep all of their files', async () => {
  const zip = new JSZip();
  await addPhotosToZip(zip, [station(''), station('')], []);
  assert.ok(zip.files['BACKUP/']);
  assert.ok(zip.files['BACKUP 2/']);
  assert.equal(Object.values(zip.files).filter((entry) => !entry.dir).length, 6);
});
