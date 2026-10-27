/**
 * Servicio cliente para el Asistente Académico IA con Google Gemini API
 * Gestiona consultas, contexto de la programación semanal y alternancia de modelos.
 */

const FALLBACK_MODELS = [
  'gemini-3.5-flash-lite',
  'gemini-3.1-flash-lite',
  'gemini-2.5-flash-lite',
  'gemini-2.0-flash',
  'gemini-1.5-flash'
];

/**
 * Prepara el resumen de la programación actual como contexto para el modelo.
 * @param {Array} activities Lista de actividades cargadas
 * @returns {string} Resumen textual para inyección de contexto
 */
export function buildScheduleContext(activities) {
  if (!activities || activities.length === 0) {
    return 'Actualmente no hay actividades cargadas en la agenda.';
  }

  const lines = activities.map((act) => {
    return `- [${act.date} | ${act.startTime}] ${act.department}: "${act.title}" por ${act.speakers || 'Por confirmar'} | Modalidad: ${act.modality} (${act.location || 'N/A'})${act.meetingUrl ? ` | Conexión: ${act.meetingUrl}` : ''}${act.recordingUrl ? ` | Grabación: ${act.recordingUrl}` : ''}`;
  });

  return lines.join('\n');
}

/**
 * Envía una consulta al asistente Gemini intentando primero el endpoint serverless (/api/gemini)
 * y como respaldo directo la API de Google si existe VITE_GEMINI_API_KEY.
 *
 * @param {string} prompt Pregunta del usuario
 * @param {Array} history Historial previo de la conversación [{ role: 'user'|'model', text: '...' }]
 * @param {Array} activities Lista de actividades académicas
 * @returns {Promise<{ answer: string, modelUsed: string }>}
 */
export async function askGeminiAssistant(prompt, history = [], activities = []) {
  const scheduleContext = buildScheduleContext(activities);

  // 1. Intentar primero a través de la función Serverless (/api/gemini)
  try {
    const res = await fetch('/api/gemini', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt, history, scheduleContext })
    });

    if (res.ok) {
      const data = await res.json();
      return {
        answer: data.response,
        modelUsed: data.modelUsed || 'gemini-3.5-flash-lite'
      };
    }

    // Si la función devuelve error 500 porque falta la API key
    if (res.status === 500) {
      const errData = await res.json().catch(() => ({}));
      if (errData.setupHelp) {
        throw new Error(errData.setupHelp);
      }
    }
  } catch (err) {
    // Si no estamos en Vercel o el endpoint /api/gemini devolvió 404 en Vite local
    console.info('[Gemini Client] Probando llamada directa cliente o fallback local...', err.message);
  }

  // 2. Si hay VITE_GEMINI_API_KEY en el entorno cliente (ej: desarrollo local)
  const clientKey = import.meta.env.VITE_GEMINI_API_KEY;
  if (!clientKey) {
    return {
      answer: `👋 ¡Hola! Soy el **Asistente Académico de Aulas Abiertas**.
      
Para habilitar mis respuestas en tiempo real con **Gemini 3.5 Flash Lite / 3.1 Flash Lite**, por favor agrega tu clave de API:
1. En **Vercel**: Ve a *Settings > Environment Variables* y añade **\`GEMINI_API_KEY\`**.
2. En local: Añade **\`VITE_GEMINI_API_KEY=tu_clave\`** en tu archivo \`.env\`.

Mientras tanto, puedes consultar la programación semanal oficial y los filtros interactivos en la página.`,
      modelUsed: 'Configuración pendiente'
    };
  }

  // Ejecución directa en cliente con alternancia de modelos
  const systemInstruction = `Eres el Asistente Académico Oficial de Aulas Abiertas (Facultad de Medicina, Universidad de Antioquia).
Orientas a estudiantes, médicos y docentes sobre conferencias, ponentes y horarios en Bogotá (UTC-5).
Usa el siguiente contexto real de actividades:
${scheduleContext}
Responde en español con rigor, calidez y brevedad.`;

  const contents = history.map((m) => ({
    role: m.role === 'user' ? 'user' : 'model',
    parts: [{ text: m.text }]
  }));
  contents.push({ role: 'user', parts: [{ text: prompt }] });

  for (const model of FALLBACK_MODELS) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${clientKey}`;
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: systemInstruction }] },
          contents,
          generationConfig: { temperature: 0.3, maxOutputTokens: 1000 }
        })
      });

      if (response.ok) {
        const data = await response.json();
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
        if (text) {
          return { answer: text, modelUsed: model };
        }
      }
    } catch (e) {
      console.warn(`[Client Gemini] Alternando desde ${model}:`, e.message);
    }
  }

  throw new Error('No se pudo conectar con la API de Gemini usando los modelos candidatos.');
}

/**
 * Utiliza Gemini IA para extraer las conferencias completas desde un enlace o texto de MailerLite.
 * @param {string} url Enlace del boletín MailerLite (ej: https://preview.mailerlite.com/k8w4m4m5a6)
 * @param {string} rawContent Contenido opcional pegado manualmente
 * @returns {Promise<{ activities: Array, csvContent: string, count: number, modelUsed: string }>}
 */
export async function scrapeMailerliteWithGemini(url, rawContent = '') {
  // 1. Probar primero vía Serverless (/api/scrape-mailerlite)
  let serverError = null;
  try {
    const res = await fetch('/api/scrape-mailerlite', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url, rawContent })
    });

    if (res.ok) {
      const data = await res.json();
      return data;
    }

    const errData = await res.json().catch(() => ({}));
    serverError = errData.error || errData.details || `Error del servidor (${res.status}): ${res.statusText || 'No se pudo procesar la solicitud'}`;
  } catch (err) {
    // Si la llamada fetch falló totalmente (ej: CORS o servidor local apagado)
    console.warn('[MailerLite Scraper Client] Endpoint serverless no alcanzable:', err.message);
    serverError = `Error de conexión con el servicio: ${err.message}`;
  }

  // Si el servidor respondió con un error o no se pudo completar la llamada serverless
  if (serverError) {
    throw new Error(serverError);
  }

  // 2. Si no hay serverless activo (desarrollo puramente local)
  const clientKey = import.meta.env.VITE_GEMINI_API_KEY;
  if (!clientKey) {
    throw new Error('Para utilizar el Extractor Inteligente con Gemini IA, configura GEMINI_API_KEY en Vercel o VITE_GEMINI_API_KEY en tu archivo .env.');
  }

  throw new Error('En desarrollo local, para extraer URLs externas se recomienda usar el endpoint en Vercel o pegar el texto del boletín.');
}


