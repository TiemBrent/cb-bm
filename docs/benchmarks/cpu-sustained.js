import { BenchmarkUtils, BenchmarkResult } from './utils.js';

const SUSTAINED_DURATION_MS = 5 * 60 * 1000; // 5 minutes default
const SAMPLE_INTERVAL_MS = 2000; // Sample every 2 seconds

const workerCode = `
  self.onmessage = function(e) {
    const { task, data } = e.data;
    
    if (task === 'sustainedLoad') {
      const { duration, intensity } = data;
      const endTime = Date.now() + duration;
      let sum = 0;
      
      while (Date.now() < endTime) {
        for (let i = 0; i < intensity; i++) {
          sum += Math.sin(i) * Math.cos(i) + Math.sqrt(i + 1);
        }
      }
      
      self.postMessage({ task: 'sustainedLoad', result: sum });
    }
  };
`;

function createWorker() {
  const blob = new Blob([workerCode], { type: 'application/javascript' });
  return new Worker(URL.createObjectURL(blob));
}

function runSustainedWorkload(durationMs, intensity = 10000) {
  return new Promise(resolve => {
    const worker = createWorker();
    worker.onmessage = (e) => {
      if (e.data.task === 'sustainedLoad') {
        worker.terminate();
        resolve();
      }
    };
    worker.postMessage({ task: 'sustainedLoad', data: { duration: durationMs, intensity } });
  });
}

function measureBaselinePerformance() {
  const iterations = 100000;
  let sum = 0;
  const start = performance.now();
  for (let i = 0; i < iterations; i++) {
    sum += Math.sin(i) * Math.cos(i) + Math.sqrt(i + 1);
  }
  return performance.now() - start;
}

export async function run(options = {}) {
  const durationMs = options.durationMs || SUSTAINED_DURATION_MS;
  const result = new BenchmarkResult('cpu-sustained', 'CPU Sustained Performance', 'cpu');
  const startTime = performance.now();

  const telemetry = [];
  let monitoringActive = false;

  const baselineTime = measureBaselinePerformance();
  const baselineOps = 100000 / (baselineTime / 1000);

  const perfSamples = [];
  let sampleCount = 0;
  const maxSamples = Math.floor(durationMs / SAMPLE_INTERVAL_MS);

  const intensity = 50000;

  async function runSample() {
    const sampleStart = performance.now();
    await runSustainedWorkload(SAMPLE_INTERVAL_MS, intensity);
    const sampleTime = performance.now() - sampleStart;
    const opsPerSec = intensity / (sampleTime / 1000);
    perfSamples.push({ time: sampleTime, opsPerSec, timestamp: Date.now() });
  }

  const monitorInterval = setInterval(() => {
    // Telemetry will be received via extension bridge
  }, SAMPLE_INTERVAL_MS);

  const totalSamples = Math.floor(durationMs / SAMPLE_INTERVAL_MS);
  
  for (let i = 0; i < totalSamples; i++) {
    if (!monitoringActive) break;
    
    await runSample();
    sampleCount++;
    
    const progress = (sampleCount / totalSamples) * 100;
    if (typeof reportProgress === 'function') {
      reportProgress(progress, `Sustained test: ${sampleCount}/${totalSamples} samples`);
    }
  }

  clearInterval(monitorInterval);

  if (perfSamples.length === 0) {
    result.setFailed('No samples collected');
    return result.toJSON();
  }

  const opsPerSecValues = perfSamples.map(s => s.opsPerSec);
  const initialOps = opsPerSecValues[0];
  const finalOps = opsPerSecValues[opsPerSecValues.length - 1];
  const avgOps = opsPerSecValues.reduce((a, b) => a + b, 0) / opsPerSecValues.length;
  const minOps = Math.min(...opsPerSecValues);
  const maxOps = Math.max(...opsPerSecValues);
  const retention = (finalOps / initialOps) * 100;

  const score = Math.min(100, Math.round(retention));

  const details = {
    duration: `${(durationMs / 60000).toFixed(1)} min`,
    initialPerformance: `${(initialOps / 1e6).toFixed(1)} M ops/s`,
    finalPerformance: `${(finalOps / 1e6).toFixed(1)} M ops/s`,
    averagePerformance: `${(avgOps / 1e6).toFixed(1)} M ops/s`,
    minPerformance: `${(minOps / 1e6).toFixed(1)} M ops/s`,
    maxPerformance: `${(maxOps / 1e6).toFixed(1)} M ops/s`,
    retention: `${retention.toFixed(1)}%`,
    samplesCollected: perfSamples.length,
    baselineOpsPerSec: `${(baselineOps / 1e6).toFixed(1)} M ops/s`
  };

  result.durationMs = performance.now() - startTime;
  result.setCompleted(score, {
    initialOpsPerSec: initialOps,
    finalOpsPerSec: finalOps,
    avgOpsPerSec: avgOps,
    minOpsPerSec: minOps,
    maxOpsPerSec: maxOps,
    retention,
    baselineOpsPerSec: baselineOps,
    samples: perfSamples
  }, details, perfSamples, { durationMs, sampleInterval: SAMPLE_INTERVAL_MS });

  return result.toJSON();
}

export function setProgressCallback(cb) {
  reportProgress = cb;
}

let reportProgress = null;