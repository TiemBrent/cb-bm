const computeShaderSource = `
  @group(0) @binding(0) var<storage, read_write> data: array<f32>;
  @compute @workgroup_size(64)
  fn main(@builtin(global_invocation_id) id: vec3<u32>) {
    let i = id.x;
    if (i >= arrayLength(&data)) { return; }
    var x = data[i];
    for (var j = 0u; j < 100u; j++) {
      x = sin(x) * cos(x) + 1.0;
    }
    data[i] = x;
  }
`;

export async function run() {
  if (!navigator.gpu) {
    return {
      raw: {},
      score: 0,
      error: 'WebGPU not supported',
      details: { supported: false }
    };
  }

  try {
    const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
    if (!adapter) {
      throw new Error('No WebGPU adapter');
    }
    const device = await adapter.requestDevice();

    const results = {};

    const bufferSize = 1024 * 1024;
    const storageBuffer = device.createBuffer({
      size: bufferSize * 4,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST,
      mappedAtCreation: true
    });
    new Float32Array(storageBuffer.getMappedRange()).fill(1.0);
    storageBuffer.unmap();

    const shaderModule = device.createShaderModule({ code: computeShaderSource });
    const pipeline = device.createComputePipeline({
      layout: 'auto',
      compute: { module: shaderModule, entryPoint: 'main' }
    });

    const bindGroup = device.createBindGroup({
      layout: pipeline.getBindGroupLayout(0),
      entries: [{ binding: 0, resource: { buffer: storageBuffer } }]
    });

    const iterations = 10;
    const commandEncoder = device.createCommandEncoder();
    const passEncoder = commandEncoder.beginComputePass();
    passEncoder.setPipeline(pipeline);
    passEncoder.setBindGroup(0, bindGroup);
    passEncoder.dispatchWorkgroups(Math.ceil(bufferSize / 64));
    passEncoder.end();
    const commands = commandEncoder.finish();

    const start = performance.now();
    for (let i = 0; i < iterations; i++) {
      device.queue.submit([commands]);
    }
    await device.queue.onSubmittedWorkDone();
    results.compute = performance.now() - start;

    results.memoryBandwidth = await runMemoryBandwidthTest(device);

    return {
      raw: results,
      score: Math.min(100, Math.round(1000 / results.compute * 100)),
      details: {
        computeTime: `${results.compute.toFixed(2)} ms`,
        memoryBandwidth: `${results.memoryBandwidth.toFixed(1)} GB/s`,
        adapter: adapter.name
      }
    };
  } catch (error) {
    return {
      raw: {},
      score: 0,
      error: error.message,
      details: { supported: false, error: error.message }
    };
  }
}

async function runMemoryBandwidthTest(device) {
  const size = 64 * 1024 * 1024;
  const buffer = device.createBuffer({
    size,
    usage: GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST
  });

  const readback = device.createBuffer({
    size,
    usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ
  });

  const encoder = device.createCommandEncoder();
  encoder.copyBufferToBuffer(buffer, 0, readback, 0, size);
  device.queue.submit([encoder.finish()]);

  const start = performance.now();
  await readback.mapAsync(GPUMapMode.READ);
  const elapsed = performance.now() - start;
  readback.unmap();

  return (size / elapsed) * 1000 / 1e9;
}