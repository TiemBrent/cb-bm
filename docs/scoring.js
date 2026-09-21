const CATEGORY_WEIGHTS = {
  'cpu-single': 0.12,
  'cpu-multi': 0.12,
  'wasm': 0.08,
  'gpu-webgl': 0.10,
  'gpu-webgpu': 0.10,
  'memory': 0.08,
  'storage': 0.06,
  'network': 0.04,
  'rendering': 0.06,
  'crypto': 0.02,
  'audio': 0.02,
  'canvas2d': 0.04,
  'offscreen-canvas': 0.02,
  'display': 0.04,
  'video': 0.04,
  'cpu-sustained': 0.04,
  'gpu-sustained': 0.04
};

const CATEGORY_LABELS = {
  'cpu-single': 'CPU Single-Thread',
  'cpu-multi': 'CPU Multi-Thread',
  'wasm': 'WASM',
  'gpu-webgl': 'GPU WebGL',
  'gpu-webgpu': 'GPU WebGPU',
  'memory': 'Memory',
  'storage': 'Storage',
  'network': 'Network',
  'rendering': 'Rendering',
  'crypto': 'Crypto',
  'audio': 'Audio',
  'canvas2d': 'Canvas 2D',
  'offscreen-canvas': 'OffscreenCanvas',
  'display': 'Display & Refresh',
  'video': 'Video / WebCodecs',
  'cpu-sustained': 'CPU Sustained',
  'gpu-sustained': 'GPU Sustained'
};

const SCORE_NORMALIZATION = {
  'cpu-single': { baseline: 1000000, type: 'throughput' },
  'cpu-multi': { baseline: 2000000, type: 'throughput' },
  'wasm': { baseline: 5, type: 'speedup' },
  'gpu-webgl': { baseline: 60, type: 'fps' },
  'gpu-webgpu': { baseline: 1000, type: 'throughput' },
  'memory': { baseline: 10, type: 'throughput' },
  'storage': { baseline: 50, type: 'throughput' },
  'network': { baseline: 100, type: 'throughput' },
  'rendering': { baseline: 60, type: 'fps' },
  'crypto': { baseline: 1000000, type: 'throughput' },
  'audio': { baseline: 100, type: 'latency' },
  'canvas2d': { baseline: 10000000, type: 'throughput' },
  'offscreen-canvas': { baseline: 1000000, type: 'throughput' },
  'display': { baseline: 100, type: 'stability' },
  'video': { baseline: 30, type: 'fps' },
  'cpu-sustained': { baseline: 100, type: 'retention' },
  'gpu-sustained': { baseline: 100, type: 'retention' }
};

export class ScoringEngine {
  calculate(results) {
    const scores = {};
    let totalWeight = 0;
    let weightedSum = 0;

    for (const [id, weight] of Object.entries(CATEGORY_WEIGHTS)) {
      const result = results[id];
      if (result && typeof result.score === 'number' && result.status !== 'failed' && result.status !== 'unsupported') {
        const normalizedScore = this.normalizeScore(id, result);
        scores[id] = {
          label: CATEGORY_LABELS[id],
          score: Math.round(normalizedScore),
          weight,
          raw: result,
          normalized: normalizedScore
        };
        weightedSum += normalizedScore * weight;
        totalWeight += weight;
      } else {
        scores[id] = {
          label: CATEGORY_LABELS[id],
          score: 0,
          weight,
          raw: result,
          error: result?.error || result?.status || 'No score available'
        };
      }
    }

    const finalScore = totalWeight > 0 ? Math.round(weightedSum / totalWeight) : 0;

    return {
      categories: scores,
      finalScore,
      totalWeight,
      normalization: SCORE_NORMALIZATION
    };
  }

  normalizeScore(categoryId, result) {
    const norm = SCORE_NORMALIZATION[categoryId];
    if (!norm) return result.score;

    const metrics = result.metrics || {};
    
    switch (norm.type) {
      case 'throughput':
        if (metrics.opsPerSec) {
          return Math.min(100, (metrics.opsPerSec / norm.baseline) * 100);
        }
        if (metrics.throughput) {
          return Math.min(100, (metrics.throughput / (norm.baseline * 1e9)) * 100);
        }
        break;
      case 'fps':
        if (metrics.avgFPS) {
          return Math.min(100, (metrics.avgFPS / norm.baseline) * 100);
        }
        if (metrics.fps) {
          return Math.min(100, (metrics.fps / norm.baseline) * 100);
        }
        break;
      case 'speedup':
        if (metrics.speedup) {
          return Math.min(100, metrics.speedup * norm.baseline);
        }
        break;
      case 'retention':
        if (metrics.retention) {
          return metrics.retention;
        }
        break;
      case 'stability':
        if (metrics.stability) {
          return metrics.stability;
        }
        break;
      case 'latency':
        if (metrics.avg) {
          return Math.max(0, 100 - metrics.avg * 10);
        }
        break;
    }

    return result.score;
  }

  getFinalScore(scores) {
    return scores.finalScore;
  }

  getTier(score) {
    if (score >= 90) return { label: 'Flagship', color: '#ffd700' };
    if (score >= 75) return { label: 'High-End', color: '#c0c0c0' };
    if (score >= 60) return { label: 'Mid-Range', color: '#cd7f32' };
    if (score >= 40) return { label: 'Budget', color: '#8b8b8b' };
    return { label: 'Entry-Level', color: '#666666' };
  }

  getScoreBreakdown(scores) {
    const breakdown = {};
    for (const [id, cat] of Object.entries(scores.categories)) {
      if (cat.raw && cat.raw.metrics) {
        breakdown[id] = {
          label: cat.label,
          score: cat.score,
          weight: cat.weight,
          metrics: cat.raw.metrics,
          formula: this.getFormulaString(id)
        };
      }
    }
    return breakdown;
  }

  getFormulaString(categoryId) {
    const norm = SCORE_NORMALIZATION[categoryId];
    if (!norm) return 'Default scoring';

    switch (norm.type) {
      case 'throughput':
        return `min(100, (measured_ops_per_sec / ${norm.baseline.toLocaleString()}) * 100)`;
      case 'fps':
        return `min(100, (measured_fps / ${norm.baseline}) * 100)`;
      case 'speedup':
        return `min(100, speedup * ${norm.baseline})`;
      case 'retention':
        return `final_performance / initial_performance * 100`;
      case 'stability':
        return `100 - (dropped_frames / total_frames) * 1000`;
      case 'latency':
        return `max(0, 100 - avg_latency_ms * 10)`;
    }
    return 'Custom';
  }
}