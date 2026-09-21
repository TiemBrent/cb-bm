import { BenchmarkUtils, BenchmarkResult } from './utils.js';

export async function run() {
  const result = new BenchmarkResult('display', 'Display & Refresh Rate', 'rendering');
  const startTime = performance.now();

  const details = {};
  const raw = {};

  const idleResult = await measureRefreshRate('idle', 3000);
  details.idleRefreshRate = `${idleResult.rate.toFixed(1)} Hz (measured)`;
  details.idleFrameTime = `${idleResult.avgFrameTime.toFixed(2)} ms`;
  details.idleJitter = `${idleResult.jitter.toFixed(2)} ms`;
  raw.idle = idleResult;

  const loadResult = await measureRefreshRate('load', 3000, true);
  details.loadRefreshRate = `${loadResult.rate.toFixed(1)} Hz (under load)`;
  details.loadFrameTime = `${loadResult.avgFrameTime.toFixed(2)} ms`;
  details.loadJitter = `${loadResult.jitter.toFixed(2)} ms`;
  raw.load = loadResult;

  const screen = window.screen;
  details.screenRefreshRate = `${screen.currentMode?.refreshRate || 'unknown'} Hz (reported)`;
  details.screenResolution = `${screen.width}x${screen.height}`;
  details.devicePixelRatio = window.devicePixelRatio;
  details.colorDepth = screen.colorDepth;

  const droppedFrames = idleResult.droppedFrames + loadResult.droppedFrames;
  const totalFrames = idleResult.frames + loadResult.frames;
  const dropRate = totalFrames > 0 ? (droppedFrames / totalFrames * 100) : 0;

  details.droppedFrames = `${droppedFrames} / ${totalFrames} (${dropRate.toFixed(2)}%)`;
  details.longFrames = idleResult.longFrames + loadResult.longFrames;

  const stability = 100 - dropRate * 10;
  const score = Math.min(100, Math.max(0, Math.round(stability)));

  result.durationMs = performance.now() - startTime;
  result.setCompleted(score, { 
    idleRate: idleResult.rate,
    loadRate: loadResult.rate,
    droppedFrames,
    dropRate,
    stability
  }, details, raw, { 
    screenResolution: `${screen.width}x${screen.height}`,
    devicePixelRatio: window.devicePixelRatio 
  });

  return result.toJSON();
}

async function measureRefreshRate(mode, duration, underLoad = false) {
  return new Promise(resolve => {
    const times = [];
    let lastTime = performance.now();
    let frame = 0;
    let droppedFrames = 0;
    let longFrames = 0;
    const expectedFrameTime = 1000 / 60;
    let loadInterval = null;

    if (underLoad) {
      const canvas = document.createElement('canvas');
      canvas.width = 400;
      canvas.height = 300;
      canvas.style.cssText = 'position:absolute;left:-9999px;top:-9999px;';
      document.body.appendChild(canvas);
      const ctx = canvas.getContext('2d');

      loadInterval = setInterval(() => {
        ctx.clearRect(0, 0, 400, 300);
        for (let i = 0; i < 100; i++) {
          ctx.fillStyle = `hsl(${i * 3.6}, 50%, 50%)`;
          ctx.fillRect(Math.random() * 400, Math.random() * 300, 50, 50);
        }
      }, 16);
    }

    function tick(now) {
      if (frame > 0) {
        const dt = now - lastTime;
        times.push(dt);
        
        if (dt > expectedFrameTime * 1.5) {
          droppedFrames++;
        }
        if (dt > expectedFrameTime * 2) {
          longFrames++;
        }
      }
      lastTime = now;
      frame++;

      if (performance.now() - (times[0] || now) < duration) {
        requestAnimationFrame(tick);
      } else {
        if (loadInterval) {
          clearInterval(loadInterval);
          document.body.removeChild(document.querySelector('canvas[style*="left:-9999px"]'));
        }

        const validTimes = times.slice(1);
        const avgFrameTime = validTimes.reduce((a, b) => a + b, 0) / validTimes.length;
        const rate = 1000 / avgFrameTime;
        
        const jitter = Math.sqrt(
          validTimes.reduce((sum, t) => sum + Math.pow(t - avgFrameTime, 2), 0) / validTimes.length
        );

        resolve({
          rate,
          avgFrameTime,
          jitter,
          frames: frame,
          droppedFrames,
          longFrames,
          samples: validTimes
        });
      }
    }
    requestAnimationFrame(tick);
  });
}