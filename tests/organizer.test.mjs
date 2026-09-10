import assert from 'node:assert/strict';
import test from 'node:test';
import { hasCertificadora, parseBoletaText } from '../app/organizer.ts';

const filename = 'BOLETA DE SERVICIO AG539 PORTALES.pdf';
const parse = (text) => parseBoletaText(text, filename);

test('a blank box between certificadoras does not inherit the next identifiers', () => {
  const result = parse(`
    HOSTNAME AG539CAJA01 IP 10.0.0.1 No. Serie 123456 DATAMATRIX GTC-UNO
    HOSTNAME AG539CAJA02 IP 10.0.0.2 No. Serie DATAMATRIX
    HOSTNAME AG539CAJA03 IP 10.0.0.3 No. Serie 345678 DATAMATRIX GTC-TRES
  `);
  assert.deepEqual(result.stations.map(({ label, serial, datamatrix }) => ({ label, serial, datamatrix })), [
    { label: 'CAJA 1', serial: '123456', datamatrix: 'GTC-UNO' },
    { label: 'CAJA 2', serial: '', datamatrix: '' },
    { label: 'CAJA 3', serial: '345678', datamatrix: 'GTC-TRES' },
  ]);
  assert.deepEqual(result.stations.filter(hasCertificadora).map((station) => station.label), ['CAJA 1', 'CAJA 3']);
  assert.deepEqual(result.warnings, []);
});

test('absent identifier labels in station blocks do not shift values', () => {
  for (const missing of [1, 2, 3]) {
    const result = parse([1, 2, 3].map((number) =>
      `HOSTNAME CAJA${number} IP 10.0.0.${number} ${number === missing ? '' : `No. de Serie: ${number}23456 Código DATAMATRIX: GTC-${number}`}`,
    ).join(' '));
    assert.deepEqual(result.stations.map(hasCertificadora), [1, 2, 3].map((number) => number !== missing));
    for (const station of result.stations.filter(hasCertificadora)) {
      const number = station.ip.slice(-1);
      assert.equal(station.serial, `${number}23456`);
      assert.equal(station.datamatrix, `GTC-${number}`);
    }
  }
});

test('column-ordered text preserves blank serial and DATAMATRIX slots', () => {
  const result = parse(`
    HOSTNAME CAJA1 HOSTNAME CAJA2 HOSTNAME CAJA3
    10.0.0.1 10.0.0.2 10.0.0.3
    No. Serie 123456 No. Serie N/A No. Serie 345678
    DATAMATRIX GTC-UNO DATAMATRIX -- DATAMATRIX GTC-TRES
  `);
  assert.deepEqual(result.stations.map((station) => station.serial), ['123456', '', '345678']);
  assert.deepEqual(result.stations.map((station) => station.datamatrix), ['GTC-UNO', '', 'GTC-TRES']);
});

test('identifier cells before HOSTNAME stay associated with their box', () => {
  const result = parse(`
    No. Serie 123456 DATAMATRIX GTC-UNO HOSTNAME CAJA1 IP 10.0.0.1
    No. Serie DATAMATRIX HOSTNAME CAJA2 IP 10.0.0.2
    No. Serie 345678 DATAMATRIX GTC-TRES HOSTNAME CAJA3 IP 10.0.0.3
  `);
  assert.deepEqual(result.stations.map(hasCertificadora), [true, false, true]);
  assert.equal(result.stations[2].serial, '345678');
});

test('a station with either identifier still requires photographs', () => {
  const result = parse(`
    HOSTNAME CAJA1 IP 10.0.0.1 No. Serie 123456 DATAMATRIX
    HOSTNAME CAJA2 IP 10.0.0.2 No. Serie DATAMATRIX GTC-DOS
  `);
  assert.deepEqual(result.stations.map(hasCertificadora), [true, true]);
  assert.equal(result.warnings.length, 1);
});

test('all boxes without certificadoras remain distinguishable from a PDF with no stations', () => {
  const emptyBoxes = parse('HOSTNAME CAJA1 10.0.0.1 No. Serie DATAMATRIX HOSTNAME CAJA2 10.0.0.2 No. Serie N/A DATAMATRIX N/A');
  assert.equal(emptyBoxes.stations.length, 2);
  assert.equal(emptyBoxes.stations.filter(hasCertificadora).length, 0);
  assert.equal(parse('Sin tabla de equipos').stations.length, 0);
  assert.equal(hasCertificadora({ serial: ' ', datamatrix: ' ' }), false);
});
