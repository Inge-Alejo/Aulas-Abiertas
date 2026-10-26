/**
 * Serverless API para Vercel: Scraper Inteligente de Boletines MailerLite con Gemini IA
 * Permite ingresar una URL de MailerLite (ej: https://preview.mailerlite.com/k8w4m4m5a6)
 * y extraer todas las actividades estructuradas en JSON y CSV para Google Sheets.
 */

const CANDIDATE_MODELS = [
  'gemini-3.5-flash-lite',
  'gemini-3.1-flash-lite',
  'gemini-2.5-flash-lite',
  'gemini-2.0-flash',
  'gemini-1.5-flash'
];

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

  const apiKey = process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({
      error: 'La variable de entorno GEMINI_API_KEY no está configurada.',
      setupHelp: 'Configura GEMINI_API_KEY en Vercel o en tu archivo .env local.'
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
        
        // Limpieza básica de scripts, estilos y etiquetas excesivas para ahorrar tokens
        contentToAnalyze = html
          .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
          .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
          .replace(/<!--[\s\S]*?-->/g, '')
          .replace(/<svg\b[^<]*(?:(?!<\/svg>)<[^<]*)*<\/svg>/gi, '')
          .replace(/\s{2,}/g, ' ')
          .slice(0, 70000); // Limitar a tamaño seguro de contexto
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
Tu tarea es analizar el texto/HTML del boletín de MailerLite y extraer cada una de las conferencias o actividades académicas programadas para la semana.

CAMPOS A EXTRAER POR CADA ACTIVIDAD (Estrictamente en formato JSON):
- id: Identificador único generado (ej: "AA-2026-001", "AA-2026-002", etc.)
- date: Fecha en formato ISO "AAAA-MM-DD" (determina el año, mes y día a partir de los encabezados de la semana del boletín).
- start_time: Hora de inicio normalizada en formato 24h "HH:mm" (ej: "07:00", "14:00").
- end_time: Hora de finalización en formato 24h "HH:mm" si existe, o cadena vacía "" si no se especifica.
- department: Departamento, servicio o especialidad médica (ej: "Urología", "Medicina Interna", "GREAPIC", "Cirugía", etc.).
- title: Título exacto y completo de la conferencia o tema clínico.
- speakers: Nombre del ponente o ponentes separados por punto y coma ";". Si no hay, coloca "".
- modality: "Virtual", "Presencial", "Híbrida" o "Por confirmar".
- location: Lugar físico o plataforma indicada (ej: "Piso 5 Bloque Médico", "Auditorio Central", "Zoom", "Teams").
- meeting_url: URL real de conexión si aparece en el boletín, o "".
- recording_url: URL de grabación o transmisión en YouTube si aparece, o "".
- summary: Breve descripción o sinopsis de la sesión si existe, o "".

IMPORTANTE: Devuelve ÚNICAMENTE un bloque de código JSON con un arreglo de objetos. No agregues explicaciones fuera del JSON.`;

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

    // Parsear el JSON devuelto por Gemini
    let activities = [];
    try {
      const cleanJson = successfulResponse.replace(/^```json\s*/i, '').replace(/```\s*$/, '').trim();
      activities = JSON.parse(cleanJson);
      if (!Array.isArray(activities) && activities.activities) {
        activities = activities.activities;
      }
    } catch (parseErr) {
      return res.status(500).json({
        error: 'La respuesta de la IA no pudo ser parseada como JSON válido.',
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
