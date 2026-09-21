let keepAwakeRequested = false;
let monitoringInterval = null;
let monitoringPort = null;

chrome.runtime.onConnectExternal.addListener((port) => {
  if (port.name !== 'benchmark') return;

  port.onMessage.addListener(async (message) => {
    try {
      let response;
      switch (message.type) {
        case 'PING':
          response = { type: 'READY' };
          break;
        case 'GET_SYSTEM_INFO':
          response = await getSystemInfo();
          break;
        case 'KEEP_AWAKE':
          response = await setKeepAwake(message.payload);
          break;
        case 'START_MONITORING':
          response = await startMonitoring(port, message.payload);
          break;
        case 'STOP_MONITORING':
          response = await stopMonitoring();
          break;
        case 'GET_CPU_TEMPERATURE':
          response = await getCPUTemperature();
          break;
        case 'GET_CPU_UTILIZATION':
          response = await getCPUUtilization();
          break;
        case 'GET_POWER_INFO':
          response = await getPowerInfo();
          break;
        default:
          response = { error: `Unknown message type: ${message.type}` };
      }
      port.postMessage({ id: message.id, type: message.type, payload: response });
    } catch (error) {
      port.postMessage({ id: message.id, type: message.type, error: error.message });
    }
  });

  port.onDisconnect.addListener(() => {
    if (keepAwakeRequested) {
      chrome.power.releaseKeepAwake();
      keepAwakeRequested = false;
    }
    stopMonitoring();
  });

  port.postMessage({ type: 'READY' });
});

async function getSystemInfo() {
  const info = {};

  try {
    info.cpu = await getCPUInfo();
  } catch (e) {
    info.cpu = { error: e.message };
  }

  try {
    info.memory = await getMemoryInfo();
  } catch (e) {
    info.memory = { error: e.message };
  }

  try {
    info.storage = await getStorageInfo();
  } catch (e) {
    info.storage = { error: e.message };
  }

  try {
    info.display = await getDisplayInfo();
  } catch (e) {
    info.display = { error: e.message };
  }

  try {
    info.platform = await getPlatformInfo();
  } catch (e) {
    info.platform = { error: e.message };
  }

  try {
    info.battery = await getBatteryInfo();
  } catch (e) {
    info.battery = { error: e.message, supported: false };
  }

  try {
    info.power = await getPowerInfo();
  } catch (e) {
    info.power = { error: e.message };
  }

  try {
    info.cpuTemperature = await getCPUTemperature();
  } catch (e) {
    info.cpuTemperature = { error: e.message, supported: false };
  }

  try {
    info.cpuUtilization = await getCPUUtilization();
  } catch (e) {
    info.cpuUtilization = { error: e.message };
  }

  return info;
}

function getCPUInfo() {
  return new Promise((resolve) => {
    chrome.system.cpu.getInfo((cpuInfo) => {
      resolve({
        modelName: cpuInfo.modelName,
        architecture: cpuInfo.archName,
        numOfProcessors: cpuInfo.numOfProcessors,
        features: cpuInfo.features,
        processorUsage: cpuInfo.processors.map(p => ({
          usage: p.usage,
          total: p.total
        }))
      });
    });
  });
}

async function getCPUTemperature() {
  return new Promise((resolve) => {
    chrome.system.cpu.getInfo((cpuInfo) => {
      if (cpuInfo.temperatures && cpuInfo.temperatures.length > 0) {
        resolve({
          supported: true,
          temperatures: cpuInfo.temperatures,
          timestamp: Date.now()
        });
      } else {
        resolve({
          supported: false,
          error: 'CPU temperature not exposed by ChromeOS API'
        });
      }
    });
  });
}

async function getCPUUtilization() {
  return new Promise((resolve) => {
    chrome.system.cpu.getInfo((cpuInfo) => {
      const processors = cpuInfo.processors || [];
      const totalUsage = processors.reduce((sum, p) => sum + (p.usage || 0), 0);
      const avgUsage = processors.length > 0 ? totalUsage / processors.length : 0;
      const idle = processors.reduce((sum, p) => sum + (p.total - p.usage || 0), 0) / (processors.length || 1);

      resolve({
        supported: true,
        totalUtilization: avgUsage,
        perProcessor: processors.map(p => ({
          usage: p.usage,
          total: p.total,
          idle: p.total - p.usage
        })),
        idlePercentage: idle,
        timestamp: Date.now()
      });
    });
  });
}

async function getPowerInfo() {
  try {
    const battery = await navigator.getBattery();
    return {
      level: battery.level,
      charging: battery.charging,
      chargingTime: battery.chargingTime,
      dischargingTime: battery.dischargingTime,
      onAC: battery.charging || battery.level === 1
    };
  } catch (e) {
    return { error: e.message, supported: false };
  }
}

function getMemoryInfo() {
  return new Promise((resolve) => {
    chrome.system.memory.getInfo((memInfo) => {
      resolve({
        total: memInfo.capacity,
        available: memInfo.availableCapacity
      });
    });
  });
}

function getStorageInfo() {
  return new Promise((resolve) => {
    chrome.system.storage.getInfo((storageInfo) => {
      resolve(storageInfo.map(device => ({
        id: device.id,
        name: device.name,
        type: device.type,
        capacity: device.capacity
      })));
    });
  });
}

function getDisplayInfo() {
  return new Promise((resolve) => {
    chrome.system.display.getInfo((displays) => {
      resolve(displays.map(d => ({
        id: d.id,
        name: d.name,
        isPrimary: d.isPrimary,
        bounds: d.bounds,
        workArea: d.workArea,
        deviceScaleFactor: d.deviceScaleFactor,
        rotation: d.rotation
      })));
    });
  });
}

function getPlatformInfo() {
  return new Promise((resolve) => {
    chrome.runtime.getPlatformInfo((info) => {
      resolve({
        os: info.os,
        arch: info.arch,
        naclArch: info.naclArch
      });
    });
  });
}

async function setKeepAwake(enabled) {
  if (enabled) {
    chrome.power.requestKeepAwake('system');
    keepAwakeRequested = true;
  } else if (keepAwakeRequested) {
    chrome.power.releaseKeepAwake();
    keepAwakeRequested = false;
  }
  return { keepAwake: keepAwakeRequested };
}

async function startMonitoring(port, options = {}) {
  if (monitoringInterval) {
    return { error: 'Monitoring already active' };
  }

  monitoringPort = port;
  const interval = options.interval || 1000;

  monitoringInterval = setInterval(async () => {
    if (!monitoringPort) return;

    const tempData = await getCPUTemperature();
    const utilData = await getCPUUtilization();
    const powerData = await getPowerInfo();

    monitoringPort.postMessage({
      type: 'TELEMETRY',
      payload: {
        timestamp: Date.now(),
        temperature: tempData,
        utilization: utilData,
        power: powerData
      }
    });
  }, interval);

  return { monitoring: true, interval };
}

async function stopMonitoring() {
  if (monitoringInterval) {
    clearInterval(monitoringInterval);
    monitoringInterval = null;
  }
  monitoringPort = null;
  return { monitoring: false };
}

chrome.runtime.onInstalled.addListener(() => {
  console.log('Chromebook Benchmark Suite extension installed');
});