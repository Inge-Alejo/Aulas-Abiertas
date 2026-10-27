/**
 * Serverless API para Vercel: Scraper Inteligente de Boletines MailerLite con Gemini IA
 * Permite ingresar una URL de MailerLite (ej: https://preview.mailerlite.com/k8w4m4m5a6)
 * y extraer todas las actividades estructuradas en JSON y CSV para Google Sheets.
 */

const CANDIDATE_MODELS = [
  'gemini-2.0-flash',
  'gemini-1.5-flash',
  'gemini-1.5-flash-8b',
  'gemini-1.5-pro'
];

/**
 * Inspecciona un objeto parseado para encontrar la propiedad que contiene el arreglo de actividades
 */
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

/**
 * Parsea un bloque de actividad individual, con soporte regex ante comillas rotas
 */
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

/**
 * Parser de rescate token a token para aislar cada objeto { ... } individualmente
 */
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

/**
 * Extrae y repara de forma ultra-resiliente el listado de actividades de la respuesta de Gemini.
 * Soporta arrays directos, objetos contenedores ({ activities, conferencias, data, etc. }),
 * respuestas truncadas sin cerrar corchetes, comillas sin escapar y extracción por bloques regex.
 */
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

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Api-Version');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método no permitido. Utiliza POST.' });
  }

  const apiKey = (process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY || process.env.gemini_api_key || '').trim();
  if (!apiKey) {
    return res.status(500).json({
      error: 'La variable de entorno GEMINI_API_KEY no está activa en este despliegue de Vercel.',
      setupHelp: 'Si acabas de agregar la variable en Vercel (Project Settings > Environment Variables), debes ir a Deployments y hacer clic en los tres puntos (...) > Redeploy para que el servidor la cargue.'
    });
  }

  try {
    const { url, rawContent } = req.body || {};
    let contentToAnalyze = rawContent || '';

    // Si se proporciona una URL de MailerLite, obtener el contenido HTML
    if (url && typeof url === 'string' && url.startsWith('http')) {
      try {
        const fetchRes = await fetch(url, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
          }
        });

        if (!fetchRes.ok) {
          throw new Error(`Error HTTP ${fetchRes.status} al consultar la URL de MailerLite.`);
        }

        const html = await fetchRes.text();
        
        // Reemplazar enlaces <a> con indicador explícito [ENLACE_REUNION_VIRTUAL: URL] para que la IA extraiga los enlaces directos de Teams/Meet
        let preprocessed = html.replace(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi, (m, href, text) => {
          const cleanText = text.replace(/<[^>]+>/g, '').trim();
          return ` [ENLACE_REUNION_VIRTUAL: ${href.trim()} (Texto: ${cleanText})] `;
        });

        // Limpieza profunda de scripts, estilos y atributos CSS redundantes para preservar todo el contenido textual y enlaces
        contentToAnalyze = preprocessed
          .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
          .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
          .replace(/<head\b[^<]*(?:(?!<\/head>)<[^<]*)*<\/head>/gi, '')
          .replace(/<!--[\s\S]*?-->/g, '')
          .replace(/<svg\b[^<]*(?:(?!<\/svg>)<[^<]*)*<\/svg>/gi, '')
          .replace(/\s*(?:style|class|id|cellpadding|cellspacing|border|width|height|bgcolor|align|valign|target|role|data-[a-z-]+|aria-[a-z-]+)="[^"]*"/gi, '')
          .replace(/\s*(?:style|class|id|cellpadding|cellspacing|border|width|height|bgcolor|align|valign|target|role|data-[a-z-]+|aria-[a-z-]+)='[^']*'/gi, '')
          .replace(/<(?:\/)?(?:tbody|thead|tfoot)>/gi, '')
          .replace(/\s{2,}/g, ' ');
      } catch (err) {
        return res.status(400).json({
          error: `No fue posible descargar el contenido del enlace: ${err.message}`
        });
      }
    }

    if (!contentToAnalyze) {
      return res.status(400).json({ error: 'Debes proporcionar una URL válida de MailerLite o el contenido del boletín.' });
    }

    const systemInstruction = `Eres un extractor experto de datos estructurados para la Facultad de Medicina de la Universidad de Antioquia (UdeA) y Aulas Abiertas.
Tu tarea es analizar minuciosamente TODO el boletín semanal de MailerLite y extraer CADA UNA de las conferencias o actividades académicas programadas para todos los días de la semana (Lunes, Martes, Miércoles, Jueves, Viernes, Sábado/Domingo).

INSTRUCCIONES CLAVE DE EXTRACCIÓN:
1. EXHAUSTIVIDAD TOTAL: El boletín contiene habitualmente entre 30 y 40 conferencias en total para toda la semana. Debes recorrer el documento de principio a fin y extraer ABSOLUTAMENTE TODAS las actividades sin omitir ninguna y sin detenerte prematuramente.
2. FECHAS EXACTAS: El boletín agrupa las conferencias bajo encabezados de días como "Lunes 26 de octubre", "Martes 27 de octubre", "Miércoles 28 de octubre", "Jueves 29 de octubre", "Viernes 30 de octubre". Determina el año, mes y día exactos y escribe la fecha en formato ISO "AAAA-MM-DD" (por ejemplo: "2026-10-26") para cada actividad de ese día.
3. HORA: La hora de inicio (start_time) normalizada en formato 24h "HH:mm" (ej: "07:00", "08:30", "14:00"). La hora de fin (end_time) si existe en "HH:mm", o cadena vacía "" si no se especifica.
4. ENLACE DE CONEXIÓN A REUNIÓN (meeting_url):
- MUY IMPORTANTE: En el texto de cada conferencia aparece su enlace de reunión virtual indicado explícitamente en [ENLACE_REUNION_VIRTUAL: URL]. Puede ser de Microsoft Teams (https://teams.microsoft.com/...), Google Meet (http://meet.google.com/ o https://meet.google.com/...), Zoom o YouTube.
- DEBES COPIAR ESE ENLACE EXACTO de Teams/Meet/Zoom en el campo meeting_url de esa conferencia.
- ESTÁ TOTALMENTE PROHIBIDO colocar la URL del boletín de MailerLite (como preview.mailerlite.com) en meeting_url.
- Si una actividad es presencial y no incluye enlace virtual, deja meeting_url como cadena vacía "".
5. CAMPOS A EXTRAER POR CADA ACTIVIDAD (JSON):
- id: Identificador único generado (ej: "AA-2026-001", "AA-2026-002", etc.)
- date: Fecha en formato "AAAA-MM-DD"
- start_time: Hora de inicio en formato "HH:mm" (24h)
- end_time: Hora de finalización "HH:mm" o ""
- department: Especialidad, servicio o departamento médico (ej: "Urología", "Medicina Interna", "Dermatología", "Cirugía General", "GREAPIC", etc.)
- title: Título completo y exacto de la conferencia
- speakers: Nombre del ponente o ponentes separados por punto y coma ";". Si no hay, ""
- modality: "Virtual", "Presencial", "Híbrida" o "Por confirmar"
- location: Lugar físico o plataforma (ej: "Piso 5", "Auditorio", "Teams", "Google Meet")
- meeting_url: URL real de videollamada (Teams, Google Meet, Zoom) si aparece en [ENLACE_REUNION_VIRTUAL: URL], o ""
- recording_url: URL de grabación o transmisión si aparece, o ""
- summary: Breve descripción o temática si se detalla en el texto, o ""

REGLAS CRÍTICAS DE SALIDA:
- Devuelve ÚNICAMENTE un arreglo JSON plano: [ { ... }, { ... } ].
- NUNCA agregues claves contenedoras (como {"activities": [...]}), texto introductorio ni explicaciones.
- NUNCA uses comillas dobles sin escapar dentro de los textos de 'title' o 'summary'. Si hay comillas en el boletín, usa comillas simples ' o angulares « ».`;

    let successfulResponse = null;
    let usedModel = null;
    let lastError = null;

    for (const model of CANDIDATE_MODELS) {
      try {
        const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
        const response = await fetch(apiUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            system_instruction: { parts: [{ text: systemInstruction }] },
            contents: [
              {
                role: 'user',
                parts: [{ text: `A continuación el contenido del boletín MailerLite para extraer:\n\n${contentToAnalyze}` }]
              }
            ],
            generationConfig: {
              temperature: 0.1,
              maxOutputTokens: 8192,
              responseMimeType: 'application/json'
            }
          })
        });

        if (response.ok) {
          const data = await response.json();
          const candidateText = data.candidates?.[0]?.content?.parts?.[0]?.text;
          if (candidateText) {
            successfulResponse = candidateText;
            usedModel = model;
            break;
          }
        } else {
          lastError = { model, status: response.status };
          console.warn(`[MailerLite Scraper] Fallo con ${model} (${response.status}), probando alternativa...`);
        }
      } catch (err) {
        lastError = { model, error: err.message };
      }
    }

    if (!successfulResponse) {
      return res.status(502).json({
        error: 'No se pudo procesar el boletín con los modelos de Gemini disponibles.',
        lastError
      });
    }

    // Parsear el JSON devuelto por Gemini de manera ultra-resiliente
    let activities = [];
    try {
      const parsedItems = parseActivitiesFromAi(successfulResponse);

      // Sanitizar campos garantizando formato y removiendo enlaces de MailerLite
      activities = parsedItems.map((act, idx) => {
        let mUrl = act.meeting_url ? String(act.meeting_url).trim() : '';
        if (mUrl.includes('mailerlite.com') || !mUrl.startsWith('http')) {
          mUrl = '';
        }
        return {
          id: act.id ? String(act.id).trim() : `AA-${idx + 1}`,
          date: act.date ? String(act.date).trim() : '',
          start_time: act.start_time ? String(act.start_time).trim() : '',
          end_time: act.end_time ? String(act.end_time).trim() : '',
          department: act.department ? String(act.department).trim() : '',
          title: act.title ? String(act.title).trim() : '',
          speakers: act.speakers ? String(act.speakers).trim() : '',
          modality: act.modality ? String(act.modality).trim() : 'Virtual',
          location: act.location ? String(act.location).trim() : '',
          meeting_url: mUrl,
          recording_url: act.recording_url ? String(act.recording_url).trim() : '',
          summary: act.summary ? String(act.summary).trim() : ''
        };
      });
    } catch (parseErr) {
      console.error('[MailerLite Scraper Parse Error]:', parseErr.message, successfulResponse);
      return res.status(500).json({
        error: 'La respuesta de la IA no pudo ser parseada como JSON válido.',
        details: parseErr.message,
        rawText: successfulResponse
      });
    }

    // Convertir las actividades extraídas a formato CSV para Google Sheets
    const csvHeaders = ['id', 'date', 'start_time', 'end_time', 'department', 'title', 'speakers', 'modality', 'location', 'meeting_url', 'recording_url', 'summary'];
    const csvRows = [csvHeaders.join(',')];

    activities.forEach((act) => {
      const row = csvHeaders.map((header) => {
        const val = act[header] !== undefined && act[header] !== null ? String(act[header]) : '';
        // Escapar comillas dobles y encerrar si tiene comas o saltos de línea
        if (val.includes(',') || val.includes('"') || val.includes('\n')) {
          return `"${val.replace(/"/g, '""')}"`;
        }
        return val;
      });
      csvRows.push(row.join(','));
    });

    const csvContent = csvRows.join('\r\n');

    return res.status(200).json({
      success: true,
      count: activities.length,
      modelUsed: usedModel,
      activities,
      csvContent,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('[MailerLite Scraper Error]:', error);
    return res.status(500).json({
      error: 'Error interno en el scraper de MailerLite con Gemini.',
      details: error.message
    });
  }
}
