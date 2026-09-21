const wasmSource = `(module
  (func $fib (param i32) (result i32)
    (local i32)
    local.get 0
    i32.const 2
    i32.le_s
    if (result i32)
      local.get 0
    else
      local.get 0
      i32.const 1
      i32.sub
      call $fib
      local.get 0
      i32.const 2
      i32.sub
      call $fib
      i32.add
    end
  )
  (export "fib" (func $fib))
)`;

async function compileWASM() {
  const binary = await WebAssembly.compile(new TextEncoder().encode(wasmSource));
  const instance = await WebAssembly.instantiate(binary);
  return instance.exports.fib;
}

const jsFib = (n) => n <= 2 ? n : jsFib(n - 1) + jsFib(n - 2);

export async function run() {
  const results = {};
  const testValue = 25;

  const wasmFib = await compileWASM();

  const startWasm = performance.now();
  const wasmResult = wasmFib(testValue);
  results.wasm = performance.now() - startWasm;

  const startJS = performance.now();
  const jsResult = jsFib(testValue);
  results.js = performance.now() - startJS;

  const speedup = results.js / results.wasm;

  results.mandelbrot = await runMandelbrotWASM();

  return {
    raw: results,
    fibResult: wasmResult,
    speedup: speedup.toFixed(2),
    score: Math.min(100, Math.round(speedup * 20)),
    details: {
      wasmTime: `${results.wasm.toFixed(2)} ms`,
      jsTime: `${results.js.toFixed(2)} ms`,
      speedup: `${speedup.toFixed(2)}x`,
      mandelbrot: `${results.mandelbrot.toFixed(2)} ms`
    }
  };
}

async function runMandelbrotWASM() {
  const mandelSource = `(module
    (import "env" "memory" (memory 1))
    (func $mandelbrot (param i32 i32 i32 i32) (result i32)
      (local i32 i32 i32 f64 f64 f64 f64 f64 i32)
      local.get 0
      local.set 4
      local.get 1
      local.set 5
      local.get 2
      local.set 6
      local.get 3
      local.set 7
      block $outer
        loop $outer_loop
          local.get 5
          local.get 7
          i32.ge_u
          br_if $outer
          local.get 4
          local.set 8
          block $inner
            loop $inner_loop
              local.get 8
              local.get 6
              i32.ge_u
              br_if $inner
              local.get 8
              i32.const 800
              i32.div_s
              f64.convert_i32_s
              f64.const 0.005
              f64.mul
              f64.const -2.0
              f64.add
              local.set 9
              local.get 5
              i32.const 600
              i32.div_s
              f64.convert_i32_s
              f64.const 0.005
              f64.mul
              f64.const -1.5
              f64.add
              local.set 10
              f64.const 0.0
              local.set 11
              f64.const 0.0
              local.set 12
              i32.const 0
              local.set 13
              block $iter
                loop $iter_loop
                  local.get 13
                  i32.const 100
                  i32.ge_s
                  br_if $iter
                  local.get 11
                  f64.mul
                  local.get 12
                  f64.mul
                  f64.sub
                  local.get 9
                  f64.add
                  local.set 14
                  local.get 11
                  f64.mul
                  f64.const 2.0
                  f64.mul
                  local.get 12
                  f64.mul
                  f64.add
                  local.get 10
                  f64.add
                  local.set 12
                  local.get 14
                  local.set 11
                  local.get 11
                  f64.mul
                  local.get 12
                  f64.mul
                  f64.add
                  f64.const 4.0
                  f64.le
                  br_if $iter_continue
                  br $iter
                  label $iter_continue
                  local.get 13
                  i32.const 1
                  i32.add
                  local.set 13
                  br $iter_loop
                end
              end
              local.get 13
              i32.store8 (local.get 0)
              local.get 0
              i32.const 1
              i32.add
              local.set 0
              local.get 8
              i32.const 1
              i32.add
              local.set 8
              br $inner_loop
            end
          end
          local.get 5
          i32.const 1
          i32.add
          local.set 5
          br $outer_loop
        end
      end
      i32.const 0
    )
    (export "mandelbrot" (func $mandelbrot))
    (export "memory" (memory 0))
  )`;

  const memory = new WebAssembly.Memory({ initial: 10 });
  const binary = await WebAssembly.compile(new TextEncoder().encode(mandelSource));
  const instance = await WebAssembly.instantiate(binary, { env: { memory } });
  const { mandelbrot } = instance.exports;

  const width = 800;
  const height = 600;
  const ptr = 0;

  const start = performance.now();
  mandelbrot(ptr, height, width, 0);
  return performance.now() - start;
}