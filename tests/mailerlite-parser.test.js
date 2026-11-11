import test from 'node:test';
import assert from 'node:assert';

// Import or recreate the resilient parser to test
function resolveArrayFromParsed(data) {
  if (Array.isArray(data)) return data;
  if (!data || typeof data !== 'object') return [];

  const candidateKeys = ['activities', 'conferencias', 'events', 'eventos', 'programacion', 'data', 'items', 'list'];
  for (const key of candidateKeys) {
    if (Array.isArray(data[key])) return data[key];
  }

  for (const key of Object.keys(data)) {
    if (Array.isArray(data[key])) return data[key];
  }

  return [];
}

function parseSingleActivityBlock(blockStr) {
  try {
    const cleaned = blockStr.replace(/,\s*([\]}])/g, '$1');
    return JSON.parse(cleaned);
  } catch (e) {
    const getField = (field) => {
      const regex = new RegExp(`"${field}"\\s*:\\s*"([\\s\\S]*?)"(?=\\s*,\\s*"[a-zA-Z0-9_]+"|\\s*})`, 'i');
      const match = blockStr.match(regex);
      return match ? match[1].replace(/\\"/g, '"').trim() : '';
    };

    const title = getField('title');
    const department = getField('department');
    if (!title && !department) return null;

    return {
      id: getField('id') || `AA-${Date.now()}`,
      date: getField('date'),
      start_time: getField('start_time'),
      end_time: getField('end_time'),
      department: department,
      title: title,
      speakers: getField('speakers'),
      modality: getField('modality') || 'Virtual',
      location: getField('location'),
      meeting_url: getField('meeting_url'),
      recording_url: getField('recording_url'),
      summary: getField('summary')
    };
  }
}

function extractActivitiesByBlocks(text) {
  const activities = [];
  let depth = 0;
  let startIdx = -1;
  let inString = false;
  let escaped = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (char === '\\') {
      escaped = true;
      continue;
    }
    if (char === '"') {
      inString = !inString;
      continue;
    }
    if (!inString) {
      if (char === '{') {
        if (depth === 0) startIdx = i;
        depth++;
      } else if (char === '}') {
        depth--;
        if (depth === 0 && startIdx !== -1) {
          const rawBlock = text.substring(startIdx, i + 1);
          const act = parseSingleActivityBlock(rawBlock);
          if (act && (act.title || act.department || act.id)) {
            activities.push(act);
          }
          startIdx = -1;
        }
      }
    }
  }
  return activities;
}

function parseActivitiesFromAi(rawText) {
  if (!rawText || typeof rawText !== 'string') return [];

  let cleaned = rawText.trim();
  cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();

  // Intento 1: Parseo JSON directo
  try {
    const directParsed = JSON.parse(cleaned);
    const resolved = resolveArrayFromParsed(directParsed);
    if (resolved.length > 0) return resolved;
  } catch (e) {}

  // Intento 2: Buscar límites de corchetes [ ... ]
  const firstBracket = cleaned.indexOf('[');
  const lastBracket = cleaned.lastIndexOf(']');
  if (firstBracket !== -1 && lastBracket > firstBracket) {
    const arraySlice = cleaned.substring(firstBracket, lastBracket + 1);
    try {
      const sanitized = arraySlice.replace(/,\s*([\]}])/g, '$1');
      const parsedSlice = JSON.parse(sanitized);
      if (Array.isArray(parsedSlice) && parsedSlice.length > 0) return parsedSlice;
    } catch (e) {}
  }

  // Intento 3: Buscar objeto contenedor { ... }
  const firstBrace = cleaned.indexOf('{');
  const lastBrace = cleaned.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    const objSlice = cleaned.substring(firstBrace, lastBrace + 1);
    try {
      const sanitized = objSlice.replace(/,\s*([\]}])/g, '$1');
      const parsedObj = JSON.parse(sanitized);
      const resolved = resolveArrayFromParsed(parsedObj);
      if (resolved.length > 0) return resolved;
    } catch (e) {}
  }

  // Intento 4: Truncado antes del último ']'
  if (firstBracket !== -1 && lastBrace > firstBracket) {
    const truncatedRepaired = cleaned.substring(firstBracket, lastBrace + 1) + '\n]';
    try {
      const sanitized = truncatedRepaired.replace(/,\s*([\]}])/g, '$1');
      const parsedTrunc = JSON.parse(sanitized);
      if (Array.isArray(parsedTrunc) && parsedTrunc.length > 0) return parsedTrunc;
    } catch (e) {}
  }

  // Intento 5: Extracción de bloques individuales
  const extractedList = extractActivitiesByBlocks(cleaned);
  if (extractedList.length > 0) {
    return extractedList;
  }

  throw new Error('No se pudo extraer ninguna actividad válida de la respuesta del modelo.');
}

test('parseActivitiesFromAi - array directo estándar', () => {
  const json = '[{"id": "1", "title": "Conferencia 1"}]';
  const result = parseActivitiesFromAi(json);
  assert.strictEqual(result.length, 1);
  assert.strictEqual(result[0].title, 'Conferencia 1');
});

