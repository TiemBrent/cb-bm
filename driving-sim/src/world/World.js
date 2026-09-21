import * as THREE from 'three';
import { Terrain } from './Terrain.js';
import { RoadNetwork } from './RoadNetwork.js';
import { PropSystem } from './PropSystem.js';
import { SkySystem } from './SkySystem.js';
import { DayNightCycle } from './DayNightCycle.js';
import { WeatherSystem } from './WeatherSystem.js';

export class World {
  constructor(renderer, settings) {
    this.renderer = renderer;
    this.settings = settings;
    
    this.scene = new THREE.Scene();
    this.scene.name = 'World';
    
    this.terrain = null;
    this.roadNetwork = null;
    this.propSystem = null;
    this.skySystem = null;
    this.dayNightCycle = null;
    this.weatherSystem = null;
    
    this.sunDirection = new THREE.Vector3(0.3, -0.8, 0.4).normalize();
    this.sunColor = new THREE.Color(1.0, 0.9, 0.7);
    this.sunIntensity = 3.0;
    this.ambientColor = new THREE.Color(0.02, 0.03, 0.05);
    this.ambientIntensity = 0.5;
    this.fogColor = new THREE.Color(0.5, 0.6, 0.7);
    this.fogNear = 100;
    this.fogFar = 800;
    this.fogDensity = 0.001;
    
    this.timeOfDay = 0.5; // 0 = midnight, 0.5 = noon
    this.daySpeed = 0.00001;
    
    this.vehicle = null;
  }
  
  async init() {
    this.setupScene();
    await this.createSkySystem();
    await this.createTerrain();
    await this.createRoadNetwork();
    await this.createPropSystem();
    this.createDayNightCycle();
    this.createWeatherSystem();
    this.setupLighting();
    this.setupFog();
  }
  
  setupScene() {
    this.scene.background = new THREE.Color(0x446688);
  }
  
  async createSkySystem() {
    this.skySystem = new SkySystem(this.renderer, this);
    await this.skySystem.init();
    this.scene.add(this.skySystem.mesh);
  }
  
  async createTerrain() {
    this.terrain = new Terrain(this.renderer, this.settings);
    await this.terrain.init();
    this.scene.add(this.terrain.mesh);
  }
  
  async createRoadNetwork() {
    this.roadNetwork = new RoadNetwork(this.renderer, this.terrain, this.settings);
    await this.roadNetwork.init();
    this.scene.add(this.roadNetwork.group);
  }
  
  async createPropSystem() {
    this.propSystem = new PropSystem(this.renderer, this.terrain, this.roadNetwork, this.settings);
    await this.propSystem.init();
    this.scene.add(this.propSystem.group);
  }
  
  createDayNightCycle() {
    this.dayNightCycle = new DayNightCycle(this);
  }
  
  createWeatherSystem() {
    this.weatherSystem = new WeatherSystem(this.renderer, this, this.settings);
    this.weatherSystem.init();
  }
  
  setupLighting() {
    const sunLight = new THREE.DirectionalLight(0xffffff, this.sunIntensity);
    sunLight.position.copy(this.sunDirection).multiplyScalar(-100);
    sunLight.castShadow = true;
    sunLight.shadow.camera.near = 0.1;
    sunLight.shadow.camera.far = 400;
    sunLight.shadow.camera.left = -100;
    sunLight.shadow.camera.right = 100;
    sunLight.shadow.camera.top = 100;
    sunLight.shadow.camera.bottom = -100;
    sunLight.shadow.mapSize.width = 2048;
    sunLight.shadow.mapSize.height = 2048;
    sunLight.shadow.bias = -0.0005;
    sunLight.shadow.normalBias = 0.02;
    this.scene.add(sunLight);
    this.sunLight = sunLight;
    
    const ambientLight = new THREE.AmbientLight(this.ambientColor, this.ambientIntensity);
    this.scene.add(ambientLight);
    this.ambientLight = ambientLight;
    
    const hemiLight = new THREE.HemisphereLight(0x88ccff, 0x332211, 0.5);
    this.scene.add(hemiLight);
    this.hemiLight = hemiLight;
  }
  
  setupFog() {
    this.scene.fog = new THREE.FogExp2(this.fogColor, this.fogDensity);
  }
  
  update(dt, vehicle) {
    this.vehicle = vehicle;
    this.timeOfDay = (this.timeOfDay + this.daySpeed * dt) % 1.0;
    
    this.dayNightCycle.update(dt);
    this.weatherSystem.update(dt);
    this.skySystem.update(dt);
    this.terrain.update(dt);
    this.roadNetwork.update(dt, vehicle);
    this.propSystem.update(dt, vehicle);
    
    this.updateLighting();
    this.updateFog();
    
    if (this.renderer.pbrMaterials) {
      this.renderer.pbrMaterials.updateSun(this.sunDirection, this.sunColor, this.sunIntensity);
      this.renderer.pbrMaterials.updateAmbient(this.ambientColor, this.ambientIntensity);
      this.renderer.pbrMaterials.updateFog(this.fogColor, this.fogNear, this.fogFar, this.fogDensity);
    }
  }
  
