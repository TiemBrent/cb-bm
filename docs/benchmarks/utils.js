export class BenchmarkUtils {
  static async warmUp(fn, iterations = 3) {
    for (let i = 0; i < iterations; i++) {
      await fn();
    }
  }

  static async runSamples(fn, sampleCount = 5, warmupCount = 2) {
    await this.warmUp(fn, warmupCount);

    const samples = [];
    for (let i = 0; i < sampleCount; i++) {
      const result = await fn();
      samples.push(result);
    }

    return this.analyzeSamples(samples);
  }

  static analyzeSamples(samples) {
    if (samples.length === 0) {
      return { median: 0, mean: 0, min: 0, max: 0, variance: 0, stdDev: 0, outliers: [] };
    }

    const sorted = [...samples].sort((a, b) => a - b);
    const n = sorted.length;

    const median = n % 2 === 0
      ? (sorted[n / 2 - 1] + sorted[n / 2]) / 2
      : sorted[Math.floor(n / 2)];

    const mean = sorted.reduce((a, b) => a + b, 0) / n;
    const min = sorted[0];
    const max = sorted[n - 1];

    const variance = sorted.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / n;
    const stdDev = Math.sqrt(variance);

    const q1 = sorted[Math.floor(n * 0.25)];
    const q3 = sorted[Math.floor(n * 0.75)];
    const iqr = q3 - q1;
    const lowerBound = q1 - 1.5 * iqr;
    const upperBound = q3 + 1.5 * iqr;
    const outliers = sorted.filter(v => v < lowerBound || v > upperBound);

    const cv = mean > 0 ? stdDev / mean : 0;
    let confidence = 'high';
    if (cv > 0.15) confidence = 'low';
    else if (cv > 0.05) confidence = 'medium';

    return {
      samples: sorted,
      median,
      mean,
      min,
      max,
      variance,
      stdDev,
      q1,
      q3,
      iqr,
      outliers,
      coefficientOfVariation: cv,
      confidence,
      percentiles: {
        p25: sorted[Math.floor(n * 0.25)],
        p50: median,
        p75: sorted[Math.floor(n * 0.75)],
        p90: sorted[Math.floor(n * 0.90)],
        p95: sorted[Math.floor(n * 0.95)],
        p99: sorted[Math.floor(n * 0.99)]
      }
    };
  }

  static formatOpsPerSec(ops, timeMs) {
    return (ops / (timeMs / 1000)).toFixed(0);
  }

  static formatThroughput(bytes, timeMs) {
    return (bytes / (timeMs / 1000) / 1e9).toFixed(2);
  }

  static formatTime(ms) {
    return ms.toFixed(2);
  }

  static calculateScore(value, baseline, maxScore = 100) {
    return Math.min(maxScore, Math.round((value / baseline) * maxScore));
  }

  static geometricMean(values) {
    if (values.length === 0) return 0;
    const product = values.reduce((a, b) => a * b, 1);
    return Math.pow(product, 1 / values.length);
  }

  static median(values) {
    if (values.length === 0) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const n = sorted.length;
    return n % 2 === 0
      ? (sorted[n / 2 - 1] + sorted[n / 2]) / 2
      : sorted[Math.floor(n / 2)];
  }
}

export class BenchmarkResult {
  constructor(id, name, category) {
    this.id = id;
    this.name = name;
    this.category = category;
    this.status = 'pending';
    this.durationMs = 0;
    this.score = 0;
    this.metrics = {};
    this.samples = [];
    this.metadata = {};
    this.details = {};
    this.error = null;
  }

  setCompleted(score, metrics, details, samples, metadata) {
    this.status = 'completed';
    this.score = score;
    this.metrics = metrics;
    this.details = details;
    this.samples = samples;
    this.metadata = metadata;
  }

  setFailed(error) {
    this.status = 'failed';
    this.error = error;
  }

  setUnsupported(reason) {
    this.status = 'unsupported';
    this.error = reason;
  }

  setSkipped(reason) {
    this.status = 'skipped';
    this.error = reason;
  }

  toJSON() {
    return {
      id: this.id,
      name: this.name,
      category: this.category,
      status: this.status,
      durationMs: this.durationMs,
      score: this.score,
      metrics: this.metrics,
      samples: this.samples,
      metadata: this.metadata,
      details: this.details,
      error: this.error
    };
  }
}