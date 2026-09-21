import * as THREE from 'three';

export class CascadedShadowManager {
  constructor(renderer, settings) {
    this.renderer = renderer;
    this.settings = settings;
    this.enabled = settings.graphics.shadows;
    
    this.cascadeCount = settings.graphics.shadowCascades;
    this.shadowMapSize = settings.graphics.shadowMapSize;
    
    this.cascades = [];
    this.cascadeSplits = [0, 0, 0, 0];
    this.cascadeMatrices = [];
    this.lightCamera = null;
    this.lightDirection = new THREE.Vector3(0.3, -0.8, 0.4).normalize();
    this.lightColor = new THREE.Color(1.0, 0.9, 0.7);
    this.lightIntensity = 3.0;
    
    this.shadowCamera = null;
    this.shadowMaterial = null;
    this.shadowScene = null;
    this.shadowRenderTargets = [];
    this.depthMaterials = [];
    
    this.frustumCorners = new Array(8).fill(null).map(() => new THREE.Vector3());
    this.frustumCenter = new THREE.Vector3();
    this.lightViewMatrix = new THREE.Matrix4();
    this.lightProjectionMatrix = new THREE.Matrix4();
    this.lightViewProjectionMatrix = new THREE.Matrix4();
    
    this.splitLambda = 0.92;
    this.fadeDistance = 200;
    this.maxShadowDistance = 400;
  }
  
  async init() {
    this.createShadowCameras();
    this.createShadowRenderTargets();
    this.createDepthMaterials();
  }
  
  createShadowCameras() {
    this.lightCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, this.maxShadowDistance);
    this.lightCamera.position.copy(this.lightDirection).multiplyScalar(-100);
    this.lightCamera.lookAt(0, 0, 0);
    this.lightCamera.up.set(0, 1, 0);
    
