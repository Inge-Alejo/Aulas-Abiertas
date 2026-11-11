/**
 * Serverless API para Vercel: Scraper Inteligente de Boletines MailerLite con Gemini IA
 * Permite ingresar una URL de MailerLite (ej: https://preview.mailerlite.com/k8w4m4m5a6)
 * y extraer todas las actividades estructuradas en JSON y CSV para Google Sheets.
 * Modelos oficiales configurados: Gemini 3.5 Flash Lite y Gemini 3.1 Flash Lite.
 */

const CANDIDATE_MODELS = [
  'gemini-3.5-flash-lite',
  'gemini-3.1-flash-lite'
];

/**
 * Normaliza una fecha a formato ISO YYYY-MM-DD
 * Soporta formatos: YYYY-MM-DD, YYYY/MM/DD, DD/MM/YYYY, D/M/YYYY, YYYY-M-D
 * y textos en español como "Viernes 13 de noviembre" o "13 de noviembre de 2026"
 * @param {string} rawDate
 * @param {number} [fallbackYear=2026]
 * @returns {string} Fecha normalizada o cadena original
 */
export function normalizeDate(rawDate, fallbackYear = 2026) {
  if (!rawDate || typeof rawDate !== 'string') return '';
  const trimmed = rawDate.trim();

  // YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return trimmed;
  }

  // YYYY/MM/DD
  if (/^\d{4}\/\d{2}\/\d{2}$/.test(trimmed)) {
    return trimmed.replace(/\//g, '-');
  }

  // DD/MM/YYYY o DD-MM-YYYY
  const dmyMatch = trimmed.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (dmyMatch) {
    const [, d, m, y] = dmyMatch;
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }

  // YYYY-M-D
  const ymdMatch = trimmed.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (ymdMatch) {
    const [, y, m, d] = ymdMatch;
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }

  // Texto en español: ej "Viernes 13 de noviembre", "13 de noviembre de 2026", "Viernes 13 nov"
  const monthMap = {
    enero: '01', ene: '01',
    febrero: '02', feb: '02',
    marzo: '03', mar: '03',
    abril: '04', abr: '04',
    mayo: '05', may: '05',
    junio: '06', jun: '06',
    julio: '07', jul: '07',
    agosto: '08', ago: '08',
    septiembre: '09', setiembre: '09', sep: '09', set: '09',
    octubre: '10', oct: '10',
    noviembre: '11', nov: '11',
    diciembre: '12', dic: '12'
  };

  const textMatch = trimmed.toLowerCase().match(/(?:lunes|martes|mi[ée]rcoles|jueves|viernes|s[áa]bado|domingo)?[\s,]*(\d{1,2})\s+de\s+([a-záéíóú]+)(?:\s+(?:de\s+)?(\d{4}))?/i);
  if (textMatch) {
    const day = textMatch[1].padStart(2, '0');
    const monthName = textMatch[2].normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const month = monthMap[monthName];
    const year = textMatch[3] || String(fallbackYear);
    if (month) {
      return `${year}-${month}-${day}`;
    }
  }

  return trimmed;
}

/**
 * Limpia y preprocesa el HTML de un boletín de MailerLite eliminando enlaces fantasma
 * y estructurando enlaces de reunión y texto limpio para optimizar la extracción con IA.
 * @param {string} html
 * @returns {string}
 */
