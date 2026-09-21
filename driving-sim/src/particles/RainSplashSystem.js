import * as THREE from 'three';

export class RainSplashSystem {
  constructor(renderer, vehicle, world, settings) {
    this.renderer = renderer;
    this.vehicle = vehicle;
    this.world = world;
    this.settings = settings;
    
    this.maxParticles = 1000;
    
    this.mesh = null;
    this.geometry = null;
    this.material = null;
    
    this.enabled = false;
  }
  
  async init() {
    this.createGeometry();
    this.createMaterial();
    this.createMesh();
  }
  
  createGeometry() {
    this.geometry = new THREE.BufferGeometry();
    
    const positions = new Float32Array(this.maxParticles * 3);
    const velocities = new Float32Array(this.maxParticles * 3);
    const sizes = new Float32Array(this.maxParticles);
    const alphas = new Float32Array(this.maxParticles);
    const lifetimes = new Float32Array(this.maxParticles);
    const ages = new Float32Array(this.maxParticles);
    const colors = new Float32Array(this.maxParticles * 3);
    
    for (let i = 0; i < this.maxParticles; i++) {
      this.resetParticle(i, positions, velocities, sizes, alphas, lifetimes, ages, colors);
    }
    
    this.geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    this.geometry.setAttribute('velocity', new THREE.BufferAttribute(velocities, 3));
    this.geometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));
    this.geometry.setAttribute('alpha', new THREE.BufferAttribute(alphas, 1));
    this.geometry.setAttribute('lifetime', new THREE.BufferAttribute(lifetimes, 1));
    this.geometry.setAttribute('age', new THREE.BufferAttribute(ages, 1));
    this.geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    
    this.geometry.setDrawRange(0, 0);
  }
  
  createMaterial() {
    this.material = new THREE.ShaderMaterial({
      uniforms: {
        time: { value: 0 },
        cameraPosition: { value: new THREE.Vector3() },
        projectionMatrix: { value: new THREE.Matrix4() },
        viewMatrix: { value: new THREE.Matrix4() }
      },
      vertexShader: `
        attribute vec3 velocity;
        attribute float size;
        attribute float alpha;
        attribute float lifetime;
        attribute float age;
        attribute vec3 color;
        uniform float time;
        uniform vec3 cameraPosition;
        uniform mat4 projectionMatrix;
        uniform mat4 viewMatrix;
        varying float vAlpha;
        varying vec3 vColor;
        varying float vSize;
        
        void main() {
          float lifeRatio = age / lifetime;
          if (lifeRatio >= 1.0) {
            gl_Position = vec4(0, 0, -1000, 1);
            gl_PointSize = 0;
            return;
          }
          
          vec3 pos = position + velocity * age + vec3(0, -9.81 * age * age * 0.5, 0);
          
          vec4 mvPosition = viewMatrix * vec4(pos, 1.0);
          gl_Position = projectionMatrix * mvPosition;
          gl_PointSize = size * (300.0 / -mvPosition.z) * (1.0 - lifeRatio * 0.3);
          
          vAlpha = alpha * (1.0 - lifeRatio * 0.5);
          vColor = color;
          vSize = size;
        }
      `,
      fragmentShader: `
        varying float vAlpha;
        varying vec3 vColor;
        varying float vSize;
        
        void main() {
          float dist = length(gl_PointCoord - vec2(0.5));
          if (dist > 0.5) discard;
          
          float alpha = smoothstep(0.5, 0.0, dist) * vAlpha;
          gl_FragColor = vec4(vColor, alpha);
        }
      `,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    });
  }
  
  createMesh() {
    this.mesh = new THREE.Points(this.geometry, this.material);
    this.mesh.name = 'RainSplashes';
    this.mesh.frustumCulled = false;
    this.mesh.visible = false;
  }
  
  resetParticle(i, positions, velocities, sizes, alphas, lifetimes, ages, colors) {
    positions[i * 3] = 0;
    positions[i * 3 + 1] = -100;
    positions[i * 3 + 2] = 0;
    velocities[i * 3] = 0;
    velocities[i * 3 + 1] = 0;
    velocities[i * 3 + 2] = 0;
    sizes[i] = 0;
    alphas[i] = 0;
    lifetimes[i] = 0;
    ages[i] = 0;
    colors[i * 3] = 0.6;
    colors[i * 3 + 1] = 0.7;
    colors[i * 3 + 2] = 0.9;
  }
  
  update(dt) {
    const rainIntensity = this.world.weatherSystem?.rainIntensity || 0;
    
    if (rainIntensity < 0.1) {
      this.mesh.visible = false;
      return;
    }
    
    this.mesh.visible = true;
    
    const ages = this.geometry.attributes.age.array;
    const lifetimes = this.geometry.attributes.lifetime.array;
    const velocities = this.geometry.attributes.velocity.array;
    const positions = this.geometry.attributes.position.array;
    
    let activeCount = 0;
    
    for (let i = 0; i < this.maxParticles; i++) {
      if (ages[i] < lifetimes[i] && lifetimes[i] > 0) {
        ages[i] += dt;
        
        velocities[i * 3] *= 0.9;
        velocities[i * 3 + 2] *= 0.9;
        
        activeCount = Math.max(activeCount, i + 1);
      }
    }
    
    this.geometry.attributes.age.needsUpdate = true;
    this.geometry.attributes.velocity.needsUpdate = true;
    this.geometry.setDrawRange(0, activeCount);
    
    this.material.uniforms.time.value += dt;
    this.material.uniforms.cameraPosition.value.copy(this.renderer.camera.position);
    this.material.uniforms.projectionMatrix.value.copy(this.renderer.camera.projectionMatrix);
    this.material.uniforms.viewMatrix.value.copy(this.renderer.camera.matrixWorldInverse);
    
    this.emitSplashes(dt, rainIntensity);
  }
  
  emitSplashes(dt, intensity) {
    if (!this.vehicle) return;
    
    const vehiclePos = this.vehicle.position;
    const forward = this.vehicle.getForwardVector();
    const right = this.vehicle.getRightVector();
    
    const emitCount = Math.floor(intensity * 30 * dt);
    const positions = this.geometry.attributes.position.array;
    const velocities = this.geometry.attributes.velocity.array;
    const sizes = this.geometry.attributes.size.array;
    const alphas = this.geometry.attributes.alpha.array;
    const lifetimes = this.geometry.attributes.lifetime.array;
    const ages = this.geometry.attributes.age.array;
    const colors = this.geometry.attributes.color.array;
    
    for (let i = 0; i < emitCount; i++) {
      let idx = -1;
      for (let j = 0; j < this.maxParticles; j++) {
        if (ages[j] >= lifetimes[j] || lifetimes[j] === 0) {
          idx = j;
          break;
        }
      }
      if (idx === -1) continue;
      
      const offsetX = (Math.random() - 0.5) * 4;
      const offsetZ = Math.random() * 3 - 1;
      
      const emitPos = vehiclePos.clone()
        .add(right.clone().multiplyScalar(offsetX))
        .add(forward.clone().multiplyScalar(offsetZ));
      
      emitPos.y = this.world.getHeightAt(emitPos.x, emitPos.z) + 0.02;
      
      const vel = new THREE.Vector3(
        (Math.random() - 0.5) * 2,
        Math.random() * 3 + 1,
        (Math.random() - 0.5) * 2
      );
      
      positions[idx * 3] = emitPos.x;
      positions[idx * 3 + 1] = emitPos.y;
      positions[idx * 3 + 2] = emitPos.z;
      
      velocities[idx * 3] = vel.x;
      velocities[idx * 3 + 1] = vel.y;
      velocities[idx * 3 + 2] = vel.z;
      
      sizes[idx] = 0.02 + Math.random() * 0.03;
      alphas[idx] = 0.4 + Math.random() * 0.3;
      lifetimes[idx] = 0.2 + Math.random() * 0.4;
      ages[idx] = 0;
      
      colors[idx * 3] = 0.5 + Math.random() * 0.2;
      colors[idx * 3 + 1] = 0.6 + Math.random() * 0.2;
      colors[idx * 3 + 2] = 0.8 + Math.random() * 0.2;
    }
    
    this.geometry.attributes.position.needsUpdate = true;
    this.geometry.attributes.velocity.needsUpdate = true;
    this.geometry.attributes.size.needsUpdate = true;
    this.geometry.attributes.alpha.needsUpdate = true;
    this.geometry.attributes.lifetime.needsUpdate = true;
    this.geometry.attributes.age.needsUpdate = true;
    this.geometry.attributes.color.needsUpdate = true;
  }
  
  dispose() {
    this.geometry?.dispose();
    this.material?.dispose();
  }
}