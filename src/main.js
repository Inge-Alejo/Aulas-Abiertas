/**
 * main.js
 * Lógica de interacción, renderizado reactivo y gestión de estado para Aulas Abiertas.
 */

import {
  loadScheduleData,
  getAvailableWeeks,
  getActivitiesGroupedByDay,
  getUpcomingActivity,
  filterActivities,
  formatDayLabel
} from './services/scheduleService.js';

import {
  getFavoriteActivityIds,
  toggleFavoriteActivity,
  submitActivityQuestion,
  getFirebaseStatus,
  loginWithEmail,
  registerWithEmail,
  logoutUser,
  onAuthChange
} from './services/firebaseService.js';

import {
  askGeminiAssistant,
  scrapeMailerliteWithGemini
} from './services/geminiService.js';

// Estado global de la aplicación
const state = {
  allActivities: [],
  availableWeeks: [],
  selectedWeekKey: '',
  filters: {
    search: '',
    day: '',
    department: '',
    modality: ''
  },
  favorites: [],
  onlyFavoritesFilter: false,
  chatHistory: [],
  isLoading: true,
  isRefreshing: false,
  dataSourceInfo: {
    source: '',
    lastUpdated: '',
    isLive: false
  }
};

// 12 Listas de reproducción temáticas oficiales verificadas del canal de Teleducación UdeA
const VERIFIED_PLAYLISTS = [
  {
    title: 'Medicina Interna',
    id: 'PLWutZMaMUREfzBbXZ8PWiR2-aYMNUV4br',
    url: 'https://www.youtube.com/playlist?list=PLWutZMaMUREfzBbXZ8PWiR2-aYMNUV4br',
    category: 'Atención clínica y crítica',
    description: 'Guías clínicas, falla cardíaca, riesgo cardiovascular y patologías sistémicas.'
  },
  {
    title: 'Ginecología y Obstetricia',
    id: 'PLWutZMaMUREdErivJcGl_RVOeCp15cOjh',
    url: 'https://www.youtube.com/playlist?list=PLWutZMaMUREdErivJcGl_RVOeCp15cOjh',
    category: 'Salud materno-infantil',
    description: 'Preeclampsia, embarazo de alto riesgo, salud fetal y oncología ginecológica.'
  },
  {
    title: 'Medicina de Urgencias',
    id: 'PLWutZMaMUREcHGQHpTR1Orc08Zx1DGspv',
    url: 'https://www.youtube.com/playlist?list=PLWutZMaMUREcHGQHpTR1Orc08Zx1DGspv',
    category: 'Atención clínica y crítica',
    description: 'Reanimación, trombolisis, trauma, shock y soporte vital avanzado.'
  },
  {
    title: 'Endocrinología',
    id: 'PLWutZMaMUREfcP8tw36_ngXsrOtpMgUwq',
    url: 'https://www.youtube.com/playlist?list=PLWutZMaMUREfcP8tw36_ngXsrOtpMgUwq',
    category: 'Especialidades médicas',
    description: 'Diabetes, osteoporosis, tiroides, metabolismo óseo y terapias hormonales.'
  },
  {
    title: 'Anestesiología y Reanimación',
    id: 'PLWutZMaMUREe-WzJhxuwkjc5_On2c6--Q',
    url: 'https://www.youtube.com/playlist?list=PLWutZMaMUREe-WzJhxuwkjc5_On2c6--Q',
    category: 'Áreas médico-quirúrgicas',
    description: 'Vía aérea difícil, farmacología perioperatoria, monitoreo hemodinámico.'
  },
  {
    title: 'Pediatría y Puericultura',
    id: 'PLWutZMaMUREfGxKGOcU0DJ1dyZQT0bmgt',
    url: 'https://www.youtube.com/playlist?list=PLWutZMaMUREfGxKGOcU0DJ1dyZQT0bmgt',
    category: 'Salud materno-infantil',
    description: 'Infectología pediátrica, nutrición, desarrollo infantil y neonatología.'
  },
  {
    title: 'Medicina Física y Rehabilitación',
    id: 'PLWutZMaMUREczvFffoLHzIgY0wjqkJsod',
    url: 'https://www.youtube.com/playlist?list=PLWutZMaMUREczvFffoLHzIgY0wjqkJsod',
    category: 'Especialidades médicas',
    description: 'Neurorrehabilitación, enfermedades neuromusculares y rehabilitación musculoesquelética.'
  },
  {
    title: 'Alergología Clínica',
    id: 'PLWutZMaMUREeyppOkA_BSZWFI5rlEgM8e',
    url: 'https://www.youtube.com/playlist?list=PLWutZMaMUREeyppOkA_BSZWFI5rlEgM8e',
    category: 'Especialidades médicas',
    description: 'Hipersensibilidad a fármacos, inmunoterapia y enfermedades atópicas graves.'
  },
  {
    title: 'Otorrinolaringología',
    id: 'PLWutZMaMUREdKYyYrlmTI20pawPQie37e',
    url: 'https://www.youtube.com/playlist?list=PLWutZMaMUREdKYyYrlmTI20pawPQie37e',
    category: 'Áreas médico-quirúrgicas',
    description: 'Patología de oído, nariz, laringe y cirugía de cabeza y cuello.'
  },
  {
    title: 'Psiquiatría y Salud Mental (GREAPIC)',
    id: 'PLWutZMaMUREdq_6zLkAUtHtmpCMnEoBLa',
    url: 'https://www.youtube.com/playlist?list=PLWutZMaMUREdq_6zLkAUtHtmpCMnEoBLa',
    category: 'Salud mental',
    description: 'Psiquiatría de enlace, salud mental infantil y prevención del burnout.'
  },
  {
    title: 'Microbiología y Parasitología',
    id: 'PLWutZMaMUREcdNPC94HRcliXT6wwxMqAL',
    url: 'https://www.youtube.com/playlist?list=PLWutZMaMUREcdNPC94HRcliXT6wwxMqAL',
    category: 'Investigación básica y aplicada',
    description: 'Resistencia antimicrobiana, mecanismos de virulencia y vigilancia epidemiológica.'
  },
  {
    title: 'Nefrología',
    id: 'PLWutZMaMUREfIPu3L-df2t0xnaJhL3pXz',
    url: 'https://www.youtube.com/playlist?list=PLWutZMaMUREfIPu3L-df2t0xnaJhL3pXz',
    category: 'Especialidades médicas',
    description: 'Enfermedad renal crónica, glomerulopatías, diálisis y trasplante renal.'
  }
];

