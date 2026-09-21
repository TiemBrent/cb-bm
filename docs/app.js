import { BenchmarkRunner } from './benchmarks/runner.js';
import { ExtensionBridge } from './extension-bridge.js';
import { ScoringEngine } from './scoring.js';
import { ResultsDashboard } from './dashboard.js';
import { FeatureDetector } from './benchmarks/features.js';
import { BenchmarkHistory } from './benchmarks/history.js';

class BenchmarkApp {
  constructor() {
    this.runner = new BenchmarkRunner('full');
    this.bridge = new ExtensionBridge();
    this.scoring = new ScoringEngine();
    this.dashboard = new ResultsDashboard();
    this.history = new BenchmarkHistory();
    this.mode = 'full';
    this.telemetryData = [];
    this.baselineData = null;
    this.features = null;

    this.runBtn = document.getElementById('run-benchmarks');
    this.connectBtn = document.getElementById('connect-extension');
    this.extStatus = document.getElementById('extension-status');
    this.progressContainer = document.getElementById('progress-container');
    this.progressFill = document.getElementById('progress-fill');
    this.progressText = document.getElementById('progress-text');
    this.resultsSection = document.getElementById('results');
    this.detailsSection = document.getElementById('details');
    this.exportBtn = document.getElementById('export-results');
    this.exportCsvBtn = document.getElementById('export-csv');
    this.modeSelect = document.getElementById('benchmark-mode');
    this.abortBtn = document.getElementById('abort-benchmarks');
    this.pauseBtn = document.getElementById('pause-benchmarks');
    this.telemetryContainer = document.getElementById('telemetry-container');
    this.cpuTempEl = document.getElementById('cpu-temp');
    this.cpuUtilEl = document.getElementById('cpu-util');
    this.currentFpsEl = document.getElementById('current-fps');
    this.baselineSection = document.getElementById('baseline');
    this.compatSection = document.getElementById('compatibility');
    this.historySection = document.getElementById('history');
    this.historyContent = document.getElementById('history-content');
    this.debugMode = false;
    this.debugBtn = document.getElementById('debug-mode');

    this.init();
  }

  async init() {
    this.runBtn.addEventListener('click', () => this.runBenchmarks());
    this.connectBtn.addEventListener('click', () => this.connectExtension());
    this.exportBtn.addEventListener('click', () => this.exportResults());
    this.exportCsvBtn.addEventListener('click', () => this.exportCSV());
    this.abortBtn.addEventListener('click', () => this.abortBenchmarks());
    this.pauseBtn.addEventListener('click', () => this.togglePause());
    this.modeSelect.addEventListener('change', (e) => this.setMode(e.target.value));
    this.debugBtn.addEventListener('click', () => this.toggleDebugMode());

    this.bridge.onStatusChange = (connected) => this.updateExtensionStatus(connected);
    this.bridge.onSystemInfo = (info) => this.dashboard.setSystemInfo(info);
    this.bridge.onTelemetry = (telemetry) => this.handleTelemetry(telemetry);

    await this.bridge.init();
    this.renderModeOptions();
    await this.detectFeatures();
    await this.loadHistory();
  }

  async detectFeatures() {
    this.features = await FeatureDetector.detectAll();
    this.renderCompatibilityTable();
  }

  renderCompatibilityTable() {
    if (!this.compatSection) return;
    this.compatSection.innerHTML = FeatureDetector.renderCompatibilityTable(this.features);
    this.compatSection.classList.remove('hidden');
  }

  async loadHistory() {
    await this.history.init();
    const runs = await this.history.getAllRuns();
    if (runs.length > 0) {
      this.historySection.classList.remove('hidden');
      this.renderHistory(runs);
    }
  }

