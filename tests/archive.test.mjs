import assert from 'node:assert/strict';
import test from 'node:test';
import JSZip from 'jszip';
import { addPhotosToZip, agencyFolderName } from '../app/organizer.ts';
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

test('a mixed agency exports all photos, cables and documents without any directories', async () => {
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
    'Caja1_IP_10.0.0.1 Fotografia Certificadora.JPG',
    'Caja1_IP_10.0.0.1 Fotografia No. Serie y Código DATAMATRIX.heic',
    'Caja1_IP_10.0.0.1 Fotografia Ubicación No. Serie y Código DATAMATRIX.png',
    'Caja2_IP_10.0.0.1 Fotografia Certificadora.JPG',
    'Caja2_IP_10.0.0.1 Fotografia No. Serie y Código DATAMATRIX 1.heic',
    'Caja2_IP_10.0.0.1 Fotografia Ubicación No. Serie y Código DATAMATRIX 1.png',
    'Caja2_IP_10.0.0.1 Fotografia No. Serie y Código DATAMATRIX 2.jpg',
    'Caja2_IP_10.0.0.1 Fotografia Ubicación No. Serie y Código DATAMATRIX 2.heif',
    'Estado Cableado 1.jpg', 'Estado Cableado 2.heic',
  ].sort());
  for (const entry of Object.values(saved.files)) {
    assert.equal(entry.dir, false);
    assert.equal(entry.name.includes('/'), false);
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
    assert.equal(Object.keys(zip.files).length, count);
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

test('flattening cannot silently overwrite another station or an original document', async () => {
  const zip = new JSZip();
  await assert.rejects(addPhotosToZip(zip, [station('CAJA 1'), station('CAJA 01')], []), /mismo nombre/);
  assert.deepEqual(Object.keys(zip.files), []);
  const original = new File(['signed document'], 'CAJA1_IP_10.0.0.1 FOTOGRAFIA CERTIFICADORA.JPG');
  zip.file(original.name, await original.arrayBuffer());
  await assert.rejects(addPhotosToZip(zip, [station('CAJA 1')], []), /mismo nombre/);
  assert.deepEqual(Object.keys(zip.files), [original.name]);
  assert.equal(await zip.file(original.name).async('string'), 'signed document');
});