/**
 * Inicialización principal
 */
document.addEventListener('DOMContentLoaded', async () => {
  setupNavigation();
  renderPlaylists();
  
  // Cargar favoritos guardados en Firebase / LocalStorage
  state.favorites = await getFavoriteActivityIds();
  updateFavoritesBadge();
  setupFavoritesFilter();
  
  await loadAndRenderSchedule();
  setupFilterListeners();
  setupGeminiChat();
  setupQuestionModal();
  setupAuthUI();
  setupMailerliteScraper();
});

/**
 * Carga de datos y renderizado
 */
async function loadAndRenderSchedule(forceRefresh = false) {
  const refreshBtn = document.getElementById('btn-refresh');
  const loadingIndicator = document.getElementById('schedule-loading-state');
  
  if (forceRefresh && refreshBtn) {
    refreshBtn.classList.add('loading');
    refreshBtn.disabled = true;
    showToast('Consultando actualización de la programación...', 'info');
  }

  try {
    const data = await loadScheduleData({ forceRefresh });
    state.allActivities = data.activities;
    state.dataSourceInfo = {
      source: data.source,
      lastUpdated: data.lastUpdated,
      isLive: data.isLive
    };

    state.availableWeeks = getAvailableWeeks(state.allActivities);
    if (state.availableWeeks.length > 0 && !state.selectedWeekKey) {
      state.selectedWeekKey = state.availableWeeks[0].weekKey;
    }

    updateDataStatusUI();
    renderSpotlightActivity();
    renderWeekNavigator();
    populateDepartmentFilter();
    populateDayFilter();
    renderScheduleList();

    if (forceRefresh) {
      showToast('Programación actualizada correctamente', 'success');
    }
  } catch (error) {
    console.error('Error al cargar la programación:', error);
    showToast(`No se pudo actualizar: ${error.message}`, 'error');
  } finally {
    if (refreshBtn) {
      refreshBtn.classList.remove('loading');
      refreshBtn.disabled = false;
    }
    if (loadingIndicator) {
      loadingIndicator.style.display = 'none';
    }
  }
}

/**
 * Actualiza la información de estado de los datos en la UI
 */
function updateDataStatusUI() {
  const badgeEl = document.getElementById('status-source-badge');
  const timeEl = document.getElementById('status-last-updated');

  if (badgeEl) {
    badgeEl.textContent = state.dataSourceInfo.source;
    badgeEl.className = `status-badge ${state.dataSourceInfo.isLive ? 'live' : 'local'}`;
  }
  if (timeEl) {
    timeEl.textContent = `Actualizado: ${state.dataSourceInfo.lastUpdated} (COT)`;
  }
}

/**
 * Renderiza la próxima actividad destacada
 */
function renderSpotlightActivity() {
  const container = document.getElementById('spotlight-container');
  if (!container) return;

  const upcoming = getUpcomingActivity(state.allActivities);
  if (!upcoming) {
    container.innerHTML = `
      <div class="spotlight-card">
        <div class="spotlight-header">
          <span class="spotlight-badge">Agenda de la Facultad</span>
          <span class="spotlight-dept">Teleducación Medicina UdeA</span>
        </div>
        <h3 class="spotlight-title">No hay actividades programadas para este momento</h3>
        <p style="color: #CBD5E1; margin-bottom: 20px;">
          Consulte la programación semanal completa a continuación o explore el archivo de conferencias grabadas en nuestro canal oficial.
        </p>
        <a href="#programacion" class="btn-spotlight-access">
          Ver Programación Semanal
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
        </a>
      </div>
    `;
    return;
  }

  const hasMeeting = Boolean(upcoming.meeting_url);
  const actionButton = hasMeeting ? `
    <a href="${upcoming.meeting_url}" target="_blank" rel="noopener noreferrer" class="btn-spotlight-access" id="btn-spotlight-join">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polygon points="10 8 16 12 10 16 10 8"/></svg>
      Conectarse a la Sesión en Vivo
    </a>
  ` : `
    <a href="#programacion" class="btn-spotlight-access">
      Ver Detalles en Programación
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
    </a>
  `;

  container.innerHTML = `
    <div class="spotlight-card" id="spotlight-card-${upcoming.id}">
      <div class="spotlight-header">
        <span class="spotlight-badge">
          <span class="spotlight-pulse-dot" aria-hidden="true"></span>
          Próxima Sesión Académica
        </span>
        <span class="spotlight-dept">${upcoming.department}</span>
      </div>
      <h3 class="spotlight-title">${upcoming.title}</h3>
      
      <div class="spotlight-details">
        <span class="spotlight-meta-item">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
          <strong>${upcoming.dayLabel}</strong>
        </span>
        <span class="spotlight-meta-item">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
          <strong>${upcoming.startTime} COT</strong> ${upcoming.endTime ? `a ${upcoming.endTime} COT` : ''}
        </span>
        <span class="spotlight-meta-item">
          <span class="card-modality-badge modality-${upcoming.modality.toLowerCase()}">${upcoming.modality}</span>
        </span>
        ${upcoming.location ? `
        <span class="spotlight-meta-item">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
          ${upcoming.location}
        </span>
        ` : ''}
      </div>

      ${upcoming.speakers ? `
      <div class="spotlight-speakers">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
        <span>Presenta: <strong>${upcoming.speakers}</strong></span>
      </div>
      ` : ''}

      ${upcoming.summary ? `
      <p style="color: #CBD5E1; font-size: 0.9375rem; line-height: 1.5; margin-bottom: 20px;">
        ${upcoming.summary}
      </p>
      ` : ''}

      <div class="spotlight-footer">
        <div>
          <span style="font-size: 0.8125rem; color: #94A3B8;">Organiza: Facultad de Medicina UdeA</span>
        </div>
        <div>
          ${actionButton}
        </div>
      </div>
    </div>
  `;
}

