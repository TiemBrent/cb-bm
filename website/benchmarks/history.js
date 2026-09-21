const DB_NAME = 'chromebook-benchmark-history';
const STORE_NAME = 'runs';
const DB_VERSION = 1;

export class BenchmarkHistory {
  constructor() {
    this.db = null;
  }

  async init() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        this.db = request.result;
        resolve();
      };
      
      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true });
          store.createIndex('timestamp', 'timestamp', { unique: false });
          store.createIndex('finalScore', 'finalScore', { unique: false });
        }
      };
    });
  }

  async saveRun(runData) {
    if (!this.db) await this.init();
    
    const data = {
      ...runData,
      timestamp: runData.timestamp || Date.now(),
      version: runData.version || '1.0.0'
    };

    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const request = store.add(data);
      
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async getAllRuns() {
    if (!this.db) await this.init();
    
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const request = store.getAll();
      
      request.onsuccess = () => resolve(request.result.sort((a, b) => b.timestamp - a.timestamp));
      request.onerror = () => reject(request.error);
    });
  }

  async getLatestRun() {
    const runs = await this.getAllRuns();
    return runs[0] || null;
  }

  async compareWithLatest(currentRun) {
    const latest = await this.getLatestRun();
    if (!latest) return null;

    const comparison = {
      current: currentRun,
      previous: latest,
      differences: {}
    };

    if (currentRun.scores && latest.scores) {
      for (const [catId, currentCat] of Object.entries(currentRun.scores.categories)) {
        const prevCat = latest.scores.categories[catId];
        if (prevCat && typeof currentCat.score === 'number' && typeof prevCat.score === 'number') {
          const diff = currentCat.score - prevCat.score;
          const pct = prevCat.score !== 0 ? ((diff / prevCat.score) * 100).toFixed(1) : 'N/A';
          comparison.differences[catId] = {
            label: currentCat.label,
            current: currentCat.score,
            previous: prevCat.score,
            difference: diff,
            percentChange: pct
          };
        }
      }
    }

    if (currentRun.finalScore !== undefined && latest.finalScore !== undefined) {
      const diff = currentRun.finalScore - latest.finalScore;
      const pct = latest.finalScore !== 0 ? ((diff / latest.finalScore) * 100).toFixed(1) : 'N/A';
      comparison.differences.overall = {
        label: 'Overall Score',
        current: currentRun.finalScore,
        previous: latest.finalScore,
        difference: diff,
        percentChange: pct
      };
    }

    return comparison;
  }

  async deleteRun(id) {
    if (!this.db) await this.init();
    
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const request = store.delete(id);
      
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async clearHistory() {
    if (!this.db) await this.init();
    
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const request = store.clear();
      
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }
}