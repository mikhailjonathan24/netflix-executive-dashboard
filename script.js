const numberFormat = new Intl.NumberFormat('en-US');
const chartColors = ['#df2935', '#3485d1', '#e99a37', '#41a978', '#8068c9', '#e2ba35', '#269ea3', '#e16a38', '#c34d89', '#657386'];
const validRatings = new Set(['G', 'NC-17', 'NR', 'PG', 'PG-13', 'R', 'TV-14', 'TV-G', 'TV-MA', 'TV-PG', 'TV-Y', 'TV-Y7', 'TV-Y7-FV', 'UR']);
const state = { rows: [], filteredRows: [], page: 1, pageSize: 12, charts: {} };
const elements = {
  status: document.getElementById('dataset-status'),
  error: document.getElementById('error-banner'),
  errorMessage: document.getElementById('error-message'),
  type: document.getElementById('type-filter'),
  genre: document.getElementById('genre-filter'),
  yearMin: document.getElementById('year-min'),
  yearMax: document.getElementById('year-max'),
  yearLabel: document.getElementById('year-range-label'),
  rangeWrap: document.getElementById('range-wrap'),
  rangeFill: document.getElementById('range-fill'),
  search: document.getElementById('table-search'),
  tableBody: document.getElementById('catalog-body'),
  tableCount: document.getElementById('table-count'),
  pageIndicator: document.getElementById('page-indicator'),
  previous: document.getElementById('prev-page'),
  next: document.getElementById('next-page')
};

const chartDefaults = {
  color: '#4b5563',
  borderColor: 'rgba(15,23,42,.1)',
  font: { family: 'DM Sans', size: 12 }
};

Chart.defaults.color = chartDefaults.color;
Chart.defaults.borderColor = chartDefaults.borderColor;
Chart.defaults.font.family = chartDefaults.font.family;
Chart.defaults.font.size = chartDefaults.font.size;

function cleanValue(value) {
  const cleaned = String(value ?? '').trim();
  return cleaned && cleaned.toLowerCase() !== 'unknown' ? cleaned : '';
}

function splitValues(value) {
  return cleanValue(value).split(',').map(item => item.trim()).filter(Boolean);
}

function getReleaseYear(row) {
  const year = Number(row.release_year);
  return Number.isFinite(year) && year > 0 ? year : null;
}

function getYearAdded(row) {
  const year = Number(row.year_added);
  return Number.isFinite(year) && year > 0 ? year : null;
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
}

function showLoadError(message) {
  elements.status.textContent = 'Dataset unavailable';
  elements.errorMessage.textContent = message;
  elements.error.hidden = false;
}

function loadDataset() {
  if (!window.Papa) {
    showLoadError('PapaParse gagal dimuat. Periksa koneksi internet dan muat ulang halaman.');
    return;
  }

  Papa.parse('netflix_cleaned.csv', {
    download: true,
    header: true,
    skipEmptyLines: 'greedy',
    complete: result => {
      const requiredColumns = ['type', 'title', 'release_year', 'listed_in'];
      if (result.errors.length && !result.data.length) {
        showLoadError('CSV tidak dapat dibaca. Pastikan dashboard dibuka melalui server lokal dan file CSV berada di folder yang sama.');
        return;
      }
      const headers = result.meta.fields || [];
      const missing = requiredColumns.filter(column => !headers.includes(column));
      if (missing.length) {
        showLoadError(`Kolom wajib tidak ditemukan: ${missing.join(', ')}.`);
        return;
      }

      state.rows = result.data.filter(row => cleanValue(row.title));
      if (!state.rows.length) {
        showLoadError('CSV berhasil dibuka, tetapi tidak memiliki baris judul yang valid.');
        return;
      }
      initializeFilters();
      elements.status.textContent = `${numberFormat.format(state.rows.length)} titles loaded`;
      elements.error.hidden = true;
      applyFilters();
    },
    error: () => showLoadError('Browser tidak dapat membaca file CSV. Jalankan dashboard melalui server lokal, bukan dengan membuka index.html langsung.')
  });
}

