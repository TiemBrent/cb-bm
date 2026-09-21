const vertexShaderSource = `
  attribute vec2 a_position;
  attribute vec2 a_texCoord;
  varying vec2 v_texCoord;
  void main() {
    gl_Position = vec4(a_position, 0.0, 1.0);
    v_texCoord = a_texCoord;
  }
`;

const fragmentShaderSource = `
  precision highp float;
  varying vec2 v_texCoord;
  uniform float u_time;
  uniform float u_complexity;
  void main() {
    vec2 uv = v_texCoord;
    float col = 0.0;
    for (int i = 0; i < 10; i++) {
      float freq = float(i + 1) * u_complexity;
      col += sin(uv.x * freq + u_time) * cos(uv.y * freq + u_time) * 0.1;
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

export async function run() {
  const canvas = document.createElement('canvas');
  canvas.width = 800;
  canvas.height = 600;
  const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
  if (!gl) {
    throw new Error('WebGL not supported');
  }

  const vs = createShader(gl, gl.VERTEX_SHADER, vertexShaderSource);
  const fs = createShader(gl, gl.FRAGMENT_SHADER, fragmentShaderSource);
  const program = createProgram(gl, vs, fs);

  const positionBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
    -1, -1, 0, 0,
     1, -1, 1, 0,
    -1,  1, 0, 1,
    -1,  1, 0, 1,
     1, -1, 1, 0,
     1,  1, 1, 1
  ]), gl.STATIC_DRAW);

  const positionLoc = gl.getAttribLocation(program, 'a_position');
  const texCoordLoc = gl.getAttribLocation(program, 'a_texCoord');
  const timeLoc = gl.getUniformLocation(program, 'u_time');
  const complexityLoc = gl.getUniformLocation(program, 'u_complexity');

  gl.enableVertexAttribArray(positionLoc);
  gl.enableVertexAttribArray(texCoordLoc);
  gl.vertexAttribPointer(positionLoc, 2, gl.FLOAT, false, 16, 0);
  gl.vertexAttribPointer(texCoordLoc, 2, gl.FLOAT, false, 16, 8);

  gl.useProgram(program);
  gl.viewport(0, 0, 800, 600);

  const results = {};
  const frameCount = 300;
  const complexities = [1.0, 2.0, 5.0, 10.0];

  for (const complexity of complexities) {
    const times = [];
    let frame = 0;
    const startTime = performance.now();

    function render(time) {
      if (frame >= frameCount) return;
      gl.uniform1f(timeLoc, time * 0.001);
      gl.uniform1f(complexityLoc, complexity);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
      times.push(performance.now());
      frame++;
      requestAnimationFrame(render);
    }

    await new Promise(resolve => {
      function step(time) {
        if (frame >= frameCount) {
          resolve();
          return;
        }
        render(time);
        requestAnimationFrame(step);
      }
      requestAnimationFrame(step);
    });

    const frameTimes = [];
    for (let i = 1; i < times.length; i++) {
      frameTimes.push(times[i] - times[i - 1]);
    }
    const avgFrameTime = frameTimes.reduce((a, b) => a + b, 0) / frameTimes.length;
    const fps = 1000 / avgFrameTime;
    results[`complexity_${complexity}`] = { avgFrameTime, fps };
  }

  const fillRateResult = await runFillRateTest(gl);
  const triangleResult = await runTriangleThroughputTest(gl);

  gl.getExtension('WEBGL_lose_context')?.loseContext();

  const avgFPS = Object.values(results).reduce((sum, r) => sum + r.fps, 0) / Object.values(results).length;
  const score = Math.min(100, Math.round(avgFPS / 60 * 100));

  return {
    raw: results,
    fillRate: fillRateResult,
    triangleThroughput: triangleResult,
    score,
    details: {
      avgFPS: avgFPS.toFixed(1),
      fillRate: `${fillRateResult.megapixelsPerSec.toFixed(0)} MP/s`,
      triangles: `${triangleResult.millionsPerSec.toFixed(2)} M tris/s`
    }
  };
}

async function runFillRateTest(gl) {
  const vs = createShader(gl, gl.VERTEX_SHADER, `
    attribute vec2 a_pos;
    void main() { gl_Position = vec4(a_pos, 0, 1); }
  `);
  const fs = createShader(gl, gl.FRAGMENT_SHADER, `
    precision highp float;
    void main() { gl_FragColor = vec4(1, 0, 0, 1); }
  `);
  const program = createProgram(gl, vs, fs);
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, -1,1, -1,1, 1,-1, 1,1]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(program, 'a_pos');
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  gl.useProgram(program);

  const iterations = 100;
  const start = performance.now();
  for (let i = 0; i < iterations; i++) {
    gl.drawArrays(gl.TRIANGLES, 0, 6);
  }
  gl.finish();
  const elapsed = performance.now() - start;

  const pixels = 800 * 600 * iterations;
  return { megapixelsPerSec: (pixels / elapsed) * 1000 / 1e6 };
}

async function runTriangleThroughputTest(gl) {
  const vs = createShader(gl, gl.VERTEX_SHADER, `
    attribute vec2 a_pos;
    void main() { gl_Position = vec4(a_pos, 0, 1); }
  `);
  const fs = createShader(gl, gl.FRAGMENT_SHADER, `
    precision highp float;
    void main() { gl_FragColor = vec4(0, 1, 0, 1); }
  `);
  const program = createProgram(gl, vs, fs);
  const triangles = 10000;
  const vertices = new Float32Array(triangles * 3 * 2);
  for (let i = 0; i < triangles; i++) {
    const x = (Math.random() - 0.5) * 2;
    const y = (Math.random() - 0.5) * 2;
    const s = 0.01;
    vertices[i * 6 + 0] = x; vertices[i * 6 + 1] = y;
    vertices[i * 6 + 2] = x + s; vertices[i * 6 + 3] = y;
    vertices[i * 6 + 4] = x; vertices[i * 6 + 5] = y + s;
  }
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(program, 'a_pos');
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  gl.useProgram(program);

  const iterations = 50;
  const start = performance.now();
  for (let i = 0; i < iterations; i++) {
    gl.drawArrays(gl.TRIANGLES, 0, triangles * 3);
  }
  gl.finish();
  const elapsed = performance.now() - start;

  return { millionsPerSec: (triangles * iterations / elapsed) * 1000 / 1e6 };
}