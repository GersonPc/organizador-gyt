import assert from 'node:assert/strict';
import test from 'node:test';
import { hasCertificadora, parseBoletaText, stationNeedsPhotos, stationParts } from '../app/organizer.ts';

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

test('special box headings override numeric hostnames without losing their names', () => {
  for (const label of ['CAJA JEFE', 'CAJA JEFE DE AGENCIA', 'CAJA NORTE', 'AUTOCAJA 1', 'AUTOCAJA 3']) {
    const station = parse(`${label}\nHOSTNAME AG539CAJA01 IP 10.0.0.1 No. Serie 123456 DATAMATRIX GTC-UNO`).stations[0];
    assert.equal(station.label, label);
    assert.equal(station.nameMissing, false);
  }
});

test('autocaja hostnames support full, abbreviated, separated and split names', () => {
  for (const hostname of ['AG539AUTOCAJA01', 'AG539AUTOCAJA_01', 'AG539AUTOC1', 'AG539AUTOC_01', 'AG539AUTOCAJA 1']) {
    assert.equal(parse(`HOSTNAME: ${hostname} IP 10.0.0.1 No. Serie 123456 DATAMATRIX GTC-UNO`).stations[0].label, 'AUTOCAJA 1', hostname);
  }
  assert.equal(parse('HOSTNAME AG539CAJA_JEFE IP 10.0.0.1').stations[0].label, 'CAJA JEFE');
});

test('box name formatting accepts separators and number markers without truncating words', () => {
  for (const label of ['Caja 01', 'CAJA-01', 'CAJA #01', 'Caja No. 01', 'CAJA N° 01', 'CAJA Nº 01', 'CAJA: 01']) {
    assert.equal(stationParts(label).folder, 'CAJA 1', label);
    assert.equal(parse(`${label}\nHOSTNAME PC01 IP 10.0.0.1`).stations[0].label, 'CAJA 1', label);
  }
  assert.equal(stationParts('AUTOCAJA 01').folder, 'AUTOCAJA 1');
  assert.equal(stationParts('CAJA NORTE').folder, 'CAJA NORTE');
  assert.equal(stationParts('CAJA NÚMERO UNO').folder, 'CAJA UNO');
});

test('explicit names may be on the next line or omit the colon', () => {
  for (const field of ['Nombre de la caja:\nCAJA JEFE', 'Nombre de estación\nCAJA JEFE', 'Ubicación CAJA JEFE']) {
    assert.equal(parse(`${field}\nHOSTNAME PC01 IP 10.0.0.1 No. Serie 123456 DATAMATRIX GTC-UNO`).stations[0].label, 'CAJA JEFE', field);
  }
});

test('headings before equipment metadata stay with the following station', () => {
  const result = parse(`CAJA JEFE\nMarca Olivetti Modelo PR2\nHOSTNAME AG539CAJA01 IP 10.0.0.1
AUTOCAJA 1\nMarca Olivetti Modelo PR2\nHOSTNAME AG539AUTOC1 IP 10.0.0.2`);
  assert.deepEqual(result.stations.map((s) => s.label), ['CAJA JEFE', 'AUTOCAJA 1']);
});

test('a heading and an explicit name for one station do not shift the next name', () => {
  const result = parse(`CAJA JEFE\nHOSTNAME AG539CAJA01 IP 10.0.0.1 Ubicación: CAJA JEFE
HOSTNAME AG539AUTOC1 IP 10.0.0.2`);
  assert.deepEqual(result.stations.map((s) => s.label), ['CAJA JEFE', 'AUTOCAJA 1']);
});

test('names side by side remain separate and stop at user metadata', () => {
  const result = parse('HOSTNAME PC01 HOSTNAME PC02\n10.0.0.1 10.0.0.2\nCAJA JEFE AUTOCAJA 1 Usuario Sin Asignar');
  assert.deepEqual(result.stations.map((s) => s.label), ['CAJA JEFE', 'AUTOCAJA 1']);
});

test('unknown, conflicting and duplicate names produce actionable review warnings', () => {
  assert.ok(parse('HOSTNAME PC01 IP 10.0.0.1').warnings.some((w) => w.includes('BACKUP')));
  const duplicate = parse('CAJA JEFE\nHOSTNAME PC01 IP 10.0.0.1\nCAJA JEFE\nHOSTNAME PC02 IP 10.0.0.2');
  assert.ok(duplicate.warnings.some((w) => w.includes('Se repite el nombre')));
  const conflict = parse('HOSTNAME PC01 IP 10.0.0.1 Ubicación: CAJA JEFE\nNombre de caja: CAJA REPORTES');
  assert.ok(conflict.warnings.some((w) => w.includes('varios nombres')));
});

