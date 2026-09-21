import { BenchmarkUtils, BenchmarkResult } from './utils.js';

const workerCode = `
  self.onmessage = async function(e) {
    const { task, canvas, width, height } = e.data;
    
    if (task === 'render') {
      const ctx = canvas.getContext('2d');
      const iterations = 100;
      const objCount = 500;
      const start = performance.now();
      
      for (let i = 0; i < iterations; i++) {
        ctx.clearRect(0, 0, width, height);
        for (let j = 0; j < objCount; j++) {
          ctx.save();
          ctx.translate(Math.random() * width, Math.random() * height);
          ctx.rotate(Math.random() * Math.PI * 2);
          ctx.fillRect(-25, -25, 50, 50);
          ctx.restore();
        }
      }
      
      const elapsed = performance.now() - start;
      self.postMessage({ task: 'render', result: elapsed });
    }
  };
`;

function createOffscreenWorker() {
  const blob = new Blob([workerCode], { type: 'application/javascript' });
  return new Worker(URL.createObjectURL(blob));
}

export async function run() {
  const result = new BenchmarkResult('offscreen-canvas', 'OffscreenCanvas', 'rendering');
  const startTime = performance.now();

  const width = 800;
  const height = 600;
  const details = {};
  const raw = {};

  const mainThreadResult = await runMainThreadTest(width, height);
  details.mainThread = `${BenchmarkUtils.formatOpsPerSec(mainThreadResult.ops, mainThreadResult.time)} ops/s`;
  raw.mainThread = mainThreadResult.time;

  let offscreenSupported = false;
  let offscreenTime = 0;
  let offscreenOpsPerSec = 0;

  try {
    if (typeof OffscreenCanvas !== 'undefined') {
      offscreenSupported = true;
      const offscreenResult = await runOffscreenTest(width, height);
      offscreenTime = offscreenResult.time;
      offscreenOpsPerSec = offscreenResult.opsPerSec;
      details.offscreenCanvas = `${BenchmarkUtils.formatOpsPerSec(offscreenResult.ops, offscreenResult.time)} ops/s`;
      raw.offscreenCanvas = offscreenResult.time;
    } else {
      details.offscreenCanvas = 'Not supported';
      raw.offscreenCanvas = null;
    }
  } catch (e) {
    details.offscreenCanvas = `Failed: ${e.message}`;
    raw.offscreenCanvas = null;
  }

  const score = Math.min(100, Math.round(offscreenOpsPerSec / 1000000 * 100));

  result.durationMs = performance.now() - startTime;
  result.setCompleted(score, { 
    mainThreadOpsPerSec: mainThreadResult.opsPerSec,
    offscreenOpsPerSec,
    offscreenSupported,
    speedup: offscreenSupported ? (offscreenOpsPerSec / mainThreadResult.opsPerSec).toFixed(2) : 0
  }, details, raw, { mainThread: mainThreadResult, offscreenSupported });

  return result.toJSON();
}

async function runMainThreadTest(width, height) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  canvas.style.cssText = 'position:absolute;left:-9999px;top:-9999px;';
  document.body.appendChild(canvas);
  const ctx = canvas.getContext('2d');

  const iterations = 100;
  const objCount = 500;
  const ops = iterations * objCount;

  const analysis = await BenchmarkUtils.runSamples(async () => {
    const start = performance.now();
    for (let i = 0; i < iterations; i++) {
      ctx.clearRect(0, 0, width, height);
      for (let j = 0; j < objCount; j++) {
        ctx.save();
        ctx.translate(Math.random() * width, Math.random() * height);
        ctx.rotate(Math.random() * Math.PI * 2);
        ctx.fillRect(-25, -25, 50, 50);
        ctx.restore();
      }
    }
    return performance.now() - start;
  }, 3, 1);

  document.body.removeChild(canvas);

  return {
    time: analysis.median,
    opsPerSec: ops / (analysis.median / 1000),
    ops
  };
}

async function runOffscreenTest(width, height) {
  const canvas = new OffscreenCanvas(width, height);
  const worker = createOffscreenWorker();

  const ops = 100 * 500;

  const time = await new Promise((resolve, reject) => {
    const handler = (e) => {
      if (e.data.task === 'render') {
        worker.removeEventListener('message', handler);
        worker.terminate();
        resolve(e.data.result);
      }
    };
    worker.addEventListener('message', handler);
    worker.postMessage({ task: 'render', canvas, width, height });
    setTimeout(() => reject(new Error('Worker timeout')), 60000);
  });

  return {
    time,
    opsPerSec: ops / (time / 1000),
    ops
  };
}