  updateLighting() {
    const sunAngle = this.timeOfDay * Math.PI * 2 - Math.PI / 2;
    this.sunDirection.set(
      Math.cos(sunAngle),
      Math.sin(sunAngle),
      0.3
    ).normalize();
    
    const sunHeight = this.sunDirection.y;
    
    if (sunHeight > 0.1) {
      const dayFactor = THREE.MathUtils.clamp((sunHeight - 0.1) / 0.9, 0, 1);
      this.sunColor.setHSL(0.1, 0.3, 0.85);
      this.sunIntensity = THREE.MathUtils.lerp(0.5, 3.0, dayFactor);
      this.ambientColor.setHSL(0.55, 0.3, 0.15);
      this.ambientIntensity = THREE.MathUtils.lerp(0.2, 0.6, dayFactor);
      this.fogColor.setHSL(0.55, 0.4, 0.65);
    } else if (sunHeight > -0.1) {
      const twilightFactor = THREE.MathUtils.clamp((sunHeight + 0.1) / 0.2, 0, 1);
      this.sunColor.setHSL(0.08, 0.8, 0.6);
      this.sunIntensity = THREE.MathUtils.lerp(0.1, 1.0, twilightFactor);
      this.ambientColor.setHSL(0.05, 0.5, 0.1);
      this.ambientIntensity = THREE.MathUtils.lerp(0.1, 0.3, twilightFactor);
      this.fogColor.setHSL(0.05, 0.6, 0.3);
    } else {
      this.sunColor.setHSL(0.6, 0.2, 0.4);
      this.sunIntensity = 0.05;
      this.ambientColor.setHSL(0.6, 0.1, 0.05);
      this.ambientIntensity = 0.15;
      this.fogColor.setHSL(0.6, 0.1, 0.15);
    }
    
    if (this.sunLight) {
      this.sunLight.position.copy(this.sunDirection).multiplyScalar(-100);
      this.sunLight.color.copy(this.sunColor);
      this.sunLight.intensity = this.sunIntensity;
    }
    
    if (this.ambientLight) {
      this.ambientLight.color.copy(this.ambientColor);
      this.ambientLight.intensity = this.ambientIntensity;
    }
    
    if (this.hemiLight) {
      const skyColor = new THREE.Color().setHSL(0.55, 0.4, THREE.MathUtils.lerp(0.3, 0.7, Math.max(0, sunHeight)));
      const groundColor = new THREE.Color().setHSL(0.05, 0.3, THREE.MathUtils.lerp(0.05, 0.2, Math.max(0, sunHeight)));
      this.hemiLight.color.copy(skyColor);
      this.hemiLight.groundColor.copy(groundColor);
      this.hemiLight.intensity = THREE.MathUtils.lerp(0.2, 0.8, Math.max(0, sunHeight));
    }
  }
  
  updateFog() {
    const sunHeight = this.sunDirection.y;
    let density = this.fogDensity;
    let near = this.fogNear;
    let far = this.fogFar;
    
    if (sunHeight < 0) {
      density *= 1.5;
      near *= 0.7;
      far *= 0.7;
    }
    
    if (this.weatherSystem && this.weatherSystem.rainIntensity > 0) {
      density *= 1.0 + this.weatherSystem.rainIntensity * 2;
      near *= 1.0 - this.weatherSystem.rainIntensity * 0.3;
      far *= 1.0 - this.weatherSystem.rainIntensity * 0.3;
      this.fogColor.lerp(new THREE.Color(0.6, 0.6, 0.7), this.weatherSystem.rainIntensity * 0.5);
    }
    
    if (this.scene.fog) {
      this.scene.fog.density = density;
    }
  }
  
  getHeightAt(x, z) {
    return this.terrain ? this.terrain.getHeightAt(x, z) : 0;
  }
  
  getNormalAt(x, z) {
    return this.terrain ? this.terrain.getNormalAt(x, z) : new THREE.Vector3(0, 1, 0);
  }
  
  getSurfaceTypeAt(x, z) {
    return this.roadNetwork ? this.roadNetwork.getSurfaceTypeAt(x, z) : 'grass';
  }
  
  getRoadInfoAt(x, z) {
    return this.roadNetwork ? this.roadNetwork.getRoadInfoAt(x, z) : null;
  }
  
  onResize() {
    if (this.skySystem) this.skySystem.onResize();
    if (this.terrain) this.terrain.onResize();
  }
  
  dispose() {
    this.terrain?.dispose();
    this.roadNetwork?.dispose();
    this.propSystem?.dispose();
    this.skySystem?.dispose();
    this.weatherSystem?.dispose();
    this.scene.clear();
  }
}