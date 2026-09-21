import * as THREE from 'three';

export class TireDustSystem {
  constructor(renderer, vehicle, world, settings) {
    this.renderer = renderer;
    this.vehicle = vehicle;
    this.world = world;
    this.settings = settings;
    
    this.maxParticles = 500;
    this.particles = [];
    this.activeCount = 0;
    
    this.mesh = null;
    this.geometry = null;
    this.material = null;
    
    this.emitTimer = 0;
    this.emitInterval = 0.02;
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
    const rotations = new Float32Array(this.maxParticles);
    const rotationSpeeds = new Float32Array(this.maxParticles);
    
    for (let i = 0; i < this.maxParticles; i++) {
      this.resetParticle(i, positions, velocities, sizes, alphas, lifetimes, ages, colors, rotations, rotationSpeeds);
    }
    
    this.geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    this.geometry.setAttribute('velocity', new THREE.BufferAttribute(velocities, 3));
    this.geometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));
    this.geometry.setAttribute('alpha', new THREE.BufferAttribute(alphas, 1));
    this.geometry.setAttribute('lifetime', new THREE.BufferAttribute(lifetimes, 1));
    this.geometry.setAttribute('age', new THREE.BufferAttribute(ages, 1));
    this.geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    this.geometry.setAttribute('rotation', new THREE.BufferAttribute(rotations, 1));
    this.geometry.setAttribute('rotationSpeed', new THREE.BufferAttribute(rotationSpeeds, 1));
    
    this.geometry.setDrawRange(0, 0);
  }
  
  createMaterial() {
    this.material = new THREE.ShaderMaterial({
      uniforms: {
        time: { value: 0 },
        cameraPosition: { value: new THREE.Vector3() },
        resolution: { value: new THREE.Vector2(window.innerWidth, window.innerHeight) },
        projectionMatrix: { value: new THREE.Matrix4() },
        viewMatrix: { value: new THREE.Matrix4() },
        texture: { value: this.createDustTexture() }
      },
      vertexShader: `
        attribute vec3 velocity;
        attribute float size;
        attribute float alpha;
        attribute float lifetime;
        attribute float age;
        attribute vec3 color;
        attribute float rotation;
        attribute float rotationSpeed;
        uniform float time;
        uniform vec3 cameraPosition;
        uniform mat4 projectionMatrix;
        uniform mat4 viewMatrix;
        varying float vAlpha;
        varying vec3 vColor;
        varying float vRotation;
        varying float vSize;
        
        void main() {
          float lifeRatio = age / lifetime;
          if (lifeRatio >= 1.0) {
            gl_Position = vec4(0, 0, -1000, 1);
            gl_PointSize = 0;
            return;
          }
          
          vec3 pos = position + velocity * age;
          pos.y = max(pos.y, 0.1);
          
          vec4 mvPosition = viewMatrix * vec4(pos, 1.0);
          gl_Position = projectionMatrix * mvPosition;
          gl_PointSize = size * (300.0 / -mvPosition.z) * (1.0 - lifeRatio * 0.5);
          
          vAlpha = alpha * (1.0 - lifeRatio);
          vColor = color;
          vRotation = rotation + rotationSpeed * age;
          vSize = size;
        }
      `,
      fragmentShader: `
        uniform sampler2D texture;
        varying float vAlpha;
        varying vec3 vColor;
        varying float vRotation;
        varying float vSize;
        
        void main() {
          vec2 uv = gl_PointCoord - 0.5;
          float angle = vRotation;
          float s = sin(angle), c = cos(angle);
          uv = vec2(uv.x * c - uv.y * s, uv.x * s + uv.y * c) + 0.5;
          
          vec4 tex = texture2D(texture, uv);
          float alpha = tex.a * vAlpha;
          
          if (alpha < 0.01) discard;
          
          gl_FragColor = vec4(vColor * tex.rgb, alpha);
        }
      `,
      transparent: true,
      depthWrite: false,
      blending: THREE.NormalBlending,
      vertexColors: true
    });
  }
  
  createDustTexture() {
    const size = 64;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    
    const gradient = ctx.createRadialGradient(size/2, size/2, 0, size/2, size/2, size/2);
    gradient.addColorStop(0, 'rgba(255,255,255,1)');
    gradient.addColorStop(0.5, 'rgba(255,255,255,0.5)');
    gradient.addColorStop(1, 'rgba(255,255,255,0)');
    
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);
    
    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.ClampToEdgeWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
    return texture;
  }
  
  createMesh() {
    this.mesh = new THREE.Points(this.geometry, this.material);
    this.mesh.name = 'TireDust';
    this.mesh.frustumCulled = false;
  }
  
  resetParticle(i, positions, velocities, sizes, alphas, lifetimes, ages, colors, rotations, rotationSpeeds) {
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
    colors[i * 3] = 0.5;
    colors[i * 3 + 1] = 0.45;
    colors[i * 3 + 2] = 0.4;
    rotations[i] = 0;
    rotationSpeeds[i] = 0;
  }
  
  emit(wheel, contactPatch, dt) {
    if (!contactPatch.isGrounded) return;
    
    const surfaceType = this.world.getSurfaceTypeAt(contactPatch.point.x, contactPatch.point.z);
    const slip = Math.abs(contactPatch.slip);
    const slipAngle = Math.abs(contactPatch.slipAngle);
    const speed = this.vehicle.speed;
    
    const shouldEmit = (
      (surfaceType === 'gravel' && slip > 0.05 && speed > 5) ||
      (surfaceType === 'asphalt' && (slip > 0.3 || slipAngle > 0.2) && speed > 15) ||
      (surfaceType === 'grass' && speed > 10) ||
      (surfaceType === 'dirt' && speed > 8)
    );
    
    if (!shouldEmit) return;
    
    const emitRate = Math.min(slip * 20 + slipAngle * 30 + speed * 0.5, 50);
    this.emitTimer += dt;
    
    const particlesToEmit = Math.floor(this.emitTimer * emitRate);
    this.emitTimer = 0;
    
    for (let i = 0; i < particlesToEmit && this.activeCount < this.maxParticles; i++) {
      this.spawnParticle(wheel, contactPatch, surfaceType);
    }
  }
  
  spawnParticle(wheel, contactPatch, surfaceType) {
    const positions = this.geometry.attributes.position.array;
    const velocities = this.geometry.attributes.velocity.array;
    const sizes = this.geometry.attributes.size.array;
    const alphas = this.geometry.attributes.alpha.array;
    const lifetimes = this.geometry.attributes.lifetime.array;
    const ages = this.geometry.attributes.age.array;
    const colors = this.geometry.attributes.color.array;
    const rotations = this.geometry.attributes.rotation.array;
    const rotationSpeeds = this.geometry.attributes.rotationSpeed.array;
    
    let i = -1;
    for (let j = 0; j < this.maxParticles; j++) {
      if (ages[j] >= lifetimes[j] || lifetimes[j] === 0) {
        i = j;
        break;
      }
    }
    
    if (i === -1) {
      i = this.activeCount % this.maxParticles;
    }
    
    const pos = contactPatch.point.clone();
    pos.add(new THREE.Vector3(
      (Math.random() - 0.5) * 0.3,
      0.05,
      (Math.random() - 0.5) * 0.3
    ));
    
    const vel = new THREE.Vector3(
      (Math.random() - 0.5) * 3,
      Math.random() * 2 + 1,
      (Math.random() - 0.5) * 3
    );
    
    vel.add(this.vehicle.velocity.clone().multiplyScalar(0.3));
    
    positions[i * 3] = pos.x;
    positions[i * 3 + 1] = pos.y;
    positions[i * 3 + 2] = pos.z;
    
    velocities[i * 3] = vel.x;
    velocities[i * 3 + 1] = vel.y;
    velocities[i * 3 + 2] = vel.z;
    
    sizes[i] = 0.1 + Math.random() * 0.2;
    alphas[i] = 0.4 + Math.random() * 0.3;
    lifetimes[i] = 1.0 + Math.random() * 2.0;
    ages[i] = 0;
    
    if (surfaceType === 'gravel') {
      colors[i * 3] = 0.5 + Math.random() * 0.1;
      colors[i * 3 + 1] = 0.45 + Math.random() * 0.1;
      colors[i * 3 + 2] = 0.4 + Math.random() * 0.1;
    } else if (surfaceType === 'grass') {
      colors[i * 3] = 0.2 + Math.random() * 0.1;
      colors[i * 3 + 1] = 0.3 + Math.random() * 0.1;
      colors[i * 3 + 2] = 0.15 + Math.random() * 0.05;
    } else if (surfaceType === 'dirt') {
      colors[i * 3] = 0.4 + Math.random() * 0.1;
      colors[i * 3 + 1] = 0.3 + Math.random() * 0.1;
      colors[i * 3 + 2] = 0.2 + Math.random() * 0.1;
    } else {
      colors[i * 3] = 0.3 + Math.random() * 0.1;
      colors[i * 3 + 1] = 0.3 + Math.random() * 0.1;
      colors[i * 3 + 2] = 0.3 + Math.random() * 0.1;
    }
    
    rotations[i] = Math.random() * Math.PI * 2;
    rotationSpeeds[i] = (Math.random() - 0.5) * 2;
    
    this.geometry.attributes.position.needsUpdate = true;
    this.geometry.attributes.velocity.needsUpdate = true;
    this.geometry.attributes.size.needsUpdate = true;
    this.geometry.attributes.alpha.needsUpdate = true;
    this.geometry.attributes.lifetime.needsUpdate = true;
    this.geometry.attributes.age.needsUpdate = true;
    this.geometry.attributes.color.needsUpdate = true;
    this.geometry.attributes.rotation.needsUpdate = true;
    this.geometry.attributes.rotationSpeed.needsUpdate = true;
    
    this.activeCount = Math.max(this.activeCount, i + 1);
  }
  
  update(dt) {
    const positions = this.geometry.attributes.position.array;
    const velocities = this.geometry.attributes.velocity.array;
    const ages = this.geometry.attributes.age.array;
    const lifetimes = this.geometry.attributes.lifetime.array;
    const alphas = this.geometry.attributes.alpha.array;
    
    let activeCount = 0;
    
    for (let i = 0; i < this.maxParticles; i++) {
      if (ages[i] < lifetimes[i] && lifetimes[i] > 0) {
        ages[i] += dt;
        
        const lifeRatio = ages[i] / lifetimes[i];
        velocities[i * 3 + 1] -= 9.81 * dt * 0.3;
        velocities[i * 3] *= 0.98;
        velocities[i * 3 + 2] *= 0.98;
        
        activeCount = Math.max(activeCount, i + 1);
      }
    }
    
    this.activeCount = activeCount;
    this.geometry.attributes.age.needsUpdate = true;
    this.geometry.attributes.velocity.needsUpdate = true;
    this.geometry.setDrawRange(0, activeCount);
    
    this.material.uniforms.time.value += dt;
    this.material.uniforms.cameraPosition.value.copy(this.renderer.camera.position);
    this.material.uniforms.projectionMatrix.value.copy(this.renderer.camera.projectionMatrix);
    this.material.uniforms.viewMatrix.value.copy(this.renderer.camera.matrixWorldInverse);
    
    this.vehicle.wheels.forEach((wheel, i) => {
      this.emit(wheel, this.vehicle.contactPatches[i], dt);
    });
  }
  
  dispose() {
    this.geometry?.dispose();
    this.material?.dispose();
    this.material.uniforms.texture.value?.dispose();
  }
}