(function () {
  'use strict';

  let data = null;
  let chartInstances = {};

  const MONTHS = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
  const COLORS_GENESIS = ['#27AE60','#E74C3C','#3498DB','#F39C12','#9B59B6','#1ABC9C','#E67E22','#2ECC71'];
  const CAPITAL_COLORS = { liquidez: '#3498DB', fci: '#9B59B6', plazo_fijo: '#E67E22' };

  function fmt(n) {
    return '$ ' + Number(n).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function fmtUSD(n, rate) {
    const val = n / rate;
    return 'USD ' + val.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  async function loadData() {
    const res = await fetch('data/metrics.json');
    data = await res.json();
    init();
  }

  function init() {
    populateDateFilters();
    populateCapitalFilters();
    applyFilters();
    setupCapitalFilters();
    setupCurrencyToggle();
    setupCategoryToggle();
  }

  function getAllDates(records, field) {
    return records.map(r => {
      const d = new Date(r[field] || r.fecha);
      return { year: d.getFullYear(), month: d.getMonth() + 1, label: MONTHS[d.getMonth()] + ' ' + d.getFullYear() };
    });
  }

  function uniqueDates(records) {
    const map = {};
    (records || []).forEach(r => {
      const d = new Date(r.fecha);
      const y = d.getFullYear();
      const m = d.getMonth() + 1;
      const key = y + '-' + String(m).padStart(2, '0');
      map[key] = { year: y, month: m, label: MONTHS[m - 1] + ' ' + y };
    });
    return Object.values(map).sort((a, b) => a.year !== b.year ? a.year - b.year : a.month - b.month);
  }

  function populateDateFilters() {
    const bd = data.base_de_datos || [];
    const dates = uniqueDates(bd);
    const selPeriodo = document.getElementById('filterPeriodo');
    const selAnio = document.getElementById('filterAnio');

    selPeriodo.innerHTML = dates.map(d => `<option value="${d.year}-${String(d.month).padStart(2,'0')}">${d.label}</option>`).join('');
    const years = [...new Set(dates.map(d => d.year))].sort();
    selAnio.innerHTML = years.map(y => `<option value="${y}">${y}</option>`).join('');

    if (dates.length) {
      const last = dates[dates.length - 1];
      selPeriodo.value = last.year + '-' + String(last.month).padStart(2, '0');
      selAnio.value = String(last.year);
    }

    selPeriodo.addEventListener('change', applyFilters);
    selAnio.addEventListener('change', applyFilters);
  }

  function populateCapitalFilters() {
    const cf = data.capital_financiero || [];
    const dates = uniqueDates(cf);
    const selPer = document.getElementById('filterCapitalPeriodo');
    const selAnio = document.getElementById('filterCapitalAnio');

    selPer.innerHTML = dates.map(d => `<option value="${d.year}-${String(d.month).padStart(2,'0')}">${d.label}</option>`).join('');
    const years = [...new Set(dates.map(d => d.year))].sort();
    selAnio.innerHTML = years.map(y => `<option value="${y}">${y}</option>`).join('');

    if (dates.length) {
      const last = dates[dates.length - 1];
      selPer.value = last.year + '-' + String(last.month).padStart(2, '0');
      selAnio.value = String(last.year);
    }
  }

  function setupCapitalFilters() {
    document.getElementById('filterCapitalPeriodo').addEventListener('change', updateCapitalCharts);
    document.getElementById('filterCapitalAnio').addEventListener('change', updateCapitalCharts);
  }

  function getCurrentPeriod() {
    const val = document.getElementById('filterPeriodo').value;
    if (!val) return null;
    const [y, m] = val.split('-').map(Number);
    return { year: y, month: m };
  }

  function getPrevPeriod(year, month) {
    if (month === 1) return { year: year - 1, month: 12 };
    return { year, month: month - 1 };
  }

  function filterByPeriod(records, year, month) {
    return (records || []).filter(r => {
      const d = new Date(r.fecha);
      return d.getFullYear() === year && (d.getMonth() + 1) === month;
    });
  }

  function sumByCategory(records, categoria) {
    return records.filter(r => (r.categoria || '').toLowerCase() === categoria.toLowerCase())
      .reduce((s, r) => s + Number(r.monto || 0), 0);
  }

  function sumByTipo(records, categoria, tipo) {
    return records.filter(r =>
      (r.categoria || '').toLowerCase() === categoria.toLowerCase() &&
      (r.tipo || '').toLowerCase() === tipo.toLowerCase()
    ).reduce((s, r) => s + Number(r.monto || 0), 0);
  }

  function applyFilters() {
    const period = getCurrentPeriod();
    if (!period || !data) return;
    const { year, month } = period;
    const bd = data.base_de_datos || [];
    const filtered = filterByPeriod(bd, year, month);
    const prev = getPrevPeriod(year, month);
    const filteredPrev = filterByPeriod(bd, prev.year, prev.month);

    const ingresos = sumByCategory(filtered, 'Ingreso');
    const egresos = sumByCategory(filtered, 'Egreso');
    const egresosOp = sumByTipo(filtered, 'Egreso', 'Operativo');
    const egresosExt = sumByTipo(filtered, 'Egreso', 'Extraordinario');
    const preIngresos = sumByCategory(filteredPrev, 'Ingreso');
    const preEgresos = sumByCategory(filteredPrev, 'Egreso');
    const preEgresosOp = sumByTipo(filteredPrev, 'Egreso', 'Operativo');
    const preEgresosExt = sumByTipo(filteredPrev, 'Egreso', 'Extraordinario');

    updateKPI('kpiIngresos', ingresos, preIngresos);
    updateKPI('kpiEgresos', egresos, preEgresos);
    updateKPI('kpiEgresosOp', egresosOp, preEgresosOp);
    updateKPI('kpiEgresosExt', egresosExt, preEgresosExt);

    updateIngresosEgresosChart();
    updateExpedientesCharts();
    updateVepScitChart();
    updateCategoriasChart();
    updateCapitalCharts();
  }

  function updateKPI(id, current, previous) {
    const valEl = document.getElementById(id + 'Valor');
    const deltaEl = document.getElementById(id + 'Delta');
    valEl.textContent = fmt(current);
    if (previous > 0) {
      const pct = ((current - previous) / previous) * 100;
      const cls = pct >= 0 ? 'delta-up' : 'delta-down';
      const icon = pct >= 0 ? '\u25B2' : '\u25BC';
      deltaEl.innerHTML = `<span class="delta-icon ${cls}">${icon}</span> <span class="${cls}">${Math.abs(pct).toFixed(1)}% vs mes anterior</span>`;
    } else {
      deltaEl.innerHTML = '<span class="delta-icon">\u2014</span> Sin dato previo';
    }
  }

  function destroyChart(key) {
    if (chartInstances[key]) {
      chartInstances[key].destroy();
      delete chartInstances[key];
    }
  }

  function buildMonthsLabels() {
    const bd = data.base_de_datos || [];
    const dates = uniqueDates(bd);
    return dates.map(d => d.label);
  }

  function aggregateByMonth(records, cat) {
    const map = {};
    (records || []).forEach(r => {
      const d = new Date(r.fecha);
      const key = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
      if ((r.categoria || '').toLowerCase() === cat.toLowerCase()) {
        map[key] = (map[key] || 0) + Number(r.monto || 0);
      }
    });
    return map;
  }

  function updateIngresosEgresosChart() {
    destroyChart('ingresosEgresos');
    const bd = data.base_de_datos || [];
    const dates = uniqueDates(bd);
    const labels = dates.map(d => d.label);
    const ingMap = aggregateByMonth(bd, 'Ingreso');
    const egMap = aggregateByMonth(bd, 'Egreso');
    const ingData = dates.map(d => ingMap[d.year + '-' + String(d.month).padStart(2, '0')] || 0);
    const egData = dates.map(d => egMap[d.year + '-' + String(d.month).padStart(2, '0')] || 0);

    const ctx = document.getElementById('chartIngresosEgresos').getContext('2d');
    chartInstances.ingresosEgresos = new Chart(ctx, {
      type: 'bar',
      data: {
        labels,
        datasets: [
          { label: 'Ingresos', data: ingData, backgroundColor: '#27AE60', borderColor: '#1E8449', borderWidth: 1, borderRadius: 4 },
          { label: 'Egresos', data: egData, backgroundColor: '#E74C3C', borderColor: '#C0392B', borderWidth: 1, borderRadius: 4 }
        ]
      },
      options: {
        responsive: true,
        plugins: {
          legend: { position: 'top', labels: { usePointStyle: true, padding: 16 } },
          tooltip: { callbacks: { label: ctx => ctx.dataset.label + ': ' + fmt(ctx.raw) } }
        },
        scales: {
          y: { beginAtZero: true, ticks: { callback: v => '$ ' + v.toLocaleString('es-AR') } }
        }
      }
    });
  }

  function updateExpedientesCharts() {
    destroyChart('expedientes');
    destroyChart('expedientesEstado');
    const exp = data.expedientes || [];
    const period = getCurrentPeriod();
    const filtered = period ? filterByPeriod(exp, period.year, period.month) : exp;

    const tipos = {};
    const estados = {};
    filtered.forEach(r => {
      tipos[r.tipo] = (tipos[r.tipo] || 0) + 1;
      estados[r.estado] = (estados[r.estado] || 0) + 1;
    });

    const tipoLabels = Object.keys(tipos);
    const tipoData = Object.values(tipos);
    const estLabels = Object.keys(estados);
    const estData = Object.values(estados);

    const ctx1 = document.getElementById('chartExpedientes').getContext('2d');
    chartInstances.expedientes = new Chart(ctx1, {
      type: 'doughnut',
      data: {
        labels: tipoLabels,
        datasets: [{ data: tipoData, backgroundColor: COLORS_GENESIS.slice(0, tipoLabels.length), borderWidth: 0 }]
      },
      options: {
        responsive: true,
        plugins: {
          legend: { position: 'bottom', labels: { usePointStyle: true, padding: 12 } },
          tooltip: { callbacks: { label: ctx => ctx.label + ': ' + ctx.raw + ' expedientes' } }
        }
      }
    });

    const ctx2 = document.getElementById('chartExpedientesEstado').getContext('2d');
    chartInstances.expedientesEstado = new Chart(ctx2, {
      type: 'doughnut',
      data: {
        labels: estLabels,
        datasets: [{ data: estData, backgroundColor: ['#3498DB','#F39C12','#27AE60'], borderWidth: 0 }]
      },
      options: {
        responsive: true,
        plugins: {
          legend: { position: 'bottom', labels: { usePointStyle: true, padding: 12 } },
          tooltip: { callbacks: { label: ctx => ctx.label + ': ' + ctx.raw + ' expedientes' } }
        }
      }
    });
  }

  function updateVepScitChart() {
    destroyChart('vepScit');
    const rv = data.rendicion_vep_scit || [];
    const labels = rv.map(r => r.periodo || MONTHS[new Date(r.fecha).getMonth()] + ' ' + new Date(r.fecha).getFullYear());
    const ingVEP = rv.map(r => Number(r.ingreso_vep || 0));
    const ingSCIT = rv.map(r => Number(r.ingreso_scit || 0));
    const egVEP = rv.map(r => Number(r.egreso_vep || 0));
    const egSCIT = rv.map(r => Number(r.egreso_scit || 0));

    const ctx = document.getElementById('chartVepScit').getContext('2d');
    chartInstances.vepScit = new Chart(ctx, {
      type: 'bar',
      data: {
        labels,
        datasets: [
          { label: 'Ingresos VEP', data: ingVEP, backgroundColor: '#27AE60', borderRadius: 3 },
          { label: 'Ingresos SCIT', data: ingSCIT, backgroundColor: '#2ECC71', borderRadius: 3 },
          { label: 'Egresos VEP', data: egVEP, backgroundColor: '#E74C3C', borderRadius: 3 },
          { label: 'Egresos SCIT', data: egSCIT, backgroundColor: '#F1948A', borderRadius: 3 }
        ]
      },
      options: {
        responsive: true,
        plugins: {
          legend: { position: 'top', labels: { usePointStyle: true, padding: 14, font: { size: 11 } } },
          tooltip: { callbacks: { label: ctx => ctx.dataset.label + ': ' + fmt(ctx.raw) } }
        },
        scales: {
          x: { stacked: false },
          y: { beginAtZero: true, ticks: { callback: v => '$ ' + v.toLocaleString('es-AR') } }
        }
      }
    });
  }

  let currentCatToggle = 'Ingresos';

  function setupCategoryToggle() {
    document.querySelectorAll('[data-cat]').forEach(btn => {
      btn.addEventListener('click', function () {
        document.querySelectorAll('[data-cat]').forEach(b => b.classList.remove('active'));
        this.classList.add('active');
        currentCatToggle = this.dataset.cat;
        updateCategoriasChart();
      });
    });
  }

  function updateCategoriasChart() {
    destroyChart('categorias');
    const bd = data.base_de_datos || [];
    const period = getCurrentPeriod();
    const filtered = period ? filterByPeriod(bd, period.year, period.month) : bd;
    const catFiltered = filtered.filter(r => (r.categoria || '').toLowerCase() === currentCatToggle.toLowerCase());
    const grupos = {};
    catFiltered.forEach(r => {
      const tipo = r.tipo || 'Sin tipo';
      grupos[tipo] = (grupos[tipo] || 0) + Number(r.monto || 0);
    });
    const labels = Object.keys(grupos);
    const values = Object.values(grupos);

    const ctx = document.getElementById('chartCategorias').getContext('2d');
    chartInstances.categorias = new Chart(ctx, {
      type: 'bar',
      data: {
        labels,
        datasets: [{
          label: currentCatToggle,
          data: values,
          backgroundColor: currentCatToggle === 'Ingresos' ? '#27AE60' : '#E74C3C',
          borderRadius: 6
        }]
      },
      options: {
        responsive: true,
        indexAxis: 'y',
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: ctx => fmt(ctx.raw) } }
        },
        scales: {
          x: { beginAtZero: true, ticks: { callback: v => '$ ' + v.toLocaleString('es-AR') } }
        }
      }
    });
  }

  function getCapitalPeriod() {
    const val = document.getElementById('filterCapitalPeriodo').value;
    if (!val) return null;
    const [y, m] = val.split('-').map(Number);
    return { year: y, month: m };
  }

  function getSelectedCurrency() {
    const active = document.querySelector('.currency-toggle .active');
    return active ? active.dataset.currency : 'ARS';
  }

  function setupCurrencyToggle() {
    document.querySelectorAll('[data-currency]').forEach(btn => {
      btn.addEventListener('click', function () {
        document.querySelectorAll('[data-currency]').forEach(b => b.classList.remove('active'));
        this.classList.add('active');
        updateCapitalCharts();
      });
    });
  }

  function updateCapitalCharts() {
    destroyChart('capitalDist');
    destroyChart('capitalCrecimiento');

    const cf = data.capital_financiero || [];
    const period = getCapitalPeriod();
    const currency = getSelectedCurrency();
    const filtered = period ? filterByPeriod(cf, period.year, period.month) : cf;

    if (!filtered.length) return;
    const record = filtered[filtered.length - 1];
    const rate = record.cotizacion_usd || 1;

    let liq = Number(record.liquidez || 0);
    let fci = Number(record.fci || 0);
    let pf = Number(record.plazo_fijo || 0);
    let int = Number(record.intereses_devengados || 0);

    if (currency === 'USD') {
      liq = liq / rate;
      fci = fci / rate;
      pf = pf / rate;
      int = int / rate;
    }

    const formatVal = currency === 'USD' ? v => fmtUSD(v, 1) : fmt;

    const ctx1 = document.getElementById('chartCapitalDist').getContext('2d');
    chartInstances.capitalDist = new Chart(ctx1, {
      type: 'doughnut',
      data: {
        labels: ['Liquidez', 'FCI', 'Plazo Fijo'],
        datasets: [{
          data: [liq, fci, pf],
          backgroundColor: ['#3498DB', '#9B59B6', '#E67E22'],
          borderWidth: 0
        }]
      },
      options: {
        responsive: true,
        plugins: {
          legend: { position: 'bottom', labels: { usePointStyle: true, padding: 14 } },
          tooltip: { callbacks: { label: ctx => ctx.label + ': ' + formatVal(ctx.raw) } }
        }
      }
    });

    const ctx2 = document.getElementById('chartCapitalCrecimiento').getContext('2d');
    const labels = cf.map(r => MONTHS[new Date(r.fecha).getMonth()] + ' ' + new Date(r.fecha).getFullYear());
    const totalData = cf.map(r => {
      let t = Number(r.liquidez || 0) + Number(r.fci || 0) + Number(r.plazo_fijo || 0);
      return currency === 'USD' ? t / (r.cotizacion_usd || 1) : t;
    });
    const intData = cf.map(r => {
      let i = Number(r.intereses_devengados || 0);
      return currency === 'USD' ? i / (r.cotizacion_usd || 1) : i;
    });

    chartInstances.capitalCrecimiento = new Chart(ctx2, {
      type: 'bar',
      data: {
        labels,
        datasets: [
          { label: 'Capital Total', data: totalData, backgroundColor: '#1ABC9C', borderRadius: 4 },
          { label: 'Intereses Devengados', data: intData, backgroundColor: '#F39C12', borderRadius: 4 }
        ]
      },
      options: {
        responsive: true,
        plugins: {
          legend: { position: 'top', labels: { usePointStyle: true } },
          tooltip: { callbacks: { label: ctx => ctx.dataset.label + ': ' + formatVal(ctx.raw) } }
        },
        scales: {
          y: { beginAtZero: true, ticks: { callback: v => currency === 'USD' ? 'USD ' + v.toLocaleString('es-AR') : '$ ' + v.toLocaleString('es-AR') } }
        }
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', loadData);
  } else {
    loadData();
  }
})();