  renderHistory(runs) {
    if (!this.historyContent) return;
    
    const recentRuns = runs.slice(0, 10);
    this.historyContent.innerHTML = `
      <h3>Previous Runs (${runs.length} total)</h3>
      <table class="detail-table">
        <thead>
          <tr><th>Date</th><th>Mode</th><th>Final Score</th><th>Tier</th><th>Actions</th></tr>
        </thead>
        <tbody>
          ${recentRuns.map(run => {
            const tier = this.scoring.getTier(run.finalScore || 0);
            const date = new Date(run.timestamp).toLocaleString();
            return `
              <tr>
                <td>${date}</td>
                <td>${run.mode || 'full'}</td>
                <td>${run.finalScore || 0}</td>
                <td style="color: ${tier.color}">${tier.label}</td>
                <td>
                  <button class="btn secondary" style="padding: 0.25rem 0.5rem; font-size: 0.75rem;" onclick="app.compareWithRun(${run.id})">Compare</button>
                  <button class="btn secondary" style="padding: 0.25rem 0.5rem; font-size: 0.75rem; background: var(--danger);" onclick="app.deleteRun(${run.id})">Delete</button>
                </td>
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>
    `;
    
    window.app = this;
  }

  async compareWithRun(runId) {
    const runs = await this.history.getAllRuns();
    const run = runs.find(r => r.id === runId);
    if (!run) return;

    const currentData = this.dashboard.getExportData();
    if (!currentData) {
      alert('Run a benchmark first to compare');
      return;
    }

    const comparison = await this.history.compareWithLatest(currentData);
    if (!comparison) return;

    this.showComparison(comparison);
  }

  showComparison(comparison) {
    const content = document.getElementById('detail-content');
    if (!content) return;

    const panel = document.getElementById('detail-comparison') || document.createElement('div');
    panel.id = 'detail-comparison';
    panel.className = 'detail-panel active';
    
    let html = '<h3>Comparison with Previous Run</h3>';
    html += '<table class="detail-table"><thead><tr><th>Category</th><th>Current</th><th>Previous</th><th>Change</th><th>% Change</th></tr></tbody>';
    
    for (const [catId, diff] of Object.entries(comparison.differences)) {
      const changeClass = diff.difference > 0 ? 'good' : diff.difference < 0 ? 'poor' : '';
      const sign = diff.difference > 0 ? '+' : '';
      html += `
        <tr>
          <td>${diff.label}</td>
          <td>${diff.current}</td>
          <td>${diff.previous}</td>
          <td class="${changeClass}">${sign}${diff.difference}</td>
          <td class="${changeClass}">${sign}${diff.percentChange}%</td>
        </tr>
      `;
    }
    html += '</table>';
    
    panel.innerHTML = html;
    content.appendChild(panel);
    
    const tabsContainer = document.getElementById('detail-tabs');
    const tab = document.createElement('button');
    tab.className = 'detail-tab active';
    tab.textContent = 'Comparison';
    tab.dataset.target = 'comparison';
    tab.addEventListener('click', () => this.switchTab('comparison'));
    tabsContainer.appendChild(tab);
    
    document.querySelectorAll('.detail-tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    document.querySelectorAll('.detail-panel').forEach(p => p.classList.remove('active'));
    panel.classList.add('active');
  }

  async deleteRun(runId) {
    if (!confirm('Delete this run?')) return;
    await this.history.deleteRun(runId);
    const runs = await this.history.getAllRuns();
    this.renderHistory(runs);
  }

  renderModeOptions() {
    if (!this.modeSelect) return;
    this.modeSelect.innerHTML = `
      <option value="quick">Quick Test (~1-2 min)</option>
      <option value="full" selected>Full Benchmark (~5-10 min)</option>
      <option value="stress">Stress Test (~15-20 min)</option>
    `;
  }

  updateExtensionStatus(connected) {
    this.extStatus.textContent = connected ? 'Extension: Connected' : 'Extension: Disconnected';
    this.extStatus.className = `status-badge ${connected ? 'connected' : 'disconnected'}`;
    this.runBtn.disabled = !connected;
    this.connectBtn.textContent = connected ? 'Disconnect Extension' : 'Connect Extension';
    
    if (connected) {
      this.modeSelect.disabled = false;
    } else {
      this.modeSelect.disabled = true;
    }
  }

  async connectExtension() {
    if (this.bridge.connected) {
      await this.bridge.disconnect();
    } else {
      try {
        await this.bridge.connect();
      } catch (error) {
        alert(`Failed to connect: ${error.message}`);
      }
    }
  }

  setMode(mode) {
    this.mode = mode;
    this.runner.setMode(mode);
  }

  async runBenchmarks() {
    this.runBtn.disabled = true;
    this.abortBtn.disabled = false;
    this.pauseBtn.disabled = false;
    this.pauseBtn.textContent = 'Pause';
    this.progressContainer.classList.remove('hidden');
    this.resultsSection.classList.add('hidden');
    this.detailsSection.classList.add('hidden');
    this.telemetryContainer.classList.remove('hidden');
    this.telemetryData = [];

    this.runner.onProgress = (progress, message, benchId) => {
      this.progressFill.style.width = `${progress}%`;
      this.progressText.textContent = message;
      this.updateTelemetryUI();
    };

    try {
      if (this.bridge.connected) {
        await this.bridge.send({ type: 'KEEP_AWAKE', payload: true });
        await this.bridge.startMonitoring(1000);
      }

      this.baselineData = await this.runner.runBaseline();
      this.renderBaseline();

      const websiteResults = await this.runner.runAll();
      let extensionResults = null;

      if (this.bridge.connected) {
        extensionResults = await this.bridge.requestSystemInfo();
      }

      if (this.bridge.connected) {
        await this.bridge.stopMonitoring();
      }

      const scores = this.scoring.calculate(websiteResults);
      const finalScore = this.scoring.getFinalScore(scores);

      const runData = {
        scores,
        finalScore,
        websiteResults,
        extensionResults,
        baseline: this.baselineData,
        telemetry: this.telemetryData,
        timestamp: Date.now(),
        mode: this.mode,
        version: '1.0.0'
      };

      await this.history.saveRun(runData);

      this.dashboard.render(runData);

      this.resultsSection.classList.remove('hidden');
      this.detailsSection.classList.remove('hidden');
      this.progressContainer.classList.add('hidden');
      this.runBtn.disabled = false;
      this.abortBtn.disabled = true;
      this.pauseBtn.disabled = true;

      await this.loadHistory();

    } catch (error) {
      console.error('Benchmark error:', error);
      this.progressText.textContent = `Error: ${error.message}`;
      this.runBtn.disabled = false;
      this.abortBtn.disabled = true;
      this.pauseBtn.disabled = true;
    } finally {
      if (this.bridge.connected) {
        await this.bridge.send({ type: 'KEEP_AWAKE', payload: false }).catch(() => {});
        await this.bridge.stopMonitoring().catch(() => {});
      }
    }
  }

  abortBenchmarks() {
    this.runner.abort();
    this.progressText.textContent = 'Aborting...';
    this.abortBtn.disabled = true;
  }

  async togglePause() {
    if (this.runner.paused) {
      this.runner.resume();
      this.pauseBtn.textContent = 'Pause';
    } else {
      await this.runner.pause();
      this.pauseBtn.textContent = 'Resume';
      this.progressText.textContent = 'Paused';
    }
  }

  handleTelemetry(telemetry) {
    this.telemetryData.push(telemetry);
    if (this.telemetryData.length > 300) {
      this.telemetryData.shift();
    }
  }

  updateTelemetryUI() {
    if (this.telemetryData.length === 0) return;

    const latest = this.telemetryData[this.telemetryData.length - 1];

    if (latest.temperature && latest.temperature.supported && latest.temperature.temperatures) {
      const temps = latest.temperature.temperatures;
      const maxTemp = Math.max(...temps);
      this.cpuTempEl.textContent = `${maxTemp}°C`;
      this.cpuTempEl.style.color = maxTemp > 80 ? '#f85149' : maxTemp > 60 ? '#d29922' : '#3fb950';
    } else {
      this.cpuTempEl.textContent = 'N/A';
    }

    if (latest.utilization && latest.utilization.supported) {
      this.cpuUtilEl.textContent = `${latest.utilization.totalUtilization.toFixed(1)}%`;
    } else {
      this.cpuUtilEl.textContent = 'N/A';
    }

    if (latest.power && latest.power.level !== undefined) {
      this.cpuUtilEl.textContent = `${latest.utilization?.totalUtilization?.toFixed(1) || 'N/A'}%`;
      const powerEl = document.getElementById('power-state');
      if (powerEl) {
        powerEl.textContent = latest.power.charging ? 'AC' : 'Battery';
        powerEl.style.color = latest.power.charging ? '#3fb950' : '#d29922';
      }
    }

    if (this.currentFpsEl && latest.timestamp) {
      this.currentFpsEl.textContent = '—';
    }
  }

  renderBaseline() {
    if (!this.baselineSection || !this.baselineData) return;

    this.baselineSection.classList.remove('hidden');
    this.baselineSection.innerHTML = `
      <h3>Baseline Measurements</h3>
      <div class="baseline-grid">
        <div class="info-item">
          <div class="info-label">CPU Idle Latency</div>
          <div class="info-value">${this.baselineData.cpuIdle.avg.toFixed(2)} ms</div>
        </div>
        <div class="info-item">
          <div class="info-label">Refresh Rate</div>
          <div class="info-value">${this.baselineData.refreshRate.rate.toFixed(1)} Hz</div>
        </div>
        <div class="info-item">
          <div class="info-label">Frame Time</div>
          <div class="info-value">${this.baselineData.refreshRate.avgFrameTime.toFixed(2)} ms</div>
        </div>
        ${this.baselineData.memory.supported ? `
        <div class="info-item">
          <div class="info-label">JS Heap Used</div>
          <div class="info-value">${(this.baselineData.memory.usedJSHeapSize / 1e6).toFixed(1)} MB</div>
        </div>
        <div class="info-item">
          <div class="info-label">JS Heap Total</div>
          <div class="info-value">${(this.baselineData.memory.totalJSHeapSize / 1e6).toFixed(1)} MB</div>
        </div>
        ` : ''}
      </div>
    `;
  }

  exportResults() {
    const data = this.dashboard.getExportData();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `chromebook-benchmark-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  exportCSV() {
    const csv = this.dashboard.exportCSV();
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `chromebook-benchmark-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  toggleDebugMode() {
    this.debugMode = !this.debugMode;
    this.debugBtn.textContent = this.debugMode ? 'Debug: ON' : 'Debug: OFF';
    this.debugBtn.style.background = this.debugMode ? 'var(--success)' : 'var(--card-bg)';
    
    if (this.debugMode) {
      this.showDebugPanel();
    } else {
      this.hideDebugPanel();
    }
  }

  showDebugPanel() {
    const panel = document.getElementById('detail-debug') || document.createElement('div');
    panel.id = 'detail-debug';
    panel.className = 'detail-panel active';
    
    const data = this.dashboard.getExportData();
    if (!data) {
      panel.innerHTML = '<p>No data available. Run a benchmark first.</p>';
      return;
    }

    let html = '<h3>Debug Information</h3>';
    html += '<table class="detail-table"><thead><tr><th>Property</th><th>Value</th></tr></tbody>';
    
    html += `<tr><td>Suite Version</td><td>${data.timestamp ? '1.0.0' : 'N/A'}</td></tr>`;
    html += `<tr><td>Run ID</td><td>${data.timestamp || 'N/A'}</td></tr>`;
    html += `<tr><td>Timestamp</td><td>${data.timestamp ? new Date(data.timestamp).toISOString() : 'N/A'}</td></tr>`;
    html += `<tr><td>Mode</td><td>${this.mode}</td></tr>`;
    html += `<tr><td>Extension Connected</td><td>${this.bridge.connected ? 'Yes' : 'No'}</td></tr>`;
    html += `<tr><td>Telemetry Samples</td><td>${this.telemetryData.length}</td></tr>`;
    html += `<tr><td>Final Score</td><td>${data.finalScore || 'N/A'}</td></tr>`;
    
    if (data.scores && data.scores.categories) {
      for (const [id, cat] of Object.entries(data.scores.categories)) {
        if (cat.raw && cat.raw.metrics) {
          html += `<tr><td>${cat.label} - Weight</td><td>${(cat.weight * 100).toFixed(1)}%</td></tr>`;
          html += `<tr><td>${cat.label} - Score</td><td>${cat.score}</td></tr>`;
          html += `<tr><td>${cat.label} - Normalized</td><td>${cat.normalized?.toFixed(2) || 'N/A'}</td></tr>`;
          if (cat.raw.metrics.confidence) {
            html += `<tr><td>${cat.label} - Confidence</td><td>${cat.raw.metrics.confidence}</td></tr>`;
          }
          if (cat.raw.metrics.coefficientOfVariation !== undefined) {
            html += `<tr><td>${cat.label} - CV</td><td>${(cat.raw.metrics.coefficientOfVariation * 100).toFixed(2)}%</td></tr>`;
          }
        }
      }
    }
    
    html += '</table>';
    panel.innerHTML = html;
    
    const content = document.getElementById('detail-content');
    if (content) content.appendChild(panel);
    
    const tabsContainer = document.getElementById('detail-tabs');
    if (tabsContainer) {
      const tab = document.createElement('button');
      tab.className = 'detail-tab active';
      tab.textContent = 'Debug';
      tab.dataset.target = 'debug';
      tab.addEventListener('click', () => this.switchTab('debug'));
      tabsContainer.appendChild(tab);
      
      document.querySelectorAll('.detail-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      document.querySelectorAll('.detail-panel').forEach(p => p.classList.remove('active'));
      panel.classList.add('active');
    }
  }

  hideDebugPanel() {
    const panel = document.getElementById('detail-debug');
    if (panel) panel.remove();
    
    const tabsContainer = document.getElementById('detail-tabs');
    if (tabsContainer) {
      const tab = tabsContainer.querySelector('[data-target="debug"]');
      if (tab) tab.remove();
    }
  }
}

document.addEventListener('DOMContentLoaded', () => new BenchmarkApp());