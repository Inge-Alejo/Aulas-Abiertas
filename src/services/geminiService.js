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
