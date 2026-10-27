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
