/**
 * spotlight-and-carousel.test.js
 * Suite de verificación para las reglas de negocio institucionales:
 * 1. Cita editorial de la Facultad de Medicina en index.html.
 * 2. Encuentros presenciales sin enlace de reunión virtual.
 * 3. Exclusión estricta de actividades finalizadas del apartado en vivo / próximas de hoy.
 * 4. Listas de reproducción oficiales en cuadrícula de 3 filas x 4 columnas con carrusel.
 * 5. Corrección de nomenclatura institucional: GRAEPIC vs Psiquiatría y Salud Mental.
 */

import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  parseScheduleCsv,
  getActiveOrUpcomingSessions
} from '../src/services/scheduleService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.join(__dirname, '..');

test('1. Presencia de la cita editorial institucional en index.html', () => {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf-8');
  const expectedQuote = 'La medicina debe ser para el servicio de todos los seres humanos de una comunidad, y no solamente para los que pueden tener acceso a ella por su posición económica o geográfica.';
  
  assert.ok(html.includes(expectedQuote), 'La cita textual institucional debe existir en index.html');
  assert.ok(html.includes('Héctor Abad Gómez'), 'Debe citar al Dr. Héctor Abad Gómez');
  assert.ok(html.includes('quote-editorial-container'), 'Debe estar contenida dentro de quote-editorial-container');
});

test('2. Los encuentros presenciales NUNCA deben llevar enlace virtual', () => {
  const csvContent = fs.readFileSync(path.join(ROOT, 'public/data/programacion_semanal_octubre_2026.csv'), 'utf-8');
  const { activities } = parseScheduleCsv(csvContent);

  const presenciales = activities.filter(a => a.modality === 'Presencial');
  assert.ok(presenciales.length >= 3, 'Debe haber al menos 3 actividades presenciales en el dataset');

  presenciales.forEach(act => {
    assert.strictEqual(
      act.meeting_url,
      '',
      `La actividad presencial "${act.title}" no debe tener meeting_url, pero tenía: "${act.meeting_url}"`
    );
  });
});

test('3. Sesiones finalizadas (hora de fin ya transcurrida) NO se muestran en vivo ni en próximas de hoy', () => {
  const sampleActivities = [
    {
      id: 'ACT-01',
      date: '2026-10-28',
      startTime: '07:00',
      endTime: '08:00',
      modality: 'Virtual',
      title: 'Sesión Temprana de 7 a 8 am',
      department: 'Medicina Interna',
      meeting_url: 'https://meet.google.com/test-1'
    },
    {
      id: 'ACT-02',
      date: '2026-10-28',
      startTime: '08:00',
      endTime: '09:30',
      modality: 'Virtual',
      title: 'Sesión de Media Mañana de 8 a 9:30 am',
      department: 'Pediatría',
      meeting_url: 'https://meet.google.com/test-2'
    },
    {
      id: 'ACT-03',
      date: '2026-10-28',
      startTime: '10:00',
      endTime: '11:00',
      modality: 'Virtual',
      title: 'Sesión Tardía de 10 a 11 am',
      department: 'Cirugía',
      meeting_url: 'https://meet.google.com/test-3'
    }
  ];

  // Caso A: A las 07:30 (ACT-01 está en vivo, ACT-02 y ACT-03 son futuras)
  const at730 = new Date('2026-10-28T07:30:00-05:00');
  const result730 = getActiveOrUpcomingSessions(sampleActivities, at730);
  assert.strictEqual(result730.type, 'live');
  assert.strictEqual(result730.activities[0].id, 'ACT-01');

  // Caso B: A las 08:00 (ACT-01 ya concluyó a las 08:00, ACT-02 entra en vivo de 08:00 a 09:30)
  const at800 = new Date('2026-10-28T08:00:00-05:00');
  const result800 = getActiveOrUpcomingSessions(sampleActivities, at800);
  assert.strictEqual(result800.type, 'live');
  assert.strictEqual(result800.activities[0].id, 'ACT-02');
  assert.ok(!result800.activities.some(a => a.id === 'ACT-01'), 'ACT-01 terminó y NO debe estar en vivo a las 08:00');

  // Caso C: A las 09:35 (ACT-01 y ACT-02 ya terminaron; ACT-03 inicia a las 10:00)
  const at935 = new Date('2026-10-28T09:35:00-05:00');
  const result935 = getActiveOrUpcomingSessions(sampleActivities, at935);
  assert.strictEqual(result935.type, 'upcoming_today');
  assert.strictEqual(result935.activities.length, 1);
  assert.strictEqual(result935.activities[0].id, 'ACT-03');
  assert.ok(!result935.activities.some(a => a.id === 'ACT-01'), 'ACT-01 finalizada no debe estar en próximas hoy');
  assert.ok(!result935.activities.some(a => a.id === 'ACT-02'), 'ACT-02 finalizada no debe estar en próximas hoy');

  // Caso D: A las 11:05 (Todas las actividades del día ya concluyeron)
  const at1105 = new Date('2026-10-28T11:05:00-05:00');
  const result1105 = getActiveOrUpcomingSessions(sampleActivities, at1105);
  // Al no haber más actividades hoy, debe pasar a past o no incluir actividades en vivo
  assert.strictEqual(result1105.isLiveNow, false);
  assert.notStrictEqual(result1105.type, 'upcoming_today');
});

