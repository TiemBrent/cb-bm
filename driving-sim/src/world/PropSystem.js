import * as THREE from 'three';

export class PropSystem {
  constructor(renderer, terrain, roadNetwork, settings) {
    this.renderer = renderer;
    this.terrain = terrain;
    this.roadNetwork = roadNetwork;
    this.settings = settings;
    
    this.group = new THREE.Group();
    this.group.name = 'PropSystem';
    
    this.instances = [];
    this.instanceMeshes = new Map();
    this.propTypes = [];
    this.maxInstancesPerType = 1000;
  }
  
  async init() {
    this.definePropTypes();
    this.generateProps();
    this.createInstanceMeshes();
  }
  
  definePropTypes() {
    this.propTypes = [
      {
        name: 'tree_pine_large',
        geometry: this.createPineGeometry(8, 4),
        material: this.createFoliageMaterial(0.2, 0.15, 0.1),
        scale: { min: 0.8, max: 1.2 },
        density: 0.0008,
        minDistanceFromRoad: 8,
        maxSlope: 0.4,
        biome: ['forest', 'mountain']
      },
      {
        name: 'tree_pine_small',
        geometry: this.createPineGeometry(5, 2.5),
        material: this.createFoliageMaterial(0.18, 0.14, 0.09),
        scale: { min: 0.5, max: 0.8 },
        density: 0.0015,
        minDistanceFromRoad: 5,
        maxSlope: 0.5,
        biome: ['forest', 'mountain']
      },
      {
        name: 'tree_oak',
        geometry: this.createOakGeometry(6, 5),
        material: this.createFoliageMaterial(0.15, 0.25, 0.1),
        scale: { min: 0.7, max: 1.3 },
        density: 0.0005,
        minDistanceFromRoad: 10,
        maxSlope: 0.3,
        biome: ['grassland', 'forest']
      },
      {
        name: 'rock_large',
        geometry: this.createRockGeometry(3),
        material: this.createRockMaterial(0.3, 0.28, 0.25),
        scale: { min: 1.5, max: 3 },
        density: 0.0003,
        minDistanceFromRoad: 3,
        maxSlope: 0.8,
        biome: ['mountain', 'canyon', 'coastal']
      },
      {
        name: 'rock_medium',
        geometry: this.createRockGeometry(1.5),
        material: this.createRockMaterial(0.35, 0.32, 0.28),
        scale: { min: 0.8, max: 1.5 },
        density: 0.0008,
        minDistanceFromRoad: 2,
        maxSlope: 1.0,
        biome: ['mountain', 'canyon', 'coastal', 'grassland']
      },
      {
        name: 'rock_small',
        geometry: this.createRockGeometry(0.6),
        material: this.createRockMaterial(0.4, 0.38, 0.35),
        scale: { min: 0.4, max: 0.8 },
        density: 0.002,
        minDistanceFromRoad: 1,
        maxSlope: 1.0,
        biome: ['all']
      },
      {
        name: 'bush',
        geometry: this.createBushGeometry(1.2),
        material: this.createFoliageMaterial(0.1, 0.2, 0.08),
        scale: { min: 0.6, max: 1.2 },
        density: 0.003,
        minDistanceFromRoad: 2,
        maxSlope: 0.4,
        biome: ['grassland', 'forest']
      },
      {
        name: 'grass_clump',
        geometry: this.createGrassClumpGeometry(0.5),
        material: this.createGrassMaterial(),
        scale: { min: 0.5, max: 1.5 },
        density: 0.02,
        minDistanceFromRoad: 1,
        maxSlope: 0.6,
        biome: ['grassland', 'forest']
      },
      {
        name: 'sign',
        geometry: this.createSignGeometry(),
        material: this.createSignMaterial(),
        scale: { min: 1, max: 1 },
        density: 0.0001,
        minDistanceFromRoad: 2.5,
        maxDistanceFromRoad: 4,
        maxSlope: 0.2,
        onRoadSide: true,
        biome: ['all']
      },
      {
        name: 'streetlight',
        geometry: this.createStreetlightGeometry(),
        material: this.createStreetlightMaterial(),
        scale: { min: 1, max: 1 },
        density: 0.00005,
        minDistanceFromRoad: 3.5,
        maxDistanceFromRoad: 5,
        maxSlope: 0.1,
        onRoadSide: true,
        biome: ['coastal']
      }
    ];
  }
  
  createPineGeometry(height, radius) {
    const geometry = new THREE.ConeGeometry(radius, height, 8);
    geometry.translate(0, height / 2, 0);
    return geometry;
  }
  
