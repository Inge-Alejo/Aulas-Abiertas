# Aulas Abiertas — Facultad de Medicina, Universidad de Antioquia (UdeA)

Plataforma web editorial institucional, visualizador interactivo de programación académica y asistente inteligente para la iniciativa **Aulas Abiertas**, liderada por la **Facultad de Medicina de la Universidad de Antioquia** y el equipo de **Teleducación**.

El proyecto combina una narrativa visual científica de alto nivel con:
1. **Agenda Académica Dinámica:** Alimentada en tiempo real desde **Google Sheets (CSV)** sin modificar código.
2. **Asistente Académico IA:** Impulsado por **Google Gemini API** con alternancia/fallback de modelos (**Gemini 3.5 Flash Lite** / **Gemini 3.1 Flash Lite** / **2.5 Flash Lite**) y contexto en vivo de la agenda médica.
3. **Persistencia en la Nube con Firebase:** Base de datos **Firestore** para favoritos personalizados y preguntas enviadas a los ponentes/Teleducación.
4. **Despliegue Serverless en Vercel:** Configuración lista para producción con funciones serverless seguras en `/api/gemini.js`.

---

## 🏛️ Identidad y Dirección de Arte

Diseñado bajo principios editoriales contemporáneos inspirados en publicaciones científicas de referencia:
- **Paleta Institucional UdeA:** Verde bosque universitario (`#004D25`, `#002E16`), acentos en verde lima/esmeralda vibrante (`#10B981`, `#059669`), fondo pergamino cálido (`#FAF9F5`), y tipografía de alto contraste con serif editorial para titulares (`Newsreader`, `Playfair Display`) y sans-serif técnica (`Inter`, `Plus Jakarta Sans`) para navegación, controles y metadata.
- **Iconografía y Activos Reales:** Escudo oficial de la Facultad de Medicina UdeA, fotografía de auditorios académicos y claustros históricos, y ausencia absoluta de plantillas genéricas o iconografía médica de stock.

---

## 🚀 Tecnologías y Skills Utilizadas

