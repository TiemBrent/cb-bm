const DB_NAME = 'benchmark_db';
const STORE_NAME = 'benchmark_store';

export async function run() {
  const results = {};

  results.indexedDB = await runIndexedDBTest();
  results.cacheAPI = await runCacheAPITest();

  await cleanup();

  const score = Math.min(100, Math.round(
    (results.indexedDB.writeSpeed / 1e6) * 30 +
    (results.indexedDB.readSpeed / 1e6) * 30 +
    (results.cacheAPI.writeSpeed / 1e6) * 20 +
    (results.cacheAPI.readSpeed / 1e6) * 20
  ));

  return {
    raw: results,
    score,
    details: {
      indexedDBWrite: `${(results.indexedDB.writeSpeed / 1e6).toFixed(1)} MB/s`,
      indexedDBRead: `${(results.indexedDB.readSpeed / 1e6).toFixed(1)} MB/s`,
      cacheWrite: `${(results.cacheAPI.writeSpeed / 1e6).toFixed(1)} MB/s`,
      cacheRead: `${(results.cacheAPI.readSpeed / 1e6).toFixed(1)} MB/s`
    }
  };
}

async function runIndexedDBTest() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onerror = () => reject(request.error);
    request.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
    request.onsuccess = async (e) => {
      const db = e.target.result;
      const recordSize = 10 * 1024;
      const recordCount = 1000;
      const data = new Uint8Array(recordSize);
      crypto.getRandomValues(data);
      const records = Array.from({ length: recordCount }, (_, i) => ({
        id: i,
        data: Array.from(data),
        timestamp: Date.now()
      }));

      const writeStart = performance.now();
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      for (const record of records) {
        await new Promise((res, rej) => {
          const req = store.put(record);
          req.onsuccess = res;
          req.onerror = rej;
        });
      }
      await new Promise((res, rej) => {
        tx.oncomplete = res;
        tx.onerror = rej;
      });
      const writeTime = performance.now() - writeStart;

      const readStart = performance.now();
      const readTx = db.transaction(STORE_NAME, 'readonly');
      const readStore = readTx.objectStore(STORE_NAME);
      for (let i = 0; i < recordCount; i++) {
        await new Promise((res, rej) => {
          const req = readStore.get(i);
          req.onsuccess = res;
          req.onerror = rej;
        });
      }
      await new Promise((res, rej) => {
        readTx.oncomplete = res;
        readTx.onerror = rej;
      });
      const readTime = performance.now() - readStart;

      const totalBytes = recordCount * recordSize;
      resolve({
        writeSpeed: totalBytes / (writeTime / 1000),
        readSpeed: totalBytes / (readTime / 1000),
        writeTime,
        readTime
      });
    };
  });
}

async function runCacheAPITest() {
  const cacheName = 'benchmark_cache';
  const cache = await caches.open(cacheName);
  await cache.keys().then(keys => Promise.all(keys.map(k => cache.delete(k))));

  const recordSize = 10 * 1024;
  const recordCount = 1000;
  const data = new Uint8Array(recordSize);
  crypto.getRandomValues(data);
  const blob = new Blob([data]);

  const requests = Array.from({ length: recordCount }, (_, i) =>
    new Request(`/benchmark/${i}`, { method: 'GET' })
  );
  const responses = requests.map(r => new Response(blob.clone()));

  const writeStart = performance.now();
  await Promise.all(requests.map((req, i) => cache.put(req, responses[i])));
  const writeTime = performance.now() - writeStart;

  const readStart = performance.now();
  await Promise.all(requests.map(req => cache.match(req)));
  const readTime = performance.now() - readStart;

  const totalBytes = recordCount * recordSize;
  return {
    writeSpeed: totalBytes / (writeTime / 1000),
    readSpeed: totalBytes / (readTime / 1000),
    writeTime,
    readTime
  };
}

async function cleanup() {
  try {
    await indexedDB.deleteDatabase(DB_NAME);
    await caches.delete('benchmark_cache');
  } catch {}
}