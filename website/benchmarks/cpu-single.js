import { BenchmarkUtils, BenchmarkResult } from './utils.js';

function runSortBenchmark(arraySize = 100000) {
  const arr = new Array(arraySize).fill(0).map(() => Math.random());
  const start = performance.now();
  arr.sort((a, b) => a - b);
  return performance.now() - start;
}

function runPrimeSieve(limit = 100000) {
  const sieve = new Uint8Array(limit + 1);
  const start = performance.now();
  for (let i = 2; i * i <= limit; i++) {
    if (!sieve[i]) {
      for (let j = i * i; j <= limit; j += i) {
        sieve[j] = 1;
      }
    }
  }
  return performance.now() - start;
}

async function runSHA256(iterations = 10000) {
  const data = new TextEncoder().encode('benchmark test data '.repeat(100));
  const start = performance.now();
  for (let i = 0; i < iterations; i++) {
    await crypto.subtle.digest('SHA-256', data);
  }
  return performance.now() - start;
}

function runRegexMatching(iterations = 50000) {
  const text = 'The quick brown fox jumps over the lazy dog. '.repeat(100);
  const regex = /\b\w{4,}\b/g;
  const start = performance.now();
  for (let i = 0; i < iterations; i++) {
    text.match(regex);
  }
  return performance.now() - start;
}

function runJSONParse(iterations = 20000) {
  const json = JSON.stringify({ data: 'x'.repeat(1000), arr: Array(100).fill(0).map((_, i) => i) });
  const start = performance.now();
  for (let i = 0; i < iterations; i++) {
    JSON.parse(json);
  }
  return performance.now() - start;
}

function runJSONStringify(iterations = 20000) {
  const obj = { data: 'x'.repeat(1000), arr: Array(100).fill(0).map((_, i) => i) };
  const start = performance.now();
  for (let i = 0; i < iterations; i++) {
    JSON.stringify(obj);
  }
  return performance.now() - start;
}

function runFloatArithmetic(iterations = 5000000) {
  let sum = 0;
  const start = performance.now();
  for (let i = 0; i < iterations; i++) {
    sum += Math.sin(i) * Math.cos(i) + Math.sqrt(i + 1);
  }
  return performance.now() - start;
}

function runIntegerArithmetic(iterations = 5000000) {
  let sum = 0;
  const start = performance.now();
  for (let i = 0; i < iterations; i++) {
    sum += (i * 7) ^ (i << 3) + (i >>> 2);
  }
  return performance.now() - start;
}

async function runTypedArraySort(arraySize = 100000) {
  const arr = new Float64Array(arraySize);
  for (let i = 0; i < arraySize; i++) arr[i] = Math.random();
  const start = performance.now();
  arr.sort();
  return performance.now() - start;
}

export async function run() {
  const result = new BenchmarkResult('cpu-single', 'CPU Single-Thread', 'cpu');
  const startTime = performance.now();

  const tests = [
    { name: 'sort', fn: () => runSortBenchmark(), ops: 100000, weight: 1 },
    { name: 'primeSieve', fn: () => runPrimeSieve(), ops: 100000, weight: 1 },
    { name: 'sha256', fn: () => runSHA256(), ops: 10000, weight: 1 },
    { name: 'regex', fn: () => runRegexMatching(), ops: 50000, weight: 1 },
    { name: 'jsonParse', fn: () => runJSONParse(), ops: 20000, weight: 1 },
    { name: 'jsonStringify', fn: () => runJSONStringify(), ops: 20000, weight: 1 },
    { name: 'floatArithmetic', fn: () => runFloatArithmetic(), ops: 5000000, weight: 1 },
    { name: 'integerArithmetic', fn: () => runIntegerArithmetic(), ops: 5000000, weight: 1 },
    { name: 'typedArraySort', fn: () => runTypedArraySort(), ops: 100000, weight: 1 }
  ];

  const allOpsPerSec = [];
  const details = {};
  const raw = {};

  for (const test of tests) {
    try {
      const analysis = await BenchmarkUtils.runSamples(test.fn, 5, 2);
      const opsPerSec = test.ops / (analysis.median / 1000);
      allOpsPerSec.push(opsPerSec);

      raw[test.name] = analysis.median;
      details[test.name] = `${BenchmarkUtils.formatOpsPerSec(test.ops, analysis.median)} ops/s (median of 5)`;
    } catch (e) {
      raw[test.name] = null;
      details[test.name] = `Failed: ${e.message}`;
    }
  }

  const avgOpsPerSec = BenchmarkUtils.geometricMean(allOpsPerSec);
  const score = Math.min(100, Math.round(avgOpsPerSec / 1000000 * 100));

  result.durationMs = performance.now() - startTime;
  result.setCompleted(score, { opsPerSec: avgOpsPerSec }, details, raw, { tests: tests.map(t => t.name) });

  return result.toJSON();
}