    this.shadowCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, this.maxShadowDistance);
  }
  
  createShadowRenderTargets() {
    for (let i = 0; i < this.cascadeCount; i++) {
      const depthTexture = new THREE.DepthTexture();
      depthTexture.name = `ShadowMap_Cascade${i}_Depth`;
      depthTexture.type = THREE.UnsignedIntType;
      depthTexture.minFilter = THREE.NearestFilter;
      depthTexture.magFilter = THREE.NearestFilter;
      
      const rt = new THREE.WebGLRenderTarget(this.shadowMapSize, this.shadowMapSize, {
        minFilter: THREE.NearestFilter,
        magFilter: THREE.NearestFilter,
        depthBuffer: true,
        depthTexture: depthTexture,
        stencilBuffer: false
      });
      rt.texture.name = `ShadowMap_Cascade${i}`;
      this.shadowRenderTargets.push(rt);
      
      this.cascadeMatrices.push(new THREE.Matrix4());
    }
  }
  
  createDepthMaterials() {
    for (let i = 0; i < this.cascadeCount; i++) {
      const material = new THREE.ShaderMaterial({
        uniforms: {
          cascadeIndex: { value: i },
          cascadeSplits: { value: this.cascadeSplits },
          cameraNear: { value: this.renderer.camera.near },
          cameraFar: { value: this.renderer.camera.far },
          lightViewProjectionMatrix: { value: this.lightViewProjectionMatrix }
        },
        vertexShader: `
          uniform int cascadeIndex;
          uniform float cascadeSplits[4];
          uniform float cameraNear;
          uniform float cameraFar;
          uniform mat4 lightViewProjectionMatrix;
          varying vec4 vShadowCoord;
          varying float vCascadeSplit;
          
          void main() {
            vec4 worldPos = modelMatrix * vec4(position, 1.0);
            vShadowCoord = lightViewProjectionMatrix * worldPos;
            vCascadeSplit = cascadeSplits[cascadeIndex];
            gl_Position = projectionMatrix * viewMatrix * worldPos;
          }
        `,
        fragmentShader: `
          varying vec4 vShadowCoord;
          varying float vCascadeSplit;
          void main() {
            gl_FragColor = vec4(0.0);
          }
        `,
        depthTest: true,
        depthWrite: true
      });
      this.depthMaterials.push(material);
    }
  }
  
  calculateCascadeSplits(camera) {
    const near = camera.near;
    const far = Math.min(camera.far, this.maxShadowDistance);
    const range = far - near;
    const ratio = far / near;
    
    for (let i = 0; i < this.cascadeCount; i++) {
      const p = (i + 1) / this.cascadeCount;
      const log = near * Math.pow(ratio, p);
      const uniform = near + range * p;
      this.cascadeSplits[i] = THREE.MathUtils.lerp(uniform, log, this.splitLambda);
    }
  }
  
  updateFrustumCorners(camera, splitIndex) {
    const splits = this.cascadeSplits;
    const near = splitIndex === 0 ? camera.near : splits[splitIndex - 1];
    const far = splits[splitIndex];
    
    const corners = this.frustumCorners;
    const projMatrix = camera.projectionMatrix;
    
    const invProj = new THREE.Matrix4().copy(projMatrix).invert();
    
    const frustumCornersNDC = [
      new THREE.Vector3(-1, -1, -1), new THREE.Vector3(1, -1, -1),
      new THREE.Vector3(1, 1, -1), new THREE.Vector3(-1, 1, -1),
      new THREE.Vector3(-1, -1, 1), new THREE.Vector3(1, -1, 1),
      new THREE.Vector3(1, 1, 1), new THREE.Vector3(-1, 1, 1)
    ];
    
    for (let i = 0; i < 8; i++) {
      const corner = frustumCornersNDC[i];
      const z = (i < 4) ? -1 : 1;
      
      const ndc = new THREE.Vector3(corner.x, corner.y, z);
      const viewPos = ndc.applyMatrix4(invProj);
      
      const worldPos = viewPos.applyMatrix4(camera.matrixWorld);
      
      if (i < 4) {
        worldPos.lerp(camera.position, (near - camera.near) / (camera.far - camera.near));
      } else {
        worldPos.lerp(camera.position, (far - camera.near) / (camera.far - camera.near));
      }
      
      corners[i].copy(worldPos);
    }
  }
  
  computeShadowMatrices(camera, cascadeIndex) {
    this.updateFrustumCorners(camera, cascadeIndex);
    
    this.frustumCenter.set(0, 0, 0);
    for (let i = 0; i < 8; i++) {
      this.frustumCenter.add(this.frustumCorners[i]);
    }
    this.frustumCenter.divideScalar(8);
    
    const lightDir = this.lightDirection.clone().normalize();
    const up = new THREE.Vector3(0, 1, 0);
    
    if (Math.abs(lightDir.dot(up)) > 0.99) {
      up.set(0, 0, 1);
    }
    
    this.lightViewMatrix.lookAt(
      this.frustumCenter,
      this.frustumCenter.clone().add(lightDir),
      up
    );
    
    let minX = Infinity, maxX = -Infinity;
    let minY = Infinity, maxY = -Infinity;
    let minZ = Infinity, maxZ = -Infinity;
    
    for (let i = 0; i < 8; i++) {
      const corner = this.frustumCorners[i].clone().applyMatrix4(this.lightViewMatrix);
      minX = Math.min(minX, corner.x);
      maxX = Math.max(maxX, corner.x);
      minY = Math.min(minY, corner.y);
      maxY = Math.max(maxY, corner.y);
      minZ = Math.min(minZ, corner.z);
      maxZ = Math.max(maxZ, corner.z);
    }
    
    const cascadeScale = [0.15, 0.35, 0.7, 1.0][cascadeIndex] || 1.0;
    const padding = 10 * cascadeScale;
    
    minX -= padding; maxX += padding;
    minY -= padding; maxY += padding;
    minZ -= padding; maxZ += padding;
    
    this.lightProjectionMatrix.makeOrthographic(
      minX, maxX, maxY, minY, minZ, maxZ
    );
    
    this.lightViewProjectionMatrix.multiplyMatrices(this.lightProjectionMatrix, this.lightViewMatrix);
    this.cascadeMatrices[cascadeIndex].copy(this.lightViewProjectionMatrix);
    
    this.shadowCamera.left = minX;
    this.shadowCamera.right = maxX;
    this.shadowCamera.top = maxY;
    this.shadowCamera.bottom = minY;
    this.shadowCamera.near = minZ;
    this.shadowCamera.far = maxZ;
    this.shadowCamera.updateProjectionMatrix();
    
    this.shadowCamera.matrixWorldInverse.copy(this.lightViewMatrix);
    this.shadowCamera.matrixWorld.copy(this.lightViewMatrix).invert();
  }
  
  render(scene, camera, vehicle) {
    if (!this.enabled) return;
    
    this.calculateCascadeSplits(camera);
    
    const currentAutoUpdate = this.renderer.renderer.shadowMap.autoUpdate;
    this.renderer.renderer.shadowMap.autoUpdate = false;
    
    const currentRenderTarget = this.renderer.renderer.getRenderTarget();
    
    for (let i = 0; i < this.cascadeCount; i++) {
      this.computeShadowMatrices(camera, i);
      
      this.renderer.renderer.setRenderTarget(this.shadowRenderTargets[i]);
      this.renderer.renderer.clear();
      
      scene.overrideMaterial = this.depthMaterials[i];
      this.depthMaterials[i].uniforms.cascadeIndex.value = i;
      this.depthMaterials[i].uniforms.cascadeSplits.value = this.cascadeSplits;
      this.depthMaterials[i].uniforms.cameraNear.value = camera.near;
      this.depthMaterials[i].uniforms.cameraFar.value = camera.far;
      this.depthMaterials[i].uniforms.lightViewProjectionMatrix.value.copy(this.lightViewProjectionMatrix);
      
      this.renderer.renderer.render(scene, this.shadowCamera);
      
      scene.overrideMaterial = null;
    }
    
    this.renderer.renderer.setRenderTarget(currentRenderTarget);
    this.renderer.renderer.shadowMap.autoUpdate = currentAutoUpdate;
  }
  
  getShadowData() {
    return {
      cascadeCount: this.cascadeCount,
      cascadeSplits: this.cascadeSplits,
      cascadeMatrices: this.cascadeMatrices,
      shadowMaps: this.shadowRenderTargets.map(rt => rt.depthTexture),
      lightDirection: this.lightDirection,
      lightColor: this.lightColor,
      lightIntensity: this.lightIntensity,
      fadeDistance: this.fadeDistance,
      maxShadowDistance: this.maxShadowDistance
    };
  }
  
  updateLight(direction, color, intensity) {
    if (direction) this.lightDirection.copy(direction).normalize();
    if (color) this.lightColor.copy(color);
    if (intensity !== undefined) this.lightIntensity = intensity;
  }
  
  onResize() {
    // Shadow maps don't need to resize with screen
  }
  
  setCascadeCount(count) {
    this.cascadeCount = Math.max(1, Math.min(4, count));
  }
  
  setShadowMapSize(size) {
    this.shadowMapSize = size;
    this.shadowRenderTargets.forEach(rt => rt.dispose());
    this.shadowRenderTargets = [];
    this.createShadowRenderTargets();
  }
  
  dispose() {
    this.shadowRenderTargets.forEach(rt => rt.dispose());
    this.shadowRenderTargets = [];
    this.depthMaterials.forEach(m => m.dispose());
    this.depthMaterials = [];
  }
}