test('parseActivitiesFromAi - envuelto en ```json markdown y con texto previo', () => {
  const json = 'Aquí tienes el resultado:\n```json\n[{"id": "2", "title": "Conferencia 2"}]\n```\nSaludos.';
  const result = parseActivitiesFromAi(json);
  assert.strictEqual(result.length, 1);
  assert.strictEqual(result[0].title, 'Conferencia 2');
});

test('parseActivitiesFromAi - envuelto en objeto { "conferencias": [...] }', () => {
  const json = '{"status": "ok", "conferencias": [{"id": "3", "title": "Conferencia 3"}]}';
  const result = parseActivitiesFromAi(json);
  assert.strictEqual(result.length, 1);
  assert.strictEqual(result[0].title, 'Conferencia 3');
});

test('parseActivitiesFromAi - array truncado que no alcanzó a cerrar ]', () => {
  const json = '[{"id": "4", "title": "Conferencia 4"}, {"id": "5", "title": "Conferencia 5"}, {"id": "6", "title": "Confe';
  const result = parseActivitiesFromAi(json);
  assert.strictEqual(result.length, 2);
  assert.strictEqual(result[0].title, 'Conferencia 4');
  assert.strictEqual(result[1].title, 'Conferencia 5');
});

test('parseActivitiesFromAi - con trailing comma', () => {
  const json = '[{"id": "7", "title": "Conferencia 7", }, ]';
  const result = parseActivitiesFromAi(json);
  assert.strictEqual(result.length, 1);
  assert.strictEqual(result[0].title, 'Conferencia 7');
});

test('parseActivitiesFromAi - bloque con comillas sin escapar en el título', () => {
  const json = `[
    {
      "id": "8",
      "department": "Urología",
      "title": "REVISIÓN: "ENFERMEDAD RENAL" ACTUALIZACIÓN",
      "speakers": "Dr. Pérez",
      "meeting_url": "https://teams.microsoft.com/test"
    }
  ]`;
  const result = parseActivitiesFromAi(json);
  assert.strictEqual(result.length, 1);
  assert.strictEqual(result[0].department, 'Urología');
  assert.ok(result[0].title.includes('ENFERMEDAD RENAL'));
});

test('parseActivitiesFromAi - extracción de múltiples conferencias del Viernes (virtuales y presenciales)', () => {
  const fridayAiJson = `[
    {
      "id": "AA-2026-027",
      "date": "2026-11-13",
      "start_time": "07:00",
      "end_time": "08:00",
      "department": "Farmacología y Toxicología",
      "title": "Complicaciones clínicas de las terapias basadas en incretinas",
      "speakers": "Dra. Gisela Tabares Ospina",
      "modality": "Virtual",
      "location": "Teams",
      "meeting_url": "https://teams.microsoft.com/meet/264789585190059?p=Mnn6ZAE52HlZGBqa64",
      "recording_url": "",
      "summary": "Toxicología clínica"
    },
    {
      "id": "AA-2026-028",
      "date": "2026-11-13",
      "start_time": "07:00",
      "end_time": "08:30",
      "department": "Medicina Interna",
      "title": "Mujer con síndrome constitucional, bicitopenia y lesiones nodulares hepáticas y adrenales",
      "speakers": "Manuela Valencia Muñoz",
      "modality": "Presencial",
      "location": "Auditorio 108 Morfología - Facultad de Medicina",
      "meeting_url": "",
      "recording_url": "",
      "summary": "Discusión de caso clínico en morfología"
    },
    {
      "id": "AA-2026-029",
      "date": "2026-11-13",
      "start_time": "08:00",
      "end_time": "09:00",
      "department": "Historia de la Medicina",
      "title": "Medellín un recorrido por su historia",
      "speakers": "Dr. Edison Muñoz",
      "modality": "Presencial",
      "location": "Auditorio 108",
      "meeting_url": "",
      "recording_url": "",
      "summary": ""
    }
  ]`;

  const parsed = parseActivitiesFromAi(fridayAiJson);
  assert.strictEqual(parsed.length, 3, 'Deben extraerse las 3 conferencias del viernes sin recortar');
  
  const fridayActs = parsed.filter(a => a.date === '2026-11-13');
  assert.strictEqual(fridayActs.length, 3, 'Todas las 3 actividades pertenecen al viernes 2026-11-13');
  
  // Conferencia 1: Farmacología (Virtual con Teams)
  assert.strictEqual(fridayActs[0].department, 'Farmacología y Toxicología');
  assert.strictEqual(fridayActs[0].modality, 'Virtual');
  assert.ok(fridayActs[0].meeting_url.includes('teams.microsoft.com'));

  // Conferencia 2: Medicina Interna (Presencial sin link virtual)
  assert.strictEqual(fridayActs[1].department, 'Medicina Interna');
  assert.strictEqual(fridayActs[1].modality, 'Presencial');
  assert.strictEqual(fridayActs[1].meeting_url, '', 'La actividad presencial del viernes debe tener meeting_url vacío');
  assert.ok(fridayActs[1].location.includes('Auditorio 108'));

  // Conferencia 3: Historia de la Medicina (Presencial)
  assert.strictEqual(fridayActs[2].department, 'Historia de la Medicina');
  assert.strictEqual(fridayActs[2].modality, 'Presencial');
  assert.strictEqual(fridayActs[2].meeting_url, '');
});

