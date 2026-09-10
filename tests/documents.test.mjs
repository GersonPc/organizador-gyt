import assert from 'node:assert/strict';
import test from 'node:test';
import JSZip from 'jszip';
import { addDocumentsToZip, blankDocuments, documentNamesError, missingDocumentsWarning } from '../app/documents.ts';

const documents = () => ({
  boleta: new File([new Uint8Array([0, 255, 128, 10])], 'Boleta firmada.pdf'),
  informe: new File(['Informe firmado original'], 'Informe firmado.pdf'),
  word: new File([new Uint8Array([80, 75, 3, 4, 255])], 'Finalización original.docx'),
});

test('documents keep their original names and bytes at the ZIP root beside photo folders', async () => {
  const zip = new JSZip();
  const photoPath = 'AGENCIA 539 PORTALES/CAJA 1/foto.jpg';
  const photo = new Uint8Array([255, 216, 255, 0]);
  zip.file(photoPath, photo);
  const files = documents();
  await addDocumentsToZip(zip, files);
  const saved = await JSZip.loadAsync(await zip.generateAsync({ type: 'uint8array' }));
  const paths = Object.values(saved.files).filter((entry) => !entry.dir).map((entry) => entry.name);
  assert.deepEqual(paths.sort(), [photoPath, ...Object.values(files).map((file) => file.name)].sort());
  for (const file of Object.values(files)) {
    assert.deepEqual(await saved.file(file.name).async('uint8array'), new Uint8Array(await file.arrayBuffer()));
  }
  assert.deepEqual(await saved.file(photoPath).async('uint8array'), photo);
  assert.equal(Object.keys(saved.files).some((path) => path.includes('DOCUMENTOS/')), false);
});

test('any subset of optional documents can be included and the warning lists only missing files', async () => {
  const available = documents();
  const roles = ['boleta', 'informe', 'word'];
  const labels = ['Boleta de servicio firmada', 'Informe de finalización firmado', 'Informe de finalización en Word'];
  for (let mask = 0; mask < 8; mask++) {
    const files = blankDocuments();
    roles.forEach((role, index) => {
      if (mask & (1 << index)) files[role] = available[role];
    });
    const warning = missingDocumentsWarning(files);
    if (mask === 7) {
      assert.equal(warning, null);
    } else {
      assert.ok(warning.includes('Aceptar'));
      labels.forEach((label, index) => assert.equal(warning.includes(label), !(mask & (1 << index))));
    }
    const zip = new JSZip();
    await addDocumentsToZip(zip, files);
    assert.deepEqual(Object.keys(zip.files).sort(), Object.values(files).filter(Boolean).map((file) => file.name).sort());
  }
});

test('duplicate names cannot silently overwrite signed documents', async () => {
  const files = documents();
  files.informe = new File(['Different signed document'], 'BOLETA FIRMADA.PDF');
  assert.ok(documentNamesError(files));
  const zip = new JSZip();
  await assert.rejects(addDocumentsToZip(zip, files), /mismo nombre/);
  assert.deepEqual(Object.keys(zip.files), []);
  assert.equal(documentNamesError(documents()), null);
});