export function cleanMailerliteHtml(html) {
  if (!html || typeof html !== 'string') return '';

  // 1. Filtrar enlaces <a>: descartar enlaces fantasma vacíos de MailerLite (cleanText vacío)
  // y distinguir enlaces de reunión de enlaces externos o administrativos
  const preprocessed = html.replace(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi, (m, href, text) => {
    const cleanText = text.replace(/<[^>]+>/g, '').trim();
    if (!cleanText) return ' '; // Descartar enlaces vacíos fantasma que MailerLite deja en el HTML

    const trimmedHref = href.trim();
    // Excluir enlaces de correo, teléfono o navegación interna del visor de MailerLite
    if (trimmedHref.startsWith('mailto:') || trimmedHref.startsWith('tel:') || trimmedHref.includes('mailerlite.com')) {
      return ` [ENLACE_EXTERNO: ${trimmedHref} (Texto: ${cleanText})] `;
    }
    return ` [ENLACE_REUNION_VIRTUAL: ${trimmedHref} (Texto: ${cleanText})] `;
  });

  // 2. Limpieza profunda de etiquetas, estilos, scripts y normalización de saltos de línea
  return preprocessed
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
    .replace(/<head\b[^<]*(?:(?!<\/head>)<[^<]*)*<\/head>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<svg\b[^<]*(?:(?!<\/svg>)<[^<]*)*<\/svg>/gi, '')
    .replace(/\s*(?:style|class|id|cellpadding|cellspacing|border|width|height|bgcolor|align|valign|target|role|data-[a-z-]+|aria-[a-z-]+)="[^"]*"/gi, '')
    .replace(/\s*(?:style|class|id|cellpadding|cellspacing|border|width|height|bgcolor|align|valign|target|role|data-[a-z-]+|aria-[a-z-]+)='[^']*'/gi, '')
    .replace(/<(?:\/)?(?:tbody|thead|tfoot)>/gi, '')
    .replace(/<br\s*[\/]?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<\/tr>/gi, '\n')
    .replace(/<\/td>/gi, ' | ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/[ \t]+/g, ' ')
    .replace(/[|\s]*\n[|\s]*/g, '\n')
    .replace(/\n{2,}/g, '\n')
    .trim();
}

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

    const title = getField('title') || getField('titulo') || getField('tema');
    const department = getField('department') || getField('departamento') || getField('especialidad');
    if (!title && !department) return null;

    const dateVal = getField('date') || getField('fecha') || getField('dia');

    return {
      id: getField('id') || `AA-${Date.now()}`,
      date: normalizeDate(dateVal),
      start_time: getField('start_time') || getField('startTime') || getField('hora') || getField('hora_inicio'),
      end_time: getField('end_time') || getField('endTime') || getField('hora_fin'),
      department: department,
      title: title,
      speakers: getField('speakers') || getField('ponente') || getField('ponentes') || getField('presenta'),
      modality: getField('modality') || getField('modalidad') || 'Virtual',
      location: getField('location') || getField('lugar') || getField('auditorio'),
      meeting_url: getField('meeting_url') || getField('meetingUrl') || getField('enlace'),
      recording_url: getField('recording_url') || getField('recordingUrl') || getField('grabacion'),
      summary: getField('summary') || getField('resumen')
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
  const origin = req.headers.origin || '*';
  res.setHeader('Access-Control-Allow-Origin', origin);
  if (origin !== '*') {
    res.setHeader('Access-Control-Allow-Credentials', 'true');
  }
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
        contentToAnalyze = cleanMailerliteHtml(html);
      } catch (err) {
        return res.status(400).json({
          error: `No fue posible descargar el contenido del enlace: ${err.message}`
        });
      }
    } else if (rawContent && typeof rawContent === 'string' && /<[a-z][\s\S]*>/i.test(rawContent)) {
      // Si el usuario pegó HTML en crudo en lugar de texto plano, aplicar la misma limpieza profunda
      contentToAnalyze = cleanMailerliteHtml(rawContent);
    }

    if (!contentToAnalyze) {
      return res.status(400).json({ error: 'Debes proporcionar una URL válida de MailerLite o el contenido del boletín.' });
    }

    const systemInstruction = `Eres un extractor experto de datos estructurados para la Facultad de Medicina de la Universidad de Antioquia (UdeA) y Aulas Abiertas.
Tu tarea es analizar minuciosamente TODO el boletín semanal de MailerLite y extraer CADA UNA de las conferencias o actividades académicas programadas para todos los días de la semana (Lunes, Martes, Miércoles, Jueves, Viernes, Sábado/Domingo).

INSTRUCCIONES CLAVE DE EXTRACCIÓN:
1. EXHAUSTIVIDAD TOTAL: El boletín contiene habitualmente entre 25 y 40 conferencias en total para toda la semana. Debes recorrer el documento de principio a fin y extraer ABSOLUTAMENTE TODAS las actividades sin omitir ninguna y sin detenerte prematuramente.

2. ATENCIÓN ESPECIAL AL VIERNES (ÚLTIMO DÍA DE LA SEMANA):
- ¡REGLA CRÍTICA PARA EL VIERNES!: El viernes se ubica al final del boletín y habitualmente contiene MÚLTIPLES conferencias (ej: 2, 3 o más actividades para diferentes especialidades como Farmacología, Medicina Interna, Pediatría, Cirugía, Urgencias, etc.).
- NUNCA te detengas al extraer la primera actividad del viernes. Debes extraer TODAS y CADA UNA de las conferencias que aparezcan bajo el encabezado del viernes hasta agotar la programación.
- No confundas la última conferencia del viernes con la sección final de suscripción al canal de YouTube, enlaces de WhatsApp o pie de página institucional.
- Asegúrate de incluir tanto la primera conferencia del viernes como la segunda, tercera y subsiguientes.

3. CONFERENCIAS PRESENCIALES (SIN ENLACE VIRTUAL):
- ¡MUY IMPORTANTE!: Varias conferencias (por ejemplo, de Medicina Interna o Historia de la Medicina) son 100% PRESENCIALES en auditorios físicos (ej: "Auditorio 108 Morfología - Facultad de Medicina", auditorios de hospitales o sedes de la Facultad).
- ESTAS ACTIVIDADES PRESENCIALES NO TIENEN BOTÓN VIRTUAL "Aquí" NI ENLACE DE TEAMS/MEET.
- DEBES EXTRAERLAS OBLIGATORIAMENTE. No las omitas ni las descartes por ser presenciales.
- Para las actividades presenciales asigna:
  * "modality": "Presencial"
  * "location": El lugar físico indicado (ej: "Auditorio 108 Morfología - Facultad de Medicina")
  * "meeting_url": "" (cadena vacía obligatoria para eventos presenciales)

4. FECHAS EXACTAS:
- El boletín agrupa las conferencias bajo encabezados de días como "Lunes 09 de noviembre", "Martes 10 de noviembre", "Miércoles 11 de noviembre", "Jueves 12 de noviembre", "Viernes 13 de noviembre" (o fechas de octubre, etc.).
- Determina el año, mes y día exactos y escribe la fecha en formato ISO "AAAA-MM-DD" (por ejemplo: "2026-11-13") para CADA actividad de ese día. No inventes fechas ni dejes el campo vacío.

5. HORAS:
- La hora de inicio (start_time) normalizada en formato 24h "HH:mm" (ej: "07:00", "08:00", "14:00"). Si el boletín dice "7:00 am", escribe "07:00".
- La hora de fin (end_time) si existe en "HH:mm", o cadena vacía "" si no se especifica.

6. ENLACE DE CONEXIÓN A REUNIÓN VIRTUAL (meeting_url):
- En las actividades virtuales o híbridas, copia el enlace directo indicado en [ENLACE_REUNION_VIRTUAL: URL (Texto: Aquí)].
- Copia únicamente enlaces válidos de videoconferencia (Microsoft Teams, Google Meet, Zoom o YouTube).
- NUNCA coloques en meeting_url enlaces a preview.mailerlite.com, mailto:, tel: ni enlaces de cancelación de suscripción.
- Si la actividad es presencial, meeting_url DEBE ser cadena vacía "".

7. CAMPOS A EXTRAER POR CADA ACTIVIDAD (JSON):
- id: Identificador único generado (ej: "AA-2026-001", "AA-2026-002", etc.)
- date: Fecha en formato ISO "AAAA-MM-DD" (ej: "2026-11-13")
- start_time: Hora de inicio en formato 24h "HH:mm"
- end_time: Hora de finalización en formato 24h "HH:mm" o ""
- department: Especialidad médica o servicio (ej: "Urología", "Medicina Interna", "Farmacología y Toxicología", "Cirugía Vascular", "Cardiología", "GRAEPIC", "Pediatría y Puericultura", "Medicina Crítica", "Medicina de Urgencias", "Anestesiología y Reanimación", "Enfermedades Infecciosas", etc.)
- title: Título exacto de la conferencia (extraído del campo "Tema:")
- speakers: Nombre del ponente o expositor (extraído del campo "Presenta:"). Si no hay, ""
- modality: "Virtual", "Presencial", "Híbrida"
- location: Lugar físico si es presencial, o "Teams" / "Google Meet" si es virtual
- meeting_url: URL real de videollamada para virtuales, o "" si es presencial
- recording_url: URL de grabación o transmisión si aparece, o ""
- summary: Breve descripción temática si se detalla en el texto, o ""

REGLAS CRÍTICAS DE SALIDA:
- Devuelve ÚNICAMENTE un arreglo JSON plano: [ { ... }, { ... } ].
- NUNCA agregues claves contenedoras (como {"activities": [...]}), texto introductorio ni explicaciones.
- NUNCA uses comillas dobles sin escapar dentro de los textos de 'title' o 'summary'. Si hay comillas en el boletín, usa comillas simples ' o angulares « ».
- Cierra obligatoriamente el corchete final ] del arreglo JSON.`;

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
              maxOutputTokens: 8192
            }
          })
        });

        if (response.ok) {
          const data = await response.json();
          const candidate = data.candidates?.[0];
          const candidateText = candidate?.content?.parts?.[0]?.text;
          if (candidateText) {
            successfulResponse = candidateText;
            usedModel = model;
            break;
          } else {
            const finishReason = candidate?.finishReason || 'SIN_TEXTO';
            lastError = { model, finishReason, promptFeedback: data.promptFeedback };
            console.warn(`[MailerLite Scraper] Modelo ${model} respondió sin texto (finishReason: ${finishReason})`);
          }
        } else {
          const errData = await response.json().catch(() => null) || await response.text().catch(() => '');
          const errorMsg = errData?.error?.message || (typeof errData === 'string' ? errData : JSON.stringify(errData));
          lastError = { model, status: response.status, message: errorMsg };
          console.warn(`[MailerLite Scraper] Fallo con ${model} (${response.status}):`, errorMsg);
        }
      } catch (err) {
        lastError = { model, error: err.message };
        console.warn(`[MailerLite Scraper] Excepción de red con ${model}:`, err.message);
      }
    }

    if (!successfulResponse) {
      const detailedMsg = lastError?.message 
        || (lastError?.finishReason ? `El modelo no generó texto (Motivo: ${lastError.finishReason})` : '')
        || (lastError?.status ? `Error HTTP ${lastError.status}` : 'Sin respuesta de los modelos de Gemini');

      return res.status(502).json({
        error: `No se pudo procesar el boletín con los modelos de Gemini: ${detailedMsg}`,
        lastError
      });
    }

    // Parsear el JSON devuelto por Gemini de manera ultra-resiliente
    let activities = [];
    try {
      const parsedItems = parseActivitiesFromAi(successfulResponse);

      // Sanitizar campos garantizando formato, fechas normalizadas y removiendo enlaces de MailerLite
      activities = parsedItems.map((act, idx) => {
        const rawDate = act.date || act.fecha || act.dia || '';
        const normDate = normalizeDate(rawDate ? String(rawDate).trim() : '');
        const modality = (act.modality || act.modalidad || '').trim() || 'Virtual';
        const isStrictlyPresencial = modality.toLowerCase().includes('presenc') && !modality.toLowerCase().includes('híbrid');

        let rawMeeting = (act.meeting_url || act.meetingUrl || act.enlace || '').trim();
        let mUrl = rawMeeting;
        if (isStrictlyPresencial || mUrl.includes('mailerlite.com') || !mUrl.startsWith('http')) {
          mUrl = '';
        }

        return {
          id: act.id ? String(act.id).trim() : `AA-${idx + 1}`,
          date: normDate || rawDate,
          start_time: (act.start_time || act.startTime || act.hora || act.hora_inicio || '').trim(),
          end_time: (act.end_time || act.endTime || act.hora_fin || '').trim(),
          department: (act.department || act.departamento || act.especialidad || '').trim(),
          title: (act.title || act.titulo || act.tema || '').trim(),
          speakers: (act.speakers || act.ponente || act.ponentes || act.presenta || '').trim(),
          modality: modality,
          location: (act.location || act.lugar || act.ubicacion || '').trim(),
          meeting_url: mUrl,
          recording_url: (act.recording_url || act.recordingUrl || act.grabacion || '').trim(),
          summary: (act.summary || act.resumen || '').trim()
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
