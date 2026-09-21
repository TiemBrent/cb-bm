import * as THREE from 'three';
import { CurvePath, CatmullRomCurve3, Vector3 } from 'three';

export class RoadNetwork {
  constructor(renderer, terrain, settings) {
    this.renderer = renderer;
    this.terrain = terrain;
    this.settings = settings;
    
    this.group = new THREE.Group();
    this.group.name = 'RoadNetwork';
    
    this.roads = [];
    this.roadMeshes = [];
    this.roadWidth = 6;
    this.shoulderWidth = 1.5;
    this.roadSegments = 50;
    
    this.surfaceTypes = new Map();
    this.roadTree = null;
  }
  
  async init() {
    this.generateRoadNetwork();
    this.createRoadGeometry();
    this.buildSpatialIndex();
  }
  
  generateRoadNetwork() {
    const center = new THREE.Vector3(0, 0, 0);
    const mainRoadLength = 3000;
    const numMainRoads = 4;
    
    for (let i = 0; i < numMainRoads; i++) {
      const angle = (i / numMainRoads) * Math.PI * 2;
      const direction = new THREE.Vector3(Math.cos(angle), 0, Math.sin(angle));
      
      const road = this.createCurvedRoad(center, direction, mainRoadLength, 8 + Math.random() * 4);
      this.roads.push(road);
    }
    
    this.generateBranchingRoads(center, 3, 2);
    
    this.generateMountainRoads();
    this.generateCanyonRoads();
    this.generateCoastalRoads();
  }
  
  createCurvedRoad(start, direction, length, numCurves) {
    const points = [start.clone()];
    let currentPos = start.clone();
    let currentDir = direction.clone();
    const segmentLength = length / numCurves;
    
    for (let i = 0; i < numCurves; i++) {
      const curveStrength = (Math.random() - 0.5) * 0.8;
      const turnAngle = curveStrength * Math.PI * 0.3;
      
      const axis = new THREE.Vector3(0, 1, 0);
      currentDir.applyAxisAngle(axis, turnAngle);
      currentDir.normalize();
      
      const variation = 1.0 + (Math.random() - 0.5) * 0.3;
      currentPos.add(currentDir.clone().multiplyScalar(segmentLength * variation));
      
      const terrainHeight = this.terrain.getHeightAt(currentPos.x, currentPos.z);
      currentPos.y = terrainHeight + 0.5;
      
      points.push(currentPos.clone());
    }
    
    const curve = new CatmullRomCurve3(points, false, 'centripetal', 0.5);
    const sampledPoints = curve.getPoints(this.roadSegments * numCurves);
    
    return {
      points: sampledPoints,
      curve: curve,
      width: this.roadWidth,
      type: 'asphalt',
      isMain: true,
      length: length
    };
  }
  
  generateBranchingRoads(center, numBranches, depth) {
    if (depth <= 0) return;
    
    for (let i = 0; i < numBranches; i++) {
      const mainRoad = this.roads[Math.floor(Math.random() * this.roads.length)];
      if (!mainRoad || mainRoad.points.length < 10) continue;
      
      const startIdx = Math.floor(Math.random() * (mainRoad.points.length - 10)) + 5;
      const startPoint = mainRoad.points[startIdx].clone();
      const nextPoint = mainRoad.points[startIdx + 1].clone();
      const direction = nextPoint.sub(startPoint).normalize();
      
      const perp = new THREE.Vector3(-direction.z, 0, direction.x);
      if (Math.random() < 0.5) perp.negate();
      
      const branchLength = 500 + Math.random() * 1000;
      const branch = this.createCurvedRoad(startPoint, perp, branchLength, 4 + Math.floor(Math.random() * 3));
      branch.type = Math.random() < 0.3 ? 'gravel' : 'asphalt';
      branch.isMain = false;
      this.roads.push(branch);
      
      this.generateBranchingRoads(startPoint, Math.max(1, numBranches - 1), depth - 1);
    }
  }
  
