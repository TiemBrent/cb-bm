import { BenchmarkUtils, BenchmarkResult } from './utils.js';

export async function run() {
  const result = new BenchmarkResult('video', 'Video / WebCodecs', 'media');
  const startTime = performance.now();

  const details = {};
  const raw = {};
  const supportedCodecs = [];

  if (!('VideoDecoder' in window) || !('VideoEncoder' in window)) {
    details.support = 'WebCodecs not supported';
    raw.support = false;
    result.setUnsupported('WebCodecs not supported');
    return result.toJSON();
  }

  details.support = 'WebCodecs supported';
  raw.support = true;

  const testConfigs = [
    { name: 'decode-720p', width: 1280, height: 720, frameCount: 100 },
    { name: 'decode-1080p', width: 1920, height: 1080, frameCount: 50 },
    { name: 'encode-720p', width: 1280, height: 720, frameCount: 50 },
  ];

  for (const config of testConfigs) {
    try {
      if (config.name.startsWith('decode')) {
        const decodeResult = await runDecodeTest(config);
        details[config.name] = `${decodeResult.fps.toFixed(1)} fps (${decodeResult.avgDecodeTime.toFixed(2)} ms/frame)`;
        raw[config.name] = decodeResult;
      } else {
        const encodeResult = await runEncodeTest(config);
        details[config.name] = `${encodeResult.fps.toFixed(1)} fps (${encodeResult.avgEncodeTime.toFixed(2)} ms/frame)`;
        raw[config.name] = encodeResult;
      }
    } catch (e) {
      details[config.name] = `Failed: ${e.message}`;
      raw[config.name] = { error: e.message };
    }
  }

  try {
    const capabilities = await detectMediaCapabilities();
    details.capabilities = JSON.stringify(capabilities, null, 2);
    raw.capabilities = capabilities;
  } catch (e) {
    details.capabilities = `Detection failed: ${e.message}`;
  }

  const score = calculateVideoScore(raw);
  result.durationMs = performance.now() - startTime;
  result.setCompleted(score, { supportedCodecs }, details, raw, {});

  return result.toJSON();
}

async function runDecodeTest(config) {
  const { width, height, frameCount } = config;

  const init = {
    type: 'key',
    data: generateFakeKeyFrame(width, height)
  };

  const decoder = new VideoDecoder({
    output: (frame) => {
      frame.close();
    },
    error: (e) => console.error('Decoder error:', e)
  });

  const config_obj = {
    codec: 'vp09.00.10.08',
    codedWidth: width,
    codedHeight: height
  };

  try {
    await decoder.configure(config_obj);
  } catch (e) {
    config_obj.codec = 'avc1.42001e';
    await decoder.configure(config_obj);
  }

  const start = performance.now();
  let decoded = 0;

  for (let i = 0; i < frameCount; i++) {
    const chunk = new EncodedVideoChunk({
      type: i === 0 ? 'key' : 'delta',
      timestamp: i * 16666,
      data: generateFakeFrameData(width, height)
    });
    decoder.decode(chunk);
    decoded++;
  }

  await decoder.flush();
  const elapsed = performance.now() - start;

  decoder.close();

  return {
    fps: decoded / (elapsed / 1000),
    avgDecodeTime: elapsed / decoded,
    framesDecoded: decoded,
    totalTime: elapsed
  };
}

async function runEncodeTest(config) {
  const { width, height, frameCount } = config;

  const encoder = new VideoEncoder({
    output: (chunk, metadata) => {},
    error: (e) => console.error('Encoder error:', e)
  });

  const config_obj = {
    codec: 'vp09.00.10.08',
    width,
    height,
    bitrate: 5_000_000,
    framerate: 30
  };

  try {
    encoder.configure(config_obj);
  } catch (e) {
    config_obj.codec = 'avc1.42001e';
    encoder.configure(config_obj);
  }

  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext('2d');

  const start = performance.now();
  let encoded = 0;

  for (let i = 0; i < frameCount; i++) {
    ctx.fillStyle = `hsl(${i * 3.6}, 50%, 50%)`;
    ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = 'white';
    ctx.font = '24px sans-serif';
    ctx.fillText(`Frame ${i}`, 50, 50);

    const frame = new VideoFrame(canvas, { timestamp: i * 33333 });
    encoder.encode(frame, i === 0 ? { keyFrame: true } : {});
    frame.close();
    encoded++;
  }

  await encoder.flush();
  const elapsed = performance.now() - start;

  encoder.close();

  return {
    fps: encoded / (elapsed / 1000),
    avgEncodeTime: elapsed / encoded,
    framesEncoded: encoded,
    totalTime: elapsed
  };
}

async function detectMediaCapabilities() {
  const capabilities = { video: {}, audio: {} };

  const videoCodecs = [
    'vp09.00.10.08', 'vp8', 'avc1.42001e', 'avc1.420028', 
    'hevc', 'av1', 'av01.0.05M.08'
  ];

  for (const codec of videoCodecs) {
    try {
      const support = await VideoDecoder.isConfigSupported({
        codec,
        codedWidth: 1920,
        codedHeight: 1080
      });
      capabilities.video[codec] = support;
    } catch (e) {
      capabilities.video[codec] = { supported: false, error: e.message };
    }
  }

  return capabilities;
}

function generateFakeKeyFrame(width, height) {
  const data = new Uint8Array(width * height * 1.5);
  for (let i = 0; i < data.length; i++) {
    data[i] = Math.random() * 256;
  }
  return data;
}

function generateFakeFrameData(width, height) {
  const data = new Uint8Array(width * height);
  for (let i = 0; i < data.length; i++) {
    data[i] = Math.random() * 256;
  }
  return data;
}

function calculateVideoScore(raw) {
  let score = 0;
  let count = 0;

  for (const [key, value] of Object.entries(raw)) {
    if (value && value.fps) {
      score += Math.min(100, value.fps * 2);
      count++;
    }
  }

  return count > 0 ? Math.round(score / count) : 0;
}