import * as THREE from 'three';
import { TireDustSystem } from './TireDustSystem.js';
import { SmokeSystem } from './SmokeSystem.js';
import { SparkSystem } from './SparkSystem.js';
import { RainSplashSystem } from './RainSplashSystem.js';

export class ParticleManager {
  constructor(renderer, vehicle, world, settings) {
    this.renderer = renderer;
    this.vehicle = vehicle;
    this.world = world;
    this.settings = settings;
    this.enabled = settings.graphics.particles;
    
    this.tireDust = null;
    this.smoke = null;
    this.sparks = null;
    this.rainSplashes = null;
    
    this.systems = [];
  }
  
  async init() {
    this.tireDust = new TireDustSystem(this.renderer, this.vehicle, this.world, this.settings);
    await this.tireDust.init();
    this.systems.push(this.tireDust);
    
    this.smoke = new SmokeSystem(this.renderer, this.vehicle, this.world, this.settings);
    await this.smoke.init();
    this.systems.push(this.smoke);
    
    this.sparks = new SparkSystem(this.renderer, this.vehicle, this.world, this.settings);
    await this.sparks.init();
    this.systems.push(this.sparks);
    
    this.rainSplashes = new RainSplashSystem(this.renderer, this.vehicle, this.world, this.settings);
    await this.rainSplashes.init();
    this.systems.push(this.rainSplashes);
    
    this.world.scene.add(this.tireDust.mesh);
    this.world.scene.add(this.smoke.mesh);
    this.world.scene.add(this.sparks.mesh);
    this.world.scene.add(this.rainSplashes.mesh);
  }
  
  update(dt) {
    if (!this.enabled) return;
    
    this.systems.forEach(system => {
      system.update(dt);
    });
  }
  
  setEnabled(enabled) {
    this.enabled = enabled;
    this.systems.forEach(system => {
      system.mesh.visible = enabled;
    });
  }
  
  dispose() {
    this.systems.forEach(system => system.dispose());
    this.world.scene.remove(this.tireDust?.mesh);
    this.world.scene.remove(this.smoke?.mesh);
    this.world.scene.remove(this.sparks?.mesh);
    this.world.scene.remove(this.rainSplashes?.mesh);
  }
}