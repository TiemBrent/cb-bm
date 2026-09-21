import * as THREE from 'three';
import { Renderer } from './renderer/Renderer.js';
import { World } from './world/World.js';
import { Vehicle } from './vehicle/Vehicle.js';
import { CameraController } from './vehicle/CameraController.js';
import { InputManager } from './InputManager.js';
import { AudioEngine } from './audio/AudioEngine.js';
import { ParticleManager } from './particles/ParticleManager.js';
import { UI } from './ui/UI.js';
import { Settings } from './Settings.js';

class DrivingSimulator {
  constructor() {
    this.canvas = document.getElementById('canvas');
    this.loadingEl = document.getElementById('loading');
    this.loadingProgress = document.querySelector('.loading-progress');
    this.loadingText = document.querySelector('.loading-text');
    
    this.renderer = null;
    this.world = null;
    this.vehicle = null;
    this.cameraController = null;
    this.input = null;
    this.audio = null;
    this.particles = null;
    this.ui = null;
    this.settings = new Settings();
    
    this.clock = new THREE.Clock();
    this.deltaTime = 0;
    this.elapsedTime = 0;
    this.frameCount = 0;
    this.lastFpsUpdate = 0;
    this.fps = 60;
    this.frameTime = 16.67;
    
    this.isRunning = false;
    this.isPaused = false;
    
    this.init();
  }
  
  async init() {
    this.updateLoading(10, 'Creating renderer...');
    this.renderer = new Renderer(this.canvas, this.settings);
    await this.renderer.init();
    
    this.updateLoading(30, 'Building world...');
    this.world = new World(this.renderer, this.settings);
    await this.world.init();
    
    this.updateLoading(50, 'Initializing vehicle...');
    this.vehicle = new Vehicle(this.renderer, this.world, this.settings);
    await this.vehicle.init();
    
    this.updateLoading(65, 'Setting up camera...');
    this.cameraController = new CameraController(this.vehicle, this.renderer.camera, this.settings);
    
    this.updateLoading(75, 'Initializing audio...');
    this.audio = new AudioEngine(this.vehicle, this.settings);
    await this.audio.init();
    
    this.updateLoading(85, 'Creating particle systems...');
    this.particles = new ParticleManager(this.renderer, this.vehicle, this.world, this.settings);
    await this.particles.init();
    
    this.updateLoading(95, 'Setting up UI...');
    this.input = new InputManager(this);
    this.ui = new UI(this);
    this.ui.init();
    
    this.updateLoading(100, 'Ready!');
    
    setTimeout(() => {
      this.loadingEl.style.opacity = '0';
      setTimeout(() => this.loadingEl.style.display = 'none', 500);
      this.ui.showMenu();
    }, 500);
    
    this.start();
  }
  
  updateLoading(percent, text) {
    this.loadingProgress.style.width = `${percent}%`;
    this.loadingText.textContent = text;
  }
  
  start() {
    this.isRunning = true;
    this.clock.start();
    this.animate();
  }
  
  animate() {
    if (!this.isRunning) return;
    
    requestAnimationFrame(() => this.animate());
    
    this.deltaTime = Math.min(this.clock.getDelta(), 1/30);
    this.elapsedTime += this.deltaTime;
    this.frameCount++;
    
    if (this.elapsedTime - this.lastFpsUpdate >= 1.0) {
      this.fps = this.frameCount / (this.elapsedTime - this.lastFpsUpdate);
      this.frameTime = 1000 / this.fps;
      this.frameCount = 0;
      this.lastFpsUpdate = this.elapsedTime;
      this.updateDebug();
    }
    
    if (!this.isPaused) {
      this.update(this.deltaTime);
    }
    
    this.render();
  }
  
  update(dt) {
    this.input.update(dt);
    this.vehicle.update(dt);
    this.cameraController.update(dt);
    this.world.update(dt, this.vehicle);
    this.particles.update(dt);
    this.audio.update(dt);
    this.ui.update(dt);
  }
  
  render() {
    this.renderer.render(this.world.scene, this.cameraController.camera, this.vehicle, this.deltaTime);
  }
  
  updateDebug() {
    document.getElementById('fps').textContent = 
      `FPS: ${this.fps.toFixed(1)} | Frame: ${this.frameTime.toFixed(2)}ms | Triangles: ${this.renderer.info.render.triangles}`;
    
    const v = this.vehicle;
    document.getElementById('debug').textContent = 
      `Speed: ${v.speedKmh.toFixed(1)} km/h | RPM: ${v.engineRpm.toFixed(0)} | Gear: ${v.gear} | Drift: ${v.driftAngle.toFixed(1)}°`;
  }
  
  pause() {
    this.isPaused = true;
    this.audio.setPaused(true);
  }
  
  resume() {
    this.isPaused = false;
    this.audio.setPaused(false);
  }
  
  togglePause() {
    if (this.isPaused) this.resume(); else this.pause();
  }
}

window.addEventListener('DOMContentLoaded', () => {
  window.simulator = new DrivingSimulator();
});

export { DrivingSimulator };