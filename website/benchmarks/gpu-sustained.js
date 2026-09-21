import { BenchmarkUtils, BenchmarkResult } from './utils.js';

const SUSTAINED_DURATION_MS = 5 * 60 * 1000; // 5 minutes default
const SAMPLE_INTERVAL_MS = 2000;

const vertexShaderSource = `
  attribute vec2 a_position;
  void main() {
    gl_Position = vec4(a_position, 0.0, 1.0);
  }
`;

const fragmentShaderSource = `
  precision highp float;
  uniform float u_time;
  uniform float u_complexity;
  void main() {
    vec2 uv = gl_FragCoord.xy / vec2(800.0, 600.0);
    float col = 0.0;
    for (int i = 0; i < 20; i++) {
      float freq = float(i + 1) * u_complexity;
      col += sin(uv.x * freq + u_time) * cos(uv.y * freq + u_time) * 0.05;
    }
    gl_FragColor = vec4(col, col * 0.5, col * 0.3, 1.0);
  }
`;

function createShader(gl, type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    throw new Error(gl.getShaderInfoLog(shader));
  }
  return shader;
}

function createProgram(gl, vs, fs) {
  const program = gl.createProgram();
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    throw new Error(gl.getProgramInfoLog(program));
  }
  return program;
}

export async function run(options = {}) {
  const durationMs = options.durationMs || SUSTAINED_DURATION_MS;
  const result = new BenchmarkResult('gpu-sustained', 'GPU Sustained Performance', 'gpu');
  const startTime = performance.now();

  const canvas = document.createElement('canvas');
  canvas.width = 800;
  canvas.height = 600;
  canvas.style.cssText = 'position:absolute;left:-9999px;top:-9999px;';
  document.body.appendChild(canvas);

  const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
  if (!gl) {
    document.body.removeChild(canvas);
    result.setUnsupported('WebGL not supported');
    return result.toJSON();
  }

  const vs = createShader(gl, gl.VERTEX_SHADER, vertexShaderSource);
  const fs = createShader(gl, gl.FRAGMENT_SHADER, fragmentShaderSource);
  const program = createProgram(gl, vs, fs);

  const positionBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
    -1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1
  ]), gl.STATIC_DRAW);

  const positionLoc = gl.getAttribLocation(program, 'a_position');
  const timeLoc = gl.getUniformLocation(program, 'u_time');
  const complexityLoc = gl.getUniformLocation(program, 'u_complexity');

  gl.enableVertexAttribArray(positionLoc);
  gl.vertexAttribPointer(positionLoc, 2, gl.FLOAT, false, 0, 0);
  gl.useProgram(program);
  gl.viewport(0, 0, 800, 600);

  const perfSamples = [];
  let frameCount = 0;
  let lastFrameTime = performance.now();
  let frameTimes = [];
  const totalSamples = Math.floor(durationMs / SAMPLE_INTERVAL_MS);

  function renderFrame(time) {
    const dt = time - lastFrameTime;
    lastFrameTime = time;
    frameTimes.push(dt);
    frameCount++;

    gl.uniform1f(timeLoc, time * 0.001);
    gl.uniform1f(complexityLoc, 5.0);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
  }

  for (let i = 0; i < totalSamples; i++) {
    frameCount = 0;
    frameTimes = [];
    const sampleStart = performance.now();

    await new Promise(resolve => {
      function frameLoop(time) {
        renderFrame(time);
        if (performance.now() - sampleStart < SAMPLE_INTERVAL_MS) {
          requestAnimationFrame(frameLoop);
        } else {
          resolve();
        }
      }
      requestAnimationFrame(frameLoop);
    });

    const avgFrameTime = frameTimes.reduce((a, b) => a + b, 0) / frameTimes.length;
    const fps = 1000 / avgFrameTime;
    const frameTimeVariance = frameTimes.reduce((sum, t) => sum + Math.pow(t - avgFrameTime, 2), 0) / frameTimes.length;

    perfSamples.push({
      fps,
      avgFrameTime,
      frameTimeVariance,
      framesRendered: frameCount,
      timestamp: Date.now()
    });

    if (typeof reportProgress === 'function') {
      reportProgress(((i + 1) / totalSamples) * 100, `GPU Sustained: ${fps.toFixed(1)} FPS`);
    }
  }

  document.body.removeChild(canvas);
  gl.getExtension('WEBGL_lose_context')?.loseContext();

  if (perfSamples.length === 0) {
    result.setFailed('No samples collected');
    return result.toJSON();
  }

  const fpsValues = perfSamples.map(s => s.fps);
  const initialFPS = fpsValues[0];
  const finalFPS = fpsValues[fpsValues.length - 1];
  const avgFPS = fpsValues.reduce((a, b) => a + b, 0) / fpsValues.length;
  const minFPS = Math.min(...fpsValues);
  const maxFPS = Math.max(...fpsValues);
  const retention = (finalFPS / initialFPS) * 100;

  const score = Math.min(100, Math.round(retention));

  const details = {
    duration: `${(durationMs / 60000).toFixed(1)} min`,
    initialFPS: initialFPS.toFixed(1),
    finalFPS: finalFPS.toFixed(1),
    averageFPS: avgFPS.toFixed(1),
    minFPS: minFPS.toFixed(1),
    maxFPS: maxFPS.toFixed(1),
    retention: `${retention.toFixed(1)}%`,
    samplesCollected: perfSamples.length
  };

  result.durationMs = performance.now() - startTime;
  result.setCompleted(score, {
    initialFPS,
    finalFPS,
    avgFPS,
    minFPS,
    maxFPS,
    retention,
    samples: perfSamples
  }, details, perfSamples, { durationMs, sampleInterval: SAMPLE_INTERVAL_MS });

  return result.toJSON();
}

export function setProgressCallback(cb) {
  reportProgress = cb;
}

let reportProgress = null;