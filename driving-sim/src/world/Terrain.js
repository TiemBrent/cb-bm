import * as THREE from 'three';
import { SimplexNoise } from 'three/examples/jsm/math/SimplexNoise.js';

export class Terrain {
  constructor(renderer, settings) {
    this.renderer = renderer;
    this.settings = settings;
    
    this.size = 4000;
    this.segments = 512;
    this.maxHeight = 150;
    this.minHeight = 0;
    
    this.mesh = null;
    this.geometry = null;
    this.material = null;
    
    this.heightData = null;
    this.normalData = null;
    
    this.noise = new SimplexNoise();
    this.detailNoise = new SimplexNoise();
    
    this.chunkSize = 256;
    this.chunks = [];
    this.chunkResolution = 64;
  }
  
  async init() {
    this.generateHeightmap();
    this.createGeometry();
    this.createMaterial();
    this.createMesh();
    this.computeNormals();
  }
  
  generateHeightmap() {
    const resolution = this.segments + 1;
    this.heightData = new Float32Array(resolution * resolution);
    this.normalData = new Float32Array(resolution * resolution * 3);
    
    const halfSize = this.size / 2;
    const scale = 0.002;
    const detailScale = 0.02;
    
    for (let z = 0; z < resolution; z++) {
      for (let x = 0; x < resolution; x++) {
        const worldX = (x - this.segments / 2) * (this.size / this.segments);
        const worldZ = (z - this.segments / 2) * (this.size / this.segments);
        
        let height = 0;
        
// Base terrain
        height += this.noise.noise(worldX * scale, worldZ * scale) * this.maxHeight * 0.6;
        height += this.noise.noise(worldX * scale * 2, worldZ * scale * 2) * this.maxHeight * 0.2;
        height += this.noise.noise(worldX * scale * 4, worldZ * scale * 4) * this.maxHeight * 0.1;
        height += this.noise.noise(worldX * scale * 8, worldZ * scale * 8) * this.maxHeight * 0.05;
        
        // Detail noise
        height += this.detailNoise.noise(worldX * detailScale, worldZ * detailScale) * 5;
        height += this.detailNoise.noise(worldX * detailScale * 2, worldZ * detailScale * 2) * 2;
        height += this.detailNoise.noise(worldX * detailScale * 4, worldZ * detailScale * 4) * 1;
        
        // Valleys and ridges
        const ridge = Math.abs(this.noise.noise(worldX * scale * 0.5, worldZ * scale * 0.5));
        height += (1 - ridge) * 30;
        
        // Clamp
        height = Math.max(this.minHeight, Math.min(this.maxHeight, height));
        
        this.heightData[z * resolution + x] = height;
      }
    }
  }
  
  createGeometry() {
    const resolution = this.segments + 1;
    const halfSize = this.size / 2;
    const segmentSize = this.size / this.segments;
    
    const positions = new Float32Array(resolution * resolution * 3);
    const uvs = new Float32Array(resolution * resolution * 2);
    const indices = [];
    
    for (let z = 0; z < resolution; z++) {
      for (let x = 0; x < resolution; x++) {
        const i = z * resolution + x;
        
        positions[i * 3] = (x - this.segments / 2) * segmentSize;
        positions[i * 3 + 1] = this.heightData[i];
        positions[i * 3 + 2] = (z - this.segments / 2) * segmentSize;
        
        uvs[i * 2] = x / this.segments;
        uvs[i * 2 + 1] = z / this.segments;
      }
    }
    
    for (let gz = 0; gz < this.segments; gz++) {
      for (let gx = 0; gx < this.segments; gx++) {
        const a = gz * resolution + gx;
        const b = gz * resolution + gx + 1;
        const c = (gz + 1) * resolution + gx;
        const d = (gz + 1) * resolution + gx + 1;
        
        indices.push(a, c, b);
        indices.push(b, c, d);
      }
    }
    
    this.geometry = new THREE.BufferGeometry();
    this.geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    this.geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
    this.geometry.setIndex(indices);
    this.geometry.computeVertexNormals();
    this.geometry.computeTangents();
  }
  
  computeNormals() {
    const resolution = this.segments + 1;
    const segmentSize = this.size / this.segments;
    
    for (let z = 0; z < resolution; z++) {
      for (let x = 0; x < resolution; x++) {
        const i = z * resolution + x;
        
        let hL = this.heightData[z * resolution + Math.max(0, x - 1)];
        let hR = this.heightData[z * resolution + Math.min(resolution - 1, x + 1)];
        let hD = this.heightData[Math.max(0, z - 1) * resolution + x];
        let hU = this.heightData[Math.min(resolution - 1, z + 1) * resolution + x];
        
        const normal = new THREE.Vector3(
          (hL - hR) * 0.5,
          segmentSize,
          (hD - hU) * 0.5
        ).normalize();
        
        this.normalData[i * 3] = normal.x;
        this.normalData[i * 3 + 1] = normal.y;
        this.normalData[i * 3 + 2] = normal.z;
      }
    }
    
    this.geometry.setAttribute('normal', new THREE.BufferAttribute(this.normalData, 3));
  }
  
