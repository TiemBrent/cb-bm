const EXTENSION_ID = 'chromebook-benchmark-suite';

export class ExtensionBridge {
  constructor() {
    this.connected = false;
    this.port = null;
    this.onStatusChange = null;
    this.onSystemInfo = null;
    this.onTelemetry = null;
    this.pendingRequests = new Map();
    this.requestId = 0;
    this.extensionId = null;
  }

  async init() {
    if (chrome.runtime && chrome.runtime.id) {
      this.extensionId = chrome.runtime.id;
    } else {
      this.extensionId = EXTENSION_ID;
    }
  }

  async connect() {
    if (this.connected) return;

    try {
      this.port = chrome.runtime.connect(this.extensionId, { name: 'benchmark' });
      
      this.port.onMessage.addListener((msg) => this.handleMessage(msg));
      this.port.onDisconnect.addListener(() => this.handleDisconnect());

      await this.send({ type: 'PING' });
      
      this.connected = true;
      this.onStatusChange?.(true);
    } catch (error) {
      console.error('Extension connection failed:', error);
      this.handleDisconnect();
      throw error;
    }
  }

  async disconnect() {
    if (this.port) {
      this.port.disconnect();
      this.port = null;
    }
    this.connected = false;
    this.onStatusChange?.(false);
  }

  async requestSystemInfo() {
    return this.send({ type: 'GET_SYSTEM_INFO' });
  }

  async requestKeepAwake(enabled) {
    return this.send({ type: 'KEEP_AWAKE', payload: enabled });
  }

  async startMonitoring(interval = 1000) {
    return this.send({ type: 'START_MONITORING', payload: { interval } });
  }

  async stopMonitoring() {
    return this.send({ type: 'STOP_MONITORING' });
  }

  async requestCPUTemperature() {
    return this.send({ type: 'GET_CPU_TEMPERATURE' });
  }

  async requestCPUUtilization() {
    return this.send({ type: 'GET_CPU_UTILIZATION' });
  }

  async requestPowerInfo() {
    return this.send({ type: 'GET_POWER_INFO' });
  }

  async send(message) {
    if (!this.connected || !this.port) {
      throw new Error('Not connected to extension');
    }

    const id = ++this.requestId;
    return new Promise((resolve, reject) => {
      this.pendingRequests.set(id, { resolve, reject, timeout: setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(new Error('Request timeout'));
      }, 30000) });

      this.port.postMessage({ ...message, id });
    });
  }

  handleMessage(message) {
    const { id, type, payload, error } = message;

    if (id && this.pendingRequests.has(id)) {
      const { resolve, reject, timeout } = this.pendingRequests.get(id);
      clearTimeout(timeout);
      this.pendingRequests.delete(id);

      if (error) {
        reject(new Error(error));
      } else {
        resolve(payload);
      }
      return;
    }

    switch (type) {
      case 'READY':
        this.connected = true;
        this.onStatusChange?.(true);
        break;
      case 'SYSTEM_INFO':
        this.onSystemInfo?.(payload);
        break;
      case 'TELEMETRY':
        this.onTelemetry?.(payload);
        break;
    }
  }

  handleDisconnect() {
    this.connected = false;
    this.port = null;
    this.pendingRequests.forEach(({ reject, timeout }) => {
      clearTimeout(timeout);
      reject(new Error('Extension disconnected'));
    });
    this.pendingRequests.clear();
    this.onStatusChange?.(false);
  }
}