test('4. Configuración del carrusel de listas de reproducción (3 filas x 4 columnas)', () => {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf-8');
  const js = fs.readFileSync(path.join(ROOT, 'src/main.js'), 'utf-8');
  const css = fs.readFileSync(path.join(ROOT, 'src/styles/main.css'), 'utf-8');

  // HTML
  assert.ok(html.includes('id="playlists-carousel-viewport"'), 'Debe existir el viewport del carrusel');
  assert.ok(html.includes('id="playlists-carousel-track"'), 'Debe existir el track del carrusel');
  assert.ok(html.includes('id="btn-playlists-prev"'), 'Debe existir botón prev');
  assert.ok(html.includes('id="btn-playlists-next"'), 'Debe existir botón next');
  assert.ok(html.includes('id="playlists-page-indicator"'), 'Debe existir indicador de página');

  // JS: Verificación de las 11 listas activas de Aulas Abiertas en cuadrícula 3x4
  assert.ok(js.includes('PLAYLISTS_PER_PAGE = 12'), 'Debe fijar 12 listas por página (3x4)');
  assert.ok(js.includes('Urología'), 'Debe incluir playlist de Urología');
  assert.ok(js.includes('Anestesiología'), 'Debe incluir playlist de Anestesiología');
  assert.ok(js.includes('Rehabilitación Cardiaca'), 'Debe incluir playlist de Rehabilitación Cardiaca');
  assert.ok(js.includes('Medicina de Urgencias'), 'Debe incluir playlist de Medicina de Urgencias');
  assert.ok(js.includes('Medicina Crítica y Cuidados Intensivos'), 'Debe incluir playlist de Medicina Crítica y Cuidados Intensivos');
  assert.ok(js.includes('Alergología'), 'Debe incluir playlist de Alergología');
  assert.ok(js.includes('Endocrinología'), 'Debe incluir playlist de Endocrinología');
  assert.ok(js.includes('GRAEPIC'), 'Debe incluir playlist de GRAEPIC');
  assert.ok(js.includes('Nefrología'), 'Debe incluir playlist de Nefrología');
  assert.ok(js.includes('Medicina Física y Rehabilitación'), 'Debe incluir playlist de Medicina Física y Rehabilitación');
  assert.ok(js.includes('Pediatría'), 'Debe incluir playlist de Pediatría');

  // CSS: Verificación de regla 4 columnas x 3 filas
  assert.ok(css.includes('grid-template-columns: repeat(4, 1fr)'), 'Debe tener 4 columnas en CSS');
  assert.ok(css.includes('playlists-carousel-track'), 'Debe tener estilos para el track del carrusel');
});

test('5. Corrección de nomenclatura institucional: GRAEPIC verificado sin errata GREAPIC', () => {
  const js = fs.readFileSync(path.join(ROOT, 'src/main.js'), 'utf-8');
  const csv = fs.readFileSync(path.join(ROOT, 'public/data/programacion_semanal_octubre_2026.csv'), 'utf-8');

  // En main.js debe existir GRAEPIC correctamente escrito
  assert.ok(js.includes('GRAEPIC'), 'Debe existir lista para GRAEPIC');
  assert.ok(!js.includes('GREAPIC'), 'No debe existir la errata GREAPIC en ningún lugar de main.js');

  // En el CSV no debe existir GREAPIC
  assert.ok(!csv.includes('GREAPIC'), 'No debe existir la errata GREAPIC en el CSV oficial');
});