/**
 * Renderiza el selector y controles de semanas
 */
function renderWeekNavigator() {
  const titleEl = document.getElementById('current-week-title');
  const prevBtn = document.getElementById('btn-prev-week');
  const nextBtn = document.getElementById('btn-next-week');

  if (state.availableWeeks.length === 0) {
    if (titleEl) titleEl.textContent = 'Sin semanas registradas';
    if (prevBtn) prevBtn.disabled = true;
    if (nextBtn) nextBtn.disabled = true;
    return;
  }

  const currentIndex = state.availableWeeks.findIndex(w => w.weekKey === state.selectedWeekKey);
  const currentWeek = state.availableWeeks[currentIndex] || state.availableWeeks[0];

  if (titleEl) {
    titleEl.textContent = currentWeek.label;
  }

  if (prevBtn) {
    prevBtn.disabled = currentIndex <= 0;
    prevBtn.onclick = () => {
      if (currentIndex > 0) {
        state.selectedWeekKey = state.availableWeeks[currentIndex - 1].weekKey;
        state.filters.day = ''; // reiniciar filtro de día al cambiar semana
        populateDayFilter();
        renderWeekNavigator();
        renderScheduleList();
      }
    };
  }

  if (nextBtn) {
    nextBtn.disabled = currentIndex >= state.availableWeeks.length - 1;
    nextBtn.onclick = () => {
      if (currentIndex < state.availableWeeks.length - 1) {
        state.selectedWeekKey = state.availableWeeks[currentIndex + 1].weekKey;
        state.filters.day = '';
        populateDayFilter();
        renderWeekNavigator();
        renderScheduleList();
      }
    };
  }
}

/**
 * Rellena el selector de departamentos de acuerdo a los datos reales
 */
function populateDepartmentFilter() {
  const select = document.getElementById('filter-department');
  if (!select) return;

  const currentVal = select.value;
  const departments = Array.from(new Set(state.allActivities.map(a => a.department))).sort((a, b) => a.localeCompare('es'));

  let optionsHtml = '<option value="">Todos los departamentos</option>';
  departments.forEach(dept => {
    optionsHtml += `<option value="${dept}" ${dept === currentVal ? 'selected' : ''}>${dept}</option>`;
  });

  select.innerHTML = optionsHtml;
}

/**
 * Rellena el selector de días según la semana actualmente seleccionada
 */
function populateDayFilter() {
  const select = document.getElementById('filter-day');
  if (!select) return;

  const weekActivities = state.allActivities.filter(a => a.weekKey === state.selectedWeekKey);
  const days = Array.from(new Set(weekActivities.map(a => a.date))).sort();

  let optionsHtml = '<option value="">Todos los días</option>';
  days.forEach(d => {
    const label = formatDayLabel(d);
    optionsHtml += `<option value="${d}" ${d === state.filters.day ? 'selected' : ''}>${label}</option>`;
  });

  select.innerHTML = optionsHtml;
}

/**
 * Renderiza el listado principal de actividades agrupadas por día
 */
function renderScheduleList() {
  const container = document.getElementById('schedule-days-container');
  const countEl = document.getElementById('results-count');
  const clearBtn = document.getElementById('btn-clear-filters');
  if (!container) return;

  // Filtrar actividades de la semana seleccionada
  let weekActivities = state.allActivities.filter(a => a.weekKey === state.selectedWeekKey);

  // Filtro de Mis Favoritos (Firebase / LocalStorage)
  if (state.onlyFavoritesFilter) {
    weekActivities = weekActivities.filter(a => state.favorites.includes(a.id));
  }

  const filtered = filterActivities(weekActivities, state.filters);

  // Mostrar / ocultar botón de limpiar filtros
  const hasActiveFilters = Boolean(
    state.filters.search ||
    state.filters.day ||
    state.filters.department ||
    state.filters.modality ||
    state.onlyFavoritesFilter
  );

  if (clearBtn) {
    clearBtn.style.display = hasActiveFilters ? 'inline-block' : 'none';
  }

  if (countEl) {
    countEl.textContent = `${filtered.length} ${filtered.length === 1 ? 'actividad encontrada' : 'actividades encontradas'}`;
  }

  if (filtered.length === 0) {
    const isFavEmpty = state.onlyFavoritesFilter && state.favorites.length === 0;
    container.innerHTML = `
      <div class="empty-results-box" role="status">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="color: var(--text-muted); margin-bottom: 12px;">
          <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
        </svg>
        <h3>${isFavEmpty ? 'Aún no tienes actividades favoritas' : 'No se encontraron actividades'}</h3>
        <p>${isFavEmpty ? 'Haz clic en la estrella ★ "Guardar" de cualquier actividad para crear tu agenda personalizada.' : 'No existen sesiones académicas que coincidan con los criterios de búsqueda o filtros seleccionados.'}</p>
        <button class="btn-secondary" id="btn-reset-filters-empty">
          Limpiar todos los filtros
        </button>
      </div>
    `;

    const resetBtn = document.getElementById('btn-reset-filters-empty');
    if (resetBtn) {
      resetBtn.onclick = resetAllFilters;
    }
    return;
  }

  // Agrupar actividades filtradas por fecha
  const dayMap = new Map();
  filtered.forEach(act => {
    if (!dayMap.has(act.date)) {
      dayMap.set(act.date, {
        date: act.date,
        dayLabel: act.dayLabel,
        activities: []
      });
    }
    dayMap.get(act.date).activities.push(act);
  });

  const dayGroups = Array.from(dayMap.values()).sort((a, b) => a.date.localeCompare(b.date));

  let html = '';
  dayGroups.forEach(group => {
    html += `
      <section class="day-group" aria-labelledby="day-header-${group.date}">
        <div class="day-header">
          <h3 class="day-title" id="day-header-${group.date}">${group.dayLabel}</h3>
          <span class="day-activity-count">${group.activities.length} ${group.activities.length === 1 ? 'sesión' : 'sesiones'}</span>
        </div>
        <div class="activities-list">
          ${group.activities.map(act => renderActivityCard(act)).join('')}
        </div>
      </section>
    `;
  });

  container.innerHTML = html;
}