function initializeFilters() {
  const years = state.rows.map(getReleaseYear).filter(Boolean);
  const minYear = Math.min(...years);
  const maxYear = Math.max(...years);
  elements.yearMin.min = String(minYear);
  elements.yearMin.max = String(maxYear);
  elements.yearMin.value = String(minYear);
  elements.yearMax.min = String(minYear);
  elements.yearMax.max = String(maxYear);
  elements.yearMax.value = String(maxYear);

  const genres = new Set();
  state.rows.forEach(row => splitValues(row.listed_in).forEach(genre => genres.add(genre)));
  [...genres].sort((a, b) => a.localeCompare(b)).forEach(genre => {
    const option = document.createElement('option');
    option.value = genre;
    option.textContent = genre;
    elements.genre.append(option);
  });
  updateYearRangeVisual();
}

function updateYearRangeVisual() {
  const min = Number(elements.yearMin.min);
  const max = Number(elements.yearMin.max);
  const selectedMin = Number(elements.yearMin.value);
  const selectedMax = Number(elements.yearMax.value);
  const span = max - min || 1;
  elements.yearLabel.textContent = `${selectedMin} — ${selectedMax}`;
  elements.rangeWrap.style.setProperty('--start', `${((selectedMin - min) / span) * 100}%`);
  elements.rangeWrap.style.setProperty('--end', `${((selectedMax - min) / span) * 100}%`);
}

function applyFilters() {
  const type = elements.type.value;
  const genre = elements.genre.value;
  const minYear = Number(elements.yearMin.value);
  const maxYear = Number(elements.yearMax.value);
  state.filteredRows = state.rows.filter(row => {
    const year = getReleaseYear(row);
    return (type === 'All' || row.type === type)
      && (genre === 'All' || splitValues(row.listed_in).includes(genre))
      && year !== null && year >= minYear && year <= maxYear;
  });
  state.page = 1;
  renderDashboard();
}

function countBy(rows, getKeys) {
  const counts = new Map();
  rows.forEach(row => getKeys(row).forEach(key => counts.set(key, (counts.get(key) || 0) + 1)));
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}

function formatShare(count, total) {
  return total ? `${((count / total) * 100).toFixed(1)}% of current view` : '0% of current view';
}

function updateKpis(rows) {
  const movieCount = rows.filter(row => row.type === 'Movie').length;
  const showCount = rows.filter(row => row.type === 'TV Show').length;
  const years = countBy(rows.filter(row => getReleaseYear(row)), row => [String(getReleaseYear(row))]);
  const genres = countBy(rows, row => splitValues(row.listed_in));
  const total = rows.length;

  document.getElementById('kpi-total').textContent = numberFormat.format(total);
  document.getElementById('kpi-total-note').textContent = `Titles in current view`;
  document.getElementById('kpi-movies').textContent = numberFormat.format(movieCount);
  document.getElementById('kpi-movies-share').textContent = formatShare(movieCount, total);
  document.getElementById('kpi-shows').textContent = numberFormat.format(showCount);
  document.getElementById('kpi-shows-share').textContent = formatShare(showCount, total);
  document.getElementById('kpi-year').textContent = years[0]?.[0] || '—';
  document.getElementById('kpi-year-note').textContent = years[0] ? `${numberFormat.format(years[0][1])} titles released` : 'No release year data';
  document.getElementById('kpi-genre').textContent = genres[0]?.[0] || '—';
  document.getElementById('kpi-genre-note').textContent = genres[0] ? `${numberFormat.format(genres[0][1])} titles tagged` : 'No genre data';
  document.getElementById('donut-total').textContent = numberFormat.format(total);
  updateInsights(rows);
}

function updateInsights(rows) {
  const total = rows.length;
  const genre = countBy(rows, row => splitValues(row.listed_in))[0];
  const country = countBy(rows, row => splitValues(row.country))[0];
  const movieCount = rows.filter(row => row.type === 'Movie').length;
  const showCount = rows.filter(row => row.type === 'TV Show').length;
  const movieShare = total ? ((movieCount / total) * 100).toFixed(1) : '0.0';
  const showShare = total ? ((showCount / total) * 100).toFixed(1) : '0.0';

  document.getElementById('insight-genre').textContent = genre?.[0] || 'No genre data';
  document.getElementById('insight-genre-detail').textContent = genre ? `${numberFormat.format(genre[1])} titles tagged` : 'No titles in this view';
  document.getElementById('insight-mix').textContent = `${movieShare}% Movies · ${showShare}% TV Shows`;
  document.getElementById('insight-mix-detail').textContent = `${numberFormat.format(movieCount)} movies · ${numberFormat.format(showCount)} TV shows`;
  document.getElementById('insight-country').textContent = country?.[0] || 'No country data';
  document.getElementById('insight-country-detail').textContent = country ? `${numberFormat.format(country[1])} titles produced` : 'No country data in this view';
}

