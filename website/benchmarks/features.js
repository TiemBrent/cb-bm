export class FeatureDetector {
  static async detectAll() {
    const features = {};

    features.webAssembly = this.detectWebAssembly();
    features.webWorkers = this.detectWebWorkers();
    features.webGL = await this.detectWebGL();
    features.webGPU = await this.detectWebGPU();
    features.offscreenCanvas = this.detectOffscreenCanvas();
    features.webCodecs = this.detectWebCodecs();
    features.webAudio = this.detectWebAudio();
    features.indexedDB = this.detectIndexedDB();
    features.cacheAPI = this.detectCacheAPI();
    features.performanceObserver = this.detectPerformanceObserver();
    features.sharedArrayBuffer = this.detectSharedArrayBuffer();
    features.simd = this.detectSIMD();
    features.battery = await this.detectBattery();
    features.connection = this.detectConnection();
    features.deviceMemory = this.detectDeviceMemory();
    features.hardwareConcurrency = this.detectHardwareConcurrency();
    features.cpuTemperature = await this.detectCPUTemperature();
    features.extension = await this.detectExtension();

    return features;
  }

  static detectWebAssembly() {
    try {
      return { supported: typeof WebAssembly === 'object', status: 'supported' };
    } catch {
      return { supported: false, status: 'unsupported' };
    }
  }

  static detectWebWorkers() {
    return { supported: typeof Worker !== 'undefined', status: typeof Worker !== 'undefined' ? 'supported' : 'unsupported' };
  }

  static async detectWebGL() {
    try {
      const canvas = document.createElement('canvas');
      const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
      if (gl) {
        const ext = gl.getExtension('WEBGL_debug_renderer_info');
        const renderer = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
        const vendor = ext ? gl.getParameter(ext.UNMASKED_VENDOR_WEBGL) : gl.getParameter(gl.VENDOR);
        return { 
          supported: true, 
          status: 'supported',
          renderer,
          vendor,
          version: gl.getParameter(gl.VERSION),
          shadingLanguageVersion: gl.getParameter(gl.SHADING_LANGUAGE_VERSION)
        };
      }
      return { supported: false, status: 'unsupported' };
    } catch {
      return { supported: false, status: 'unsupported' };
    }
  }

  static async detectWebGPU() {
    if (!navigator.gpu) {
      return { supported: false, status: 'unsupported', reason: 'navigator.gpu not available' };
    }
    try {
      const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
      if (adapter) {
        return { 
          supported: true, 
          status: 'supported',
          adapter: adapter.name,
          features: [...adapter.features],
          limits: Object.fromEntries(Object.entries(adapter.limits).map(([k, v]) => [k, v]))
        };
      }
      return { supported: false, status: 'unsupported', reason: 'No adapter found' };
    } catch (e) {
      return { supported: false, status: 'error', reason: e.message };
    }
  }

  static detectOffscreenCanvas() {
    return { supported: typeof OffscreenCanvas !== 'undefined', status: typeof OffscreenCanvas !== 'undefined' ? 'supported' : 'unsupported' };
  }

  static detectWebCodecs() {
    const supported = 'VideoDecoder' in window && 'VideoEncoder' in window;
    return { supported, status: supported ? 'supported' : 'unsupported' };
  }

  static detectWebAudio() {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    const OfflineAudioContext = window.OfflineAudioContext || window.webkitOfflineAudioContext;
    return { 
      supported: !!AudioContext && !!OfflineAudioContext, 
      status: (!!AudioContext && !!OfflineAudioContext) ? 'supported' : 'unsupported',
      audioContext: !!AudioContext,
      offlineAudioContext: !!OfflineAudioContext
    };
  }

  static detectIndexedDB() {
    return { supported: typeof indexedDB !== 'undefined', status: typeof indexedDB !== 'undefined' ? 'supported' : 'unsupported' };
  }

  static detectCacheAPI() {
    return { supported: typeof caches !== 'undefined', status: typeof caches !== 'undefined' ? 'supported' : 'unsupported' };
  }

  static detectPerformanceObserver() {
    return { supported: typeof PerformanceObserver !== 'undefined', status: typeof PerformanceObserver !== 'undefined' ? 'supported' : 'unsupported' };
  }

  static detectSharedArrayBuffer() {
    return { supported: typeof SharedArrayBuffer !== 'undefined', status: typeof SharedArrayBuffer !== 'undefined' ? 'supported' : 'unsupported' };
  }

  static detectSIMD() {
    return { supported: false, status: 'unsupported', reason: 'SIMD not exposed in JS' };
  }

  static async detectBattery() {
    try {
      const battery = await navigator.getBattery();
      return { supported: true, status: 'supported', level: battery.level, charging: battery.charging };
    } catch {
      return { supported: false, status: 'unsupported' };
    }
  }

  static detectConnection() {
    const conn = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    return { 
      supported: !!conn, 
      status: conn ? 'supported' : 'unsupported',
      effectiveType: conn?.effectiveType,
      downlink: conn?.downlink,
      rtt: conn?.rtt,
      saveData: conn?.saveData
    };
  }

  static detectDeviceMemory() {
    return { supported: 'deviceMemory' in navigator, status: 'deviceMemory' in navigator ? 'supported' : 'unsupported', value: navigator.deviceMemory };
  }

  static detectHardwareConcurrency() {
    return { supported: true, status: 'supported', value: navigator.hardwareConcurrency };
  }

  static async detectCPUTemperature() {
    if (typeof chrome !== 'undefined' && chrome.system && chrome.system.cpu) {
      try {
        const info = await new Promise(resolve => chrome.system.cpu.getInfo(resolve));
        return { supported: !!(info.temperatures && info.temperatures.length > 0), status: (info.temperatures && info.temperatures.length > 0) ? 'supported' : 'unsupported' };
      } catch {
        return { supported: false, status: 'error' };
      }
    }
    return { supported: false, status: 'extension_required' };
  }

  static async detectExtension() {
    if (typeof chrome !== 'undefined' && chrome.runtime) {
      try {
        const response = await chrome.runtime.sendMessage('chromebook-benchmark-suite', { type: 'PING' });
        return { supported: !!response, status: response ? 'connected' : 'not_connected' };
      } catch {
        return { supported: false, status: 'not_installed' };
      }
    }
    return { supported: false, status: 'not_available' };
  }

  static renderCompatibilityTable(features) {
    const rows = Object.entries(features).map(([key, value]) => {
      const statusIcon = value.supported ? '✓' : '✕';
      const statusClass = value.supported ? 'supported' : 'unsupported';
      const statusText = value.status || (value.supported ? 'Supported' : 'Unsupported');
      const details = this.formatFeatureDetails(value);
      
      return `
        <tr class="${statusClass}">
          <td>${this.formatKey(key)}</td>
          <td class="status-${statusClass}">${statusIcon} ${statusText}</td>
          <td>${details}</td>
        </tr>
      `;
    }).join('');

    return `
      <table class="detail-table compatibility-table">
        <thead>
          <tr><th>Feature</th><th>Status</th><th>Details</th></tr>
        </thead>
        <tbody>
          ${rows}
        </tbody>
      </table>
    `;
  }

  static formatFeatureDetails(value) {
    const details = [];
    if (value.renderer) details.push(`Renderer: ${value.renderer}`);
    if (value.vendor) details.push(`Vendor: ${value.vendor}`);
    if (value.version) details.push(`Version: ${value.version}`);
    if (value.adapter) details.push(`Adapter: ${value.adapter}`);
    if (value.value !== undefined) details.push(`Value: ${value.value}`);
    if (value.level !== undefined) details.push(`Level: ${Math.round(value.level * 100)}%`);
    if (value.charging !== undefined) details.push(`Charging: ${value.charging ? 'Yes' : 'No'}`);
    if (value.effectiveType) details.push(`Type: ${value.effectiveType}`);
    if (value.downlink) details.push(`Downlink: ${value.downlink} Mbps`);
    if (value.reason) details.push(`Reason: ${value.reason}`);
    return details.join(' | ');
  }

  static formatKey(key) {
    return key.replace(/([A-Z])/g, ' $1').replace(/^./, c => c.toUpperCase());
  }
}