test('named boxes with blank network cells survive a two-column equipment table', () => {
  const result = parse(`Datos equipos
No. Serie 123456 No. Serie 234567
HOSTNAME AG539CAJA1 HOSTNAME AG539CAJA2
Caja 1 IP 10.0.0.1 Caja 2 IP 10.0.0.2
DATAMATRIX GTC-UNO DATAMATRIX GTC-DOS
Usuario Uno Usuario Dos
No. Serie 345678 No. Serie 456789
HOSTNAME HOSTNAME
Caja 10 IP Caja ADMAC IP
DATAMATRIX GTC-TRES DATAMATRIX GTC-CUATRO
Usuario No asignado Usuario No asignado
Mantenimiento Preventivo
Observaciones
Certificadora CAJA 10 Y ADMAC se queda como Backup. No. Serie 999999 DATAMATRIX GTC-NOTA`);
  assert.deepEqual(result.stations, [
    { hostname: 'AG539CAJA1', ip: '10.0.0.1', label: 'CAJA 1', nameMissing: false, serial: '123456', datamatrix: 'GTC-UNO' },
    { hostname: 'AG539CAJA2', ip: '10.0.0.2', label: 'CAJA 2', nameMissing: false, serial: '234567', datamatrix: 'GTC-DOS' },
    { hostname: '', ip: '', label: 'CAJA 10', nameMissing: false, serial: '345678', datamatrix: 'GTC-TRES' },
    { hostname: '', ip: '', label: 'CAJA ADMAC', nameMissing: false, serial: '456789', datamatrix: 'GTC-CUATRO' },
  ]);
  assert.ok(result.stations.every(stationNeedsPhotos));
  assert.deepEqual(result.warnings, []);
});

test('blank hostname and IP slots at the beginning, middle or end do not shift later data', () => {
  for (const blank of [1, 2, 3]) {
    const result = parse([1, 2, 3].map((number) => `No. Serie ${number}23456
HOSTNAME ${number === blank ? '' : `AG539CAJA${number}`}
Caja ${number} IP ${number === blank ? '' : `10.0.0.${number}`}
DATAMATRIX GTC-${number}`).join('\n'));
    assert.deepEqual(result.stations.map(({ hostname, ip, label, serial, datamatrix }) => ({ hostname, ip, label, serial, datamatrix })),
      [1, 2, 3].map((number) => ({ hostname: number === blank ? '' : `AG539CAJA${number}`, ip: number === blank ? '' : `10.0.0.${number}`, label: `CAJA ${number}`, serial: `${number}23456`, datamatrix: `GTC-${number}` })));
  }
});

test('a missing IP with a hostname does not take the following station IP', () => {
  const result = parse('CAJA JEFE\nHOSTNAME PC01 IP No. Serie 123456 DATAMATRIX GTC-UNO\nCAJA 2\nHOSTNAME CAJA2 IP 10.0.0.2 No. Serie 234567 DATAMATRIX GTC-DOS');
  assert.deepEqual(result.stations.map((s) => s.ip), ['', '10.0.0.2']);
  assert.deepEqual(result.stations.map((s) => s.hostname), ['PC01', 'CAJA2']);
});

test('named boxes without hostname or IP labels can still receive photos', () => {
  const result = parse('CAJA 10\nNo. Serie 123456 DATAMATRIX GTC-UNO\nCAJA ADMAC\nNo. Serie 234567 DATAMATRIX GTC-DOS');
  assert.deepEqual(result.stations.map((s) => [s.label, s.hostname, s.ip, s.serial]), [['CAJA 10', '', '', '123456'], ['CAJA ADMAC', '', '', '234567']]);
  assert.ok(result.stations.every(stationNeedsPhotos));
  assert.equal(stationNeedsPhotos(parse('CAJA ADMAC').stations[0]), true);
  assert.equal(stationNeedsPhotos(parse('HOSTNAME CAJA1 IP 10.0.0.1 No. Serie DATAMATRIX').stations[0]), false);
});
