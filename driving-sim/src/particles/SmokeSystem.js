import * as THREE from 'three';

export class SmokeSystem {
  constructor(renderer, vehicle, world, settings) {
    this.renderer = renderer;
    this.vehicle = vehicle;
    this.world = world;
    this.settings = settings;
    
    this.maxParticles = 200;
    this.particles = [];
    
    this.mesh = null;
    this.geometry = null;
    this.material = null;
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
        projectionMatrix: { value: new THREE.Matrix4() },
        viewMatrix: { value: new THREE.Matrix4() },
        texture: { value: this.createSmokeTexture() }
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
          pos.y += age * 0.5;
          
          vec4 mvPosition = viewMatrix * vec4(pos, 1.0);
          gl_Position = projectionMatrix * mvPosition;
          gl_PointSize = size * (300.0 / -mvPosition.z) * (1.0 + lifeRatio);
          
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
      blending: THREE.NormalBlending
    });
  }
  
  createSmokeTexture() {
    const size = 64;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    
    const gradient = ctx.createRadialGradient(size/2, size/2, 0, size/2, size/2, size/2);
    gradient.addColorStop(0, 'rgba(255,255,255,0.8)');
    gradient.addColorStop(0.3, 'rgba(200,200,200,0.4)');
    gradient.addColorStop(1, 'rgba(150,150,150,0)');
    
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);
    
    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.ClampToEdgeWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
    return texture;
  }
  
  createMesh() {
    this.mesh = new THREE.Points(this.geometry, this.material);
    this.mesh.name = 'Smoke';
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
    colors[i * 3] = 0.6;
    colors[i * 3 + 1] = 0.6;
    colors[i * 3 + 2] = 0.6;
    rotations[i] = 0;
    rotationSpeeds[i] = 0;
  }
  
  emitBurnout(wheel, contactPatch) {
    if (!contactPatch.isGrounded) return;
    
    const slip = Math.abs(contactPatch.slip);
    const throttle = this.vehicle.throttle;
    const speed = this.vehicle.speed;
    
    if (slip > 0.5 && throttle > 0.5 && speed < 20) {
      this.spawnParticle(wheel, contactPatch, 'burnout');
    }
  }
  
  emitDriftSmoke(wheel, contactPatch) {
    if (!contactPatch.isGrounded) return;
    
    const slipAngle = Math.abs(contactPatch.slipAngle);
    const speed = this.vehicle.speed;
    
    if (slipAngle > 0.3 && speed > 30) {
      this.spawnParticle(wheel, contactPatch, 'drift');
    }
  }
  
  spawnParticle(wheel, contactPatch, type) {
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
    if (i === -1) return;
    
    const pos = contactPatch.point.clone();
    pos.y += 0.1;
    
    let vel = new THREE.Vector3();
    let size = 0;
    let alpha = 0;
    let lifetime = 0;
    
    if (type === 'burnout') {
      const rearDir = new THREE.Vector3(0, 0, 1).applyQuaternion(this.vehicle.quaternion);
      vel.copy(rearDir).multiplyScalar(2 + Math.random() * 3);
      vel.add(new THREE.Vector3((Math.random()-0.5)*2, Math.random()*2, (Math.random()-0.5)*2));
      size = 0.5 + Math.random() * 0.5;
      alpha = 0.3 + Math.random() * 0.2;
      lifetime = 0.5 + Math.random() * 1.0;
      colors[i * 3] = 0.8;
      colors[i * 3 + 1] = 0.8;
      colors[i * 3 + 2] = 0.8;
    } else {
      vel.set((Math.random()-0.5)*1, Math.random()*1 + 0.5, (Math.random()-0.5)*1);
      vel.add(this.vehicle.velocity.clone().multiplyScalar(0.1));
      size = 0.8 + Math.random() * 0.6;
      alpha = 0.2 + Math.random() * 0.15;
      lifetime = 1.5 + Math.random() * 2.0;
      colors[i * 3] = 0.5 + Math.random() * 0.1;
      colors[i * 3 + 1] = 0.5 + Math.random() * 0.1;
      colors[i * 3 + 2] = 0.5 + Math.random() * 0.1;
    }
    
    positions[i * 3] = pos.x;
    positions[i * 3 + 1] = pos.y;
    positions[i * 3 + 2] = pos.z;
    
    velocities[i * 3] = vel.x;
    velocities[i * 3 + 1] = vel.y;
    velocities[i * 3 + 2] = vel.z;
    
    sizes[i] = size;
    alphas[i] = alpha;
    lifetimes[i] = lifetime;
    ages[i] = 0;
    rotations[i] = Math.random() * Math.PI * 2;
    rotationSpeeds[i] = (Math.random() - 0.5) * 0.5;
    
    this.geometry.attributes.position.needsUpdate = true;
    this.geometry.attributes.velocity.needsUpdate = true;
    this.geometry.attributes.size.needsUpdate = true;
    this.geometry.attributes.alpha.needsUpdate = true;
    this.geometry.attributes.lifetime.needsUpdate = true;
    this.geometry.attributes.age.needsUpdate = true;
    this.geometry.attributes.color.needsUpdate = true;
    this.geometry.attributes.rotation.needsUpdate = true;
    this.geometry.attributes.rotationSpeed.needsUpdate = true;
  }
  
  update(dt) {
    const ages = this.geometry.attributes.age.array;
    const lifetimes = this.geometry.attributes.lifetime.array;
    const velocities = this.geometry.attributes.velocity.array;
    
    let activeCount = 0;
    
    for (let i = 0; i < this.maxParticles; i++) {
      if (ages[i] < lifetimes[i] && lifetimes[i] > 0) {
        ages[i] += dt;
        
        velocities[i * 3] *= 0.95;
        velocities[i * 3 + 2] *= 0.95;
        
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
    
    const rearWheels = [2, 3];
    rearWheels.forEach(idx => {
      const wheel = this.vehicle.wheels[idx];
      const contact = this.vehicle.contactPatches[idx];
      this.emitBurnout(wheel, contact);
      this.emitDriftSmoke(wheel, contact);
    });
  }
  
  dispose() {
    this.geometry?.dispose();
    this.material?.dispose();
    this.material.uniforms.texture.value?.dispose();
  }
}