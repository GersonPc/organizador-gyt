import assert from 'node:assert/strict';
import test from 'node:test';
import { pdfPageText } from '../app/pdf-text.ts';
import { parseBoletaText } from '../app/organizer.ts';

const cell = (str, x, y, height = 8) => ({ str, transform: [1, 0, 0, 1, x, y], height });

test('PDF text is read top to bottom and left to right regardless of drawing order', () => {
  const items = [cell('AUTOCAJA 1', 200, 80), cell('CAJA JEFE', 0, 80), cell('Datos equipos', 0, 100)];
  assert.equal(pdfPageText(items), 'Datos equipos\nCAJA JEFE AUTOCAJA 1');
  assert.equal(pdfPageText([...items].reverse()), pdfPageText(items));
});

test('small baseline differences stay in the same row without joining adjacent rows', () => {
  assert.equal(pdfPageText([cell('IP', 0, 100), cell('10.0.0.1', 60, 100.5), cell('DATAMATRIX', 0, 90)]), 'IP 10.0.0.1\nDATAMATRIX');
});

test('non-text, empty and invalid coordinates are ignored', () => {
  assert.equal(pdfPageText([null, {}, { type: 'beginMarkedContent' }, cell(' ', 0, 10), cell('bad', NaN, 10), cell('OK', 0, 10)]), 'OK');
  assert.equal(pdfPageText([]), '');
});

test('merged names drawn after the table retain their own hostname, IP and identifiers', () => {
  // Synthetic two-column layout reproducing the supplied boleta's drawing
  // order. Names are emitted last, in a different order from the equipment.
  const items = [
    cell('No. Serie 123456', 60, 100), cell('No. Serie 234567', 260, 100),
    cell('HOSTNAME AG100CAJA01', 60, 90), cell('HOSTNAME AG100AUTOC1', 260, 90),
    cell('IP 10.0.0.1', 60, 80), cell('IP 10.0.0.2', 260, 80),
    cell('DATAMATRIX GTC-UNO', 60, 70), cell('DATAMATRIX GTC-DOS', 260, 70),
    cell('No. Serie 345678', 60, 50), cell('HOSTNAME AG100CAJA02', 60, 40),
    cell('IP 10.0.0.3', 60, 30), cell('DATAMATRIX GTC-TRES', 60, 20),
    cell('CAJA 2', 0, 30), cell('AUTOCAJA 1', 200, 80), cell('CAJA JEFE', 0, 80),
  ];
  const result = parseBoletaText(pdfPageText(items), 'Boleta de Servicio 100 PRUEBA.pdf');
  assert.deepEqual(result.stations.map(({ label, ip, serial, datamatrix }) => ({ label, ip, serial, datamatrix })), [
    { label: 'CAJA JEFE', ip: '10.0.0.1', serial: '123456', datamatrix: 'GTC-UNO' },
    { label: 'AUTOCAJA 1', ip: '10.0.0.2', serial: '234567', datamatrix: 'GTC-DOS' },
    { label: 'CAJA 2', ip: '10.0.0.3', serial: '345678', datamatrix: 'GTC-TRES' },
  ]);
  assert.deepEqual(result.warnings, []);
});
