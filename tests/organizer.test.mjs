import assert from 'node:assert/strict';
import test from 'node:test';
import { hasCertificadora, parseBoletaText, stationParts } from '../app/organizer.ts';

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

test('custom box names come from PDF headings and override a numeric hostname', () => {
  const result = parse(`
    CAJA REPORTES
    HOSTNAME AG539CAJA01 IP 10.0.0.1 No. Serie 123456 DATAMATRIX GTC-UNO
    CAJA 2
    HOSTNAME AG539CAJA02 IP 10.0.0.2 No. Serie 234567 DATAMATRIX GTC-DOS
  `);
  assert.deepEqual(result.stations.map((station) => station.label), ['CAJA REPORTES', 'CAJA 2']);
  assert.equal(stationParts(result.stations[0].label).folder, 'CAJA REPORTES');
});

test('custom names are read from explicit location fields, compact hostnames and split hostname text', () => {
  for (const [text, label] of [
    ['HOSTNAME PC01 IP 10.0.0.1 Ubicación: Caja Reportes No. Serie 123456 DATAMATRIX GTC-UNO', 'CAJA REPORTES'],
    ['Nombre de estación: Reportes HOSTNAME PC01 IP 10.0.0.1 No. Serie 123456 DATAMATRIX GTC-UNO', 'REPORTES'],
    ['HOSTNAME AG539CAJAREPORTES IP 10.0.0.1 No. Serie 123456 DATAMATRIX GTC-UNO', 'CAJA REPORTES'],
    ['HOSTNAME AG539CAJA_REPORTES_2 IP 10.0.0.1 No. Serie 123456 DATAMATRIX GTC-UNO', 'CAJA REPORTES 2'],
    ['HOSTNAME AG539CAJA REPORTES IP 10.0.0.1 No. Serie 123456 DATAMATRIX GTC-UNO', 'CAJA REPORTES'],
  ]) {
    assert.equal(parse(text).stations[0].label, label, text);
  }
});

test('names listed as a column stay associated with the matching station', () => {
  const result = parse(`
    CAJA REPORTES
    CAJA 2
    HOSTNAME PC01 HOSTNAME AG539CAJA02
    10.0.0.1 10.0.0.2
    No. Serie 123456 No. Serie 234567 DATAMATRIX GTC-UNO DATAMATRIX GTC-DOS
  `);
  assert.deepEqual(result.stations.map((station) => station.label), ['CAJA REPORTES', 'CAJA 2']);
});

test('unknown stations use BACKUP without changing custom names containing numbers', () => {
  const result = parse('HOSTNAME PC01 IP 10.0.0.1 No. Serie 123456 DATAMATRIX GTC-UNO HOSTNAME PC02 IP 10.0.0.2 No. Serie 234567 DATAMATRIX GTC-DOS');
  assert.deepEqual(result.stations.map((station) => station.label), ['BACKUP', 'BACKUP 2']);
  assert.ok(result.stations.every((station) => station.nameMissing));
  assert.equal(stationParts('Caja Reportes 2').folder, 'CAJA REPORTES 2');
  assert.equal(stationParts('Reporte 539').folder, 'REPORTE 539');
  assert.equal(stationParts('').folder, 'BACKUP');
  assert.equal(stationParts('CAJA 01').folder, 'CAJA 1');
});

test('an explicit BACKUP name in the PDF is preserved as a real detected name', () => {
  const station = parse('Ubicación: BACKUP HOSTNAME PC01 IP 10.0.0.1 No. Serie 123456 DATAMATRIX GTC-UNO').stations[0];
  assert.equal(station.label, 'BACKUP');
  assert.equal(station.nameMissing, false);
});

test('words inside identifier codes are not mistaken for folder headings', () => {
  const result = parse('CAJA REPORTES\nHOSTNAME AG539CAJA01 IP 10.0.0.1 No. Serie 123456 DATAMATRIX GTC-REPORTES\nHOSTNAME PC02 IP 10.0.0.2 No. Serie 234567 DATAMATRIX GTC-BACKUP\nHOSTNAME PC03 No. Serie 345678 DATAMATRIX GTC-AUTOBANCO');
  assert.deepEqual(result.stations.map((station) => station.label), ['CAJA REPORTES', 'BACKUP', 'BACKUP 2']);
});