  createOakGeometry(height, radius) {
    const trunkGeometry = new THREE.CylinderGeometry(0.3, 0.5, height * 0.4, 8);
    trunkGeometry.translate(0, height * 0.2, 0);
    
    const canopyGeometry = new THREE.SphereGeometry(radius, 12, 8);
    canopyGeometry.translate(0, height * 0.6, 0);
    canopyGeometry.scale(1, 0.7, 1);
    
    const merged = new THREE.BufferGeometry();
    const positions = [];
    const normals = [];
    const uvs = [];
    
    [trunkGeometry, canopyGeometry].forEach((g, idx) => {
      const pos = g.attributes.position;
      const nor = g.attributes.normal;
      const uv = g.attributes.uv;
      
      for (let i = 0; i < pos.count; i++) {
        positions.push(pos.getX(i), pos.getY(i), pos.getZ(i));
        normals.push(nor.getX(i), nor.getY(i), nor.getZ(i));
        uvs.push(uv.getX(i), uv.getY(i));
      }
    });
    
    merged.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    merged.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    merged.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    
    return merged;
  }
  
  createRockGeometry(size) {
    const geometry = new THREE.DodecahedronGeometry(size, 1);
    
    const positions = geometry.attributes.position;
    for (let i = 0; i < positions.count; i++) {
      const x = positions.getX(i);
      const y = positions.getY(i);
      const z = positions.getZ(i);
      
      const noise = 1 + (Math.random() - 0.5) * 0.3;
      positions.setXYZ(i, x * noise, y * noise * 0.8, z * noise);
    }
    
    geometry.computeVertexNormals();
    geometry.computeTangents();
    return geometry;
  }
  
  createBushGeometry(size) {
    const geometry = new THREE.SphereGeometry(size, 8, 6);
    geometry.scale(1, 0.6, 1);
    geometry.translate(0, size * 0.3, 0);
    
    const positions = geometry.attributes.position;
    for (let i = 0; i < positions.count; i++) {
      const noise = 1 + (Math.random() - 0.5) * 0.2;
      const x = positions.getX(i) * noise;
      const y = positions.getY(i) * noise;
      const z = positions.getZ(i) * noise;
      positions.setXYZ(i, x, y, z);
    }
    
    geometry.computeVertexNormals();
    return geometry;
  }
  
  createGrassClumpGeometry(size) {
    const blades = 5;
    const geometry = new THREE.BufferGeometry();
    const positions = [];
    const normals = [];
    const uvs = [];
    const indices = [];
    
    for (let b = 0; b < blades; b++) {
      const angle = (b / blades) * Math.PI * 2;
      const width = size * 0.15;
      const height = size * (0.8 + Math.random() * 0.4);
      
      const vBase = positions.length / 3;
      
      positions.push(
        Math.cos(angle) * width, 0, Math.sin(angle) * width,
        Math.cos(angle) * width * 0.3, height, Math.sin(angle) * width * 0.3
      );
      
      normals.push(
        Math.cos(angle), 0, Math.sin(angle),
        Math.cos(angle) * 0.5, 0.8, Math.sin(angle) * 0.5
      );
      
      uvs.push(0, 0, 1, 1);
      
      indices.push(vBase, vBase + 1, vBase + 2);
    }
    
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geometry.setIndex(indices);
    
    return geometry;
  }
  
  createSignGeometry() {
    const poleGeometry = new THREE.CylinderGeometry(0.08, 0.1, 3, 8);
    poleGeometry.translate(0, 1.5, 0);
    
    const signGeometry = new THREE.BoxGeometry(1.2, 0.8, 0.05);
    signGeometry.translate(0.6, 3.2, 0);
    
    const merged = new THREE.BufferGeometry();
    const positions = [];
    const normals = [];
    const uvs = [];
    
    [poleGeometry, signGeometry].forEach(g => {
      const pos = g.attributes.position;
      const nor = g.attributes.normal;
      const uv = g.attributes.uv;
      
      for (let i = 0; i < pos.count; i++) {
        positions.push(pos.getX(i), pos.getY(i), pos.getZ(i));
        normals.push(nor.getX(i), nor.getY(i), nor.getZ(i));
        uvs.push(uv.getX(i), uv.getY(i));
      }
    });
    
    merged.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    merged.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    merged.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    
    return merged;
  }
  