/**
 * Renderiza la tarjeta individual de una actividad académica
 */
function renderActivityCard(act) {
  const hasMeeting = Boolean(act.meeting_url);
  const hasRecording = Boolean(act.recording_url);
  const isFav = state.favorites.includes(act.id);

  return `
    <article class="activity-card" id="act-${act.id}" tabindex="0" aria-label="${act.title}">
      <div class="card-top-row">
        <span class="card-time-badge">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
          ${act.startTime} COT ${act.endTime ? `– ${act.endTime}` : ''}
        </span>
        <span class="card-modality-badge modality-${act.modality.toLowerCase()}">${act.modality}</span>
      </div>

      <div class="card-department">${act.department}</div>
      <h4 class="card-title">${act.title}</h4>

      ${act.speakers ? `
      <div class="card-speakers">
        <strong>Presenta:</strong> ${act.speakers}
      </div>
      ` : ''}

      ${act.location ? `
      <div class="card-location">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="flex-shrink:0; margin-top:2px;"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
        <span>${act.location}</span>
      </div>
      ` : ''}

      ${act.summary ? `
      <div class="card-summary">
        ${act.summary}
      </div>
      ` : ''}

      <div class="card-actions">
        ${hasMeeting ? `
          <a href="${act.meeting_url}" target="_blank" rel="noopener noreferrer" class="btn-session-link" id="link-meet-${act.id}">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="10 8 16 12 10 16 10 8"/><circle cx="12" cy="12" r="10"/></svg>
            Ingresar a la sesión
          </a>
        ` : ''}

        ${hasRecording ? `
          <a href="${act.recording_url}" target="_blank" rel="noopener noreferrer" class="btn-recording-link" id="link-rec-${act.id}">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18"/><line x1="7" y1="2" x2="7" y2="22"/><line x1="17" y1="2" x2="17" y2="22"/><line x1="2" y1="12" x2="22" y2="12"/></svg>
            Ver grabación
          </a>
        ` : ''}
      </div>

      <!-- Barra de interacción complementaria (Firebase Favorites + Gemini IA + Preguntas) -->
      <div class="card-actions-row">
        <button class="btn-card-fav ${isFav ? 'is-favorite' : ''}" data-act-id="${act.id}" title="${isFav ? 'Quitar de favoritos' : 'Guardar en mis favoritos'}">
          <span>★</span> ${isFav ? 'En mis favoritos' : 'Guardar'}
        </button>
        <button class="btn-card-ask-ai" data-act-id="${act.id}" title="Consultar con el Asistente IA">
          <span>✦</span> Preguntar a IA
        </button>
        <button class="btn-card-question" data-act-id="${act.id}" title="Enviar pregunta al ponente o Teleducación">
          <span>✉</span> Preguntar al ponente
        </button>
      </div>
    </article>
  `;
}

/**
 * Renderiza las listas de reproducción oficiales en la sección de Biblioteca
 */
function renderPlaylists() {
  const container = document.getElementById('playlists-grid-container');
  if (!container) return;

  container.innerHTML = VERIFIED_PLAYLISTS.map((pl, idx) => `
    <div class="playlist-card" id="playlist-card-${idx}">
      <div class="playlist-card-icon" aria-hidden="true">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
          <polygon points="10 8 16 12 10 16 10 8"/>
          <path d="M22.54 6.42a2.78 2.78 0 0 0-1.94-2C18.88 4 12 4 12 4s-6.88 0-8.6.46a2.78 2.78 0 0 0-1.94 2A29 29 0 0 0 1 11.75a29 29 0 0 0 .46 5.33A2.78 2.78 0 0 0 3.4 19c1.72.46 8.6.46 8.6.46s6.88 0 8.6-.46a2.78 2.78 0 0 0 1.94-2 29 29 0 0 0 .46-5.25 29 29 0 0 0-.46-5.33z"/>
        </svg>
      </div>
      <span style="font-size: 0.75rem; text-transform: uppercase; font-weight: 700; color: var(--udea-green-primary); margin-bottom: 4px;">
        ${pl.category}
      </span>
      <h4 class="playlist-card-title">${pl.title}</h4>
      <p class="playlist-card-meta">${pl.description}</p>
      <a href="${pl.url}" target="_blank" rel="noopener noreferrer" class="playlist-card-link" id="link-playlist-${idx}">
        <span>Abrir en YouTube</span>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
      </a>
    </div>
  `).join('');
}

/**
 * Configuración de eventos de filtros y búsqueda
 */