function createChart(key, canvasId, config) {
  if (state.charts[key]) state.charts[key].destroy();
  state.charts[key] = new Chart(document.getElementById(canvasId), config);
}

function baseOptions(indexAxis = 'x') {
  return {
    responsive: true,
    maintainAspectRatio: false,
    indexAxis,
    animation: { duration: 380 },
    plugins: {
      legend: { display: false },
      tooltip: { backgroundColor: '#292929', titleColor: '#fff', bodyColor: '#ddd', padding: 10, borderColor: '#414141', borderWidth: 1 }
    },
    scales: {
      x: { grid: { display: false }, border: { display: false }, ticks: { color: '#596273', maxRotation: 0, autoSkip: true } },
      y: { beginAtZero: true, grid: { color: 'rgba(15,23,42,.08)' }, border: { display: false }, ticks: { precision: 0, color: '#596273' } }
    }
  };
}

function renderCharts(rows) {
  const movieCount = rows.filter(row => row.type === 'Movie').length;
  const showCount = rows.filter(row => row.type === 'TV Show').length;
  createChart('type', 'type-chart', {
    type: 'doughnut',
    data: { labels: ['Movies', 'TV shows'], datasets: [{ data: [movieCount, showCount], backgroundColor: [chartColors[0], chartColors[1]], borderColor: '#fff', borderWidth: 3, hoverOffset: 5 }] },
    options: { responsive: true, maintainAspectRatio: false, cutout: '76%', plugins: { legend: { display: false }, tooltip: { backgroundColor: '#292929', padding: 9 } } }
  });
  document.getElementById('type-legend').innerHTML = [
    ['Movies', movieCount, chartColors[0]], ['TV shows', showCount, chartColors[1]]
  ].map(([label, count, color]) => `<div class="legend-item"><span class="legend-swatch" style="background:${color}"></span><span class="legend-name">${label}</span><strong class="legend-value">${numberFormat.format(count)}</strong></div>`).join('');

  const addedByYear = new Map();
  rows.forEach(row => {
    const year = getYearAdded(row);
    if (!year) return;
    if (!addedByYear.has(year)) addedByYear.set(year, { Movie: 0, 'TV Show': 0 });
    if (row.type in addedByYear.get(year)) addedByYear.get(year)[row.type] += 1;
  });
  const addedYears = [...addedByYear.entries()].sort((a, b) => a[0] - b[0]);
  const trendOptions = baseOptions();
  trendOptions.scales.y.grid = { color: 'rgba(15,23,42,.07)' };
  trendOptions.elements = { point: { radius: 2, hoverRadius: 4 }, line: { tension: .35 } };
  trendOptions.plugins.legend = { display: true, position: 'top', align: 'end', labels: { boxWidth: 8, boxHeight: 8, padding: 8, usePointStyle: true, pointStyle: 'circle', font: { size: 9 } } };
  createChart('trend', 'trend-chart', { type: 'line', data: { labels: addedYears.map(item => String(item[0])), datasets: [
    { label: 'Movies', data: addedYears.map(item => item[1].Movie), borderColor: chartColors[0], backgroundColor: 'rgba(223,41,53,.1)', fill: true, borderWidth: 2, pointBackgroundColor: chartColors[0] },
    { label: 'TV Shows', data: addedYears.map(item => item[1]['TV Show']), borderColor: chartColors[1], backgroundColor: 'rgba(52,133,209,.08)', fill: true, borderWidth: 2, pointBackgroundColor: chartColors[1] }
  ] }, options: trendOptions });

  const ratings = countBy(rows.filter(row => validRatings.has(cleanValue(row.rating).toUpperCase())), row => [cleanValue(row.rating).toUpperCase()]);
  const ratingOptions = baseOptions('y');
  ratingOptions.scales.x.grid = { color: 'rgba(15,23,42,.07)' };
  ratingOptions.scales.y.grid = { display: false };
  ratingOptions.scales.x.ticks = { precision: 0, color: '#596273' };
  ratingOptions.scales.y.ticks = { color: '#3f4858', font: { size: 12 } };
  createChart('rating', 'rating-chart', { type: 'bar', data: { labels: ratings.map(item => item[0]), datasets: [{ data: ratings.map(item => item[1]), backgroundColor: ratings.map((_, index) => chartColors[index % 5]), borderRadius: 2, barPercentage: .75, maxBarThickness: 17 }] }, options: ratingOptions });

  const genres = countBy(rows, row => splitValues(row.listed_in)).slice(0, 10);
  const genreOptions = baseOptions('y');
  genreOptions.scales.x.grid = { color: 'rgba(15,23,42,.07)' };
  genreOptions.scales.y.grid = { display: false };
  genreOptions.scales.x.ticks = { precision: 0, color: '#596273' };
  genreOptions.scales.y.ticks = { color: '#3f4858', font: { size: 12 } };
  createChart('genres', 'genre-chart', { type: 'bar', data: { labels: genres.map(item => item[0]), datasets: [{ data: genres.map(item => item[1]), backgroundColor: genres.map((_, index) => index === 0 ? chartColors[0] : '#dd747b'), borderRadius: 2, barPercentage: .72, maxBarThickness: 14 }] }, options: genreOptions });

  const countries = countBy(rows, row => splitValues(row.country)).slice(0, 10);
  const countryOptions = baseOptions('y');
  countryOptions.scales.x.grid = { color: 'rgba(15,23,42,.07)' };
  countryOptions.scales.y.grid = { display: false };
  countryOptions.scales.x.ticks = { precision: 0, color: '#596273' };
  countryOptions.scales.y.ticks = { color: '#3f4858', font: { size: 12 } };
  createChart('countries', 'country-chart', { type: 'bar', data: { labels: countries.map(item => item[0]), datasets: [{ data: countries.map(item => item[1]), backgroundColor: countries.map((_, index) => index === 0 ? '#7651cf' : '#a993e5'), borderRadius: 2, barPercentage: .72, maxBarThickness: 14 }] }, options: countryOptions });

  const directors = countBy(rows, row => splitValues(row.director)).slice(0, 10);
  const directorOptions = baseOptions('y');
  directorOptions.scales.x.grid = { color: 'rgba(15,23,42,.07)' };
  directorOptions.scales.y.grid = { display: false };
  directorOptions.scales.x.ticks = { precision: 0, color: '#596273' };
  directorOptions.scales.y.ticks = { color: '#3f4858', font: { size: 11 } };
  createChart('directors', 'director-chart', { type: 'bar', data: { labels: directors.map(item => item[0]), datasets: [{ data: directors.map(item => item[1]), backgroundColor: directors.map((_, index) => index === 0 ? chartColors[1] : '#83b5e5'), borderRadius: 2, barPercentage: .72, maxBarThickness: 13 }] }, options: directorOptions });

  const actors = countBy(rows, row => splitValues(row.cast)).slice(0, 10);
  const actorOptions = baseOptions('y');
  actorOptions.scales.x.grid = { color: 'rgba(15,23,42,.07)' };
  actorOptions.scales.y.grid = { display: false };
  actorOptions.scales.x.ticks = { precision: 0, color: '#596273' };
  actorOptions.scales.y.ticks = { color: '#3f4858', font: { size: 11 } };
  createChart('actors', 'actor-chart', { type: 'bar', data: { labels: actors.map(item => item[0]), datasets: [{ data: actors.map(item => item[1]), backgroundColor: actors.map((_, index) => index === 0 ? chartColors[2] : '#efb56e'), borderRadius: 2, barPercentage: .72, maxBarThickness: 13 }] }, options: actorOptions });

  const movieBuckets = ['< 60', '60–89', '90–119', '120–149', '150+'];
  const movieDurations = rows.filter(row => row.type === 'Movie').map(row => parseInt(row.duration, 10)).filter(Number.isFinite);
  const movieCounts = [0, 0, 0, 0, 0];
  movieDurations.forEach(minutes => {
    const index = minutes < 60 ? 0 : minutes < 90 ? 1 : minutes < 120 ? 2 : minutes < 150 ? 3 : 4;
    movieCounts[index] += 1;
  });
  createChart('movieDuration', 'movie-duration-chart', { type: 'bar', data: { labels: movieBuckets, datasets: [{ data: movieCounts, backgroundColor: '#ad3439', borderRadius: 2, maxBarThickness: 27 }] }, options: { ...baseOptions(), plugins: { ...baseOptions().plugins, tooltip: { ...baseOptions().plugins.tooltip, callbacks: { title: items => `${items[0]?.label || ''} min` } } }, scales: { ...baseOptions().scales, x: { ...baseOptions().scales.x, ticks: { color: '#c0c0c0', font: { size: 11 } } } } } });

  const showBuckets = ['1', '2', '3', '4–5', '6–10', '11+'];
  const showCounts = [0, 0, 0, 0, 0, 0];
  rows.filter(row => row.type === 'TV Show').forEach(row => {
    const seasons = parseInt(row.duration, 10);
    if (!Number.isFinite(seasons)) return;
    const index = seasons === 1 ? 0 : seasons === 2 ? 1 : seasons === 3 ? 2 : seasons <= 5 ? 3 : seasons <= 10 ? 4 : 5;
    showCounts[index] += 1;
  });
  createChart('showDuration', 'show-duration-chart', { type: 'bar', data: { labels: showBuckets, datasets: [{ data: showCounts, backgroundColor: '#777', borderRadius: 2, maxBarThickness: 23 }] }, options: { ...baseOptions(), scales: { ...baseOptions().scales, x: { ...baseOptions().scales.x, ticks: { color: '#c0c0c0', font: { size: 11 } } } } } });
}

