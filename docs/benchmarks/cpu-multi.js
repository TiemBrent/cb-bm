import { BenchmarkUtils, BenchmarkResult } from './utils.js';

const workerCode = `
  self.onmessage = function(e) {
    const { task, data } = e.data;
    let result;

    switch (task) {
      case 'sort':
        result = data.sort((a, b) => a - b);
        break;
      case 'primeSieve':
        const sieve = new Uint8Array(data.limit + 1);
        for (let i = 2; i * i <= data.limit; i++) {
          if (!sieve[i]) {
            for (let j = i * i; j <= data.limit; j += i) {
              sieve[j] = 1;
            }
          }
        }
        result = sieve;
        break;
      case 'sha256':
        const encoder = new TextEncoder();
        const input = encoder.encode(data.input);
        result = crypto.subtle.digest('SHA-256', input);
        break;
      case 'floatArithmetic':
        let sum = 0;
        for (let i = 0; i < data.iterations; i++) {
          sum += Math.sin(i) * Math.cos(i) + Math.sqrt(i + 1);
        }
        result = sum;
        break;
    }

    self.postMessage({ task, result });
  };
`;

function createWorker() {
  const blob = new Blob([workerCode], { type: 'application/javascript' });
  return new Worker(URL.createObjectURL(blob));
}

async function runWorkerTask(worker, task, data) {
  return new Promise((resolve, reject) => {
    const handler = (e) => {
      if (e.data.task === task) {
        worker.removeEventListener('message', handler);
        resolve(e.data.result);
      }
    };
    worker.addEventListener('message', handler);
    worker.postMessage({ task, data });
    setTimeout(() => reject(new Error('Worker timeout')), 60000);
  });
}

export async function run() {
  const result = new BenchmarkResult('cpu-multi', 'CPU Multi-Thread', 'cpu');
  const startTime = performance.now();

  const concurrency = Math.min(navigator.hardwareConcurrency || 4, 16);
  const workers = Array.from({ length: concurrency }, createWorker);

  const tests = [
    { name: 'sort', task: 'sort', ops: 100000, weight: 1 },
    { name: 'primeSieve', task: 'primeSieve', ops: 100000, weight: 1 },
    { name: 'sha256', task: 'sha256', ops: 2500, weight: 1 },
    { name: 'floatArithmetic', task: 'floatArithmetic', ops: 5000000, weight: 1 }
  ];

  const allOpsPerSec = [];
  const details = {};
  const raw = {};
  const scalingData = [];

  for (let workerCount = 1; workerCount <= concurrency; workerCount *= 2) {
    const activeWorkers = workers.slice(0, workerCount);
    const scaleOps = [];

    for (const test of tests) {
      const runTest = async () => {
        if (test.name === 'sort') {
          const arraySize = 100000;
          const sortData = new Array(arraySize).fill(0).map(() => Math.random());
          const chunkSize = Math.ceil(arraySize / workerCount);
          const chunks = [];
          for (let i = 0; i < workerCount; i++) {
            chunks.push(sortData.slice(i * chunkSize, (i + 1) * chunkSize));
          }
          const start = performance.now();
          await Promise.all(activeWorkers.map((w, i) => runWorkerTask(w, 'sort', chunks[i])));
          return performance.now() - start;
        } else if (test.name === 'primeSieve') {
          const start = performance.now();
          await Promise.all(activeWorkers.map(w => runWorkerTask(w, 'primeSieve', { limit: 100000 })));
          return performance.now() - start;
        } else if (test.name === 'sha256') {
          const testData = 'benchmark test data '.repeat(100);
          const start = performance.now();
          await Promise.all(activeWorkers.map(w => runWorkerTask(w, 'sha256', { input: testData })));
          return performance.now() - start;
        } else if (test.name === 'floatArithmetic') {
          const start = performance.now();
          await Promise.all(activeWorkers.map(w => runWorkerTask(w, 'floatArithmetic', { iterations: 5000000 / workerCount })));
          return performance.now() - start;
        }
      };

      try {
        const analysis = await BenchmarkUtils.runSamples(runTest, 3, 1);
        const opsPerSec = test.ops * workerCount / (analysis.median / 1000);
        scaleOps.push(opsPerSec);
        if (workerCount === concurrency) {
          raw[test.name] = analysis.median;
          details[test.name] = `${BenchmarkUtils.formatOpsPerSec(test.ops * workerCount, analysis.median)} ops/s (${workerCount} workers)`;
        }
      } catch (e) {
        if (workerCount === concurrency) {
          raw[test.name] = null;
          details[test.name] = `Failed: ${e.message}`;
        }
      }
    }

    const avgScaleOps = BenchmarkUtils.geometricMean(scaleOps);
    scalingData.push({ workers: workerCount, opsPerSec: avgScaleOps });
  }

  workers.forEach(w => w.terminate());

  const finalOpsPerSec = scalingData[scalingData.length - 1]?.opsPerSec || 0;
  const scalingEfficiency = scalingData.length > 1
    ? (scalingData[scalingData.length - 1].opsPerSec / (scalingData[0].opsPerSec * concurrency)) * 100
    : 100;

  const score = Math.min(100, Math.round(finalOpsPerSec / 2000000 * 100));

  details.scaling = scalingData.map(d => `${d.workers} workers: ${(d.opsPerSec / 1e6).toFixed(1)} M ops/s`).join(' | ');
  details.scalingEfficiency = `${scalingEfficiency.toFixed(1)}%`;
  details.coresUsed = concurrency;

  result.durationMs = performance.now() - startTime;
  result.setCompleted(score, { 
    opsPerSec: finalOpsPerSec, 
    scalingEfficiency,
    scalingData 
  }, details, raw, { concurrency, scalingData });

  return result.toJSON();
}