function setupFilterListeners() {
  const searchInput = document.getElementById('search-input');
  const daySelect = document.getElementById('filter-day');
  const deptSelect = document.getElementById('filter-department');
  const modalitySelect = document.getElementById('filter-modality');
  const clearBtn = document.getElementById('btn-clear-filters');
  const refreshBtn = document.getElementById('btn-refresh');

  if (searchInput) {
    let timeout;
    searchInput.addEventListener('input', (e) => {
      clearTimeout(timeout);
      timeout = setTimeout(() => {
        state.filters.search = e.target.value;
        renderScheduleList();
      }, 200);
    });
  }

  if (daySelect) {
    daySelect.addEventListener('change', (e) => {
      state.filters.day = e.target.value;
      renderScheduleList();
    });
  }

  if (deptSelect) {
    deptSelect.addEventListener('change', (e) => {
      state.filters.department = e.target.value;
      renderScheduleList();
    });
  }

  if (modalitySelect) {
    modalitySelect.addEventListener('change', (e) => {
      state.filters.modality = e.target.value;
      renderScheduleList();
    });
  }

  if (clearBtn) {
    clearBtn.addEventListener('click', resetAllFilters);
  }

  if (refreshBtn) {
    refreshBtn.addEventListener('click', () => {
      loadAndRenderSchedule(true);
    });
  }
}

/**
 * Reinicia todos los filtros a sus valores predeterminados
 */
function resetAllFilters() {
  state.filters = {
    search: '',
    day: '',
    department: '',
    modality: ''
  };

  const searchInput = document.getElementById('search-input');
  const daySelect = document.getElementById('filter-day');
  const deptSelect = document.getElementById('filter-department');
  const modalitySelect = document.getElementById('filter-modality');

  if (searchInput) searchInput.value = '';
  if (daySelect) daySelect.value = '';
  if (deptSelect) deptSelect.value = '';
  if (modalitySelect) modalitySelect.value = '';

  renderScheduleList();
  showToast('Filtros reiniciados', 'info');
}

/**
 * Configura la navegación interactiva, menú móvil y enlaces suaves
 */
function setupNavigation() {
  const header = document.querySelector('.site-header');
  const mobileToggle = document.getElementById('mobile-nav-toggle');
  const nav = document.getElementById('site-nav');

  // Menú móvil
  if (mobileToggle && nav) {
    mobileToggle.addEventListener('click', () => {
      const isOpen = nav.classList.toggle('open');
      mobileToggle.setAttribute('aria-expanded', isOpen);
    });

    // Cerrar menú al hacer clic en un enlace
    nav.querySelectorAll('.nav-link').forEach(link => {
      link.addEventListener('click', () => {
        nav.classList.remove('open');
        mobileToggle.setAttribute('aria-expanded', 'false');
      });
    });
  }

  // Sombra del header persistente durante el desplazamiento
  window.addEventListener('scroll', () => {
    if (header) {
      if (window.scrollY > 20) {
        header.classList.add('scrolled');
      } else {
        header.classList.remove('scrolled');
      }
    }
  }, { passive: true });
}

/**
 * Notificaciones Toast no intrusivas
 */
function showToast(message, type = 'info') {
  let toastContainer = document.getElementById('toast-container');
  if (!toastContainer) {
    toastContainer = document.createElement('div');
    toastContainer.id = 'toast-container';
    toastContainer.setAttribute('role', 'status');
    toastContainer.setAttribute('aria-live', 'polite');
    toastContainer.style.cssText = `
      position: fixed;
      bottom: 24px;
      right: 24px;
      z-index: 9999;
      display: flex;
      flex-direction: column;
      gap: 10px;
      pointer-events: none;
    `;
    document.body.appendChild(toastContainer);
  }

  const toast = document.createElement('div');
  const bgColor = type === 'success' ? '#004D25' : type === 'error' ? '#DC2626' : '#0F172A';
  
  toast.style.cssText = `
    background-color: ${bgColor};
    color: #FFFFFF;
    padding: 12px 20px;
    border-radius: 6px;
    font-size: 0.875rem;
    font-weight: 600;
    box-shadow: 0 10px 15px -3px rgba(0,0,0,0.2);
    display: flex;
    align-items: center;
    gap: 10px;
    opacity: 0;
    transform: translateY(10px);
    transition: all 250ms ease;
    pointer-events: auto;
  `;
  toast.textContent = message;

  toastContainer.appendChild(toast);

  // Animación de entrada
  requestAnimationFrame(() => {
    toast.style.opacity = '1';
    toast.style.transform = 'translateY(0)';
  });

  // Salida automática tras 3.5 segundos
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(10px)';
    setTimeout(() => {
      toast.remove();
    }, 250);
  }, 3500);
}

/**
 * Actualiza el contador de favoritos en la interfaz
 */
function updateFavoritesBadge() {
  const badge = document.getElementById('fav-count-badge');
  if (badge) {
    badge.textContent = state.favorites.length;
  }
}

/**
 * Configura el botón para alternar el filtro de solo favoritos
 */