- **Frontend Core:** [Vite](https://vite.dev/) (HTML5 semántico, Vanilla CSS estructurado en variables de diseño, JavaScript moderno ES Modules).
- **Procesamiento de Datos:** [PapaParse](https://www.papaparse.com/) para parseo seguro de CSV (soporte nativo de comillas, saltos de línea, tildes y caracteres especiales en español).
- **Inteligencia Artificial:** [Google Generative Language API (Gemini)](https://ai.google.dev/) con alternancia y degradación suave (`gemini-3.5-flash-lite` -> `gemini-3.1-flash-lite` -> `gemini-2.5-flash-lite` -> `gemini-1.5-flash`).
- **Base de Datos:** [Firebase SDK](https://firebase.google.com/) (Cloud Firestore) con respaldo transparente en LocalStorage cuando no hay credenciales configuradas.
- **Despliegue Serverless:** [Vercel](https://vercel.com/) con enrutamiento de API serverless y optimización de activos estáticos.
- **Control de Tiempo y Zona Horaria:** Motor de cálculo en zona horaria `America/Bogota` (UTC-5), normalización automática de horas 12h/24h, validación de fechas ISO `AAAA-MM-DD` y cálculo estricto de semanas Lunes–Domingo.
- **Skills de Diseño Instaladas:**
  1. `design-taste-frontend` (`.agents/skills/design-taste-frontend/`): Composición editorial asimétrica, jerarquía tipográfica y ritmo visual.
  2. `web-design-guidelines` (`.agents/skills/web-design-guidelines/`): Pautas de accesibilidad WCAG 2.1 AA, navegación 100% por teclado, foco visible y rendimiento web.
  3. `editorial` (`.agents/skills/editorial/`): Sistema tipográfico y espaciado proporcional para contenido académico denso.

---

## 📦 Estructura del Proyecto

```text
aulas-abiertas/
├── api/
│   └── gemini.js            # Función Serverless para Vercel (Gemini API con fallback)
├── assets/images/           # Logotipos institucionales y fotografía editorial
├── public/
│   └── data/
│       ├── plantilla_aulas_abiertas.csv            # Plantilla descargable para Teleducación
│       └── programacion_semanal_octubre_2026.csv   # Dataset oficial verificado (34 actividades)
├── screenshots/             # Evidencias de auditoría visual en 5 resoluciones
├── src/
│   ├── services/
│   │   ├── firebaseService.js   # Integración con Firestore (Favoritos y preguntas)
│   │   ├── geminiService.js     # Cliente del Asistente IA y formateo de contexto
│   │   └── scheduleService.js   # Motor de ingesta CSV, normalización, validación y filtros
│   ├── styles/
│   │   └── main.css             # Sistema de diseño, tokens CSS, componentes y responsive
│   └── main.js                  # Control reactivo, navegación de semanas, chat IA y modales
├── tests/
│   └── schedule-parser.test.js  # Suite de pruebas unitarias automatizadas
├── vercel.json              # Configuración de compilación y rutas de Vercel
├── index.html               # Documento semántico, metadatos SEO y accesibilidad
├── .env.example             # Ejemplo documentado de configuración de entorno
└── package.json             # Scripts de ejecución, dependencias y pruebas
```

---

## 🛠️ Comandos de Instalación y Ejecución

```bash
# 1. Instalar dependencias
npm install

# 2. Iniciar servidor local de desarrollo
npm run dev

# 3. Ejecutar pruebas unitarias automatizadas
npm test

# 4. Compilar paquete para producción
npm run build
```

---

## 🌐 Despliegue en Vercel

El repositorio está 100% preparado para desplegarse en **Vercel** en menos de 2 minutos:

1. Ve a tu panel de [Vercel](https://vercel.com/) y haz clic en **"Add New... > Project"**.
2. Conecta tu cuenta de GitHub y selecciona el repositorio: **`Inge-Alejo/Aulas-Abiertas`**.
3. Vercel detectará automáticamente el framework **Vite**.
   - **Build Command:** `npm run build`
   - **Output Directory:** `dist`
4. En la sección **Environment Variables**, agrega las variables (ver sección siguiente).
5. Haz clic en **Deploy**. ¡Tu landing page quedará en línea con SSL y CDN global!

---

## 🔑 Variables de Entorno (Environment Variables)

Configura estas variables en Vercel (*Project Settings > Environment Variables*) o en tu archivo `.env` local:

| Variable | Descripción | ¿Dónde obtenerla? |
| :--- | :--- | :--- |
| `VITE_PUBLIC_SCHEDULE_CSV_URL` | Enlace público CSV de Google Sheets | Pestaña `Programacion_publica` publicada como CSV |
| `GEMINI_API_KEY` | Clave de API de Google Gemini | [Google AI Studio](https://aistudio.google.com/) |
| `VITE_GEMINI_API_KEY` | Clave cliente para desarrollo local (opcional) | [Google AI Studio](https://aistudio.google.com/) |
| `VITE_FIREBASE_API_KEY` | Firebase API Key | Consola de Firebase > Configuración del proyecto |
| `VITE_FIREBASE_AUTH_DOMAIN` | Firebase Auth Domain | Consola de Firebase > Configuración del proyecto |
| `VITE_FIREBASE_PROJECT_ID` | Firebase Project ID | Consola de Firebase > Configuración del proyecto |
| `VITE_FIREBASE_STORAGE_BUCKET` | Firebase Storage Bucket | Consola de Firebase > Configuración del proyecto |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | Firebase Messaging Sender ID | Consola de Firebase > Configuración del proyecto |
| `VITE_FIREBASE_APP_ID` | Firebase App ID | Consola de Firebase > Configuración del proyecto |

> **Nota:** Si no configuras Firebase de inmediato, la aplicación utiliza automáticamente `localStorage` como respaldo. Si no configuras Gemini de inmediato, el asistente muestra un mensaje cordial invitando a ingresar la clave.

---

## 🔥 Configuración de Firebase (Paso a Paso)

1. Ingresa a la [Consola de Firebase](https://console.firebase.google.com/) con tu cuenta de Google.
2. Haz clic en **"Crear un proyecto"** (ejemplo: `aulas-abiertas-udea`).
3. En el menú lateral, ve a **Compilación > Firestore Database** y haz clic en **Crear base de datos**.
   - Selecciona el modo de inicio (en pruebas o con reglas de lectura/escritura).
   - Ubicación: selecciona una región cercana (ej. `us-central1` o `southamerica-east1`).
4. Ve a la **Configuración del Proyecto** (ícono de engranaje) y en la sección *Tus apps*, haz clic en el ícono de Web `</>`.
5. Copia los valores del objeto `firebaseConfig` y pégalos en las variables de entorno `VITE_FIREBASE_*`.

### Colecciones utilizadas en Firestore:
- **`favoritos_usuario`**: Actividades marcadas con estrella por los usuarios.
- **`preguntas_actividades`**: Consultas clínicas e inquietudes enviadas a través del modal para los ponentes y Teleducación.

---

## 🤖 Asistente Académico IA (Google Gemini)

La aplicación cuenta con un botón flotante **✦ Pregúntale a la IA** y botones en cada tarjeta de actividad.

### Alternancia y Resiliencia de Modelos:
El motor en `api/gemini.js` y `src/services/geminiService.js` implementa un sistema de cascada automática:
1. **Prioridad 1:** Intenta generar respuesta con `gemini-3.5-flash-lite`.
2. **Prioridad 2 (Alternancia):** Si no está disponible o arroja error, conmuta automáticamente a `gemini-3.1-flash-lite`.
3. **Respaldo Resiliente:** Si ninguna versión de preview responde, se degrada limpiamente a `gemini-2.5-flash-lite` / `gemini-1.5-flash`.
4. **Contexto Clínico:** La IA recibe en su *system prompt* la totalidad de actividades académicas reales cargadas en la semana, respondiendo con datos verídicos de ponentes, horarios y enlaces.

---

## 📊 Integración con Google Sheets (Teleducación)

Para actualizar la agenda semanal sin tocar código:
1. Abrir la hoja de Google Sheets y usar la pestaña `Programacion_publica`.
2. Ir a **Archivo > Compartir > Publicar en la web** > Pestaña `Programacion_publica` > Formato **Valores separados por comas (.csv)** > Publicar.
3. Copiar la URL generada y asignarla a la variable `VITE_PUBLIC_SCHEDULE_CSV_URL`.
4. Al hacer clic en **"Actualizar datos"** en la web, la nueva programación se refleja de inmediato.

---

## 📞 Canales Institucionales Verificados

- **Institución:** Facultad de Medicina, Universidad de Antioquia (UdeA).
- **Dirección:** Carrera 51D # 62 - 29, Medellín, Colombia.
- **WhatsApp Oficial:** [+57 302 306 1888](https://wa.me/573023061888)
- **Correo Electrónico:** [aprendizajes.med@udea.edu.co](mailto:aprendizajes.med@udea.edu.co)
- **Canal Oficial de YouTube:** [@teleducacionmedicinaudea](https://www.youtube.com/@teleducacionmedicinaudea)
