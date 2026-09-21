# Chromebook Benchmark Suite

A comprehensive benchmarking website with a companion Chrome extension for measuring Chromebook performance.

## Features

### Website Benchmarks (Pure JS/WASM/WebGL/WebGPU)
- **CPU Single-Thread**: Sorting, prime sieve, SHA-256, regex, JSON parse/stringify, float/int arithmetic, TypedArray operations
- **CPU Multi-Thread**: Same tests distributed across Web Workers (1 to N cores)
- **WASM**: Fibonacci and Mandelbrot benchmarks comparing native vs JS
- **GPU WebGL**: Triangle/particle throughput, shader complexity, fill rate
- **GPU WebGPU**: Compute shader benchmarks (where supported)
- **Memory**: Allocation speed, read/write throughput, GC pause detection, TypedArray ops
- **Storage**: IndexedDB and Cache API read/write speeds
- **Network**: Download/upload throughput, latency/jitter, connection info
- **Rendering**: Refresh rate, DOM manipulation, CSS animation stability, layout/reflow
- **Crypto**: SubtleCrypto hash/encrypt/sign/derive throughput
- **Audio**: Web Audio processing latency and throughput
- **Canvas 2D**: Rectangles, paths, circles, text, images, compositing, transforms
- **OffscreenCanvas**: Worker-based canvas rendering comparison
- **Display & Refresh Rate**: Measured vs reported refresh rate, frame stability, dropped frames
- **Video / WebCodecs**: Video encode/decode throughput (where supported)
- **CPU Sustained**: 5-minute sustained load test with thermal tracking
- **GPU Sustained**: 5-minute sustained GPU test with frame-time tracking

### Chrome Extension (Manifest V3)
- Headless background service worker (no popup/UI)
- Communicates via `externally_connectable` with the website
- Provides system info: CPU, memory, storage, display, platform, battery
- **CPU temperature monitoring** via `chrome.system.cpu.getInfo().temperatures`
- **CPU utilization monitoring** with periodic sampling
- **Thermal telemetry streaming** to website during benchmarks
- Keeps system awake during benchmarks via `chrome.power`
- Power source detection (AC vs Battery)
- All data streams back to website for unified dashboard

### Scoring & Analysis
- Weighted formula with 17 categories
- Per-category breakdown with radar chart visualization
- Tier ranking: Flagship/High-End/Mid-Range/Budget/Entry-Level
- Statistical rigor: warm-up, repeated samples, median, variance, outlier detection
- Thermal/performance correlation charts
- Baseline measurements before benchmark
- Benchmark history with run comparison (IndexedDB)
- Export: JSON, CSV
- Feature compatibility table at startup

## Quick Start

### 1. Install the Chrome Extension
1. Open `chrome://extensions/`
2. Enable "Developer mode" (top right)
3. Click "Load unpacked" and select the `extension/` folder
4. Note the Extension ID generated (e.g., `abcdefghijklmnopqrstuvwxyz`)
5. Update `extension/manifest.json` `externally_connectable.matches` with your origin

### 2. Serve the Website
```bash
python3 server.py
```
Then open http://localhost:8080

### 3. Run Benchmarks
1. Click "Connect Extension" - status should change to "Connected"
2. Select benchmark mode: Quick (~1-2 min), Full (~5-10 min), or Stress (~15-20 min)
3. Click "Run Benchmarks" - progress bar will show live updates with CPU temp/utilization
4. View results with per-category scores, radar chart, and thermal charts
5. Click "Export JSON" or "Export CSV" to save results

## Project Structure
```
├── website/
│   ├── index.html              # Main HTML
│   ├── styles.css              # Styling (dark theme, responsive)
│   ├── app.js                  # Main application controller
│   ├── extension-bridge.js     # Extension communication
│   ├── scoring.js              # Weighted scoring engine
│   ├── dashboard.js            # Results visualization
│   ├── benchmarks/             # Individual benchmark modules
│   │   ├── runner.js           # Benchmark orchestration
│   │   ├── utils.js            # Shared utilities (stats, warm-up)
│   │   ├── cpu-single.js       # Single-thread CPU tests
│   │   ├── cpu-multi.js        # Multi-thread CPU tests
│   │   ├── cpu-sustained.js    # Sustained CPU performance
│   │   ├── wasm.js             # WebAssembly benchmarks
│   │   ├── gpu-webgl.js        # WebGL benchmarks
│   │   ├── gpu-webgpu.js       # WebGPU benchmarks
│   │   ├── gpu-sustained.js    # Sustained GPU performance
│   │   ├── memory.js           # Memory benchmarks
│   │   ├── storage.js          # IndexedDB/Cache API
│   │   ├── network.js          # Network benchmarks
│   │   ├── rendering.js        # DOM/CSS/Layout
│   │   ├── canvas2d.js         # Canvas 2D benchmarks
│   │   ├── offscreen-canvas.js # OffscreenCanvas benchmarks
│   │   ├── display.js          # Refresh rate measurement
│   │   ├── video.js            # WebCodecs video benchmarks
│   │   ├── crypto.js           # Web Crypto benchmarks
│   │   ├── audio.js            # Web Audio benchmarks
│   │   ├── features.js         # Feature detection
│   │   └── history.js          # IndexedDB history
│   └── server.py               # Local dev server with COOP/COEP headers
└── extension/
    ├── manifest.json           # Manifest V3
    └── background.js           # Service worker
```

## Extension Configuration

Update `extension/manifest.json` with your website's origin:

```json
"externally_connectable": {
  "matches": ["http://localhost:8080/*", "https://your-domain.com/*"]
}
```

**Do NOT use wildcards like `https://*/*`** - this would allow any website to access the extension.

## Requirements
- Chrome 88+ (for Manifest V3, WebGPU, Web Workers)
- HTTPS or localhost (for WebGPU, Service Workers, some APIs)
- Chrome OS or Chrome on any platform (best on physical ChromeOS devices)

## Notes
- WebGPU requires Chrome 113+ and appropriate hardware
- CPU temperature only available on physical ChromeOS devices via extension
- Battery API in extension context works better than page context
- No CPU clock speed/frequency APIs available in Chrome - not faked
- Results are relative; compare same device across runs for consistency
- Sustained tests take 5+ minutes each - plan accordingly

## Benchmark Modes

| Mode | Duration | Tests |
|------|----------|-------|
| Quick | ~1-2 min | Core CPU, GPU, Memory, Storage, Rendering |
| Full | ~5-10 min | All 17 categories including sustained tests |
| Stress | ~15-20 min | Full + 10-min sustained CPU/GPU |

## Scoring Methodology

See [SCORING.md](SCORING.md) for detailed scoring formulas, normalization baselines, and tier definitions.

## Privacy

- No data collected or uploaded by default
- Extension only exposes system info required for benchmarks
- Minimal permissions: `system.cpu`, `system.memory`, `system.storage`, `system.display`, `power`
- Local storage only (IndexedDB for history)
- Export is user-initiated

## License

Open Source - MIT License