function setupFavoritesFilter() {
  const favFilterBtn = document.getElementById('btn-toggle-favorites-filter');
  if (favFilterBtn) {
    favFilterBtn.addEventListener('click', () => {
      state.onlyFavoritesFilter = !state.onlyFavoritesFilter;
      favFilterBtn.classList.toggle('active', state.onlyFavoritesFilter);
      favFilterBtn.setAttribute('aria-pressed', state.onlyFavoritesFilter);
      renderScheduleList();
    });
  }

  // Delegación de eventos para botones en tarjetas de actividad
  const container = document.getElementById('schedule-days-container');
  if (container) {
    container.addEventListener('click', async (e) => {
      // 1. Guardar / Quitar favorito
      const favBtn = e.target.closest('.btn-card-fav');
      if (favBtn) {
        const actId = favBtn.dataset.actId;
        const actObj = state.allActivities.find(a => a.id === actId);
        favBtn.disabled = true;
        try {
          const nowFav = await toggleFavoriteActivity(actId, actObj || {});
          if (nowFav) {
            state.favorites.push(actId);
            showToast('Actividad guardada en favoritos', 'success');
          } else {
            state.favorites = state.favorites.filter(id => id !== actId);
            showToast('Actividad eliminada de favoritos', 'info');
          }
          updateFavoritesBadge();
          renderScheduleList();
        } catch (err) {
          showToast('No se pudo actualizar el favorito', 'error');
        } finally {
          favBtn.disabled = false;
        }
        return;
      }

      // 2. Preguntar a la IA sobre esta actividad
      const aiBtn = e.target.closest('.btn-card-ask-ai');
      if (aiBtn) {
        const actId = aiBtn.dataset.actId;
        const act = state.allActivities.find(a => a.id === actId);
        if (act) {
          openGeminiDrawerWithPrompt(`Cuéntame sobre la conferencia de ${act.department}: "${act.title}" programada para el ${act.dayLabel} a las ${act.startTime} COT.`);
        }
        return;
      }

      // 3. Enviar pregunta al ponente
      const qBtn = e.target.closest('.btn-card-question');
      if (qBtn) {
        const actId = qBtn.dataset.actId;
        const act = state.allActivities.find(a => a.id === actId);
        if (act) {
          openQuestionModal(act);
        }
        return;
      }
    });
  }
}

/**
 * Configuración del Asistente Académico IA con Google Gemini
 */
function setupGeminiChat() {
  const openBtn = document.getElementById('btn-open-gemini-chat');
  const closeBtn = document.getElementById('btn-close-gemini-chat');
  const drawer = document.getElementById('gemini-chat-drawer');
  const backdrop = document.getElementById('gemini-chat-backdrop');
  const form = document.getElementById('gemini-chat-form');
  const input = document.getElementById('gemini-user-input');
  const chipsContainer = document.querySelector('.gemini-quick-prompts');

  const openDrawer = () => {
    if (drawer && backdrop) {
      drawer.classList.add('active');
      backdrop.classList.add('active');
      drawer.setAttribute('aria-hidden', 'false');
      backdrop.setAttribute('aria-hidden', 'false');
      setTimeout(() => input?.focus(), 250);
    }
  };

  const closeDrawer = () => {
    if (drawer && backdrop) {
      drawer.classList.remove('active');
      backdrop.classList.remove('active');
      drawer.setAttribute('aria-hidden', 'true');
      backdrop.setAttribute('aria-hidden', 'true');
    }
  };

  if (openBtn) openBtn.addEventListener('click', openDrawer);
  if (closeBtn) closeBtn.addEventListener('click', closeDrawer);
  if (backdrop) backdrop.addEventListener('click', closeDrawer);

  // Cerrar con Escape
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && drawer?.classList.contains('active')) {
      closeDrawer();
    }
  });

  // Chips de preguntas rápidas
  if (chipsContainer) {
    chipsContainer.addEventListener('click', (e) => {
      const chip = e.target.closest('.quick-prompt-chip');
      if (chip && chip.dataset.prompt) {
        sendChatMessage(chip.dataset.prompt);
      }
    });
  }

  // Envío del formulario
  if (form) {
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const prompt = input.value.trim();
      if (!prompt) return;
      input.value = '';
      sendChatMessage(prompt);
    });
  }
}

/**
 * Abre el panel de Gemini con una pregunta predefinida
 */
function openGeminiDrawerWithPrompt(promptText) {
  const openBtn = document.getElementById('btn-open-gemini-chat');
  if (openBtn) openBtn.click();
  sendChatMessage(promptText);
}

/**
 * Envía un mensaje a la API de Gemini y muestra la respuesta en el chat
 */
async function sendChatMessage(promptText) {
  const messagesContainer = document.getElementById('gemini-messages-container');
  const typingIndicator = document.getElementById('gemini-typing-indicator');
  const modelBadge = document.getElementById('gemini-active-model-badge');

  if (!messagesContainer) return;

  // 1. Renderizar mensaje del usuario
  const userMsgEl = document.createElement('div');
  userMsgEl.className = 'gemini-msg gemini-msg-user';
  userMsgEl.textContent = promptText;
  messagesContainer.appendChild(userMsgEl);
  messagesContainer.scrollTop = messagesContainer.scrollHeight;

  // Registrar en historial
  state.chatHistory.push({ role: 'user', text: promptText });

  // 2. Mostrar indicador de tipeo
  if (typingIndicator) typingIndicator.style.display = 'block';

  try {
    const result = await askGeminiAssistant(promptText, state.chatHistory.slice(0, -1), state.allActivities);
    
    // Registrar respuesta del modelo en historial
    state.chatHistory.push({ role: 'model', text: result.answer });

    // Actualizar badge con el modelo usado
    if (modelBadge && result.modelUsed) {
      modelBadge.innerHTML = `<span class="dot-live"></span> ${result.modelUsed}`;
    }

    // 3. Renderizar mensaje de respuesta
    const modelMsgEl = document.createElement('div');
    modelMsgEl.className = 'gemini-msg gemini-msg-model';
    
    // Formatear texto simple con negritas y saltos de línea
    const formatted = formatMarkdownText(result.answer);
    modelMsgEl.innerHTML = formatted + `<span class="gemini-msg-meta">${result.modelUsed}</span>`;
    
    messagesContainer.appendChild(modelMsgEl);
  } catch (err) {
    const errorMsgEl = document.createElement('div');
    errorMsgEl.className = 'gemini-msg gemini-msg-model';
    errorMsgEl.style.borderColor = '#FCA5A5';
    errorMsgEl.innerHTML = `⚠️ <strong>Aviso:</strong> ${err.message || 'No fue posible completar la consulta en este momento.'}`;
    messagesContainer.appendChild(errorMsgEl);
  } finally {
    if (typingIndicator) typingIndicator.style.display = 'none';
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
  }
}

