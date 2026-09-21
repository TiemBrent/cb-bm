import * as THREE from 'three';

export class SkySystem {
  constructor(renderer, world) {
    this.renderer = renderer;
    this.world = world;
    
    this.mesh = null;
    this.material = null;
    this.sunMesh = null;
    this.moonMesh = null;
    this.starsMesh = null;
    
    this.uniforms = {
      sunDirection: { value: new THREE.Vector3(0.3, 0.8, 0.4).normalize() },
      turbidity: { value: 2.0 },
      rayleigh: { value: 1.0 },
      mieCoefficient: { value: 0.005 },
      mieDirectionalG: { value: 0.8 },
      luminance: { value: 1.0 },
      sunSize: { value: 0.04 },
      time: { value: 0 },
      starRotation: { value: 0 }
    };
    
    // Force shader recompile - cache bust v2
    this._shaderVersion = 2;
  }
  
  async init() {
    this.createSkyDome();
    this.createSun();
    this.createMoon();
    this.createStars();
  }
  
  createSkyDome() {
    const geometry = new THREE.SphereGeometry(1000, 64, 32);
    geometry.scale(-1, 1, 1);
    
    this.material = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: `
        varying vec3 vWorldPosition;
        varying vec3 vNormal;
        void main() {
          vec4 worldPosition = modelMatrix * vec4(position, 1.0);
          vWorldPosition = worldPosition.xyz;
          vNormal = normalize(normalMatrix * normal);
          gl_Position = projectionMatrix * viewMatrix * worldPosition;
        }
      `,
      fragmentShader: `
        varying vec3 vWorldPosition;
        varying vec3 vNormal;
        
        const vec3 up = vec3(0.0, 1.0, 0.0);
        const float e = 2.718281828459045;
        const float pi = 3.141592653589793;
        
        float rayleighPhase(float cosTheta) {
          return 3.0 / (16.0 * pi) * (1.0 + cosTheta * cosTheta);
        }
        
        float hgPhase(float cosTheta, float g) {
          float g2 = g * g;
          float denom = 1.0 + g2 - 2.0 * g * cosTheta;
          return 1.0 / (4.0 * pi) * (1.0 - g2) / (denom * sqrt(denom));
        }
        
        vec3 totalRadiance(vec3 viewDir) {
          float cosSun = dot(viewDir, sunDirection);
          float cosSun2 = cosSun * cosSun;
          
          vec3 betaR = vec3(5.8, 13.5, 33.1) * rayleigh;
          vec3 betaM = vec3(mieCoefficient);
          vec3 betaT = betaR + betaM;
          
          float s = max(0.0, 1.0 - turbidity / 10.0);
          float rayleigh = rayleighPhase(cosSun) * s;
          float mie = hgPhase(cosSun, mieDirectionalG) * (1.0 - s);
          
          vec3 skyColor = (betaR * rayleigh + betaM * mie) / betaT;
          skyColor *= luminance;
          
          float sunIntensity = smoothstep(1.0 - sunSize, 1.0, cosSun);
          skyColor += vec3(1.0, 0.8, 0.6) * sunIntensity * 1000.0;
          
          float horizonFade = smoothstep(-0.1, 0.2, viewDir.y);
          skyColor *= horizonFade;
          
          return skyColor;
        }
        
        void main() {
          vec3 viewDir = normalize(vWorldPosition);
          vec3 color = totalRadiance(viewDir);
          
          // Night sky
          float nightFactor = smoothstep(-0.05, 0.15, -sunDirection.y);
          vec3 nightColor = vec3(0.01, 0.01, 0.03);
          color = mix(nightColor, color, 1.0 - nightFactor);
          
          gl_FragColor = vec4(color, 1.0);
        }
      `,
      side: THREE.BackSide,
      depthWrite: false,
      depthTest: true
    });
    
    this.mesh = new THREE.Mesh(geometry, this.material);
    this.mesh.name = 'SkyDome';
    this.mesh.frustumCulled = false;
  }
  
  createSun() {
    const geometry = new THREE.PlaneGeometry(50, 50);
    const material = new THREE.MeshBasicMaterial({
      color: 0xffffee,
      transparent: true,
      opacity: 1.0,
      depthWrite: false,
      depthTest: false
    });
    
    this.sunMesh = new THREE.Mesh(geometry, material);
    this.sunMesh.name = 'Sun';
    this.sunMesh.frustumCulled = false;
    this.sunMesh.renderOrder = -1;
  }
  
  createMoon() {
    const geometry = new THREE.PlaneGeometry(40, 40);
    const material = new THREE.MeshBasicMaterial({
      color: 0xeef2ff,
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
      depthTest: false
    });
    
    this.moonMesh = new THREE.Mesh(geometry, material);
    this.moonMesh.name = 'Moon';
    this.moonMesh.frustumCulled = false;
    this.moonMesh.renderOrder = -1;
  }
  
  createStars() {
    const geometry = new THREE.BufferGeometry();
    const count = 3000;
    const positions = new Float32Array(count * 3);
    const sizes = new Float32Array(count);
    const colors = new Float32Array(count * 3);
    const alphas = new Float32Array(count);
    
    for (let i = 0; i < count; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const radius = 950;
      
      positions[i * 3] = radius * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = radius * Math.cos(phi);
      positions[i * 3 + 2] = radius * Math.sin(phi) * Math.sin(theta);
      
      sizes[i] = 0.5 + Math.random() * 1.5;
      
      const temp = 0.5 + Math.random() * 0.5;
      if (temp < 0.6) {
        colors[i * 3] = 1.0;
        colors[i * 3 + 1] = 0.8 + Math.random() * 0.2;
        colors[i * 3 + 2] = 0.6 + Math.random() * 0.2;
      } else if (temp < 0.8) {
        colors[i * 3] = 1.0;
        colors[i * 3 + 1] = 1.0;
        colors[i * 3 + 2] = 0.9 + Math.random() * 0.1;
      } else {
        colors[i * 3] = 0.7 + Math.random() * 0.3;
        colors[i * 3 + 1] = 0.8 + Math.random() * 0.2;
        colors[i * 3 + 2] = 1.0;
      }
      
      alphas[i] = 0.3 + Math.random() * 0.7;
    }
    
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geometry.setAttribute('alpha', new THREE.BufferAttribute(alphas, 1));
    
    const material = new THREE.PointsMaterial({
      size: 1,
      vertexColors: true,
      transparent: true,
      opacity: 1.0,
      depthWrite: false,
      depthTest: false,
      sizeAttenuation: false
    });
    
    this.starsMesh = new THREE.Points(geometry, material);
    this.starsMesh.name = 'Stars';
    this.starsMesh.frustumCulled = false;
    this.starsMesh.renderOrder = -2;
  }
  
  update(dt) {
    const timeOfDay = this.world.timeOfDay;
    const sunAngle = timeOfDay * Math.PI * 2 - Math.PI / 2;
    
    const sunDir = new THREE.Vector3(
      Math.cos(sunAngle),
      Math.sin(sunAngle),
      0.3
    ).normalize();
    
    this.uniforms.sunDirection.value.copy(sunDir);
    this.uniforms.time.value += dt;
    
    if (this.sunMesh) {
      this.sunMesh.position.copy(sunDir).multiplyScalar(-900);
      this.sunMesh.lookAt(0, 0, 0);
      
      const sunHeight = sunDir.y;
      if (sunHeight > -0.1) {
        const intensity = THREE.MathUtils.clamp((sunHeight + 0.1) / 0.2, 0, 1);
        this.sunMesh.material.opacity = intensity;
        this.sunMesh.scale.setScalar(0.5 + intensity * 1.5);
      } else {
        this.sunMesh.material.opacity = 0;
      }
    }
    
    if (this.moonMesh) {
      const moonDir = sunDir.clone().negate();
      this.moonMesh.position.copy(moonDir).multiplyScalar(-900);
      this.moonMesh.lookAt(0, 0, 0);
      
      const moonHeight = moonDir.y;
      if (moonHeight > -0.1) {
        const intensity = THREE.MathUtils.clamp((moonHeight + 0.1) / 0.2, 0, 1);
        this.moonMesh.material.opacity = intensity * 0.9;
      } else {
        this.moonMesh.material.opacity = 0;
      }
    }
    
    if (this.starsMesh) {
      this.uniforms.starRotation.value += dt * 0.00001;
      this.starsMesh.rotation.y = this.uniforms.starRotation.value;
      
      const starVisibility = THREE.MathUtils.clamp((-sunDir.y - 0.05) / 0.2, 0, 1);
      this.starsMesh.material.opacity = starVisibility;
    }
  }
  
  onResize() {
    // Nothing needed
  }
  
  dispose() {
    this.mesh?.geometry.dispose();
    this.mesh?.material.dispose();
    this.sunMesh?.geometry.dispose();
    this.sunMesh?.material.dispose();
    this.moonMesh?.geometry.dispose();
    this.moonMesh?.material.dispose();
    this.starsMesh?.geometry.dispose();
    this.starsMesh?.material.dispose();
  }
}