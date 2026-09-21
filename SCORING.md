# Chromebook Benchmark Suite - Scoring Methodology

## Overview

The final benchmark score is a weighted combination of individual category scores, normalized to a 0-100 scale. The weighting reflects the relative importance of each subsystem for typical Chromebook workloads.

## Category Weights

| Category | Weight | Description |
|----------|--------|-------------|
| CPU Single-Thread | 12% | JavaScript/WASM single-thread performance |
| CPU Multi-Thread | 12% | Multi-core scaling efficiency |
| WASM | 8% | WebAssembly vs JavaScript performance |
| GPU WebGL | 10% | WebGL rendering throughput |
| GPU WebGPU | 10% | WebGPU compute performance (where available) |
| Memory | 8% | Allocation, bandwidth, GC behavior |
| Storage | 6% | IndexedDB & Cache API read/write |
| Network | 4% | Download/upload throughput, latency |
| Rendering | 6% | DOM, CSS, layout, refresh rate |
| Crypto | 2% | Web Crypto API throughput |
| Audio | 2% | Web Audio processing latency |
| Canvas 2D | 4% | 2D canvas rendering |
| OffscreenCanvas | 2% | Worker-based canvas rendering |
| Display & Refresh | 4% | Measured refresh rate, frame stability |
| Video / WebCodecs | 4% | Video encode/decode throughput |
| CPU Sustained | 4% | Performance retention over 5 minutes |
| GPU Sustained | 4% | GPU performance retention over 5 minutes |

**Total: 100%**

## Score Normalization

Each category uses a specific normalization formula appropriate for its metric type:

### Throughput-Based Categories (CPU, Memory, Storage, Crypto, Canvas 2D, OffscreenCanvas)
```
score = min(100, (measured_ops_per_sec / baseline_ops_per_sec) * 100)
```

Baselines (ops/sec):
- CPU Single-Thread: 1,000,000
- CPU Multi-Thread: 2,000,000
- Memory: 10 GB/s
- Storage: 50 MB/s
- Crypto: 1,000,000
- Canvas 2D: 10,000,000
- OffscreenCanvas: 1,000,000

### FPS-Based Categories (GPU WebGL, Rendering, Video)
```
score = min(100, (measured_fps / baseline_fps) * 100)
```

Baselines:
- GPU WebGL: 60 FPS
- Rendering: 60 FPS
- Video: 30 FPS

### Speedup-Based Categories (WASM)
```
score = min(100, wasm_speedup_over_js * baseline_multiplier)
```
Baseline multiplier: 5x

### Retention-Based Categories (Sustained CPU/GPU)
```
score = (final_performance / initial_performance) * 100
```
Measures thermal throttling / sustained performance capability.

### Stability-Based Categories (Display)
```
score = 100 - (dropped_frames / total_frames) * 1000
```
Measures frame consistency and dropped frame rate.

### Latency-Based Categories (Audio)
```
score = max(0, 100 - avg_latency_ms * 10)
```
Lower latency = higher score.

## Statistical Rigor

Each benchmark runs with:
- **Warm-up phase**: 2-3 iterations (excluded from measurements)
- **Sample count**: 5 timed samples (3 for sustained tests)
- **Primary metric**: Median (robust against outliers)
- **Reported**: Median, mean, min, max, standard deviation, coefficient of variation
- **Outlier detection**: IQR method (1.5x IQR)

## Final Score Calculation

```
final_score = Σ(category_score × category_weight) / Σ(category_weight)
```

Only categories with valid measurements contribute to the denominator.

## Tier Classification

| Score Range | Tier | Color |
|-------------|------|-------|
| 90-100 | Flagship | Gold (#ffd700) |
| 75-89 | High-End | Silver (#c0c0c0) |
| 60-74 | Mid-Range | Bronze (#cd7f32) |
| 40-59 | Budget | Gray (#8b8b8b) |
| 0-39 | Entry-Level | Dark Gray (#666666) |

## What the Score Does NOT Measure

The following are reported as context but do NOT directly affect the score:
- CPU model/architecture
- RAM capacity
- Storage capacity
- Display resolution
- GPU model name
- Battery percentage
- CPU temperature (shown as diagnostic only)

## Confidence Indicators

- **Low variance** (CV < 5%): High confidence
- **Medium variance** (CV 5-15%): Moderate confidence
- **High variance** (CV > 15%): Low confidence - results may be unstable

## Versioning

Scores are only comparable within the same benchmark suite version. The version is recorded with each run.