/**
 * Formatea texto de Markdown básico a HTML seguro
 */
function formatMarkdownText(text) {
  if (!text) return '';
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    .replace(/`(.*?)`/g, '<code>$1</code>')
    .replace(/\n\n/g, '<br><br>')
    .replace(/\n/g, '<br>');
}

/**
 * Modal para enviar preguntas al ponente y guardarlas en Firestore
 */
let currentQuestionAct = null;

function openQuestionModal(act) {
  currentQuestionAct = act;
  const modal = document.getElementById('modal-pregunta-backdrop');
  const actTitleInput = document.getElementById('modal-pregunta-act-title-display');
  const actIdInput = document.getElementById('modal-pregunta-act-id');

  if (actTitleInput) actTitleInput.value = `${act.department}: ${act.title}`;
  if (actIdInput) actIdInput.value = act.id;

  if (modal) {
    modal.style.display = 'flex';
    modal.setAttribute('aria-hidden', 'false');
    document.getElementById('modal-pregunta-nombre')?.focus();
  }
}

function closeQuestionModal() {
  const modal = document.getElementById('modal-pregunta-backdrop');
  if (modal) {
    modal.style.display = 'none';
    modal.setAttribute('aria-hidden', 'true');
  }
}

function setupQuestionModal() {
  const modal = document.getElementById('modal-pregunta-backdrop');
  const closeBtn = document.getElementById('btn-close-modal-pregunta');
  const cancelBtn = document.getElementById('btn-cancel-modal-pregunta');
  const form = document.getElementById('form-pregunta-ponente');

  if (closeBtn) closeBtn.addEventListener('click', closeQuestionModal);
  if (cancelBtn) cancelBtn.addEventListener('click', closeQuestionModal);
  if (modal) {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) closeQuestionModal();
    });
  }

  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const submitBtn = document.getElementById('btn-submit-modal-pregunta');
      const actId = document.getElementById('modal-pregunta-act-id').value;
      const userName = document.getElementById('modal-pregunta-nombre').value.trim();
      const userEmail = document.getElementById('modal-pregunta-email').value.trim();
      const questionText = document.getElementById('modal-pregunta-texto').value.trim();

      if (!questionText || !userName) return;

      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = 'Enviando...';
      }

      try {
        await submitActivityQuestion({
          activityId: actId,
          activityTitle: currentQuestionAct ? currentQuestionAct.title : '',
          activityDepartment: currentQuestionAct ? currentQuestionAct.department : '',
          userName,
          userEmail,
          questionText
        });

        showToast('¡Pregunta enviada exitosamente a Teleducación!', 'success');
        form.reset();
        closeQuestionModal();
      } catch (err) {
        showToast('Error al enviar la pregunta. Por favor intenta de nuevo.', 'error');
      } finally {
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.textContent = 'Enviar a Teleducación';
        }
      }
    });
  }
}

/* ==========================================================================
   AUTENTICACIÓN CON FIREBASE (LOGIN Y REGISTRO CON CORREO Y CONTRASEÑA)
   ========================================================================== */

function setupAuthUI() {
  const loginHeaderBtn = document.getElementById('btn-auth-header');
  const userBadge = document.getElementById('auth-user-badge');
  const userNameText = document.getElementById('auth-user-name');
  const logoutBtn = document.getElementById('btn-auth-logout');

  const modal = document.getElementById('modal-auth-backdrop');
  const closeBtn = document.getElementById('btn-close-modal-auth');
  const cancelBtn = document.getElementById('btn-cancel-modal-auth');
  const form = document.getElementById('form-auth');

  const tabLogin = document.getElementById('tab-auth-login');
  const tabRegister = document.getElementById('tab-auth-register');
  const nameGroup = document.getElementById('group-auth-name');
  const nameInput = document.getElementById('auth-input-name');
  const emailInput = document.getElementById('auth-input-email');
  const passwordInput = document.getElementById('auth-input-password');
  const submitBtn = document.getElementById('btn-submit-modal-auth');
  const errorAlert = document.getElementById('auth-error-alert');
  const successAlert = document.getElementById('auth-success-alert');

  let isRegisterMode = false;

  const setMode = (register) => {
    isRegisterMode = register;
    tabLogin.classList.toggle('active', !register);
    tabRegister.classList.toggle('active', register);
    tabLogin.setAttribute('aria-selected', !register);
    tabRegister.setAttribute('aria-selected', register);
    nameGroup.style.display = register ? 'flex' : 'none';
    submitBtn.textContent = register ? 'Crear Cuenta' : 'Iniciar Sesión';
    if (errorAlert) errorAlert.style.display = 'none';
    if (successAlert) successAlert.style.display = 'none';
  };

  const openAuthModal = () => {
    if (modal) {
      modal.style.display = 'flex';
      modal.setAttribute('aria-hidden', 'false');
      setMode(false);
      emailInput?.focus();
    }
  };

  const closeAuthModal = () => {
    if (modal) {
      modal.style.display = 'none';
      modal.setAttribute('aria-hidden', 'true');
      form.reset();
    }
  };

  if (loginHeaderBtn) loginHeaderBtn.addEventListener('click', openAuthModal);
  if (closeBtn) closeBtn.addEventListener('click', closeAuthModal);
  if (cancelBtn) cancelBtn.addEventListener('click', closeAuthModal);
  if (modal) {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) closeAuthModal();
    });
  }

  if (tabLogin) tabLogin.addEventListener('click', () => setMode(false));
  if (tabRegister) tabRegister.addEventListener('click', () => setMode(true));

  // Escuchar estado de autenticación en Firebase / Local
  onAuthChange((user) => {
    if (user) {
      if (loginHeaderBtn) loginHeaderBtn.style.display = 'none';
      if (userBadge) userBadge.style.display = 'inline-flex';
      if (userNameText) {
        userNameText.textContent = user.displayName || user.email.split('@')[0];
      }
    } else {
      if (loginHeaderBtn) loginHeaderBtn.style.display = 'inline-flex';
      if (userBadge) userBadge.style.display = 'none';
    }
  });

  // Cerrar sesión
  if (logoutBtn) {
    logoutBtn.addEventListener('click', async () => {
      await logoutUser();
      showToast('Sesión cerrada correctamente', 'info');
    });
  }

  // Envío del formulario de Login / Registro
  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = emailInput.value.trim();
      const password = passwordInput.value;
      const displayName = nameInput?.value.trim() || '';

      if (errorAlert) errorAlert.style.display = 'none';
      if (successAlert) successAlert.style.display = 'none';
      submitBtn.disabled = true;
      submitBtn.textContent = 'Procesando...';

      try {
        if (isRegisterMode) {
          await registerWithEmail(email, password, displayName);
          showToast(`¡Bienvenido a Aulas Abiertas! Cuenta creada con éxito.`, 'success');
        } else {
          await loginWithEmail(email, password);
          showToast(`¡Bienvenido de nuevo a Aulas Abiertas!`, 'success');
        }
        closeAuthModal();
      } catch (err) {
        if (errorAlert) {
          errorAlert.textContent = err.message || 'Error al autenticar.';
          errorAlert.style.display = 'block';
        }
      } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = isRegisterMode ? 'Crear Cuenta' : 'Iniciar Sesión';
      }
    });
  }
}