function renderTable() {
  const query = elements.search.value.trim().toLowerCase();
  const searchedRows = state.filteredRows.filter(row => [row.title, row.director, row.country].some(value => String(value ?? '').toLowerCase().includes(query)));
  const totalPages = Math.max(1, Math.ceil(searchedRows.length / state.pageSize));
  state.page = Math.min(state.page, totalPages);
  const start = (state.page - 1) * state.pageSize;
  const pageRows = searchedRows.slice(start, start + state.pageSize);

  elements.tableBody.innerHTML = pageRows.length ? pageRows.map(row => `<tr>
    <td title="${escapeHtml(row.title)}">${escapeHtml(row.title)}</td>
    <td><span class="type-pill">${escapeHtml(row.type || '—')}</span></td>
    <td title="${escapeHtml(row.director)}">${escapeHtml(cleanValue(row.director) || '—')}</td>
    <td title="${escapeHtml(row.country)}">${escapeHtml(cleanValue(row.country) || '—')}</td>
    <td>${escapeHtml(row.release_year || '—')}</td>
    <td>${escapeHtml(cleanValue(row.rating) || 'Not rated')}</td>
  </tr>`).join('') : '<tr><td class="empty-row" colspan="6">No titles match your search.</td></tr>';

  elements.tableCount.textContent = `${numberFormat.format(searchedRows.length)} titles${query ? ' found' : ' in view'}`;
  elements.pageIndicator.textContent = `${state.page} / ${totalPages}`;
  elements.previous.disabled = state.page <= 1;
  elements.next.disabled = state.page >= totalPages;
}