  createMaterial() {
    this.material = this.renderer.pbrMaterials.createMaterial({
      name: 'terrain',
      baseColor: new THREE.Color(0.35, 0.3, 0.25),
      metallic: 0.0,
      roughness: 0.9,
      ao: 1.0,
      clearcoat: 0.0,
      clearcoatRoughness: 0.0,
      hasBaseColorMap: true
    });
    
    if (this.material.uniforms.baseColorMap) {
      this.material.uniforms.baseColorMap.value = this.generateTerrainTexture();
    }
    if (this.material.uniforms.hasBaseColorMap) {
      this.material.uniforms.hasBaseColorMap.value = true;
    }
    this.material.defines.USE_TANGENT = '';
  }
  
  generateTerrainTexture() {
    const size = 1024;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    
    const imgData = ctx.createImageData(size, size);
    const data = imgData.data;
    
    const noise = new SimplexNoise();
    
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const i = (y * size + x) * 4;
        
        const nx = x / size * 50;
        const nz = y / size * 50;
        
        let v = noise.noise(nx * 0.01, nz * 0.01);
        v += noise.noise(nx * 0.03, nz * 0.03) * 0.5;
        v += noise.noise(nx * 0.1, nz * 0.1) * 0.25;
        
        v = (v + 1) * 0.5;
        
        const r = 90 + v * 40;
        const g = 80 + v * 35;
        const b = 60 + v * 25;
        
        data[i] = r;
        data[i + 1] = g;
        data[i + 2] = b;
        data[i + 3] = 255;
      }
    }
    
    ctx.putImageData(imgData, 0, 0);
    
    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(20, 20);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = this.renderer.renderer.capabilities.getMaxAnisotropy();
    texture.generateMipmaps = true;
    
    return texture;
  }
  
  createMesh() {
    this.mesh = new THREE.Mesh(this.geometry, this.material);
    this.mesh.name = 'Terrain';
    this.mesh.receiveShadow = true;
    this.mesh.castShadow = true;
    this.mesh.frustumCulled = true;
  }
  
  getHeightAt(x, z) {
    if (!this.heightData) return 0;
    
    const resolution = this.segments + 1;
    const segmentSize = this.size / this.segments;
    const halfSize = this.size / 2;
    
    const gx = (x + halfSize) / segmentSize;
    const gz = (z + halfSize) / segmentSize;
    
    if (gx < 0 || gx >= this.segments || gz < 0 || gz >= this.segments) {
      return this.minHeight;
    }
    
    const x0 = Math.floor(gx);
    const z0 = Math.floor(gz);
    const x1 = x0 + 1;
    const z1 = z0 + 1;
    
    const tx = gx - x0;
    const tz = gz - z0;
    
    const h00 = this.heightData[z0 * resolution + x0];
    const h10 = this.heightData[z0 * resolution + x1];
    const h01 = this.heightData[z1 * resolution + x0];
    const h11 = this.heightData[z1 * resolution + x1];
    
    const h0 = THREE.MathUtils.lerp(h00, h10, tx);
    const h1 = THREE.MathUtils.lerp(h01, h11, tx);
    
    return THREE.MathUtils.lerp(h0, h1, tz);
  }
  
  getNormalAt(x, z) {
    if (!this.normalData) return new THREE.Vector3(0, 1, 0);
    
    const resolution = this.segments + 1;
    const segmentSize = this.size / this.segments;
    const halfSize = this.size / 2;
    
    const gx = (x + halfSize) / segmentSize;
    const gz = (z + halfSize) / segmentSize;
    
    if (gx < 0 || gx >= this.segments || gz < 0 || gz >= this.segments) {
      return new THREE.Vector3(0, 1, 0);
    }
    
    const x0 = Math.floor(gx);
    const z0 = Math.floor(gz);
    const x1 = Math.min(resolution - 1, x0 + 1);
    const z1 = Math.min(resolution - 1, z0 + 1);
    
    const tx = gx - x0;
    const tz = gz - z0;
    
    const n00 = new THREE.Vector3(
      this.normalData[(z0 * resolution + x0) * 3],
      this.normalData[(z0 * resolution + x0) * 3 + 1],
      this.normalData[(z0 * resolution + x0) * 3 + 2]
    );
    const n10 = new THREE.Vector3(
      this.normalData[(z0 * resolution + x1) * 3],
      this.normalData[(z0 * resolution + x1) * 3 + 1],
      this.normalData[(z0 * resolution + x1) * 3 + 2]
    );
    const n01 = new THREE.Vector3(
      this.normalData[(z1 * resolution + x0) * 3],
      this.normalData[(z1 * resolution + x0) * 3 + 1],
      this.normalData[(z1 * resolution + x0) * 3 + 2]
    );
    const n11 = new THREE.Vector3(
      this.normalData[(z1 * resolution + x1) * 3],
      this.normalData[(z1 * resolution + x1) * 3 + 1],
      this.normalData[(z1 * resolution + x1) * 3 + 2]
    );
    
    const n0 = n00.clone().lerp(n10, tx);
    const n1 = n01.clone().lerp(n11, tx);
    
    return n0.clone().lerp(n1, tz).normalize();
  }
  
  update(dt) {
    // Terrain is static
  }
  
  onResize() {
    // Nothing needed
  }
  
  dispose() {
    this.geometry?.dispose();
    this.material?.dispose();
    if (this.material.uniforms.baseColorMap.value) {
      this.material.uniforms.baseColorMap.value.dispose();
    }
  }
}