import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  normalizeTime,
  formatTime12h,
  isValidDate,
  isValidUrl,
  normalizeModality,
  getMondayOfWeek,
  getSundayOfWeek,
  formatWeekRange,
  parseScheduleCsv,
  filterActivities,
  getAvailableWeeks,
  getActivitiesGroupedByDay,
  getUpcomingActivity
} from '../src/services/scheduleService.js';

console.log('🧪 Ejecutando suite de pruebas unitarias para scheduleService...\n');

// 1. Pruebas de normalización de hora
console.log('1. Normalización de hora:');
assert.strictEqual(normalizeTime('07:00 am'), '07:00');
assert.strictEqual(normalizeTime('7:00 am'), '07:00');
assert.strictEqual(normalizeTime('06:30 am'), '06:30');
assert.strictEqual(normalizeTime('02:00 pm'), '14:00');
assert.strictEqual(normalizeTime('2:00 p.m.'), '14:00');
assert.strictEqual(normalizeTime('14:30'), '14:30');
assert.strictEqual(normalizeTime('12:00 am'), '00:00');
assert.strictEqual(normalizeTime('12:00 pm'), '12:00');
assert.strictEqual(normalizeTime('hora inválida'), '');
console.log('  ✓ normalizeTime funciona correctamente en formatos 12h y 24h.');

// 1.1 Pruebas de formato 12h con am/pm
console.log('1.1 Formato 12h legible con am/pm:');
assert.strictEqual(formatTime12h('07:00'), '7:00 am');
assert.strictEqual(formatTime12h('06:30'), '6:30 am');
assert.strictEqual(formatTime12h('12:00'), '12:00 pm');
assert.strictEqual(formatTime12h('14:00'), '2:00 pm');
assert.strictEqual(formatTime12h('15:30'), '3:30 pm');
assert.strictEqual(formatTime12h('00:00'), '12:00 am');
console.log('  ✓ formatTime12h convierte correctamente a 12h am/pm sin sufijo COT.');

// 2. Pruebas de validación de fechas ISO
console.log('2. Validación de fechas ISO:');
assert.strictEqual(isValidDate('2026-10-26'), true);
assert.strictEqual(isValidDate('2026-02-29'), false); // 2026 no es bisiesto
assert.strictEqual(isValidDate('2024-02-29'), true);  // 2024 sí es bisiesto
assert.strictEqual(isValidDate('26/10/2026'), false);
assert.strictEqual(isValidDate('2026-13-01'), false);
console.log('  ✓ isValidDate valida correctamente años bisiestos y formato ISO.');

// 3. Pruebas de URLs
console.log('3. Validación de URLs:');
assert.strictEqual(isValidUrl('https://udea.edu.co'), true);
assert.strictEqual(isValidUrl('http://meet.google.com/abc'), true);
assert.strictEqual(isValidUrl('javascript:alert(1)'), false);
assert.strictEqual(isValidUrl('file:///etc/passwd'), false);
assert.strictEqual(isValidUrl(''), false);
console.log('  ✓ isValidUrl filtra protocolos inseguros y acepta HTTP/HTTPS.');

// 4. Modalidades
console.log('4. Normalización de modalidades:');
assert.strictEqual(normalizeModality('Virtual'), 'Virtual');
assert.strictEqual(normalizeModality('remoto'), 'Virtual');
assert.strictEqual(normalizeModality('Presencial'), 'Presencial');
assert.strictEqual(normalizeModality('Híbrida'), 'Híbrida');
assert.strictEqual(normalizeModality(''), 'Por confirmar');
console.log('  ✓ normalizeModality clasifica modalidades institucionales.');

// 5. Semanas y rangos (lunes a domingo)
console.log('5. Cálculo de semanas calendario (Lunes - Domingo):');
assert.strictEqual(getMondayOfWeek('2026-10-26'), '2026-10-26'); // Lunes 26 oct
assert.strictEqual(getMondayOfWeek('2026-10-28'), '2026-10-26'); // Miércoles 28 oct
assert.strictEqual(getMondayOfWeek('2026-11-01'), '2026-10-26'); // Domingo 1 nov
assert.strictEqual(getSundayOfWeek('2026-10-26'), '2026-11-01');
console.log('  ✓ Cálculo de lunes y domingo exacto sin desfase.');

// 6. Análisis del CSV oficial de la Facultad
console.log('6. Análisis del dataset CSV oficial:');
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const csvPath = path.resolve(__dirname, '../public/data/programacion_semanal_octubre_2026.csv');
const csvContent = fs.readFileSync(csvPath, 'utf8');

const { activities, warnings } = parseScheduleCsv(csvContent);
console.log(`  - Total actividades parseadas: ${activities.length}`);
console.log(`  - Advertencias: ${warnings.length}`);

assert(activities.length >= 30, `Esperadas al menos 30 actividades, obtenidas ${activities.length}`);
assert.strictEqual(warnings.length, 0, `No deberían existir advertencias en el CSV oficial: ${warnings.join(', ')}`);

// Verificar que contiene actividades clave
const urologia = activities.find(a => a.department === 'Urología');
assert(urologia, 'Debe existir actividad de Urología');
assert(urologia.title.includes('Crecimiento prostático'), 'Título de urología debe ser correcto');
assert(urologia.speakers.includes('Dra. Laura Sabogal'), 'Ponente de urología debe ser Dra. Laura Sabogal');

const presencial = activities.find(a => a.modality === 'Presencial');
assert(presencial, 'Debe existir al menos una actividad presencial');
assert(presencial.location.includes('HUSVF') || presencial.location.includes('Facultad'), 'Ubicación presencial debe ser verificada');

// 7. Filtros
console.log('7. Búsqueda y filtros combinables:');
const filteredByDept = filterActivities(activities, { department: 'Medicina Interna' });
assert(filteredByDept.length >= 2, 'Deben existir al menos 2 actividades de Medicina Interna');

const filteredBySearch = filterActivities(activities, { search: 'Sabogal' });
assert.strictEqual(filteredBySearch.length, 1, 'Búsqueda por apellido de ponente debe retornar 1 actividad');

const filteredByModality = filterActivities(activities, { modality: 'Presencial' });
assert(filteredByModality.every(a => a.modality === 'Presencial'), 'Todas las actividades filtradas deben ser presenciales');

// 8. Agrupación por días
console.log('8. Agrupación por días de la semana:');
const availableWeeks = getAvailableWeeks(activities);
assert.strictEqual(availableWeeks.length, 1, 'Debe existir 1 semana en el archivo de octubre');
const days = getActivitiesGroupedByDay(activities, availableWeeks[0].weekKey);
assert.strictEqual(days.length, 5, 'Deben existir 5 días con actividades (Lunes a Viernes)');

// 9. Próxima actividad en zona horaria America/Bogota
console.log('9. Selección de próxima actividad:');
const upcoming = getUpcomingActivity(activities, new Date('2026-10-26T11:00:00-05:00'));
assert(upcoming !== null, 'Debe retornar una próxima actividad válida');

console.log('\n🎉 ¡TODAS LAS PRUEBAS PASARON EXITOSAMENTE (100% OK)!');