test('cleanMailerliteHtml - filtra enlaces fantasma vacíos y conserva conferencias del viernes', async () => {
  const { cleanMailerliteHtml } = await import('../api/scrape-mailerlite.js');

  const mockNewsletterHtml = `
    <table>
      <tr><td>Viernes 13 de noviembre</td></tr>
      <tr>
        <td>Farmacología y Toxicología</td>
        <td>Hora: 7:00 am</td>
        <td>Tema: Farmaco charla</td>
        <td>Presenta: Dr. Farmaco</td>
        <td><a href="https://teams.microsoft.com/meet/123">Aquí</a></td>
        <!-- Enlaces fantasma vacíos insertados por el editor de MailerLite -->
        <td><a href="https://teams.microsoft.com/ghost1"></a></td>
        <td><a href="https://teams.microsoft.com/ghost2">  </a></td>
      </tr>
      <tr>
        <td>Medicina Interna</td>
        <td>Hora: 7:00 am</td>
        <td>Tema: Caso clínico complejo</td>
        <td>Presenta: Dra. Caso</td>
        <td>Presencial: Auditorio 108 Morfología</td>
        <!-- Enlace vacío fantasma en bloque presencial -->
        <td><a href="https://teams.microsoft.com/ghost3"></a></td>
      </tr>
      <tr>
        <!-- Enlaces externos institucionales -->
        <td><a href="tel:+576042196940">Llamar</a></td>
        <td><a href="mailto:info@udea.edu.co">Escribir</a></td>
      </tr>
    </table>
  `;

  const cleaned = cleanMailerliteHtml(mockNewsletterHtml);
  
  // Debe contener la primera conferencia del viernes
  assert.ok(cleaned.includes('Farmacología y Toxicología'));
  assert.ok(cleaned.includes('[ENLACE_REUNION_VIRTUAL: https://teams.microsoft.com/meet/123 (Texto: Aquí)]'));

  // Debe contener la segunda conferencia del viernes
  assert.ok(cleaned.includes('Medicina Interna'));
  assert.ok(cleaned.includes('Presencial: Auditorio 108 Morfología'));

  // Los enlaces fantasma NO deben aparecer como ENLACE_REUNION_VIRTUAL
  assert.ok(!cleaned.includes('ghost1'));
  assert.ok(!cleaned.includes('ghost2'));
  assert.ok(!cleaned.includes('ghost3'));

  // Los enlaces telefónicos y correo se marcan como ENLACE_EXTERNO
  assert.ok(cleaned.includes('[ENLACE_EXTERNO: tel:+576042196940 (Texto: Llamar)]'));
  assert.ok(cleaned.includes('[ENLACE_EXTERNO: mailto:info@udea.edu.co (Texto: Escribir)]'));
});

test('normalizeDate - soporta múltiples variantes de fecha para el viernes y resto de semana', async () => {
  const { normalizeDate } = await import('../api/scrape-mailerlite.js');

  assert.strictEqual(normalizeDate('2026-11-13'), '2026-11-13');
  assert.strictEqual(normalizeDate('2026/11/13'), '2026-11-13');
  assert.strictEqual(normalizeDate('13/11/2026'), '2026-11-13');
  assert.strictEqual(normalizeDate('13-11-2026'), '2026-11-13');
  assert.strictEqual(normalizeDate(' 2026-11-13  '), '2026-11-13');
  assert.strictEqual(normalizeDate('Viernes 13 de noviembre'), '2026-11-13');
  assert.strictEqual(normalizeDate('Viernes 13 de noviembre de 2026'), '2026-11-13');
  assert.strictEqual(normalizeDate('Lunes 09 de noviembre'), '2026-11-09');
  assert.strictEqual(normalizeDate(''), '');
});

test('parseActivitiesFromAi - soporte para campo "fecha" o "dia" en lugar de "date"', () => {
  const jsonWithFecha = `[
    {
      "id": "AA-01",
      "fecha": "2026-11-13",
      "hora": "07:00",
      "departamento": "Farmacología y Toxicología",
      "titulo": "Toxicología clínica",
      "ponente": "Dra. Gisela Tabares",
      "modalidad": "Virtual",
      "enlace": "https://teams.microsoft.com/test"
    }
  ]`;

  const parsed = parseActivitiesFromAi(jsonWithFecha);
  assert.strictEqual(parsed.length, 1);
  const act = parsed[0];
  assert.strictEqual(act.fecha || act.date, '2026-11-13');
  assert.strictEqual(act.titulo || act.title, 'Toxicología clínica');
});