  createStreetlightGeometry() {
    const poleGeometry = new THREE.CylinderGeometry(0.05, 0.12, 6, 8);
    poleGeometry.translate(0, 3, 0);
    
    const armGeometry = new THREE.CylinderGeometry(0.04, 0.04, 1.5, 6);
    armGeometry.rotateZ(Math.PI / 2);
    armGeometry.translate(0.75, 5.8, 0);
    
    const lightGeometry = new THREE.BoxGeometry(0.4, 0.15, 0.3);
    lightGeometry.translate(1.55, 5.8, 0);
    
    const merged = new THREE.BufferGeometry();
    const positions = [];
    const normals = [];
    const uvs = [];
    
    [poleGeometry, armGeometry, lightGeometry].forEach(g => {
      const pos = g.attributes.position;
      const nor = g.attributes.normal;
      const uv = g.attributes.uv;
      
      for (let i = 0; i < pos.count; i++) {
        positions.push(pos.getX(i), pos.getY(i), pos.getZ(i));
        normals.push(nor.getX(i), nor.getY(i), nor.getZ(i));
        uvs.push(uv.getX(i), uv.getY(i));
      }
    });
    
    merged.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    merged.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    merged.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    
    return merged;
  }
  
  createFoliageMaterial(r, g, b) {
    return this.renderer.pbrMaterials.createMaterial({
      name: `foliage_${r}_${g}_${b}`,
      baseColor: new THREE.Color(r, g, b),
      metallic: 0.0,
      roughness: 0.9,
      ao: 0.8,
      alphaCutoff: 0.5
    });
  }
  
  createRockMaterial(r, g, b) {
    return this.renderer.pbrMaterials.createMaterial({
      name: `rock_${r}_${g}_${b}`,
      baseColor: new THREE.Color(r, g, b),
      metallic: 0.0,
      roughness: 0.9,
      ao: 0.7
    });
  }
  
  createGrassMaterial() {
    return this.renderer.pbrMaterials.createMaterial({
      name: 'grass_clump',
      baseColor: new THREE.Color(0.15, 0.25, 0.1),
      metallic: 0.0,
      roughness: 0.95,
      ao: 0.7,
      alphaCutoff: 0.3
    });
  }
  
  createSignMaterial() {
    return this.renderer.pbrMaterials.createMaterial({
      name: 'sign',
      baseColor: new THREE.Color(0.9, 0.9, 0.8),
      metallic: 0.0,
      roughness: 0.4,
      ao: 1.0,
      emissive: new THREE.Color(0.05, 0.05, 0.02),
      emissiveIntensity: 0.3
    });
  }
  
  createStreetlightMaterial() {
    return this.renderer.pbrMaterials.createMaterial({
      name: 'streetlight',
      baseColor: new THREE.Color(0.2, 0.2, 0.25),
      metallic: 0.8,
      roughness: 0.3
    });
  }
  
  generateProps() {
    const worldSize = this.terrain.size;
    const halfSize = worldSize / 2;
    const gridSize = 50;
    
    const biomeMap = this.generateBiomeMap();
    
    for (let gx = 0; gx < worldSize / gridSize; gx++) {
      for (let gz = 0; gz < worldSize / gridSize; gz++) {
        const wx = gx * gridSize - halfSize;
        const wz = gz * gridSize - halfSize;
        
        const biome = biomeMap.get(`${gx}_${gz}`) || 'grassland';
        
        this.propTypes.forEach(propType => {
          if (!propType.biome.includes('all') && !propType.biome.includes(biome)) return;
          
          const count = Math.floor(propType.density * gridSize * gridSize);
          
          for (let i = 0; i < count; i++) {
            const x = wx + Math.random() * gridSize;
            const z = wz + Math.random() * gridSize;
            
            if (x < -halfSize + 50 || x > halfSize - 50 || z < -halfSize + 50 || z > halfSize - 50) continue;
            
            const y = this.terrain.getHeightAt(x, z);
            const normal = this.terrain.getNormalAt(x, z);
            const slope = Math.acos(normal.y);
            
            if (slope > propType.maxSlope) continue;
            
            const roadInfo = this.roadNetwork.getRoadInfoAt(x, z);
            if (roadInfo) {
              if (roadInfo.distance < propType.minDistanceFromRoad) continue;
              if (propType.maxDistanceFromRoad && roadInfo.distance > propType.maxDistanceFromRoad) continue;
              if (propType.onRoadSide && roadInfo.distance > propType.maxDistanceFromRoad) continue;
            }
            
            const scale = THREE.MathUtils.lerp(propType.scale.min, propType.scale.max, Math.random());
            const rotation = Math.random() * Math.PI * 2;
            
            this.instances.push({
              type: propType.name,
              position: new THREE.Vector3(x, y, z),
              rotation: new THREE.Euler(0, rotation, 0),
              scale: new THREE.Vector3(scale, scale, scale),
              biome
            });
          }
        });
      }
    }
    
    console.log(`Generated ${this.instances.length} prop instances`);
  }
  
