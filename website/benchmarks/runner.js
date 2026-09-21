import { BenchmarkUtils } from './utils.js';

export class BenchmarkRunner {
  constructor(mode = 'full') {
    this.onProgress = null;
    this.mode = mode;
    this.aborted = false;
    this.paused = false;
    this.pauseResolver = null;
    
    this.allBenchmarks = [
      { id: 'cpu-single', name: 'CPU Single-Thread', weight: 0.12, fn: () => import('./cpu-single.js').then(m => m.run()) },
      { id: 'cpu-multi', name: 'CPU Multi-Thread', weight: 0.12, fn: () => import('./cpu-multi.js').then(m => m.run()) },
      { id: 'wasm', name: 'WASM', weight: 0.08, fn: () => import('./wasm.js').then(m => m.run()) },
      { id: 'gpu-webgl', name: 'GPU WebGL', weight: 0.10, fn: () => import('./gpu-webgl.js').then(m => m.run()) },
      { id: 'gpu-webgpu', name: 'GPU WebGPU', weight: 0.10, fn: () => import('./gpu-webgpu.js').then(m => m.run()) },
      { id: 'memory', name: 'Memory', weight: 0.08, fn: () => import('./memory.js').then(m => m.run()) },
      { id: 'storage', name: 'Storage', weight: 0.06, fn: () => import('./storage.js').then(m => m.run()) },
      { id: 'network', name: 'Network', weight: 0.04, fn: () => import('./network.js').then(m => m.run()) },
      { id: 'rendering', name: 'Rendering', weight: 0.06, fn: () => import('./rendering.js').then(m => m.run()) },
      { id: 'crypto', name: 'Crypto', weight: 0.02, fn: () => import('./crypto.js').then(m => m.run()) },
      { id: 'audio', name: 'Audio', weight: 0.02, fn: () => import('./audio.js').then(m => m.run()) },
      { id: 'canvas2d', name: 'Canvas 2D', weight: 0.04, fn: () => import('./canvas2d.js').then(m => m.run()) },
      { id: 'offscreen-canvas', name: 'OffscreenCanvas', weight: 0.02, fn: () => import('./offscreen-canvas.js').then(m => m.run()) },
      { id: 'display', name: 'Display & Refresh Rate', weight: 0.04, fn: () => import('./display.js').then(m => m.run()) },
      { id: 'video', name: 'Video / WebCodecs', weight: 0.04, fn: () => import('./video.js').then(m => m.run()) },
      { id: 'cpu-sustained', name: 'CPU Sustained (5 min)', weight: 0.04, fn: () => import('./cpu-sustained.js').then(m => m.run()) },
      { id: 'gpu-sustained', name: 'GPU Sustained (5 min)', weight: 0.04, fn: () => import('./gpu-sustained.js').then(m => m.run()) }
    ];

    this.quickBenchmarks = [
      { id: 'cpu-single', name: 'CPU Single-Thread', weight: 0.20, fn: () => import('./cpu-single.js').then(m => m.run()) },
      { id: 'cpu-multi', name: 'CPU Multi-Thread', weight: 0.20, fn: () => import('./cpu-multi.js').then(m => m.run()) },
      { id: 'gpu-webgl', name: 'GPU WebGL', weight: 0.20, fn: () => import('./gpu-webgl.js').then(m => m.run()) },
      { id: 'memory', name: 'Memory', weight: 0.15, fn: () => import('./memory.js').then(m => m.run()) },
      { id: 'storage', name: 'Storage', weight: 0.10, fn: () => import('./storage.js').then(m => m.run()) },
      { id: 'rendering', name: 'Rendering', weight: 0.15, fn: () => import('./rendering.js').then(m => m.run()) }
    ];

    this.stressBenchmarks = [
      ...this.allBenchmarks,
      { id: 'cpu-sustained', name: 'CPU Sustained (10 min)', weight: 0.05, fn: () => import('./cpu-sustained.js').then(m => m.run({ durationMs: 10 * 60 * 1000 })) },
      { id: 'gpu-sustained', name: 'GPU Sustained (10 min)', weight: 0.05, fn: () => import('./gpu-sustained.js').then(m => m.run({ durationMs: 10 * 60 * 1000 })) }
    ];
  }

  getBenchmarks() {
    switch (this.mode) {
      case 'quick':
        return this.quickBenchmarks;
      case 'stress':
        return this.stressBenchmarks;
      default:
        return this.allBenchmarks;
    }
  }

  setMode(mode) {
    this.mode = mode;
  }

  abort() {
    this.aborted = true;
    if (this.paused) {
      this.resume();
    }
  }

  pause() {
    this.paused = true;
    this.pauseResolver = null;
    return new Promise(resolve => {
      this.pauseResolver = resolve;
    });
  }

  resume() {
    this.paused = false;
    if (this.pauseResolver) {
      this.pauseResolver();
      this.pauseResolver = null;
    }
  }

  async runAll() {
    const benchmarks = this.getBenchmarks();
    const results = {};
    const total = benchmarks.length;

    for (let i = 0; i < benchmarks.length; i++) {
      if (this.aborted) {
        console.log('Benchmark aborted');
        break;
      }

      while (this.paused) {
        await new Promise(resolve => { this.pauseResolver = resolve; });
      }

      const bench = benchmarks[i];
      const progress = Math.round((i / total) * 100);

      if (this.onProgress) {
        this.onProgress(progress, `Running ${bench.name}...`, bench.id);
      }

      try {
        const result = await bench.fn();
        results[bench.id] = {
          name: bench.name,
          weight: bench.weight,
          ...result
        };
      } catch (error) {
        console.error(`Benchmark ${bench.id} failed:`, error);
        results[bench.id] = {
          name: bench.name,
          weight: bench.weight,
          error: error.message,
          score: 0,
          status: 'failed'
        };
      }
    }

    if (this.onProgress) {
      this.onProgress(100, 'Calculating scores...');
    }

    return results;
  }

  async runBaseline() {
    if (this.onProgress) {
      this.onProgress(0, 'Measuring baseline...');
    }

    const baseline = {};
    
    baseline.cpuIdle = await this.measureCPUIdle();
    baseline.memory = await this.measureMemoryBaseline();
    baseline.refreshRate = await this.measureRefreshRateBaseline();

    if (this.onProgress) {
      this.onProgress(0, 'Baseline complete');
    }

    return baseline;
  }

  async measureCPUIdle() {
    const samples = [];
    for (let i = 0; i < 5; i++) {
      const start = performance.now();
      await new Promise(r => setTimeout(r, 100));
      samples.push(performance.now() - start);
    }
    return { avg: samples.reduce((a, b) => a + b, 0) / samples.length, samples };
  }

  async measureMemoryBaseline() {
    if (performance.memory) {
      return {
        usedJSHeapSize: performance.memory.usedJSHeapSize,
        totalJSHeapSize: performance.memory.totalJSHeapSize,
        jsHeapSizeLimit: performance.memory.jsHeapSizeLimit
      };
    }
    return { supported: false };
  }

  async measureRefreshRateBaseline() {
    return new Promise(resolve => {
      const times = [];
      let lastTime = performance.now();
      let frame = 0;

      function tick(now) {
        if (frame > 0) {
          times.push(now - lastTime);
        }
        lastTime = now;
        frame++;
        if (frame < 60) {
          requestAnimationFrame(tick);
        } else {
          const avg = times.reduce((a, b) => a + b, 0) / times.length;
          resolve({ rate: 1000 / avg, avgFrameTime: avg, frames: times.length });
        }
      }
      requestAnimationFrame(tick);
    });
  }
}