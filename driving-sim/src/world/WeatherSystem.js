import * as THREE from 'three';

export class WeatherSystem {
  constructor(renderer, world, settings) {
    this.renderer = renderer;
    this.world = world;
    this.settings = settings;
    
    this.rainIntensity = 0;
    this.targetRainIntensity = 0;
    this.windSpeed = 0;
    this.windDirection = new THREE.Vector3(1, 0, 0);
    this.cloudCover = 0;
    this.fogDensity = 0;
    
    this.rainParticles = null;
    this.rainMaterial = null;
    this.rainGeometry = null;
    this.maxRainParticles = 15000;
    this.rainArea = 200;
    
    this.puddles = [];
    this.wetness = 0;
    this.targetWetness = 0;
    
    this.weatherState = 'clear';
    this.nextWeatherChange = 0;
    this.weatherDuration = 0;
    
    this.thunderTimer = 0;
    this.thunderCooldown = 0;
  }
  
  init() {
    this.createRainSystem();
    this.scheduleNextWeatherChange();
  }
  
  createRainSystem() {
    this.rainGeometry = new THREE.BufferGeometry();
    const positions = new Float32Array(this.maxRainParticles * 3);
    const velocities = new Float32Array(this.maxRainParticles * 3);
    const sizes = new Float32Array(this.maxRainParticles);
    const alphas = new Float32Array(this.maxRainParticles);
    const lifetimes = new Float32Array(this.maxRainParticles);
    
    for (let i = 0; i < this.maxRainParticles; i++) {
      this.resetRainParticle(i, positions, velocities, sizes, alphas, lifetimes, true);
    }
    
    this.rainGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    this.rainGeometry.setAttribute('velocity', new THREE.BufferAttribute(velocities, 3));
    this.rainGeometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));
    this.rainGeometry.setAttribute('alpha', new THREE.BufferAttribute(alphas, 1));
    this.rainGeometry.setAttribute('lifetime', new THREE.BufferAttribute(lifetimes, 1));
    
    this.rainMaterial = new THREE.ShaderMaterial({
      uniforms: {
        time: { value: 0 },
        cameraPosition: { value: new THREE.Vector3() },
        rainIntensity: { value: 0 },
        windVelocity: { value: new THREE.Vector3() },
        resolution: { value: new THREE.Vector2(window.innerWidth, window.innerHeight) },
        projectionMatrix: { value: new THREE.Matrix4() },
        viewMatrix: { value: new THREE.Matrix4() }
      },
      vertexShader: `
        attribute vec3 velocity;
        attribute float size;
        attribute float alpha;
        attribute float lifetime;
        uniform float time;
        uniform vec3 cameraPosition;
        uniform float rainIntensity;
        uniform vec3 windVelocity;
        uniform mat4 projectionMatrix;
        uniform mat4 viewMatrix;
        varying float vAlpha;
        varying float vSize;
        
        void main() {
          vec3 pos = position;
          vec3 worldPos = pos + cameraPosition;
          
          float age = mod(time * 10.0 + lifetime * 100.0, 100.0) / 10.0;
          worldPos += velocity * age + windVelocity * age * 0.5;
          
          vec4 mvPosition = viewMatrix * vec4(worldPos, 1.0);
          gl_Position = projectionMatrix * mvPosition;
          gl_PointSize = size * (300.0 / -mvPosition.z);
          
          vAlpha = alpha * rainIntensity;
          vSize = size;
        }
      `,
      fragmentShader: `
        varying float vAlpha;
        varying float vSize;
        void main() {
          float dist = length(gl_PointCoord - vec2(0.5));
          if (dist > 0.5) discard;
          
          float alpha = smoothstep(0.5, 0.0, dist) * vAlpha;
          vec3 color = vec3(0.6, 0.7, 0.85);
          gl_FragColor = vec4(color, alpha);
        }
      `,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    });
    
    this.rainParticles = new THREE.Points(this.rainGeometry, this.rainMaterial);
    this.rainParticles.name = 'RainParticles';
    this.rainParticles.frustumCulled = false;
    this.world.scene.add(this.rainParticles);
  }
  
  resetRainParticle(index, positions, velocities, sizes, alphas, lifetimes, initial = false) {
    const spread = initial ? this.rainArea * 2 : this.rainArea;
    const height = 50 + Math.random() * 50;
    
    positions[index * 3] = (Math.random() - 0.5) * spread;
    positions[index * 3 + 1] = height;
    positions[index * 3 + 2] = (Math.random() - 0.5) * spread;
    
    velocities[index * 3] = this.windDirection.x * this.windSpeed * 0.1;
    velocities[index * 3 + 1] = -20 - Math.random() * 10;
    velocities[index * 3 + 2] = this.windDirection.z * this.windSpeed * 0.1;
    
    sizes[index] = 0.05 + Math.random() * 0.1;
    alphas[index] = 0.3 + Math.random() * 0.5;
    lifetimes[index] = Math.random() * 100;
  }
  
  update(dt) {
    this.updateWeatherState(dt);
    this.updateRain(dt);
    this.updateWetness(dt);
    this.updatePuddles(dt);
    this.updateFog(dt);
  }
  
  updateWeatherState(dt) {
    this.nextWeatherChange -= dt;
    
    if (this.nextWeatherChange <= 0) {
      this.changeWeather();
      this.scheduleNextWeatherChange();
    }
    
    this.rainIntensity = THREE.MathUtils.lerp(this.rainIntensity, this.targetRainIntensity, dt * 0.5);
    this.cloudCover = THREE.MathUtils.lerp(this.cloudCover, this.targetRainIntensity > 0 ? 0.8 : 0.2, dt * 0.1);
    this.windSpeed = THREE.MathUtils.lerp(this.windSpeed, this.targetRainIntensity * 10, dt * 0.2);
    
    if (this.rainIntensity > 0.5) {
      this.thunderTimer += dt;
      if (this.thunderTimer > this.thunderCooldown) {
        this.triggerThunder();
        this.thunderTimer = 0;
        this.thunderCooldown = 5 + Math.random() * 15;
      }
    }
  }
  
  scheduleNextWeatherChange() {
    const states = ['clear', 'cloudy', 'light_rain', 'heavy_rain', 'storm'];
    const weights = [0.5, 0.2, 0.15, 0.1, 0.05];
    
    let rand = Math.random();
    let cumWeight = 0;
    for (let i = 0; i < weights.length; i++) {
      cumWeight += weights[i];
      if (rand < cumWeight) {
        this.weatherState = states[i];
        break;
      }
    }
    
    switch (this.weatherState) {
      case 'clear':
        this.targetRainIntensity = 0;
        this.weatherDuration = 300 + Math.random() * 600;
        break;
      case 'cloudy':
        this.targetRainIntensity = 0;
        this.weatherDuration = 120 + Math.random() * 240;
        break;
      case 'light_rain':
        this.targetRainIntensity = 0.3 + Math.random() * 0.3;
        this.weatherDuration = 60 + Math.random() * 180;
        break;
      case 'heavy_rain':
        this.targetRainIntensity = 0.7 + Math.random() * 0.3;
        this.weatherDuration = 30 + Math.random() * 120;
        break;
      case 'storm':
        this.targetRainIntensity = 1.0;
        this.windSpeed = 20 + Math.random() * 15;
        this.weatherDuration = 20 + Math.random() * 60;
        break;
    }
    
    this.nextWeatherChange = this.weatherDuration;
  }
  
  changeWeather() {
    this.scheduleNextWeatherChange();
  }
  
  updateRain(dt) {
    if (!this.rainParticles || this.rainIntensity < 0.01) {
      if (this.rainParticles) this.rainParticles.visible = false;
      return;
    }
    
    this.rainParticles.visible = true;
    
    const positions = this.rainGeometry.attributes.position.array;
    const velocities = this.rainGeometry.attributes.velocity.array;
    const sizes = this.rainGeometry.attributes.size.array;
    const alphas = this.rainGeometry.attributes.alpha.array;
    const lifetimes = this.rainGeometry.attributes.lifetime.array;
    
    const activeCount = Math.floor(this.maxRainParticles * this.rainIntensity);
    
    for (let i = 0; i < activeCount; i++) {
      positions[i * 3 + 1] += velocities[i * 3 + 1] * dt;
      positions[i * 3] += velocities[i * 3] * dt;
      positions[i * 3 + 2] += velocities[i * 3 + 2] * dt;
      
      if (positions[i * 3 + 1] < this.world.terrain.getHeightAt(positions[i * 3], positions[i * 3 + 2]) + 0.5) {
        this.resetRainParticle(i, positions, velocities, sizes, alphas, lifetimes);
      }
    }
    
    this.rainGeometry.attributes.position.needsUpdate = true;
    
    this.rainMaterial.uniforms.time.value += dt;
    this.rainMaterial.uniforms.rainIntensity.value = this.rainIntensity;
    this.rainMaterial.uniforms.windVelocity.value.copy(this.windDirection).multiplyScalar(this.windSpeed);
    
    if (this.world.vehicle) {
      this.rainMaterial.uniforms.cameraPosition.value.copy(this.world.vehicle.position);
    }
  }
  
  updateWetness(dt) {
    this.targetWetness = this.rainIntensity;
    this.wetness = THREE.MathUtils.lerp(this.wetness, this.targetWetness, dt * 0.1);
  }
  
  updatePuddles(dt) {
    if (this.wetness > 0.3 && Math.random() < dt * 0.1) {
      const roadInfo = this.world.roadNetwork.getRoadInfoAt(
        this.world.vehicle?.chassis.position.x || 0,
        this.world.vehicle?.chassis.position.z || 0
      );
      
      if (roadInfo && roadInfo.type === 'asphalt') {
        this.puddles.push({
          position: this.world.vehicle?.chassis.position.clone() || new THREE.Vector3(),
          size: 1 + Math.random() * 3,
          life: 0,
          maxLife: 10 + Math.random() * 20
        });
      }
    }
    
    this.puddles = this.puddles.filter(p => {
      p.life += dt;
      return p.life < p.maxLife || this.wetness > 0.3;
    });
  }
  
  updateFog(dt) {
    this.fogDensity = THREE.MathUtils.lerp(this.fogDensity, this.rainIntensity * 0.005, dt);
  }
  
  triggerThunder() {
    if (!this.world.renderer) return;
    
    const flashIntensity = 0.5 + Math.random() * 0.5;
    this.world.scene.traverse(obj => {
      if (obj.isMesh && obj.material.emissiveIntensity !== undefined) {
        obj.material.emissiveIntensity = flashIntensity;
        setTimeout(() => {
          obj.material.emissiveIntensity = 0;
        }, 50 + Math.random() * 100);
      }
    });
  }
  
  getWetness() {
    return this.wetness;
  }
  
  getRainIntensity() {
    return this.rainIntensity;
  }
  
  onResize() {
    if (this.rainMaterial) {
      this.rainMaterial.uniforms.resolution.value.set(window.innerWidth, window.innerHeight);
    }
  }
  
  dispose() {
    this.rainGeometry?.dispose();
    this.rainMaterial?.dispose();
    this.rainParticles?.geometry.dispose();
    this.rainParticles?.material.dispose();
    this.world.scene.remove(this.rainParticles);
  }
}