import * as THREE from 'three';

export class SparkSystem {
  constructor(renderer, vehicle, world, settings) {
    this.renderer = renderer;
    this.vehicle = vehicle;
    this.world = world;
    this.settings = settings;
    
    this.maxParticles = 300;
    
    this.mesh = null;
    this.geometry = null;
    this.material = null;
    
    this.lastImpactTime = 0;
    this.impactCooldown = 0.1;
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
          gl_PointSize = size * (300.0 / -mvPosition.z);
          
          vAlpha = alpha * (1.0 - lifeRatio);
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
    this.mesh.name = 'Sparks';
    this.mesh.frustumCulled = false;
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
    colors[i * 3] = 1;
    colors[i * 3 + 1] = 0.8;
    colors[i * 3 + 2] = 0.2;
  }
  
  checkScrape() {
    const chassis = this.vehicle.chassis;
    if (!chassis) return;
    
    const worldPos = this.vehicle.position;
    const forward = this.vehicle.getForwardVector();
    const right = this.vehicle.getRightVector();
    const up = this.vehicle.getUpVector();
    
    const checkPoints = [
      new THREE.Vector3(-0.9, -0.1, 1.5),
      new THREE.Vector3(0.9, -0.1, 1.5),
      new THREE.Vector3(-0.9, -0.1, -1.5),
      new THREE.Vector3(0.9, -0.1, -1.5),
      new THREE.Vector3(0, -0.2, 0)
    ];
    
    let maxDepth = 0;
    let scrapePoint = null;
    let scrapeNormal = null;
    
    checkPoints.forEach(localPoint => {
      const worldPoint = localPoint.clone().applyQuaternion(this.vehicle.quaternion).add(worldPos);
      const terrainHeight = this.world.getHeightAt(worldPoint.x, worldPoint.z);
      const terrainNormal = this.world.getNormalAt(worldPoint.x, worldPoint.z);
      
      const depth = terrainHeight - worldPoint.y;
      if (depth > maxDepth && depth > 0.05) {
        maxDepth = depth;
        scrapePoint = worldPoint.clone();
        scrapePoint.y = terrainHeight;
        scrapeNormal = terrainNormal;
      }
    });
    
    if (scrapePoint && maxDepth > 0.05 && this.vehicle.speed > 10) {
      const now = this.world.simulator?.elapsedTime || 0;
      if (now - this.lastImpactTime > this.impactCooldown) {
        this.emitSparks(scrapePoint, scrapeNormal, maxDepth);
        this.lastImpactTime = now;
      }
    }
  }
  
  checkImpact() {
    if (!this.vehicle.lastPosition) return;
    
    const displacement = this.vehicle.position.clone().sub(this.vehicle.lastPosition);
    const distance = displacement.length();
    
    if (distance > 2.0 && this.vehicle.speed > 15) {
      const impactPoint = this.vehicle.position.clone();
      const impactNormal = new THREE.Vector3(0, 1, 0);
      this.emitSparks(impactPoint, impactNormal, distance * 0.5);
    }
  }
  
  emitSparks(position, normal, intensity) {
    const count = Math.floor(intensity * 20 + 5);
    
    const positions = this.geometry.attributes.position.array;
    const velocities = this.geometry.attributes.velocity.array;
    const sizes = this.geometry.attributes.size.array;
    const alphas = this.geometry.attributes.alpha.array;
    const lifetimes = this.geometry.attributes.lifetime.array;
    const ages = this.geometry.attributes.age.array;
    const colors = this.geometry.attributes.color.array;
    
    for (let i = 0; i < count; i++) {
      let idx = -1;
      for (let j = 0; j < this.maxParticles; j++) {
        if (ages[j] >= lifetimes[j] || lifetimes[j] === 0) {
          idx = j;
          break;
        }
      }
      if (idx === -1) continue;
      
      const spread = new THREE.Vector3(
        (Math.random() - 0.5) * 0.3,
        Math.random() * 0.2,
        (Math.random() - 0.5) * 0.3
      );
      
      const emitPos = position.clone().add(spread);
      
      const vel = normal.clone().multiplyScalar(3 + Math.random() * 5)
        .add(new THREE.Vector3(
          (Math.random() - 0.5) * 8,
          Math.random() * 5 + 2,
          (Math.random() - 0.5) * 8
        ))
        .add(this.vehicle.velocity.clone().multiplyScalar(0.2));
      
      positions[idx * 3] = emitPos.x;
      positions[idx * 3 + 1] = emitPos.y;
      positions[idx * 3 + 2] = emitPos.z;
      
      velocities[idx * 3] = vel.x;
      velocities[idx * 3 + 1] = vel.y;
      velocities[idx * 3 + 2] = vel.z;
      
      sizes[idx] = 0.03 + Math.random() * 0.04;
      alphas[idx] = 0.8 + Math.random() * 0.2;
      lifetimes[idx] = 0.5 + Math.random() * 1.0;
      ages[idx] = 0;
      
      const temp = Math.random();
      if (temp < 0.5) {
        colors[idx * 3] = 1;
        colors[idx * 3 + 1] = 0.8 + Math.random() * 0.2;
        colors[idx * 3 + 2] = 0.1 + Math.random() * 0.2;
      } else if (temp < 0.8) {
        colors[idx * 3] = 1;
        colors[idx * 3 + 1] = 0.5 + Math.random() * 0.3;
        colors[idx * 3 + 2] = 0;
      } else {
        colors[idx * 3] = 1;
        colors[idx * 3 + 1] = 1;
        colors[idx * 3 + 2] = 0.5 + Math.random() * 0.5;
      }
    }
    
    this.geometry.attributes.position.needsUpdate = true;
    this.geometry.attributes.velocity.needsUpdate = true;
    this.geometry.attributes.size.needsUpdate = true;
    this.geometry.attributes.alpha.needsUpdate = true;
    this.geometry.attributes.lifetime.needsUpdate = true;
    this.geometry.attributes.age.needsUpdate = true;
    this.geometry.attributes.color.needsUpdate = true;
  }
  
  update(dt) {
    const ages = this.geometry.attributes.age.array;
    const lifetimes = this.geometry.attributes.lifetime.array;
    const velocities = this.geometry.attributes.velocity.array;
    
    let activeCount = 0;
    
    for (let i = 0; i < this.maxParticles; i++) {
      if (ages[i] < lifetimes[i] && lifetimes[i] > 0) {
        ages[i] += dt;
        
        velocities[i * 3] *= 0.98;
        velocities[i * 3 + 2] *= 0.98;
        
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
    
    this.checkScrape();
    this.checkImpact();
  }
  
  dispose() {
    this.geometry?.dispose();
    this.material?.dispose();
  }
}