function renderDashboard() {
  updateKpis(state.filteredRows);
  renderCharts(state.filteredRows);
  renderTable();
  resizeActiveCharts();
}

function resizeActiveCharts() {
  requestAnimationFrame(() => {
    Object.values(state.charts).forEach(chart => chart.resize());
  });
}
elements.type.addEventListener('change', applyFilters);
elements.genre.addEventListener('change', applyFilters);
elements.yearMin.addEventListener('input', () => {
  if (Number(elements.yearMin.value) > Number(elements.yearMax.value)) elements.yearMax.value = elements.yearMin.value;
  updateYearRangeVisual();
  applyFilters();
});
elements.yearMax.addEventListener('input', () => {
  if (Number(elements.yearMax.value) < Number(elements.yearMin.value)) elements.yearMin.value = elements.yearMax.value;
  updateYearRangeVisual();
  applyFilters();
});
elements.search.addEventListener('input', () => { state.page = 1; renderTable(); });
elements.previous.addEventListener('click', () => { state.page -= 1; renderTable(); });
elements.next.addEventListener('click', () => { state.page += 1; renderTable(); });
document.getElementById('reset-filters').addEventListener('click', () => {
  elements.type.value = 'All';
  elements.genre.value = 'All';
  elements.yearMin.value = elements.yearMin.min;
  elements.yearMax.value = elements.yearMax.max;
  elements.search.value = '';
  updateYearRangeVisual();
  applyFilters();
});
document.addEventListener('keydown', event => {
  if (event.key === '/' && !['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName)) {
    event.preventDefault();
    elements.search.focus();
  }
});

loadDataset();