/* ==========================================================================
   EXTRACTOR INTELIGENTE DE BOLETINES MAILERLITE CON GEMINI IA
   ========================================================================== */

let lastScrapedActivities = [];
let lastScrapedCsv = '';

function setupMailerliteScraper() {
  const openBtn = document.getElementById('btn-header-scraper');
  const modal = document.getElementById('modal-scraper-backdrop');
  const closeBtn = document.getElementById('btn-close-modal-scraper');
  const form = document.getElementById('form-scraper-mailerlite');
  const urlInput = document.getElementById('scraper-input-url');
  const submitBtn = document.getElementById('btn-run-scraper');
  const loadingEl = document.getElementById('scraper-loading');
  const resultsEl = document.getElementById('scraper-results');
  const countBadge = document.getElementById('scraper-count-badge');
  const modelBadge = document.getElementById('scraper-model-badge');
  const tbody = document.getElementById('scraper-preview-tbody');
  const copyCsvBtn = document.getElementById('btn-scraper-copy-csv');
  const downloadCsvBtn = document.getElementById('btn-scraper-download-csv');

  const openScraperModal = () => {
    if (modal) {
      modal.style.display = 'flex';
      modal.setAttribute('aria-hidden', 'false');
      urlInput?.focus();
    }
  };

  const closeScraperModal = () => {
    if (modal) {
      modal.style.display = 'none';
      modal.setAttribute('aria-hidden', 'true');
    }
  };

  if (openBtn) openBtn.addEventListener('click', openScraperModal);
  if (closeBtn) closeBtn.addEventListener('click', closeScraperModal);
  if (modal) {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) closeScraperModal();
    });
  }

  // Envío de scraping con Gemini IA
  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const url = urlInput.value.trim();
      if (!url) return;

      submitBtn.disabled = true;
      if (loadingEl) loadingEl.style.display = 'block';
      if (resultsEl) resultsEl.style.display = 'none';

      try {
        const result = await scrapeMailerliteWithGemini(url);
        lastScrapedActivities = result.activities || [];
        lastScrapedCsv = result.csvContent || '';

        if (countBadge) countBadge.textContent = `${result.count || lastScrapedActivities.length} actividades extraídas`;
        if (modelBadge) modelBadge.textContent = result.modelUsed || 'Gemini 3.5 / 3.1 Flash Lite';

        // Renderizar tabla previa
        if (tbody) {
          tbody.innerHTML = lastScrapedActivities.map((act) => `
            <tr>
              <td><strong>${act.date}</strong></td>
              <td>${act.start_time || act.startTime}</td>
              <td>${act.department}</td>
              <td>${act.title}</td>
              <td><span class="card-modality-badge modality-${(act.modality || '').toLowerCase()}">${act.modality || 'Virtual'}</span></td>
            </tr>
          `).join('');
        }

        if (resultsEl) resultsEl.style.display = 'block';
        showToast(`¡Gemini IA extrajo ${lastScrapedActivities.length} conferencias con éxito!`, 'success');
      } catch (err) {
        showToast(`Error al procesar boletín: ${err.message}`, 'error');
      } finally {
        submitBtn.disabled = false;
        if (loadingEl) loadingEl.style.display = 'none';
      }
    });
  }

  // Copiar CSV al portapapeles
  if (copyCsvBtn) {
    copyCsvBtn.addEventListener('click', () => {
      if (!lastScrapedCsv) {
        showToast('No hay datos CSV para copiar.', 'info');
        return;
      }
      navigator.clipboard.writeText(lastScrapedCsv).then(() => {
        showToast('¡CSV copiado al portapapeles! Listo para pegar en Google Sheets.', 'success');
      }).catch(() => {
        showToast('No se pudo copiar automáticamente. Puedes descargar el archivo .csv.', 'info');
      });
    });
  }

  // Descargar archivo .csv
  if (downloadCsvBtn) {
    downloadCsvBtn.addEventListener('click', () => {
      if (!lastScrapedCsv) {
        showToast('No hay datos CSV para descargar.', 'info');
        return;
      }
      const blob = new Blob([lastScrapedCsv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.setAttribute('href', url);
      link.setAttribute('download', `aulas_abiertas_programacion_${new Date().toISOString().slice(0, 10)}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      showToast('Descargando archivo CSV...', 'success');
    });
  }
}