  generateMountainRoads() {
    const mountainCenter = new THREE.Vector3(1500, 0, 1500);
    const numSwitchbacks = 8;
    const radius = 400;
    
    for (let i = 0; i < numSwitchbacks; i++) {
      const angle = (i / numSwitchbacks) * Math.PI * 2;
      const height = (i / numSwitchbacks) * 120;
      
      const points = [];
      for (let j = 0; j <= 20; j++) {
        const a = angle + (j / 20) * Math.PI * 1.5;
        const r = radius * (0.8 + j / 20 * 0.4);
        const x = mountainCenter.x + Math.cos(a) * r;
        const z = mountainCenter.z + Math.sin(a) * r;
        const y = this.terrain.getHeightAt(x, z) + 1 + height * 0.5;
        points.push(new THREE.Vector3(x, y, z));
      }
      
      const curve = new CatmullRomCurve3(points, false, 'centripetal', 0.5);
      const sampledPoints = curve.getPoints(100);
      
      this.roads.push({
        points: sampledPoints,
        curve: curve,
        width: 5,
        type: 'asphalt',
        isMain: false,
        isMountain: true
      });
    }
  }
  
  generateCanyonRoads() {
    const canyonStart = new THREE.Vector3(-2000, 0, -500);
    const canyonEnd = new THREE.Vector3(-500, 0, -2000);
    
    const points = [];
    const numPoints = 15;
    
    for (let i = 0; i <= numPoints; i++) {
      const t = i / numPoints;
      const x = THREE.MathUtils.lerp(canyonStart.x, canyonEnd.x, t) + (Math.random() - 0.5) * 100;
      const z = THREE.MathUtils.lerp(canyonStart.z, canyonEnd.z, t) + (Math.random() - 0.5) * 100;
      const y = this.terrain.getHeightAt(x, z) + 2;
      points.push(new THREE.Vector3(x, y, z));
    }
    
    const curve = new CatmullRomCurve3(points, false, 'centripetal', 0.5);
    const sampledPoints = curve.getPoints(200);
    
    this.roads.push({
      points: sampledPoints,
      curve: curve,
      width: 5.5,
      type: 'asphalt',
      isMain: true,
      isCanyon: true
    });
  }
  
  generateCoastalRoads() {
    const coastPoints = [];
    const numPoints = 20;
    
    for (let i = 0; i <= numPoints; i++) {
      const t = i / numPoints;
      const angle = t * Math.PI * 1.2 - Math.PI * 0.1;
      const radius = 1800 + Math.sin(t * Math.PI * 4) * 200;
      const x = Math.cos(angle) * radius;
      const z = Math.sin(angle) * radius;
      const y = this.terrain.getHeightAt(x, z) + 3;
      coastPoints.push(new THREE.Vector3(x, y, z));
    }
    
    const curve = new CatmullRomCurve3(coastPoints, false, 'centripetal', 0.5);
    const sampledPoints = curve.getPoints(300);
    
    this.roads.push({
      points: sampledPoints,
      curve: curve,
      width: 6.5,
      type: 'asphalt',
      isMain: true,
      isCoastal: true
    });
  }
  
