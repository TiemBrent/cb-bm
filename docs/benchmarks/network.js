const TEST_FILE_URL = 'https://httpbin.org/bytes/10485760';
const LATENCY_URL = 'https://httpbin.org/get';
const UPLOAD_URL = 'https://httpbin.org/post';

export async function run() {
  const results = {};

  results.download = await runDownloadTest();
  results.upload = await runUploadTest();
  results.latency = await runLatencyTest();
  results.connectionInfo = getConnectionInfo();

  const score = Math.min(100, Math.round(
    (results.download.speed / 1e6) * 40 +
    (results.upload.speed / 1e6) * 30 +
    Math.max(0, 100 - results.latency.avg) * 0.3
  ));

  return {
    raw: results,
    score,
    details: {
      download: `${(results.download.speed / 1e6).toFixed(1)} MB/s`,
      upload: `${(results.upload.speed / 1e6).toFixed(1)} MB/s`,
      latency: `${results.latency.avg.toFixed(1)} ms (avg)`,
      jitter: `${results.latency.jitter.toFixed(1)} ms`,
      connection: results.connectionInfo.effectiveType || 'unknown'
    }
  };
}

async function runDownloadTest() {
  const start = performance.now();
  const response = await fetch(TEST_FILE_URL, { cache: 'no-store' });
  const reader = response.body.getReader();
  let totalBytes = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    totalBytes += value.length;
  }

  const elapsed = performance.now() - start;
  return {
    speed: totalBytes / (elapsed / 1000),
    bytes: totalBytes,
    time: elapsed
  };
}

async function runUploadTest() {
  const data = new Uint8Array(5 * 1024 * 1024);
  crypto.getRandomValues(data);
  const blob = new Blob([data]);

  const start = performance.now();
  const response = await fetch(UPLOAD_URL, {
    method: 'POST',
    body: blob,
    headers: { 'Content-Type': 'application/octet-stream' }
  });
  await response.json();
  const elapsed = performance.now() - start;

  return {
    speed: data.length / (elapsed / 1000),
    bytes: data.length,
    time: elapsed
  };
}

async function runLatencyTest() {
  const samples = 10;
  const times = [];

  for (let i = 0; i < samples; i++) {
    const start = performance.now();
    try {
      await fetch(LATENCY_URL, { cache: 'no-store' });
      times.push(performance.now() - start);
    } catch {
      times.push(9999);
    }
    await new Promise(r => setTimeout(r, 100));
  }

  const validTimes = times.filter(t => t < 9999);
  const avg = validTimes.reduce((a, b) => a + b, 0) / validTimes.length;
  const jitter = Math.sqrt(
    validTimes.reduce((sum, t) => sum + Math.pow(t - avg, 2), 0) / validTimes.length
  );

  return { avg, jitter, samples: validTimes.length, raw: times };
}

function getConnectionInfo() {
  const nav = navigator;
  const conn = nav.connection || nav.mozConnection || nav.webkitConnection;
  if (!conn) return { supported: false };

  return {
    supported: true,
    effectiveType: conn.effectiveType,
    downlink: conn.downlink,
    rtt: conn.rtt,
    saveData: conn.saveData
  };
}