# Aulas Abiertas — Facultad de Medicina, Universidad de Antioquia (UdeA)

Plataforma web editorial institucional y visualizador interactivo de programación académica para la iniciativa **Aulas Abiertas**, liderada por la **Facultad de Medicina de la Universidad de Antioquia** y el equipo de **Teleducación**.

El proyecto combina una narrativa visual científica de alto nivel con una agenda académica dinámica alimentada en tiempo real desde **Google Sheets**, eliminando por completo la necesidad de modificar código fuente o redesplegar la aplicación cada semana.

---

## 🏛️ Identidad y Dirección de Arte

Diseñado bajo principios editoriales contemporáneos inspirados en publicaciones científicas de referencia:
- **Paleta Institucional UdeA:** Verde bosque universitario (`#004D25`, `#002E16`), acentos en verde lima/esmeralda vibrante (`#10B981`, `#059669`), fondo pergamino cálido (`#FAF9F5`), y tipografía de alto contraste con serif editorial para titulares (`Newsreader`, `Playfair Display`) y sans-serif técnica (`Inter`, `Plus Jakarta Sans`) para navegación, controles y metadata.
- **Iconografía y Activos Reales:** Escudo oficial de la Facultad de Medicina UdeA, fotografía de auditorios académicos y claustros históricos, y ausencia absoluta de plantillas genéricas o iconografía médica de stock.

---

## 🚀 Tecnologías y Skills Utilizadas