  createRoadGeometry() {
    const roadMaterial = this.renderer.pbrMaterials.createMaterial({
      name: 'road_asphalt',
      baseColor: new THREE.Color(0.15, 0.15, 0.16),
      metallic: 0.05,
      roughness: 0.85,
      ao: 1.0,
      clearcoat: 0.1,
      clearcoatRoughness: 0.3
    });
    
    const gravelMaterial = this.renderer.pbrMaterials.createMaterial({
      name: 'road_gravel',
      baseColor: new THREE.Color(0.35, 0.33, 0.3),
      metallic: 0.0,
      roughness: 0.95,
      ao: 0.9
    });
    
    const markingMaterial = this.renderer.pbrMaterials.createMaterial({
      name: 'road_marking',
      baseColor: new THREE.Color(0.95, 0.95, 0.85),
      metallic: 0.0,
      roughness: 0.3,
      ao: 1.0,
      emissive: new THREE.Color(0.1, 0.1, 0.05),
      emissiveIntensity: 0.5
    });
    
    this.roads.forEach((road, roadIndex) => {
      const roadGroup = new THREE.Group();
      roadGroup.name = `Road_${roadIndex}`;
      
      const material = road.type === 'gravel' ? gravelMaterial : roadMaterial;
      
      const positions = [];
      const normals = [];
      const uvs = [];
      const indices = [];
      
      const totalWidth = road.width + this.shoulderWidth * 2;
      const halfWidth = totalWidth / 2;
      const roadHalfWidth = road.width / 2;
      
      for (let i = 0; i < road.points.length; i++) {
        const point = road.points[i];
        const nextPoint = road.points[(i + 1) % road.points.length];
        const prevPoint = road.points[(i - 1 + road.points.length) % road.points.length];
        
        const forward = nextPoint.clone().sub(prevPoint).normalize();
        const up = new THREE.Vector3(0, 1, 0);
        const right = new THREE.Vector3().crossVectors(up, forward).normalize();
        
        const terrainNormal = this.terrain.getNormalAt(point.x, point.z);
        const roadNormal = terrainNormal.clone().normalize();
        
        const rightCorrected = new THREE.Vector3().crossVectors(roadNormal, forward).normalize();
        const finalRight = rightCorrected;
        
        const vCount = positions.length / 3;
        
        // Left shoulder
        positions.push(
          point.x - finalRight.x * halfWidth,
          point.y + 0.02,
          point.z - finalRight.z * halfWidth
        );
        normals.push(0, 1, 0);
        uvs.push(0, i / road.points.length);
        
        // Left road edge
        positions.push(
          point.x - finalRight.x * roadHalfWidth,
          point.y + 0.03,
          point.z - finalRight.z * roadHalfWidth
        );
        normals.push(0, 1, 0);
        uvs.push(0.2, i / road.points.length);
        
        // Right road edge
        positions.push(
          point.x + finalRight.x * roadHalfWidth,
          point.y + 0.03,
          point.z + finalRight.z * roadHalfWidth
        );
        normals.push(0, 1, 0);
        uvs.push(0.8, i / road.points.length);
        
        // Right shoulder
        positions.push(
          point.x + finalRight.x * halfWidth,
          point.y + 0.02,
          point.z + finalRight.z * halfWidth
        );
        normals.push(0, 1, 0);
        uvs.push(1, i / road.points.length);
        
        if (i > 0) {
          const base = (i - 1) * 4;
          indices.push(base, base + 4, base + 1);
          indices.push(base + 1, base + 4, base + 5);
          indices.push(base + 1, base + 5, base + 2);
          indices.push(base + 2, base + 5, base + 6);
          indices.push(base + 2, base + 6, base + 3);
          indices.push(base + 3, base + 6, base + 7);
        }
      }
      
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
      geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
      geometry.setIndex(indices);
      geometry.computeVertexNormals();
      geometry.computeTangents();
      
      const roadMesh = new THREE.Mesh(geometry, material);
      roadMesh.receiveShadow = true;
      roadMesh.castShadow = true;
      roadGroup.add(roadMesh);
      this.roadMeshes.push(roadMesh);
      
      this.addRoadMarkings(roadGroup, road, roadIndex);
      this.addGuardrails(roadGroup, road);
      
      this.group.add(roadGroup);
    });
  }
  
  addRoadMarkings(roadGroup, road, roadIndex) {
    const markingMaterial = this.renderer.pbrMaterials.getMaterial('road_marking');
    
    if (!road.isMain) return;
    
    const positions = [];
    const uvs = [];
    const indices = [];
    const markingWidth = 0.15;
    const dashLength = 4;
    const gapLength = 6;
    
    for (let i = 1; i < road.points.length - 1; i++) {
      const point = road.points[i];
      const nextPoint = road.points[i + 1];
      const prevPoint = road.points[i - 1];
      
      const forward = nextPoint.clone().sub(prevPoint).normalize();
      const up = new THREE.Vector3(0, 1, 0);
      const right = new THREE.Vector3().crossVectors(up, forward).normalize();
      
      const terrainNormal = this.terrain.getNormalAt(point.x, point.z);
      const rightCorrected = new THREE.Vector3().crossVectors(terrainNormal, forward).normalize();
      
      const distFromStart = i;
      const dashCycle = dashLength + gapLength;
      const inDash = (distFromStart % dashCycle) < dashLength;
      
      if (inDash && roadIndex % 2 === 0) {
        const vCount = positions.length / 3;
        
        positions.push(
          point.x - rightCorrected.x * markingWidth,
          point.y + 0.04,
          point.z - rightCorrected.z * markingWidth
        );
        uvs.push(0, 0);
        
        positions.push(
          point.x + rightCorrected.x * markingWidth,
          point.y + 0.04,
          point.z + rightCorrected.z * markingWidth
        );
        uvs.push(1, 0);
        
        if (i > 1) {
          indices.push(vCount - 2, vCount, vCount - 1);
          indices.push(vCount - 1, vCount, vCount + 1);
        }
      }
    }
    
    if (positions.length > 0) {
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
      geometry.setIndex(indices);
      geometry.computeVertexNormals();
      
      const markingMesh = new THREE.Mesh(geometry, markingMaterial);
      markingMesh.renderOrder = 1;
      roadGroup.add(markingMesh);
    }
  }
  
