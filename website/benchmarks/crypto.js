export async function run() {
  const results = {};

  results.hash = await runHashTest();
  results.encrypt = await runEncryptTest();
  results.sign = await runSignTest();
  results.derive = await runDeriveTest();

  const score = Math.min(100, Math.round(
    (results.hash.opsPerSec / 1e6) * 30 +
    (results.encrypt.opsPerSec / 1e5) * 30 +
    (results.sign.opsPerSec / 1e4) * 20 +
    (results.derive.opsPerSec / 1e5) * 20
  ));

  return {
    raw: results,
    score,
    details: {
      hash: `${(results.hash.opsPerSec / 1e6).toFixed(1)} M ops/s`,
      encrypt: `${(results.encrypt.opsPerSec / 1e3).toFixed(1)} K ops/s`,
      sign: `${(results.sign.opsPerSec / 1e3).toFixed(1)} K ops/s`,
      derive: `${(results.derive.opsPerSec / 1e3).toFixed(1)} K ops/s`
    }
  };
}

async function runHashTest() {
  const algorithms = ['SHA-256', 'SHA-384', 'SHA-512'];
  const data = new TextEncoder().encode('x'.repeat(1024));
  const iterations = 10000;
  const results = {};

  for (const algo of algorithms) {
    const start = performance.now();
    for (let i = 0; i < iterations; i++) {
      await crypto.subtle.digest(algo, data);
    }
    const elapsed = performance.now() - start;
    results[algo] = { opsPerSec: iterations / (elapsed / 1000), time: elapsed };
  }

  const avgOps = Object.values(results).reduce((sum, r) => sum + r.opsPerSec, 0) / Object.values(results).length;
  return { ...results, opsPerSec: avgOps };
}

async function runEncryptTest() {
  const key = await crypto.subtle.generateKey(
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = new TextEncoder().encode('x'.repeat(1024));
  const iterations = 5000;

  const start = performance.now();
  for (let i = 0; i < iterations; i++) {
    await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, data);
  }
  const elapsed = performance.now() - start;

  return { opsPerSec: iterations / (elapsed / 1000), time: elapsed };
}

async function runSignTest() {
  const keyPair = await crypto.subtle.generateKey(
    { name: 'RSA-PSS', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
    false,
    ['sign', 'verify']
  );
  const data = new TextEncoder().encode('x'.repeat(256));
  const iterations = 1000;

  const start = performance.now();
  for (let i = 0; i < iterations; i++) {
    await crypto.subtle.sign({ name: 'RSA-PSS', saltLength: 32 }, keyPair.privateKey, data);
  }
  const elapsed = performance.now() - start;

  return { opsPerSec: iterations / (elapsed / 1000), time: elapsed };
}

async function runDeriveTest() {
  const keyMaterial = await crypto.subtle.generateKey(
    { name: 'PBKDF2' },
    false,
    ['deriveBits']
  );
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iterations = 10000;

  const start = performance.now();
  for (let i = 0; i < iterations; i++) {
    await crypto.subtle.deriveBits(
      { name: 'PBKDF2', salt, iterations: 1000, hash: 'SHA-256' },
      keyMaterial,
      256
    );
  }
  const elapsed = performance.now() - start;

  return { opsPerSec: iterations / (elapsed / 1000), time: elapsed };
}