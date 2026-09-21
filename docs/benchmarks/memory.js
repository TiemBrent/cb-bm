export async function run() {
  const results = {};

  results.allocation = await runAllocationTest();
  results.readWrite = await runReadWriteTest();
  results.gcPause = await runGCPauseTest();
  results.typedArrayOps = await runTypedArrayOpsTest();

  const score = Math.min(100, Math.round(
    (1000 / results.allocation.avgTime) * 10 +
    (results.readWrite.throughput / 1e9) * 50 +
    (1000 / results.gcPause.avgPause) * 20 +
    (results.typedArrayOps.opsPerSec / 1e8) * 20
  ));

  return {
    raw: results,
    score,
    details: {
      allocation: `${results.allocation.avgTime.toFixed(2)} ms (avg)`,
      readWrite: `${(results.readWrite.throughput / 1e9).toFixed(2)} GB/s`,
      gcPause: `${results.gcPause.avgPause.toFixed(2)} ms (avg)`,
      typedArrays: `${(results.typedArrayOps.opsPerSec / 1e6).toFixed(0)} M ops/s`
    }
  };
}

async function runAllocationTest() {
  const sizes = [1024 * 1024, 10 * 1024 * 1024, 50 * 1024 * 1024];
  const iterations = 10;
  const times = [];

  for (const size of sizes) {
    for (let i = 0; i < iterations; i++) {
      const start = performance.now();
      new Float64Array(size / 8);
      times.push(performance.now() - start);
    }
  }

  return {
    avgTime: times.reduce((a, b) => a + b, 0) / times.length,
    times
  };
}

async function runReadWriteTest() {
  const size = 100 * 1024 * 1024;
  const arr = new Float64Array(size / 8);
  const iterations = 5;

  let readTime = 0, writeTime = 0;

  for (let i = 0; i < iterations; i++) {
    const writeStart = performance.now();
    for (let j = 0; j < arr.length; j++) arr[j] = Math.random();
    writeTime += performance.now() - writeStart;

    const readStart = performance.now();
    let sum = 0;
    for (let j = 0; j < arr.length; j++) sum += arr[j];
    readTime += performance.now() - readStart;
  }

  const avgWrite = writeTime / iterations;
  const avgRead = readTime / iterations;
  const throughput = (size * 2) / ((avgWrite + avgRead) / 1000);

  return { readTime: avgRead, writeTime: avgWrite, throughput };
}

async function runGCPauseTest() {
  const pauses = [];
  const testArrays = [];

  for (let i = 0; i < 20; i++) {
    const start = performance.now();
    const arr = new Array(100000).fill(0).map(() => ({ data: new Array(100).fill(Math.random()) }));
    testArrays.push(arr);
    const elapsed = performance.now() - start;

    if (elapsed > 2) {
      pauses.push(elapsed);
    }

    if (i % 5 === 4) {
      testArrays.length = 0;
      if (globalThis.gc) globalThis.gc();
      await new Promise(r => setTimeout(r, 10));
    }
  }

  return {
    avgPause: pauses.length > 0 ? pauses.reduce((a, b) => a + b, 0) / pauses.length : 0,
    pauseCount: pauses.length,
    pauses
  };
}

async function runTypedArrayOpsTest() {
  const size = 10 * 1024 * 1024;
  const arr = new Float64Array(size / 8);
  const iterations = 100;
  const ops = [];

  for (let i = 0; i < iterations; i++) {
    const start = performance.now();
    for (let j = 0; j < arr.length; j++) {
      arr[j] = Math.sin(arr[j]) * 2 + 1;
    }
    ops.push(performance.now() - start);
  }

  const avgTime = ops.reduce((a, b) => a + b, 0) / ops.length;
  const opsPerSec = (size / 8) / (avgTime / 1000);

  return { avgTime, opsPerSec };
}