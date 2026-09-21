import * as THREE from 'three';
import { PMREMGenerator } from 'three/src/extras/PMREMGenerator.js';
import { PBRVertexShader, PBRFragmentShader } from '../shaders/PBRShaders.js';

export class PBRMaterialManager {
  constructor(renderer) {
    this.renderer = renderer;
    this.pmremGenerator = null;
    this.envMap = null;
    this.irradianceMap = null;
    this.prefilterMap = null;
    this.brdfLUT = null;
    this.lodMax = 8;
    this.materials = new Map();
    this.defaultMaterial = null;
    this.carPaintMaterial = null;
  }
  
  async init() {
    this.pmremGenerator = new PMREMGenerator(this.renderer.renderer);
    this.pmremGenerator.compileEquirectangularShader();
    
    await this.createDefaultEnvironment();
    await this.createBRDFLUT();
    this.createDefaultMaterials();
  }
  
  async createDefaultEnvironment() {
    const envScene = new THREE.Scene();
    
    const skyGeometry = new THREE.SphereGeometry(1000, 32, 16);
    const skyMaterial = new THREE.ShaderMaterial({
      uniforms: {
        sunDirection: { value: new THREE.Vector3(0.3, 0.8, 0.4).normalize() },
        turbidity: { value: 2.0 },
        rayleigh: { value: 1.0 },
        mieCoefficient: { value: 0.005 },
        mieDirectionalG: { value: 0.8 },
        luminance: { value: 1.0 },
        sunSize: { value: 0.04 }
      },
      vertexShader: `
        varying vec3 vWorldPosition;
        void main() {
          vec4 worldPosition = modelMatrix * vec4(position, 1.0);
          vWorldPosition = worldPosition.xyz;
          gl_Position = projectionMatrix * viewMatrix * worldPosition;
        }
      `,
      fragmentShader: `
        uniform vec3 sunDirection;
        uniform float turbidity;
        uniform float rayleigh;
        uniform float mieCoefficient;
        uniform float mieDirectionalG;
        uniform float luminance;
        uniform float sunSize;
        varying vec3 vWorldPosition;
        
        const vec3 up = vec3(0.0, 1.0, 0.0);
        const float e = 2.71828182845904523536028747135266249775724709369995957;
        const float pi = 3.141592653589793238462643383279502884197169;
        
        float rayleighPhase(float cosTheta) {
          return 3.0 / (16.0 * pi) * (1.0 + cosTheta * cosTheta);
        }
        
        float hgPhase(float cosTheta, float g) {
          float g2 = g * g;
          float denom = 1.0 + g2 - 2.0 * g * cosTheta;
          return 1.0 / (4.0 * pi) * (1.0 - g2) / (denom * sqrt(denom));
        }
        
        void main() {
          vec3 viewDir = normalize(vWorldPosition);
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
          
          gl_FragColor = vec4(skyColor, 1.0);
        }
      `,
      side: THREE.BackSide,
      depthWrite: false
    });
    
    const skyMesh = new THREE.Mesh(skyGeometry, skyMaterial);
    envScene.add(skyMesh);
    
    const pmrem = this.pmremGenerator.fromScene(envScene, 0.04);
    this.envMap = pmrem.texture;
    this.envMap.mapping = THREE.EquirectangularReflectionMapping;
    this.envMap.name = 'EnvMap';
    
    pmrem.dispose();
    
    const irradiancePmrem = this.pmremGenerator.fromScene(envScene, 0.01);
    this.irradianceMap = irradiancePmrem.texture;
    this.irradianceMap.mapping = THREE.EquirectangularReflectionMapping;
    this.irradianceMap.name = 'IrradianceMap';
    irradiancePmrem.dispose();
    
    const prefilterPmrem = this.pmremGenerator.fromScene(envScene, 0.1);
    this.prefilterMap = prefilterPmrem.texture;
    this.prefilterMap.mapping = THREE.EquirectangularReflectionMapping;
    this.prefilterMap.name = 'PrefilterMap';
    this.prefilterMap.minFilter = THREE.LinearMipmapLinearFilter;
    this.prefilterMap.magFilter = THREE.LinearFilter;
    this.prefilterMap.generateMipmaps = true;
    prefilterPmrem.dispose();
    
    envScene.clear();
  }
  