  addGuardrails(roadGroup, road) {
    if (!road.isMountain && !road.isCanyon) return;
    
    const railMaterial = this.renderer.pbrMaterials.createMaterial({
      name: 'guardrail',
      baseColor: new THREE.Color(0.3, 0.3, 0.35),
      metallic: 0.8,
      roughness: 0.4
    });
    
    const postGeometry = new THREE.BoxGeometry(0.15, 0.8, 0.15);
    const railGeometry = new THREE.BoxGeometry(0.1, 0.15, 10);
    
    for (let i = 0; i < road.points.length; i += 5) {
      const point = road.points[i];
      const nextPoint = road.points[Math.min(i + 1, road.points.length - 1)];
      const prevPoint = road.points[Math.max(i - 1, 0)];
      
      const forward = nextPoint.clone().sub(prevPoint).normalize();
      const up = new THREE.Vector3(0, 1, 0);
      const right = new THREE.Vector3().crossVectors(up, forward).normalize();
      
      const terrainNormal = this.terrain.getNormalAt(point.x, point.z);
      const rightCorrected = new THREE.Vector3().crossVectors(terrainNormal, forward).normalize();
      
      const roadHalfWidth = road.width / 2;
      const railOffset = roadHalfWidth + 0.5;
      
      for (let side = -1; side <= 1; side += 2) {
        const railX = point.x + rightCorrected.x * railOffset * side;
        const railZ = point.z + rightCorrected.z * railOffset * side;
        const railY = point.y + 0.4;
        
        const post = new THREE.Mesh(postGeometry, railMaterial);
        post.position.set(railX, railY, railZ);
        post.rotation.y = Math.atan2(forward.x, forward.z);
        post.castShadow = true;
        post.receiveShadow = true;
        roadGroup.add(post);
      }
    }
  }
  
  buildSpatialIndex() {
    this.surfaceTypes.clear();
    
    this.roads.forEach((road, roadIndex) => {
      for (let i = 0; i < road.points.length; i += 10) {
        const point = road.points[i];
        const key = `${Math.floor(point.x / 50)}_${Math.floor(point.z / 50)}`;
        if (!this.surfaceTypes.has(key)) {
          this.surfaceTypes.set(key, []);
        }
        this.surfaceTypes.get(key).push({
          roadIndex,
          point: point.clone(),
          type: road.type,
          width: road.width
        });
      }
    });
  }
  
  getSurfaceTypeAt(x, z) {
    const key = `${Math.floor(x / 50)}_${Math.floor(z / 50)}`;
    const roads = this.surfaceTypes.get(key);
    
    if (roads) {
      let minDist = Infinity;
      let closestType = 'grass';
      
      roads.forEach(r => {
        const dist = Math.sqrt((r.point.x - x) ** 2 + (r.point.z - z) ** 2);
        if (dist < r.width / 2 + 2 && dist < minDist) {
          minDist = dist;
          closestType = r.type;
        }
      });
      
      return closestType;
    }
    
    return 'grass';
  }
  
  getRoadInfoAt(x, z) {
    const key = `${Math.floor(x / 50)}_${Math.floor(z / 50)}`;
    const roads = this.surfaceTypes.get(key);
    
    if (roads) {
      let minDist = Infinity;
      let closestRoad = null;
      
      roads.forEach(r => {
        const dist = Math.sqrt((r.point.x - x) ** 2 + (r.point.z - z) ** 2);
        if (dist < r.width / 2 + 3 && dist < minDist) {
          minDist = dist;
          closestRoad = r;
        }
      });
      
      if (closestRoad) {
        return {
          type: closestRoad.type,
          width: closestRoad.width,
          distance: minDist
        };
      }
    }
    
    return null;
  }
  
  findNearestRoadPoint(position, maxDistance = 50) {
    let nearestPoint = null;
    let nearestDist = maxDistance;
    let nearestRoad = null;
    
    this.roads.forEach(road => {
      for (let i = 0; i < road.points.length; i += 5) {
        const point = road.points[i];
        const dist = position.distanceTo(point);
        if (dist < nearestDist) {
          nearestDist = dist;
          nearestPoint = point.clone();
          nearestRoad = road;
        }
      }
    });
    
    return { point: nearestPoint, distance: nearestDist, road: nearestRoad };
  }
  
  update(dt, vehicle) {
    // Static for now
  }
  
  onResize() {
    // Nothing needed
  }
  
  dispose() {
    this.roadMeshes.forEach(mesh => {
      mesh.geometry.dispose();
      if (mesh.material) mesh.material.dispose();
    });
    this.group.clear();
  }
}