- **Framework & Bundler:** [Vite](https://vite.dev/) (HTML5 semántico, Vanilla CSS estructurado en variables de diseño, JavaScript moderno ES Modules).
- **Procesamiento de Datos:** [PapaParse](https://www.papaparse.com/) para parseo seguro de CSV (soporte nativo de comillas, saltos de línea, tildes y caracteres especiales en español).
- **Control de Tiempo y Zona Horaria:** Motor de cálculo en zona horaria `America/Bogota` (UTC-5), normalización automática de horas 12h/24h, validación de fechas ISO `AAAA-MM-DD` y cálculo estricto de semanas Lunes–Domingo.
- **Skills de Diseño Instaladas:**
  1. `design-taste-frontend` (`.agents/skills/design-taste-frontend/`): Principios de composición editorial asimétrica, jerarquía tipográfica, ritmo visual y contrastes deliberados.
  2. `web-design-guidelines` (`.agents/skills/web-design-guidelines/`): Pautas de accesibilidad WCAG 2.1 AA, navegación 100% por teclado, foco visible, contraste de color, `prefers-reduced-motion` y rendimiento web.
  3. `editorial` (`.agents/skills/editorial/`): Sistema tipográfico y espaciado proporcional para contenido académico y científico denso.

---

## 📦 Estructura del Proyecto

```text
aulas-abiertas/
├── .agents/skills/          # Skills de diseño y accesibilidad instaladas
├── assets/images/           # Logotipos institucionales y fotografía editorial
├── public/
│   └── data/
│       ├── plantilla_aulas_abiertas.csv            # Plantilla descargable para Teleducación
│       └── programacion_semanal_octubre_2026.csv   # Dataset oficial verificado (34 actividades)
├── screenshots/             # Evidencias de auditoría visual en 5 resoluciones
├── src/
│   ├── services/
│   │   └── scheduleService.js   # Motor de ingesta CSV, normalización, validación y filtros
│   ├── styles/
│   │   └── main.css             # Sistema de diseño, tokens CSS, componentes y responsive
│   └── main.js                  # Control reactivo, navegación de semanas, modales y renderizado
├── tests/
│   └── schedule-parser.test.js  # Suite de pruebas unitarias automatizadas
├── index.html               # Documento semántico, metadatos SEO y accesibilidad
├── .env.example             # Ejemplo documentado de configuración de entorno
└── package.json             # Scripts de ejecución, construcción y pruebas
```

---

## 🛠️ Comandos de Instalación y Ejecución

### 1. Requisitos Previos
- Node.js LTS (v18 o superior).

### 2. Instalación de dependencias
```bash
npm install
```

### 3. Modo Desarrollo
Inicia el servidor local de desarrollo con recarga en caliente:
```bash
npm run dev
```
La aplicación estará disponible de inmediato en: `http://localhost:5173/`.

### 4. Ejecución de Pruebas Unitarias
Ejecuta la suite de pruebas del motor de datos (normalización de fechas, horas, formatos 12h/24h, filtros y cálculo de semanas):
```bash
npm test
```

### 5. Compilación para Producción
Genera el paquete optimizado y minificado en la carpeta `dist/`:
```bash
npm run build
```

---

## 📊 Integración con Google Sheets (Guía para el Equipo de Teleducación)

La aplicación está diseñada para que el equipo de **Teleducación** administre y actualice las actividades semanales directamente desde **Google Sheets**, sin necesidad de editar código fuente ni realizar despliegues técnicos.

### Paso 1: Crear o preparar la hoja en Google Sheets
1. Descargue la plantilla oficial incluida en el proyecto: `public/data/plantilla_aulas_abiertas.csv` (o use el botón **"Descargar plantilla CSV"** en la sección "Acerca de" de la web).
2. Cree una hoja de cálculo en su Google Drive institucional.
3. Nombre la pestaña activa exactamente como: `Programacion_publica`.
4. Mantenga inalterada la primera fila con los nombres de las columnas:

| Columna | Nombre de Cabecera | Formato Esperado | Descripción y Ejemplo |
| :--- | :--- | :--- | :--- |
| **A** | `id` | Texto | Identificador único (`AA-2026-001`, `URO-1026`) |
| **B** | `date` | `AAAA-MM-DD` | Fecha exacta en formato ISO (`2026-10-28`) |
| **C** | `start_time` | `HH:mm` o `hh:mm am/pm` | Hora de inicio (`07:00`, `02:00 pm`, etc.) |
| **D** | `end_time` | `HH:mm` (Opcional) | Hora de finalización (`08:30`) |
| **E** | `department` | Texto | Departamento o Especialidad (`Urología`, `GREAPIC`) |
| **F** | `title` | Texto | Título oficial de la conferencia académica |
| **G** | `speakers` | Texto | Ponentes separados por punto y coma (`;`) |
| **H** | `modality` | Categoría | `Virtual`, `Presencial`, `Híbrida` o `Por confirmar` |
| **I** | `location` | Texto (Opcional) | Auditorio, piso, aula o enlace general |
| **J** | `meeting_url` | URL (Opcional) | Enlace seguro a Zoom, Teams, Meet o YouTube Live |
| **K** | `recording_url` | URL (Opcional) | Enlace a la grabación oficial en YouTube |
| **L** | `summary` | Texto (Opcional) | Breve sinopsis académica o notas de la sesión |

> **Nota de Seguridad y Buenas Prácticas:** La pestaña `Programacion_publica` solo debe contener actividades aprobadas y aptas para el público general. No incluya notas internas, datos confidenciales de pacientes o enlaces a reuniones privadas.

### Paso 2: Publicar la pestaña como CSV
1. En Google Sheets, vaya al menú superior: **Archivo > Compartir > Publicar en la web**.
2. En la ventana emergente, en lugar de *"Todo el documento"*, seleccione la pestaña **`Programacion_publica`**.
3. En el formato de salida, en lugar de *"Página web"*, elija **Valores separados por comas (.csv)**.
4. Haga clic en el botón **Publicar** y confirme.
5. Copie el enlace generado (tendrá una estructura similar a: `https://docs.google.com/spreadsheets/d/e/2PACX-.../pub?gid=0&single=true&output=csv`).

### Paso 3: Configurar la URL en la aplicación
1. En la raíz del proyecto, abra o cree el archivo `.env`:
   ```bash
   VITE_PUBLIC_SCHEDULE_CSV_URL="https://docs.google.com/spreadsheets/d/e/TU_IDENTIFICADOR/pub?gid=0&single=true&output=csv"
   ```
2. Si la aplicación está desplegada en servicios en la nube (Vercel, Netlify, Cloudflare Pages o servidor institucional), agregue la variable de entorno `VITE_PUBLIC_SCHEDULE_CSV_URL` en el panel de configuración de dicho proveedor.

### Paso 4: ¿Qué ocurre si no hay una hoja configurada aún?
Si la variable está vacía o pendiente, la web activa automáticamente una **fuente de contingencia verificada** con las 34 actividades reales del boletín oficial (Semana del 26 al 30 de octubre de 2026). La aplicación nunca se romperá ni mostrará pantallas en blanco.

---

## 🧪 Validación y Pruebas Realizadas

### 1. Auditoría de Visualización Responsive
Se verificó el renderizado visual completo mediante capturas de pantalla en Microsoft Edge headless en las siguientes 5 resoluciones mínimas exigidas:
- **320 px (Mobile Ultra-Compacto):** Menú móvil colapsable accesible, tipografía con escalado fluido (`clamp`), padding ajustado (sin scroll horizontal involuntario), tarjetas de actividad legibles en una columna.
- **390 px (Mobile Estándar - iPhone/Android):** Jerarquía visual clara, botones táctiles con tamaño mínimo de interacción (44px), filtros desplegables fluidos.
- **768 px (Tabletas Verticales):** Composición equilibrada, buscador y filtros en grilla responsiva, navegación semanal clara.
- **1024 px (Tabletas Horizontales / Laptops):** Distribución editorial asimétrica en el Hero, badges institucionales alineados.
- **1440 px (Monitores de Escritorio):** Ancho máximo controlado (`1360px`), espacios en blanco intencionales, excelente legibilidad y contraste.

### 2. Auditoría de Accesibilidad y Calidad Web
- Enlace directo de accesibilidad *"Saltar al contenido principal"* (`#main-content`).
- Navegación por teclado completa (tecla `Tab`, `Enter`, `Escape` para cerrar menús y modales).
- Foco visible estilizado (`outline: 3px solid #10B981; outline-offset: 3px`).
- Estados de carga animados (`aria-live="polite"`), alertas flotantes (toasts) no intrusivas y estados vacíos amigables cuando los filtros no arrojan resultados.
- Marcado semántico HTML5 (`header`, `nav`, `main`, `section`, `article`, `footer`, `time`).

---

## 📋 Lista de Configuraciones Pendientes para el Cliente (Teleducación)

Para la puesta en marcha definitiva en producción, el equipo de Teleducación solo debe suministrar:
1. **La URL pública del Google Sheets publicado como CSV**, generada siguiendo la guía anterior.
2. (Opcional) Asignación del dominio institucional deseado (por ejemplo, `aulasabiertas.medicina.udea.edu.co`).

---

## 📞 Canales Institucionales Verificados

- **Institución:** Facultad de Medicina, Universidad de Antioquia (UdeA).
- **Dirección:** Carrera 51D # 62 - 29, Medellín, Colombia.
- **Atención al Usuario / WhatsApp:** [+57 302 306 1888](https://wa.me/573023061888)
- **Correo Electrónico:** [aprendizajes.med@udea.edu.co](mailto:aprendizajes.med@udea.edu.co)
- **Canal Oficial de YouTube:** [@teleducacionmedicinaudea](https://www.youtube.com/@teleducacionmedicinaudea)
