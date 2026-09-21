export class UI {
  constructor(simulator) {
    this.simulator = simulator;
    this.vehicle = simulator.vehicle;
    
    this.hud = document.getElementById('hud');
    this.menu = document.getElementById('menu');
    this.settingsMenu = document.getElementById('settings');
    this.startBtn = document.getElementById('startBtn');
    this.settingsBtn = document.getElementById('settingsBtn');
    this.backBtn = document.getElementById('backBtn');
    this.qualityPreset = document.getElementById('qualityPreset');
    
    this.speedoFg = document.querySelector('.speedo-fg');
    this.speedoValue = document.querySelector('.speedo-value');
    this.gearDisplay = document.querySelector('.gear');
    this.minimapContainer = document.getElementById('minimap');
    this.minimapCanvas = document.createElement('canvas');
    this.minimapCanvas.className = 'minimap-canvas';
    this.minimapContainer.appendChild(this.minimapCanvas);
    this.minimapCtx = this.minimapCanvas.getContext('2d');
    this.driftScoreEl = document.getElementById('driftScore');
    
    this.setupEventListeners();
    this.resizeMinimap();
  }
  
  init() {
    this.minimapCanvas.width = 200;
    this.minimapCanvas.height = 200;
  }
  
  init() {
    this.minimapCanvas.width = 200;
    this.minimapCanvas.height = 200;
  }
  
  setupEventListeners() {
    this.startBtn.addEventListener('click', () => this.startGame());
    this.settingsBtn.addEventListener('click', () => this.showSettings());
    this.backBtn.addEventListener('click', () => this.showMainMenu());
    
    this.qualityPreset.addEventListener('change', (e) => {
      this.simulator.settings.graphics.quality = e.target.value;
      this.simulator.settings.applyQuality();
      this.simulator.renderer.onResize();
    });
    
    document.querySelectorAll('#settings input[type="checkbox"]').forEach(cb => {
      cb.addEventListener('change', (e) => {
        const key = e.target.id.replace('setting', '').toLowerCase();
        this.simulator.settings.graphics[key] = e.target.checked;
        this.applySetting(key, e.target.checked);
      });
    });
    
    window.addEventListener('resize', () => this.resizeMinimap());
  }
  
  applySetting(key, value) {
    switch (key) {
      case 'taa':
        this.simulator.renderer.taamanager.setEnabled(value);
        break;
      case 'bloom':
        this.simulator.renderer.bloomPass.setEnabled(value);
        break;
      case 'dof':
        this.simulator.renderer.dofPass.setEnabled(value);
        break;
      case 'motionblur':
        this.simulator.renderer.motionBlurPass.setEnabled(value);
        break;
      case 'ssr':
        this.simulator.renderer.ssrPass.setEnabled(value);
        break;
      case 'shadows':
        this.simulator.renderer.shadowManager.enabled = value;
        break;
      case 'particles':
        this.simulator.particles.setEnabled(value);
        break;
    }
  }
  
  startGame() {
    this.hideMenu();
    this.simulator.resume();
  }
  
  showSettings() {
    this.menu.classList.add('hidden');
    this.settingsMenu.classList.remove('hidden');
  }
  
  showMainMenu() {
    this.settingsMenu.classList.add('hidden');
    this.menu.classList.remove('hidden');
  }
  
  showMenu() {
    this.menu.classList.remove('hidden');
    this.settingsMenu.classList.add('hidden');
    this.simulator.pause();
  }
  
  hideMenu() {
    this.menu.classList.add('hidden');
    this.settingsMenu.classList.add('hidden');
  }
  
  toggleMenu() {
    if (this.menu.classList.contains('hidden')) {
      this.showMenu();
    } else {
      this.hideMenu();
      this.simulator.resume();
    }
  }
  
  update(dt) {
    if (!this.vehicle) return;
    
    this.updateSpeedometer();
    this.updateGear();
    this.updateMinimap();
    this.updateDriftScore();
  }
  
  updateSpeedometer() {
    const speed = this.vehicle.speedKmh;
    const maxSpeed = 300;
    const ratio = Math.min(speed / maxSpeed, 1);
    
    const circumference = 2 * Math.PI * 90;
    const offset = circumference * (1 - ratio);
    this.speedoFg.style.strokeDashoffset = offset;
    
    this.speedoValue.textContent = Math.round(speed);
  }
  
  updateGear() {
    const gear = this.vehicle.getGear();
    this.gearDisplay.textContent = gear === 0 ? 'N' : gear;
    
    if (this.vehicle.isShifting) {
      this.gearDisplay.style.color = '#ff6b00';
      this.gearDisplay.style.textShadow = '0 0 10px #ff6b00, 0 0 20px #ff6b00';
    } else {
      this.gearDisplay.style.color = '#ff6b00';
      this.gearDisplay.style.textShadow = '0 0 10px #ff6b00, 0 0 20px #ff6b00';
    }
  }
  
  updateMinimap() {
    if (!this.minimapCtx || !this.vehicle) return;
    
    const ctx = this.minimapCtx;
    const size = 200;
    const range = 500;
    
    ctx.clearRect(0, 0, size, size);
    
    ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
    ctx.fillRect(0, 0, size, size);
    
    const roads = this.simulator.world.roadNetwork.roads;
    ctx.strokeStyle = 'rgba(100, 100, 100, 0.6)';
    ctx.lineWidth = 2;
    
    roads.forEach(road => {
      if (road.points.length < 2) return;
      
      ctx.beginPath();
      road.points.forEach((point, i) => {
        const x = (point.x - this.vehicle.position.x) / range * 100 + size / 2;
        const y = (point.z - this.vehicle.position.z) / range * 100 + size / 2;
        
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();
    });
    
    ctx.fillStyle = '#ff6b00';
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, 4, 0, Math.PI * 2);
    ctx.fill();
    
    const forward = this.vehicle.getForwardVector();
    const noseX = size / 2 + forward.x * 10;
    const noseY = size / 2 + forward.z * 10;
    ctx.beginPath();
    ctx.moveTo(size / 2, size / 2);
    ctx.lineTo(noseX, noseY);
    ctx.stroke();
  }
  
  updateDriftScore() {
    const score = Math.round(this.vehicle.driftScore);
    this.driftScoreEl.textContent = `Drift: ${score}`;
    
    if (this.vehicle.isDrifting) {
      this.driftScoreEl.style.color = '#ff6b00';
      this.driftScoreEl.style.textShadow = '0 0 10px #ff6b00';
    } else {
      this.driftScoreEl.style.color = '#888';
      this.driftScoreEl.style.textShadow = 'none';
    }
  }
  
  resizeMinimap() {
    if (this.minimapCanvas) {
      this.minimapCanvas.width = 200;
      this.minimapCanvas.height = 200;
    }
  }
  
  dispose() {
    // Event listeners will be cleaned up with page unload
  }
}