export async function run() {
  const results = {};

  results.refreshRate = await detectRefreshRate();
  results.domManipulation = await runDOMManipulationTest();
  results.cssAnimation = await runCSSAnimationTest();
  results.layoutReflow = await runLayoutReflowTest();

  const score = Math.min(100, Math.round(
    (results.refreshRate.rate / 144) * 25 +
    (1000 / results.domManipulation.avgTime) * 1000 * 25 +
    (results.cssAnimation.stability * 100) * 25 +
    (1000 / results.layoutReflow.avgTime) * 100 * 25
  ));

  return {
    raw: results,
    score,
    details: {
      refreshRate: `${results.refreshRate.rate.toFixed(1)} Hz`,
      domManipulation: `${results.domManipulation.avgTime.toFixed(2)} ms`,
      cssAnimation: `${(results.cssAnimation.stability * 100).toFixed(1)}% stable`,
      layoutReflow: `${results.layoutReflow.avgTime.toFixed(2)} ms`
    }
  };
}

async function detectRefreshRate() {
  return new Promise(resolve => {
    const times = [];
    let lastTime = performance.now();
    let frame = 0;

    function tick(now) {
      if (frame > 0) {
        times.push(now - lastTime);
      }
      lastTime = now;
      frame++;
      if (frame < 120) {
        requestAnimationFrame(tick);
      } else {
        const avg = times.reduce((a, b) => a + b, 0) / times.length;
        resolve({ rate: 1000 / avg, samples: times });
      }
    }
    requestAnimationFrame(tick);
  });
}

async function runDOMManipulationTest() {
  const container = document.createElement('div');
  container.style.cssText = 'position:absolute;left:-9999px;top:-9999px;';
  document.body.appendChild(container);

  const iterations = 10;
  const elementCount = 5000;
  const times = [];

  for (let i = 0; i < iterations; i++) {
    const start = performance.now();

    const fragment = document.createDocumentFragment();
    for (let j = 0; j < elementCount; j++) {
      const el = document.createElement('div');
      el.textContent = `Item ${j}`;
      el.style.cssText = 'padding:4px;margin:2px;border:1px solid #333;';
      fragment.appendChild(el);
    }
    container.appendChild(fragment);

    while (container.firstChild) {
      container.removeChild(container.firstChild);
    }

    times.push(performance.now() - start);
  }

  document.body.removeChild(container);

  return {
    avgTime: times.reduce((a, b) => a + b, 0) / times.length,
    times
  };
}

async function runCSSAnimationTest() {
  return new Promise(resolve => {
    const container = document.createElement('div');
    container.style.cssText = 'position:absolute;left:-9999px;top:-9999px;width:100px;height:100px;';
    document.body.appendChild(container);

    const el = document.createElement('div');
    el.style.cssText = `
      width:50px;height:50px;background:red;
      animation: testAnim 1s linear infinite;
    `;
    container.appendChild(el);

    const style = document.createElement('style');
    style.textContent = `
      @keyframes testAnim {
        0% { transform: translateX(0) rotate(0deg); }
        100% { transform: translateX(50px) rotate(360deg); }
      }
    `;
    document.head.appendChild(style);

    const frames = [];
    let lastTime = performance.now();
    let frame = 0;

    function tick(now) {
      const dt = now - lastTime;
      frames.push(dt);
      lastTime = now;
      frame++;
      if (frame < 180) {
        requestAnimationFrame(tick);
      } else {
        document.body.removeChild(container);
        document.head.removeChild(style);

        const expected = 1000 / 60;
        const deviations = frames.map(f => Math.abs(f - expected) / expected);
        const stability = 1 - deviations.reduce((a, b) => a + b, 0) / deviations.length;

        resolve({ stability: Math.max(0, stability), frames });
      }
    }
    requestAnimationFrame(tick);
  });
}

async function runLayoutReflowTest() {
  const container = document.createElement('div');
  container.style.cssText = 'position:absolute;left:-9999px;top:-9999px;';
  document.body.appendChild(container);

  const elements = Array.from({ length: 1000 }, (_, i) => {
    const el = document.createElement('div');
    el.style.cssText = 'width:100px;height:20px;margin:5px;background:#333;float:left;';
    el.textContent = `Item ${i}`;
    return el;
  });
  elements.forEach(el => container.appendChild(el));

  const iterations = 20;
  const times = [];

  for (let i = 0; i < iterations; i++) {
    const start = performance.now();

    elements.forEach((el, idx) => {
      el.style.width = `${50 + Math.sin(idx * 0.1) * 50}px`;
      el.style.marginLeft = `${Math.cos(idx * 0.1) * 10}px`;
      el.offsetHeight;
    });

    times.push(performance.now() - start);
  }

  document.body.removeChild(container);

  return {
    avgTime: times.reduce((a, b) => a + b, 0) / times.length,
    times
  };
}