  generateBiomeMap() {
    const biomeMap = new Map();
    const worldSize = this.terrain.size;
    const gridSize = 50;
    const halfSize = worldSize / 2;
    
    for (let gx = 0; gx < worldSize / gridSize; gx++) {
      for (let gz = 0; gz < worldSize / gridSize; gz++) {
        const wx = gx * gridSize - halfSize;
        const wz = gz * gridSize - halfSize;
        
        const height = this.terrain.getHeightAt(wx, wz);
        const roadInfo = this.roadNetwork.getRoadInfoAt(wx, wz);
        
        let biome = 'grassland';
        
        if (height > 80) biome = 'mountain';
        else if (roadInfo && roadInfo.type === 'gravel') biome = 'forest';
        else if (wx < -1000 && wz < -1000) biome = 'canyon';
        else if (Math.sqrt(wx * wx + wz * wz) > 1600) biome = 'coastal';
        else if (height > 40) biome = 'forest';
        
        biomeMap.set(`${gx}_${gz}`, biome);
      }
    }
    
    return biomeMap;
  }
  
  createInstanceMeshes() {
    const typeGroups = new Map();
    
    this.instances.forEach(inst => {
      if (!typeGroups.has(inst.type)) {
        typeGroups.set(inst.type, []);
      }
      typeGroups.get(inst.type).push(inst);
    });
    
    typeGroups.forEach((instances, typeName) => {
      const propType = this.propTypes.find(p => p.name === typeName);
      if (!propType) return;
      
      const count = Math.min(instances.length, this.maxInstancesPerType);
      const geometry = propType.geometry.clone();
      const material = propType.material.clone();
      
      const instanceMesh = new THREE.InstancedMesh(geometry, material, count);
      instanceMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      instanceMesh.castShadow = true;
      instanceMesh.receiveShadow = true;
      instanceMesh.frustumCulled = true;
      
      const matrix = new THREE.Matrix4();
      const color = new THREE.Color();
      
      instances.slice(0, count).forEach((inst, i) => {
        matrix.compose(inst.position, new THREE.Quaternion().setFromEuler(inst.rotation), inst.scale);
        instanceMesh.setMatrixAt(i, matrix);
        
        color.setHSL(0, 0, 0.9 + Math.random() * 0.1);
        instanceMesh.setColorAt(i, color);
      });
      
      instanceMesh.instanceMatrix.needsUpdate = true;
      if (instanceMesh.instanceColor) instanceMesh.instanceColor.needsUpdate = true;
      
      this.instanceMeshes.set(typeName, instanceMesh);
      this.group.add(instanceMesh);
    });
  }
  
  update(dt, vehicle) {
    if (!vehicle) return;
    
    const viewDistance = 300;
    const vehiclePos = vehicle.position;
    
    this.instanceMeshes.forEach((mesh, typeName) => {
      const propType = this.propTypes.find(p => p.name === typeName);
      if (!propType) return;
      
      const instances = this.instances.filter(i => i.type === typeName);
      let visibleCount = 0;
      
      instances.slice(0, this.maxInstancesPerType).forEach((inst, i) => {
        if (!inst.position) return;
        const dist = inst.position.distanceTo(vehiclePos);
        const visible = dist < viewDistance;
        
        if (visible !== (mesh.getMatrixAt(i, new THREE.Matrix4()).elements[15] !== 0)) {
          const matrix = new THREE.Matrix4();
          if (visible) {
            matrix.compose(inst.position, new THREE.Quaternion().setFromEuler(inst.rotation), inst.scale);
          } else {
            matrix.makeTranslation(0, -1000, 0);
          }
          mesh.setMatrixAt(i, matrix);
        }
        
        if (visible) visibleCount++;
      });
      
      mesh.instanceMatrix.needsUpdate = true;
      mesh.count = visibleCount;
    });
  }
  
  onResize() {
    // Nothing needed
  }
  
  dispose() {
    this.instanceMeshes.forEach(mesh => {
      mesh.geometry.dispose();
      mesh.material.dispose();
      mesh.dispose();
    });
    this.instanceMeshes.clear();
    this.group.clear();
  }
}