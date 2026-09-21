export class ResultsDashboard {
  constructor() {
    this.data = null;
  }

  setSystemInfo(info) {
    this.systemInfo = info;
    this.renderSystemInfo();
  }

  render({ scores, finalScore, websiteResults, extensionResults, baseline, telemetry, timestamp }) {
    this.data = { scores, finalScore, websiteResults, extensionResults, baseline, telemetry, timestamp };

    this.renderScoreSummary(finalScore);
    this.renderCategoryBreakdown(scores.categories);
    this.renderCharts(scores.categories);
    this.renderSystemInfo();
    this.renderTelemetryCharts(telemetry);
    this.renderDetails(websiteResults, extensionResults, baseline);
  }

  renderScoreSummary(finalScore) {
    const tier = this.getTier(finalScore);
    document.getElementById('final-score').textContent = finalScore;
    document.getElementById('score-tier').textContent = tier.label;
    document.getElementById('score-tier').style.color = tier.color;
  }

  renderCategoryBreakdown(categories) {
    const container = document.getElementById('category-breakdown');
    container.innerHTML = '';

    const sortedEntries = Object.entries(categories).sort((a, b) => b[1].weight - a[1].weight);

    for (const [id, cat] of sortedEntries) {
      const card = document.createElement('div');
      card.className = 'category-card';
      const statusClass = cat.error ? 'error' : cat.score >= 80 ? 'good' : cat.score >= 50 ? 'medium' : 'poor';
      card.innerHTML = `
        <div class="category-name">${cat.label}</div>
        <div class="category-score ${statusClass}">${cat.score}</div>
        <div class="category-weight">Weight: ${Math.round(cat.weight * 100)}%</div>
        ${cat.error ? `<div class="category-error" style="color: var(--warning); font-size: 0.75rem;">${cat.error}</div>` : ''}
      `;
      container.appendChild(card);
    }
  }

  renderCharts(categories) {
    const canvas = document.getElementById('radar-chart');
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    canvas.width = canvas.offsetWidth * dpr;
    canvas.height = 300 * dpr;
    ctx.scale(dpr, dpr);

    const validCategories = Object.entries(categories).filter(([_, c]) => c.score > 0 || c.error);
    const labels = validCategories.map(([_, c]) => c.label);
    const data = validCategories.map(([_, c]) => c.score);
    const centerX = canvas.width / 2 / dpr;
    const centerY = canvas.height / 2 / dpr;
    const radius = Math.min(centerX, centerY) - 30;

    ctx.clearRect(0, 0, canvas.width / dpr, canvas.height / dpr);

    ctx.strokeStyle = '#30363d';
    ctx.lineWidth = 1;
    for (let i = 1; i <= 5; i++) {
      const r = (radius / 5) * i;
      ctx.beginPath();
      ctx.arc(centerX, centerY, r, 0, Math.PI * 2);
      ctx.stroke();
    }

    const angleStep = (Math.PI * 2) / labels.length;
    ctx.beginPath();
    for (let i = 0; i < labels.length; i++) {
      const angle = i * angleStep - Math.PI / 2;
      const x = centerX + Math.cos(angle) * radius;
      const y = centerY + Math.sin(angle) * radius;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.stroke();

    ctx.fillStyle = 'rgba(88, 166, 255, 0.2)';
    ctx.beginPath();
    for (let i = 0; i < data.length; i++) {
      const angle = i * angleStep - Math.PI / 2;
      const r = (data[i] / 100) * radius;
      const x = centerX + Math.cos(angle) * r;
      const y = centerY + Math.sin(angle) * r;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = '#58a6ff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = 0; i < data.length; i++) {
      const angle = i * angleStep - Math.PI / 2;
      const r = (data[i] / 100) * radius;
      const x = centerX + Math.cos(angle) * r;
      const y = centerY + Math.sin(angle) * r;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.stroke();

    ctx.fillStyle = '#e6edf3';
    ctx.font = '11px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (let i = 0; i < labels.length; i++) {
      const angle = i * angleStep - Math.PI / 2;
      const x = centerX + Math.cos(angle) * (radius + 15);
      const y = centerY + Math.sin(angle) * (radius + 15);
      ctx.fillText(labels[i], x, y);
    }
  }

  renderTelemetryCharts(telemetry) {
    const container = document.getElementById('telemetry-charts');
    if (!telemetry || telemetry.length === 0) {
      container.classList.add('hidden');
      return;
    }

    container.classList.remove('hidden');

    const tempData = telemetry
      .filter(t => t.temperature && t.temperature.supported && t.temperature.temperatures)
      .map(t => ({
        time: (t.timestamp - telemetry[0].timestamp) / 1000,
        temp: Math.max(...t.temperature.temperatures)
      }));

    const utilData = telemetry
      .filter(t => t.utilization && t.utilization.supported)
      .map(t => ({
        time: (t.timestamp - telemetry[0].timestamp) / 1000,
        util: t.utilization.totalUtilization
      }));

    if (tempData.length > 0) {
      this.drawTimeSeriesChart('thermal-chart', tempData, 'CPU Temperature (°C)', '#f85149', 'Temperature Over Time');
    }

    if (utilData.length > 0) {
      this.drawTimeSeriesChart('performance-chart', utilData, 'CPU Utilization (%)', '#58a6ff', 'CPU Utilization Over Time');
    }
  }

  drawTimeSeriesChart(canvasId, data, yLabel, color, title) {
    let canvas = document.getElementById(canvasId);
    if (!canvas) {
      canvas = document.createElement('canvas');
      canvas.id = canvasId;
      document.getElementById('telemetry-charts').appendChild(canvas);
    }

    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    const width = canvas.offsetWidth || 800;
    const height = 250;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);

    ctx.clearRect(0, 0, width, height);

    const padding = { top: 30, right: 20, bottom: 40, left: 60 };
    const chartWidth = width - padding.left - padding.right;
    const chartHeight = height - padding.top - padding.bottom;

    const times = data.map(d => d.time);
    const values = data.map(d => d[Object.keys(d)[1]]);
    const minTime = Math.min(...times);
    const maxTime = Math.max(...times);
    const minVal = Math.min(...values);
    const maxVal = Math.max(...values);
    const valRange = maxVal - minVal || 1;

    ctx.strokeStyle = '#30363d';
    ctx.lineWidth = 1;
    ctx.font = '11px sans-serif';
    ctx.fillStyle = '#8b949e';

    for (let i = 0; i <= 5; i++) {
      const y = padding.top + (chartHeight / 5) * i;
      ctx.beginPath();
      ctx.moveTo(padding.left, y);
      ctx.lineTo(padding.left + chartWidth, y);
      ctx.stroke();
      const val = maxVal - (valRange / 5) * i;
      ctx.fillText(val.toFixed(1), padding.left - 55, y + 4);
    }

    for (let i = 0; i <= 10; i++) {
      const x = padding.left + (chartWidth / 10) * i;
      ctx.beginPath();
      ctx.moveTo(x, padding.top);
      ctx.lineTo(x, padding.top + chartHeight);
      ctx.stroke();
      const time = minTime + (maxTime - minTime) / 10 * i;
      ctx.fillText(`${time.toFixed(0)}s`, x - 15, padding.top + chartHeight + 20);
    }

    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    data.forEach((d, i) => {
      const x = padding.left + ((d.time - minTime) / (maxTime - minTime || 1)) * chartWidth;
      const y = padding.top + chartHeight - ((d[Object.keys(d)[1]] - minVal) / valRange) * chartHeight;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();

    ctx.fillStyle = color;
    data.forEach(d => {
      const x = padding.left + ((d.time - minTime) / (maxTime - minTime || 1)) * chartWidth;
      const y = padding.top + chartHeight - ((d[Object.keys(d)[1]] - minVal) / valRange) * chartHeight;
      ctx.beginPath();
      ctx.arc(x, y, 3, 0, Math.PI * 2);
      ctx.fill();
    });

    ctx.fillStyle = '#e6edf3';
    ctx.font = '14px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(title, width / 2, 20);
  }

  renderSystemInfo() {
    const container = document.getElementById('system-info');
    const grid = document.getElementById('system-info-grid');

    if (this.systemInfo) {
      grid.innerHTML = '';
      for (const [key, value] of Object.entries(this.systemInfo)) {
        if (value !== undefined && value !== null && key !== 'cpuTemperature' && key !== 'cpuUtilization' && key !== 'power') {
          const item = document.createElement('div');
          item.className = 'info-item';
          item.innerHTML = `
            <div class="info-label">${this.formatKey(key)}</div>
            <div class="info-value">${this.formatValue(value)}</div>
          `;
          grid.appendChild(item);
        }
      }
      container.classList.remove('hidden');
    } else {
      container.classList.add('hidden');
    }
  }

  renderDetails(websiteResults, extensionResults, baseline) {
    const tabsContainer = document.getElementById('detail-tabs');
    const contentContainer = document.getElementById('detail-content');

    tabsContainer.innerHTML = '';
    contentContainer.innerHTML = '';

    const categories = [
      { id: 'cpu', label: 'CPU', results: ['cpu-single', 'cpu-multi', 'cpu-sustained'] },
      { id: 'gpu', label: 'GPU', results: ['gpu-webgl', 'gpu-webgpu', 'gpu-sustained'] },
      { id: 'memory', label: 'Memory', results: ['memory'] },
      { id: 'storage', label: 'Storage', results: ['storage'] },
      { id: 'network', label: 'Network', results: ['network'] },
      { id: 'rendering', label: 'Rendering', results: ['rendering', 'canvas2d', 'offscreen-canvas', 'display'] },
      { id: 'crypto', label: 'Crypto', results: ['crypto'] },
      { id: 'audio', label: 'Audio', results: ['audio'] },
      { id: 'wasm', label: 'WASM', results: ['wasm'] },
      { id: 'video', label: 'Video', results: ['video'] }
    ];

    if (extensionResults) {
      categories.push({ id: 'system', label: 'System', results: ['system'] });
    }

    if (baseline) {
      categories.push({ id: 'baseline', label: 'Baseline', results: ['baseline'] });
    }

    categories.forEach((cat, idx) => {
      const tab = document.createElement('button');
      tab.className = `detail-tab ${idx === 0 ? 'active' : ''}`;
      tab.textContent = cat.label;
      tab.dataset.target = cat.id;
      tab.addEventListener('click', () => this.switchTab(cat.id));
      tabsContainer.appendChild(tab);

      const panel = document.createElement('div');
      panel.className = `detail-panel ${idx === 0 ? 'active' : ''}`;
      panel.id = `detail-${cat.id}`;

      if (cat.id === 'system' && extensionResults) {
        panel.innerHTML = this.renderSystemDetailTable(extensionResults);
      } else if (cat.id === 'baseline' && baseline) {
        panel.innerHTML = this.renderBaselineTable(baseline);
      } else {
        const validResults = cat.results.filter(id => websiteResults[id]);
        if (validResults.length > 0) {
          panel.innerHTML = validResults.map(id => this.renderResultTable(id, websiteResults[id])).join('');
        } else {
          panel.innerHTML = '<p style="color:var(--muted);padding:1rem;">No data available</p>';
        }
      }

      contentContainer.appendChild(panel);
    });
  }

  renderBaselineTable(baseline) {
    return `
      <table class="detail-table">
        <thead><tr><th>Metric</th><th>Value</th></tr></thead>
        <tbody>
          <tr><td>CPU Idle Latency (avg)</td><td>${baseline.cpuIdle.avg.toFixed(2)} ms</td></tr>
          <tr><td>Refresh Rate</td><td>${baseline.refreshRate.rate.toFixed(1)} Hz</td></tr>
          <tr><td>Avg Frame Time</td><td>${baseline.refreshRate.avgFrameTime.toFixed(2)} ms</td></tr>
          ${baseline.memory.supported ? `
          <tr><td>JS Heap Used</td><td>${(baseline.memory.usedJSHeapSize / 1e6).toFixed(1)} MB</td></tr>
          <tr><td>JS Heap Total</td><td>${(baseline.memory.totalJSHeapSize / 1e6).toFixed(1)} MB</td></tr>
          <tr><td>JS Heap Limit</td><td>${(baseline.memory.jsHeapSizeLimit / 1e6).toFixed(1)} MB</td></tr>
          ` : ''}
        </tbody>
      </table>
    `;
  }

  switchTab(id) {
    document.querySelectorAll('.detail-tab').forEach(t => {
      t.classList.toggle('active', t.dataset.target === id);
    });
    document.querySelectorAll('.detail-panel').forEach(p => {
      p.classList.toggle('active', p.id === `detail-${id}`);
    });
  }

  renderResultTable(id, result) {
    if (!result.details) return '';

    let html = `
      <h4 style="margin:1rem 0 0.5rem;color:var(--muted);">${result.name}</h4>
      <table class="detail-table">
        <thead><tr><th>Metric</th><th>Value</th></tr></thead>
        <tbody>
    `;

    for (const [k, v] of Object.entries(result.details)) {
      html += `<tr><td>${this.formatKey(k)}</td><td>${v}</td></tr>`;
    }

    if (result.raw && typeof result.raw === 'object') {
      html += '<tr><td colspan="2"><strong>Raw Timings (ms)</strong></td></tr>';
      for (const [k, v] of Object.entries(result.raw)) {
        if (v !== null && typeof v === 'number') {
          html += `<tr><td>${this.formatKey(k)} (raw)</td><td>${v.toFixed(2)} ms</td></tr>`;
        }
      }
    }

    if (result.metrics) {
      html += '<tr><td colspan="2"><strong>Computed Metrics</strong></td></tr>';
      for (const [k, v] of Object.entries(result.metrics)) {
        html += `<tr><td>${this.formatKey(k)}</td><td>${typeof v === 'number' ? v.toLocaleString() : v}</td></tr>`;
      }
    }

    if (result.samples && Array.isArray(result.samples) && result.samples.length > 0) {
      html += '<tr><td colspan="2"><strong>Individual Samples</strong></td></tr>';
      result.samples.forEach((s, i) => {
        if (typeof s === 'number') {
          html += `<tr><td>Sample ${i + 1}</td><td>${s.toFixed(2)} ms</td></tr>`;
        } else if (s && typeof s === 'object') {
          html += `<tr><td>Sample ${i + 1}</td><td>${JSON.stringify(s)}</td></tr>`;
        }
      });
    }

    html += '</tbody></table>';
    return html;
  }

  renderSystemDetailTable(info) {
    return `
      <table class="detail-table">
        <thead><tr><th>Property</th><th>Value</th></tr></thead>
        <tbody>
          ${Object.entries(info).map(([k, v]) => `
            <tr><td>${this.formatKey(k)}</td><td>${this.formatValue(v)}</td></tr>
          `).join('')}
        </tbody>
      </table>
    `;
  }

  formatKey(key) {
    return key.replace(/([A-Z])/g, ' $1').replace(/^./, c => c.toUpperCase());
  }

  formatValue(value) {
    if (typeof value === 'object') return JSON.stringify(value, null, 2);
    if (typeof value === 'number') return value.toLocaleString();
    return String(value);
  }

  getTier(score) {
    if (score >= 90) return { label: 'Flagship', color: '#ffd700' };
    if (score >= 75) return { label: 'High-End', color: '#c0c0c0' };
    if (score >= 60) return { label: 'Mid-Range', color: '#cd7f32' };
    if (score >= 40) return { label: 'Budget', color: '#8b8b8b' };
    return { label: 'Entry-Level', color: '#666666' };
  }

  getExportData() {
    return this.data;
  }

  exportCSV() {
    if (!this.data) return '';

    const rows = [['Category', 'Benchmark', 'Score', 'Weight', 'Status', 'Details']];
    
    for (const [id, cat] of Object.entries(this.data.scores.categories)) {
      if (cat.raw && cat.raw.details) {
        for (const [metric, value] of Object.entries(cat.raw.details)) {
          rows.push([cat.label, cat.raw.name || id, cat.score, `${Math.round(cat.weight * 100)}%`, cat.raw.status || 'completed', `${metric}: ${value}`]);
        }
      } else {
        rows.push([cat.label, id, cat.score, `${Math.round(cat.weight * 100)}%`, cat.raw?.status || 'unknown', cat.error || '']);
      }
    }

    if (this.data.extensionResults) {
      for (const [key, value] of Object.entries(this.data.extensionResults)) {
        rows.push(['System', key, '', '', 'reported', this.formatValue(value)]);
      }
    }

    return rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
  }
}