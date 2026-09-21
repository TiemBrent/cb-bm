import { BenchmarkUtils, BenchmarkResult } from './utils.js';

export async function run() {
  const result = new BenchmarkResult('canvas2d', 'Canvas 2D', 'rendering');
  const startTime = performance.now();

  const canvas = document.createElement('canvas');
  canvas.width = 800;
  canvas.height = 600;
  canvas.style.cssText = 'position:absolute;left:-9999px;top:-9999px;';
  document.body.appendChild(canvas);
  const ctx = canvas.getContext('2d');

  const tests = [];

  tests.push({
    name: 'rectangles',
    run: async () => {
      const iterations = 100;
      const rectCount = 1000;
      const start = performance.now();
      for (let i = 0; i < iterations; i++) {
        ctx.clearRect(0, 0, 800, 600);
        for (let j = 0; j < rectCount; j++) {
          ctx.fillStyle = `rgb(${Math.random() * 255}, ${Math.random() * 255}, ${Math.random() * 255})`;
          ctx.fillRect(Math.random() * 800, Math.random() * 600, 50, 50);
        }
      }
      return performance.now() - start;
    },
    ops: 100 * 1000
  });

  tests.push({
    name: 'paths',
    run: async () => {
      const iterations = 50;
      const pathCount = 500;
      const start = performance.now();
      for (let i = 0; i < iterations; i++) {
        ctx.clearRect(0, 0, 800, 600);
        for (let j = 0; j < pathCount; j++) {
          ctx.beginPath();
          ctx.moveTo(Math.random() * 800, Math.random() * 600);
          ctx.lineTo(Math.random() * 800, Math.random() * 600);
          ctx.lineTo(Math.random() * 800, Math.random() * 600);
          ctx.closePath();
          ctx.stroke();
        }
      }
      return performance.now() - start;
    },
    ops: 50 * 500
  });

  tests.push({
    name: 'circles',
    run: async () => {
      const iterations = 50;
      const circleCount = 500;
      const start = performance.now();
      for (let i = 0; i < iterations; i++) {
        ctx.clearRect(0, 0, 800, 600);
        for (let j = 0; j < circleCount; j++) {
          ctx.beginPath();
          ctx.arc(Math.random() * 800, Math.random() * 600, 20, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      return performance.now() - start;
    },
    ops: 50 * 500
  });

  tests.push({
    name: 'text',
    run: async () => {
      const iterations = 100;
      const textCount = 200;
      const start = performance.now();
      ctx.font = '16px sans-serif';
      for (let i = 0; i < iterations; i++) {
        ctx.clearRect(0, 0, 800, 600);
        for (let j = 0; j < textCount; j++) {
          ctx.fillText(`Text ${j}`, Math.random() * 800, Math.random() * 600);
        }
      }
      return performance.now() - start;
    },
    ops: 100 * 200
  });

  tests.push({
    name: 'images',
    run: async () => {
      const img = new Image();
      img.width = 100;
      img.height = 100;
      const tempCanvas = document.createElement('canvas');
      tempCanvas.width = 100;
      tempCanvas.height = 100;
      const tempCtx = tempCanvas.getContext('2d');
      tempCtx.fillStyle = 'red';
      tempCtx.fillRect(0, 0, 100, 100);
      img.src = tempCanvas.toDataURL();

      await new Promise(resolve => { img.onload = resolve; });

      const iterations = 100;
      const imageCount = 100;
      const start = performance.now();
      for (let i = 0; i < iterations; i++) {
        ctx.clearRect(0, 0, 800, 600);
        for (let j = 0; j < imageCount; j++) {
          ctx.drawImage(img, Math.random() * 700, Math.random() * 500);
        }
      }
      return performance.now() - start;
    },
    ops: 100 * 100
  });

  tests.push({
    name: 'compositing',
    run: async () => {
      const iterations = 50;
      const layerCount = 50;
      const start = performance.now();
      for (let i = 0; i < iterations; i++) {
        ctx.clearRect(0, 0, 800, 600);
        ctx.globalAlpha = 0.5;
        for (let j = 0; j < layerCount; j++) {
          ctx.fillStyle = `hsl(${j * 7}, 50%, 50%)`;
          ctx.fillRect(j * 10, j * 10, 200, 200);
        }
        ctx.globalAlpha = 1.0;
      }
      return performance.now() - start;
    },
    ops: 50 * 50
  });

  tests.push({
    name: 'transforms',
    run: async () => {
      const iterations = 50;
      const objCount = 200;
      const start = performance.now();
      for (let i = 0; i < iterations; i++) {
        ctx.clearRect(0, 0, 800, 600);
        for (let j = 0; j < objCount; j++) {
          ctx.save();
          ctx.translate(Math.random() * 800, Math.random() * 600);
          ctx.rotate(Math.random() * Math.PI * 2);
          ctx.scale(0.5 + Math.random(), 0.5 + Math.random());
          ctx.fillRect(-25, -25, 50, 50);
          ctx.restore();
        }
      }
      return performance.now() - start;
    },
    ops: 50 * 200
  });

  tests.push({
    name: 'largeFill',
    run: async () => {
      const iterations = 200;
      const start = performance.now();
      for (let i = 0; i < iterations; i++) {
        ctx.fillStyle = `rgb(${Math.random() * 255}, ${Math.random() * 255}, ${Math.random() * 255})`;
        ctx.fillRect(0, 0, 800, 600);
      }
      return performance.now() - start;
    },
    ops: 200 * 800 * 600
  });

  const allOpsPerSec = [];
  const details = {};
  const raw = {};

  for (const test of tests) {
    try {
      const analysis = await BenchmarkUtils.runSamples(test.run, 5, 2);
      const opsPerSec = test.ops / (analysis.median / 1000);
      allOpsPerSec.push(opsPerSec);

      raw[test.name] = analysis.median;
      details[test.name] = `${BenchmarkUtils.formatOpsPerSec(test.ops, analysis.median)} ops/s`;
    } catch (e) {
      raw[test.name] = null;
      details[test.name] = `Failed: ${e.message}`;
    }
  }

  document.body.removeChild(canvas);

  const avgOpsPerSec = BenchmarkUtils.geometricMean(allOpsPerSec);
  const score = Math.min(100, Math.round(avgOpsPerSec / 10000000 * 100));

  result.durationMs = performance.now() - startTime;
  result.setCompleted(score, { opsPerSec: avgOpsPerSec }, details, raw, { tests: tests.map(t => t.name) });

  return result.toJSON();
}