  async createBRDFLUT() {
    const size = 512;
    const renderTarget = new THREE.WebGLRenderTarget(size, size, {
      type: THREE.HalfFloatType,
      format: THREE.RGFormat,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      depthBuffer: false
    });
    
    const brdfShader = {
      uniforms: {},
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        varying vec2 vUv;
        void main() {
          float NdotV = vUv.x;
          float roughness = vUv.y;
          
          vec3 V = vec3(sqrt(1.0 - NdotV * NdotV), 0.0, NdotV);
          float A = 0.0;
          float B = 0.0;
          
          const uint SAMPLE_COUNT = 1024u;
          for (uint i = 0u; i < SAMPLE_COUNT; i++) {
            float xi1 = float(i) / float(SAMPLE_COUNT);
            float xi2 = vUv.y;
            
            float phi = 2.0 * 3.14159265359 * xi1;
            float cosTheta = sqrt((1.0 - xi2) / (1.0 + (roughness * roughness - 1.0) * xi2));
            float sinTheta = sqrt(1.0 - cosTheta * cosTheta);
            vec3 H = vec3(sinTheta * cos(phi), sinTheta * sin(phi), cosTheta);
            vec3 L = 2.0 * dot(V, H) * H - V;
            
            float NdotL = max(L.z, 0.0);
            float NdotH = max(H.z, 0.0);
            float VdotH = max(dot(V, H), 0.0);
            
            if (NdotL > 0.0) {
              float D = NdotH * NdotH * (roughness * roughness - 1.0) + 1.0;
              D = (roughness * roughness) / (3.14159265359 * D * D);
              
              float VdotH2 = VdotH * VdotH;
              float VdotH4 = VdotH2 * VdotH2;
              float G = 2.0 * NdotH * NdotV / VdotH;
              G = min(1.0, G);
              G = G * G;
              
              float G_Vis = G * VdotH / (NdotV * NdotH);
              float Fc = pow(1.0 - VdotH, 5.0);
              
              A += (1.0 - Fc) * G_Vis;
              B += Fc * G_Vis;
            }
          }
          
          A /= float(SAMPLE_COUNT);
          B /= float(SAMPLE_COUNT);
          
          gl_FragColor = vec4(A, B, 0.0, 1.0);
        }
      `
    };
    
    const brdfMaterial = new THREE.ShaderMaterial(brdfShader);
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), brdfMaterial);
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const scene = new THREE.Scene();
    scene.add(quad);
    
    this.renderer.renderer.setRenderTarget(renderTarget);
    this.renderer.renderer.clear();
    this.renderer.renderer.render(scene, camera);
    this.renderer.renderer.setRenderTarget(null);
    
    this.brdfLUT = renderTarget.texture;
    this.brdfLUT.name = 'BRDFLUT';
    this.brdfLUT.wrapS = THREE.ClampToEdgeWrapping;
    this.brdfLUT.wrapT = THREE.ClampToEdgeWrapping;
    
    renderTarget.dispose();
    brdfMaterial.dispose();
    quad.geometry.dispose();
  }
  
  createDefaultMaterials() {
    this.defaultMaterial = new THREE.ShaderMaterial({
      vertexShader: PBRVertexShader,
      fragmentShader: PBRFragmentShader,
      uniforms: this.getCommonUniforms({
        baseColor: new THREE.Color(0.5, 0.5, 0.5),
        metallic: 0.0,
        roughness: 0.5,
        ao: 1.0,
        clearcoat: 0.0,
        clearcoatRoughness: 0.0,
        clearcoatNormalScale: 1.0,
        emissive: new THREE.Color(0, 0, 0),
        emissiveIntensity: 1.0,
        alphaCutoff: 0.0,
        hasBaseColorMap: false,
        hasMetalRoughMap: false,
        hasNormalMap: false,
        hasAoMap: false,
        hasEmissiveMap: false,
        hasClearcoatMap: false,
        hasClearcoatRoughnessMap: false,
        hasClearcoatNormalMap: false
      }),
      defines: {
        USE_TANGENT: '',
        USE_FOG_LINEAR: ''
      }
    });
    
    this.carPaintMaterial = new THREE.ShaderMaterial({
      vertexShader: PBRVertexShader,
      fragmentShader: PBRFragmentShader,
      uniforms: this.getCommonUniforms({
        baseColor: new THREE.Color(0.8, 0.1, 0.1),
        metallic: 0.95,
        roughness: 0.2,
        ao: 1.0,
        clearcoat: 1.0,
        clearcoatRoughness: 0.1,
        clearcoatNormalScale: 1.0,
        emissive: new THREE.Color(0, 0, 0),
        emissiveIntensity: 1.0,
        alphaCutoff: 0.0,
        hasBaseColorMap: false,
        hasMetalRoughMap: false,
        hasNormalMap: false,
        hasAoMap: false,
        hasEmissiveMap: false,
        hasClearcoatMap: false,
        hasClearcoatRoughnessMap: false,
        hasClearcoatNormalMap: false
      }),
      defines: {
        USE_TANGENT: '',
        USE_FOG_LINEAR: ''
      }
    });
    
    this.materials.set('default', this.defaultMaterial);
    this.materials.set('carPaint', this.carPaintMaterial);
  }
  
  getCommonUniforms(params) {
    return {
      cameraPosition: { value: new THREE.Vector3() },
      time: { value: 0 },
      baseColor: { value: params.baseColor },
      metallic: { value: params.metallic },
      roughness: { value: params.roughness },
      ao: { value: params.ao },
      clearcoat: { value: params.clearcoat },
      clearcoatRoughness: { value: params.clearcoatRoughness },
      clearcoatNormalScale: { value: params.clearcoatNormalScale },
      emissive: { value: params.emissive },
      emissiveIntensity: { value: params.emissiveIntensity },
      alphaCutoff: { value: params.alphaCutoff },
      hasBaseColorMap: { value: params.hasBaseColorMap },
      hasMetalRoughMap: { value: params.hasMetalRoughMap },
      hasNormalMap: { value: params.hasNormalMap },
      hasAoMap: { value: params.hasAoMap },
      hasEmissiveMap: { value: params.hasEmissiveMap },
      hasClearcoatMap: { value: params.hasClearcoatMap },
      hasClearcoatRoughnessMap: { value: params.hasClearcoatRoughnessMap },
      hasClearcoatNormalMap: { value: params.hasClearcoatNormalMap },
      baseColorMap: { value: null },
      metalRoughMap: { value: null },
      normalMap: { value: null },
      aoMap: { value: null },
      emissiveMap: { value: null },
      clearcoatMap: { value: null },
      clearcoatRoughnessMap: { value: null },
      clearcoatNormalMap: { value: null },
      irradianceMap: { value: this.irradianceMap },
      prefilterMap: { value: this.prefilterMap },
      brdfLUT: { value: this.brdfLUT },
      lodMax: { value: this.lodMax },
      sunDirection: { value: new THREE.Vector3(0.3, 0.8, 0.4).normalize() },
      sunColor: { value: new THREE.Color(1.0, 0.9, 0.7) },
      sunIntensity: { value: 1.0 },
      ambientColor: { value: new THREE.Color(0.02, 0.03, 0.05) },
      ambientIntensity: { value: 0.5 },
      fogColor: { value: new THREE.Color(0.5, 0.6, 0.7) },
      fogNear: { value: 100 },
      fogFar: { value: 800 },
      fogDensity: { value: 0.001 }
    };
  }
  
  getMaterial(name) {
    return this.materials.get(name) || this.defaultMaterial;
  }
  
  createMaterial(params) {
    const material = new THREE.ShaderMaterial({
      vertexShader: PBRVertexShader,
      fragmentShader: PBRFragmentShader,
      uniforms: this.getCommonUniforms(params),
      defines: {
        USE_TANGENT: params.hasNormalMap ? '' : undefined,
        USE_FOG_LINEAR: ''
      }
    });
    
    if (params.name) {
      this.materials.set(params.name, material);
    }
    
    return material;
  }
  
  createCarPaintMaterial(baseColor, metallic = 0.95, roughness = 0.2) {
    return new THREE.ShaderMaterial({
      vertexShader: PBRVertexShader,
      fragmentShader: PBRFragmentShader,
      uniforms: this.getCommonUniforms({
        baseColor: new THREE.Color(baseColor),
        metallic: metallic,
        roughness: roughness,
        ao: 1.0,
        clearcoat: 1.0,
        clearcoatRoughness: 0.1,
        clearcoatNormalScale: 1.0,
        emissive: new THREE.Color(0, 0, 0),
        emissiveIntensity: 1.0,
        alphaCutoff: 0.0,
        hasBaseColorMap: false,
        hasMetalRoughMap: false,
        hasNormalMap: false,
        hasAoMap: false,
        hasEmissiveMap: false,
        hasClearcoatMap: false,
        hasClearcoatRoughnessMap: false,
        hasClearcoatNormalMap: false
      }),
      defines: {
        USE_TANGENT: '',
        USE_FOG_LINEAR: ''
      }
    });
  }
  
  updateCameraPosition(camera) {
    this.materials.forEach(mat => {
      if (mat.uniforms.cameraPosition) {
        mat.uniforms.cameraPosition.value.copy(camera.position);
      }
    });
  }
  
  updateTime(time) {
    this.materials.forEach(mat => {
      if (mat.uniforms.time) {
        mat.uniforms.time.value = time;
      }
    });
  }
  
  updateSun(sunDirection, sunColor, sunIntensity) {
    this.materials.forEach(mat => {
      if (mat.uniforms.sunDirection) {
        mat.uniforms.sunDirection.value.copy(sunDirection);
        mat.uniforms.sunColor.value.copy(sunColor);
        mat.uniforms.sunIntensity.value = sunIntensity;
      }
    });
  }
  
  updateAmbient(ambientColor, ambientIntensity) {
    this.materials.forEach(mat => {
      if (mat.uniforms.ambientColor) {
        mat.uniforms.ambientColor.value.copy(ambientColor);
        mat.uniforms.ambientIntensity.value = ambientIntensity;
      }
    });
  }
  
  updateFog(fogColor, fogNear, fogFar, fogDensity) {
    this.materials.forEach(mat => {
      if (mat.uniforms.fogColor) {
        mat.uniforms.fogColor.value.copy(fogColor);
        mat.uniforms.fogNear.value = fogNear;
        mat.uniforms.fogFar.value = fogFar;
        mat.uniforms.fogDensity.value = fogDensity;
      }
    });
  }
  
  dispose() {
    this.materials.forEach(mat => mat.dispose());
    this.materials.clear();
    this.pmremGenerator?.dispose();
    this.envMap?.dispose();
    this.irradianceMap?.dispose();
    this.prefilterMap?.dispose();
    this.brdfLUT?.dispose();
  }
}