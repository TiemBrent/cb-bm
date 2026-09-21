export async function run() {
  const results = {};

  try {
    results.latency = await runLatencyTest();
    results.throughput = await runThroughputTest();
    results.processing = await runProcessingTest();
  } catch (error) {
    return {
      raw: {},
      score: 0,
      error: error.message,
      details: { error: error.message }
    };
  }

  const score = Math.min(100, Math.round(
    Math.max(0, 100 - results.latency.avg * 10) * 40 +
    (results.throughput.samplesPerSec / 1e6) * 30 +
    (1000 / results.processing.avgTime) * 30
  ));

  return {
    raw: results,
    score,
    details: {
      latency: `${results.latency.avg.toFixed(2)} ms`,
      throughput: `${(results.throughput.samplesPerSec / 1e6).toFixed(1)} M samples/s`,
      processing: `${results.processing.avgTime.toFixed(2)} ms`
    }
  };
}

async function runLatencyTest() {
  const audioContext = new (window.AudioContext || window.webkitAudioContext)();
  const times = [];

  for (let i = 0; i < 20; i++) {
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();
    gain.gain.value = 0;

    const start = performance.now();
    oscillator.connect(gain);
    gain.connect(audioContext.destination);
    oscillator.start();
    oscillator.stop(audioContext.currentTime + 0.01);

    await new Promise(r => setTimeout(r, 10));
    times.push(performance.now() - start);
  }

  await audioContext.close();

  return {
    avg: times.reduce((a, b) => a + b, 0) / times.length,
    min: Math.min(...times),
    max: Math.max(...times)
  };
}

async function runThroughputTest() {
  const audioContext = new (window.AudioContext || window.webkitAudioContext)({
    latencyHint: 'interactive',
    sampleRate: 48000
  });

  const bufferSize = 4096;
  const channelCount = 2;
  const duration = 1;
  const totalSamples = audioContext.sampleRate * duration;

  const offlineContext = new OfflineAudioContext(
    channelCount,
    totalSamples,
    audioContext.sampleRate
  );

  const buffer = offlineContext.createBuffer(channelCount, bufferSize, audioContext.sampleRate);
  for (let ch = 0; ch < channelCount; ch++) {
    const data = buffer.getChannelData(ch);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }
  }

  const source = offlineContext.createBufferSource();
  source.buffer = buffer;
  source.loop = true;
  source.connect(offlineContext.destination);
  source.start();

  const start = performance.now();
  await offlineContext.startRendering();
  const elapsed = performance.now() - start;

  await audioContext.close();

  return {
    samplesPerSec: totalSamples / (elapsed / 1000),
    elapsed,
    sampleRate: audioContext.sampleRate
  };
}

async function runProcessingTest() {
  const audioContext = new (window.AudioContext || window.webkitAudioContext)();
  const offlineContext = new OfflineAudioContext(2, 48000 * 2, 48000);

  const buffer = offlineContext.createBuffer(2, 48000 * 2, 48000);
  for (let ch = 0; ch < 2; ch++) {
    const data = buffer.getChannelData(ch);
    for (let i = 0; i < data.length; i++) {
      data[i] = Math.sin(i * 0.01) * 0.5;
    }
  }

  const source = offlineContext.createBufferSource();
  source.buffer = buffer;

  const filter = offlineContext.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 1000;
  filter.Q.value = 1;

  const gain = offlineContext.createGain();
  gain.gain.value = 0.5;

  const compressor = offlineContext.createDynamicsCompressor();
  compressor.threshold.value = -24;
  compressor.knee.value = 30;
  compressor.ratio.value = 12;
  compressor.attack.value = 0.003;
  compressor.release.value = 0.25;

  source.connect(filter).connect(gain).connect(compressor).connect(offlineContext.destination);
  source.start();

  const start = performance.now();
  await offlineContext.startRendering();
  const elapsed = performance.now() - start;

  await audioContext.close();

  return { avgTime: elapsed };
}