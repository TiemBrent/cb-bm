import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { TAAManager } from './TAAManager.js';
import { BloomPass } from './BloomPass.js';
import { DOFPass } from './DOFPass.js';
import { MotionBlurPass } from './MotionBlurPass.js';
import { SSRPass } from './SSRPass.js';
import { CascadedShadowManager } from './CascadedShadowManager.js';
import { PBRMaterialManager } from './PBRMaterialManager.js';

export class Renderer {
  constructor(canvas, settings) {
    this.canvas = canvas;
    this.settings = settings;
    
    this.renderer = null;
    this.composer = null;
    this.scene = new THREE.Scene();
    this.camera = null;
    this.info = { render: { triangles: 0, calls: 0 } };
    
    this.width = window.innerWidth;
    this.height = window.innerHeight;
    this.pixelRatio = Math.min(window.devicePixelRatio, 2);
    
    this.taamanager = null;
    this.bloomPass = null;
    this.dofPass = null;
    this.motionBlurPass = null;
    this.ssrPass = null;
    this.shadowManager = null;
    this.pbrMaterials = null;
    
    this.renderTargets = {
      velocity: null,
      depth: null,
      normal: null,
      baseColor: null,
      hdr: null
    };
    
    this.prevViewProjectionMatrix = new THREE.Matrix4();
    this.currentViewProjectionMatrix = new THREE.Matrix4();
    
    this.resizeHandler = this.onResize.bind(this);
  }
  
  async init() {
    this.createRenderer();
    this.createCamera();
    this.createRenderTargets();
    this.createComposer();
    this.createPasses();
    this.shadowManager = new CascadedShadowManager(this, this.settings);
    await this.shadowManager.init();
    this.pbrMaterials = new PBRMaterialManager(this);
    await this.pbrMaterials.init();
    this.setupEventListeners();
  }
  
  createRenderer() {
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: false,
      alpha: false,
      depth: true,
      stencil: false,
      preserveDrawingBuffer: false,
      powerPreference: 'high-performance'
    });
    
    this.renderer.setSize(this.width, this.height);
    this.renderer.setPixelRatio(this.pixelRatio * this.settings.graphics.resolutionScale);
    this.renderer.toneMapping = THREE.NoToneMapping;
    this.renderer.toneMappingExposure = this.settings.graphics.exposure;
    this.renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
    this.renderer.physicallyCorrectLights = true;
    this.renderer.shadowMap.enabled = this.settings.graphics.shadows;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.shadowMap.autoUpdate = false;
    this.renderer.info.autoReset = false;
    
    this.renderer.setAnimationLoop(null);
    
    this.renderer.extensions.get('EXT_color_buffer_float');
    this.renderer.extensions.get('OES_texture_float_linear');
    this.renderer.extensions.get('WEBGL_depth_texture');
  }
  
  createCamera() {
    this.camera = new THREE.PerspectiveCamera(
      70,
      this.width / this.height,
      0.1,
      2000
    );
    this.camera.position.set(0, 2, 5);
  }
  
  createRenderTargets() {
    const w = Math.floor(this.width * this.pixelRatio * this.settings.graphics.resolutionScale);
    const h = Math.floor(this.height * this.pixelRatio * this.settings.graphics.resolutionScale);
    
    const hdrFormat = this.renderer.capabilities.isWebGL2 ? THREE.HalfFloatType : THREE.FloatType;
    
    const hdrDepthTexture = new THREE.DepthTexture();
    hdrDepthTexture.name = 'HDR_Depth';
    hdrDepthTexture.type = THREE.UnsignedIntType;
    hdrDepthTexture.minFilter = THREE.LinearFilter;
    hdrDepthTexture.magFilter = THREE.LinearFilter;
    
    this.renderTargets.hdr = new THREE.WebGLRenderTarget(w, h, {
      type: hdrFormat,
      format: THREE.RGBAFormat,
      encoding: THREE.LinearEncoding,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      depthBuffer: true,
      depthTexture: hdrDepthTexture,
      stencilBuffer: false
    });
    this.renderTargets.hdr.texture.name = 'HDR';
    
    this.renderTargets.velocity = new THREE.WebGLRenderTarget(w, h, {
      type: THREE.HalfFloatType,
      format: THREE.RGBAFormat,
      encoding: THREE.LinearEncoding,
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
      depthBuffer: false
    });
    this.renderTargets.velocity.texture.name = 'Velocity';
    
    const depthTexture = new THREE.DepthTexture();
    depthTexture.name = 'Depth_Depth';
    depthTexture.type = THREE.UnsignedIntType;
    depthTexture.minFilter = THREE.NearestFilter;
    depthTexture.magFilter = THREE.NearestFilter;
    
    this.renderTargets.depth = new THREE.WebGLRenderTarget(w, h, {
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
      depthBuffer: true,
      depthTexture: depthTexture
    });
    this.renderTargets.depth.texture.name = 'Depth';
    
    this.renderTargets.normal = new THREE.WebGLRenderTarget(w, h, {
      type: THREE.HalfFloatType,
      format: THREE.RGBAFormat,
      encoding: THREE.LinearEncoding,
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
      depthBuffer: false
    });
    this.renderTargets.normal.texture.name = 'Normal';
    
    this.renderTargets.baseColor = new THREE.WebGLRenderTarget(w, h, {
      type: THREE.HalfFloatType,
      format: THREE.RGBAFormat,
      encoding: THREE.LinearEncoding,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      depthBuffer: false
    });
    this.renderTargets.baseColor.texture.name = 'BaseColor';
  }
  
  createComposer() {
    this.composer = new EffectComposer(this.renderer, this.renderTargets.hdr);
  }
  
  createPasses() {
    const renderPass = new RenderPass(this.scene, this.camera);
    renderPass.renderToScreen = false;
    this.composer.addPass(renderPass);
    this.renderPass = renderPass;
    
    this.taamanager = new TAAManager(this, this.settings);
    this.composer.addPass(this.taamanager.getPass());
    
    this.ssrPass = new SSRPass(this, this.settings);
    this.composer.addPass(this.ssrPass.getPass());
    
    this.bloomPass = new BloomPass(this, this.settings);
    this.composer.addPass(this.bloomPass.getPass());
    
    this.dofPass = new DOFPass(this, this.settings);
    this.composer.addPass(this.dofPass.getPass());
    
    this.motionBlurPass = new MotionBlurPass(this, this.settings);
    this.composer.addPass(this.motionBlurPass.getPass());
    
    const finalPass = new ShaderPass(this.getFinalShader());
    finalPass.renderToScreen = true;
    this.composer.addPass(finalPass);
    this.finalPass = finalPass;
  }
  
  getFinalShader() {
    return {
      uniforms: {
        tDiffuse: { value: null },
        exposure: { value: this.settings.graphics.exposure },
        toneMapping: { value: 0 }
      },
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform sampler2D tDiffuse;
        uniform float exposure;
        uniform int toneMapping;
        varying vec2 vUv;
        
        vec3 ACESFilm(vec3 x) {
          float a = 2.51;
          float b = 0.03;
          float c = 2.43;
          float d = 0.59;
          float e = 0.14;
          return clamp((x*(a*x+b))/(x*(c*x+d)+e), 0.0, 1.0);
        }
        
        vec3 Reinhard(vec3 x) {
          return x / (x + vec3(1.0));
        }
        
        vec3 Uncharted2Tonemap(vec3 x) {
          float A = 0.15;
          float B = 0.50;
          float C = 0.10;
          float D = 0.20;
          float E = 0.02;
          float F = 0.30;
          return ((x*(A*x+C*B)+D*E)/(x*(A*x+B)+D*F))-E/F;
        }
        
        void main() {
          vec3 color = texture2D(tDiffuse, vUv).rgb;
          color *= exposure;
          
          if (toneMapping == 0) {
            color = ACESFilm(color);
          } else if (toneMapping == 1) {
            color = Reinhard(color);
          } else {
            color = Uncharted2Tonemap(color);
          }
          
          color = pow(color, vec3(1.0/2.2));
          
          gl_FragColor = vec4(color, 1.0);
        }
      `
    };
  }
  
  setupEventListeners() {
    window.addEventListener('resize', this.resizeHandler);
  }
  
  onResize() {
    this.width = window.innerWidth;
    this.height = window.innerHeight;
    
    this.camera.aspect = this.width / this.height;
    this.camera.updateProjectionMatrix();
    
    const scaledWidth = Math.floor(this.width * this.pixelRatio * this.settings.graphics.resolutionScale);
    const scaledHeight = Math.floor(this.height * this.pixelRatio * this.settings.graphics.resolutionScale);
    
    this.renderer.setSize(this.width, this.height);
    this.renderer.setPixelRatio(this.pixelRatio * this.settings.graphics.resolutionScale);
    
    Object.values(this.renderTargets).forEach(rt => {
      if (rt) rt.setSize(scaledWidth, scaledHeight);
    });
    
    this.composer.setSize(scaledWidth, scaledHeight);
    
    if (this.taamanager) this.taamanager.onResize(scaledWidth, scaledHeight);
    if (this.bloomPass) this.bloomPass.onResize(scaledWidth, scaledHeight);
    if (this.dofPass) this.dofPass.onResize(scaledWidth, scaledHeight);
    if (this.motionBlurPass) this.motionBlurPass.onResize(scaledWidth, scaledHeight);
    if (this.ssrPass) this.ssrPass.onResize(scaledWidth, scaledHeight);
    if (this.shadowManager) this.shadowManager.onResize();
  }
  
  updateViewProjectionMatrix() {
    this.prevViewProjectionMatrix.copy(this.currentViewProjectionMatrix);
    this.currentViewProjectionMatrix.multiplyMatrices(this.camera.projectionMatrix, this.camera.matrixWorldInverse);
  }
  
  render(scene, camera, vehicle, deltaTime) {
    this.camera = camera;
    this.updateViewProjectionMatrix();
    
    this.info = this.renderer.info;
    this.renderer.info.reset();
    
    if (this.settings.graphics.shadows && this.shadowManager) {
      this.shadowManager.render(scene, camera, vehicle);
    }
    
    this.renderVelocityDepthNormal(scene, camera, vehicle);
    
    this.composer.render(deltaTime);
    
    this.renderer.setRenderTarget(null);
  }
  
  renderVelocityDepthNormal(scene, camera, vehicle) {
    this.renderer.setRenderTarget(this.renderTargets.velocity);
    this.renderer.clear();
    
    const velocityMaterial = this.getVelocityMaterial();
    scene.overrideMaterial = velocityMaterial;
    this.renderer.render(scene, camera);
    scene.overrideMaterial = null;
    
    this.renderer.setRenderTarget(this.renderTargets.normal);
    this.renderer.clear();
    
    const normalMaterial = this.getNormalMaterial();
    scene.overrideMaterial = normalMaterial;
    this.renderer.render(scene, camera);
    scene.overrideMaterial = null;
    
    this.renderer.setRenderTarget(this.renderTargets.baseColor);
    this.renderer.clear();
    
    const baseColorMaterial = this.getBaseColorMaterial();
    scene.overrideMaterial = baseColorMaterial;
    this.renderer.render(scene, camera);
    scene.overrideMaterial = null;
  }
  
  getVelocityMaterial() {
    if (!this._velocityMaterial) {
      this._velocityMaterial = new THREE.ShaderMaterial({
        uniforms: {
          prevViewProjectionMatrix: { value: this.prevViewProjectionMatrix },
          currentViewProjectionMatrix: { value: this.currentViewProjectionMatrix }
        },
        vertexShader: `
          uniform mat4 prevViewProjectionMatrix;
          uniform mat4 currentViewProjectionMatrix;
          varying vec2 vUv;
          void main() {
            vUv = uv;
            vec4 worldPosition = modelMatrix * vec4(position, 1.0);
            vec4 currentClip = currentViewProjectionMatrix * worldPosition;
            vec4 prevClip = prevViewProjectionMatrix * worldPosition;
            gl_Position = currentClip;
          }
        `,
        fragmentShader: `
          uniform mat4 prevViewProjectionMatrix;
          uniform mat4 currentViewProjectionMatrix;
          varying vec2 vUv;
          void main() {
            gl_FragColor = vec4(0.0);
          }
        `
      });
    }
    this._velocityMaterial.uniforms.prevViewProjectionMatrix.value.copy(this.prevViewProjectionMatrix);
    this._velocityMaterial.uniforms.currentViewProjectionMatrix.value.copy(this.currentViewProjectionMatrix);
    return this._velocityMaterial;
  }
  
  getNormalMaterial() {
    if (!this._normalMaterial) {
      this._normalMaterial = new THREE.MeshNormalMaterial();
    }
    return this._normalMaterial;
  }
  
  getBaseColorMaterial() {
    if (!this._baseColorMaterial) {
      this._baseColorMaterial = new THREE.ShaderMaterial({
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
            gl_FragColor = vec4(0.0);
          }
        `
      });
    }
    return this._baseColorMaterial;
  }
  
  setSize(width, height) {
    this.width = width;
    this.height = height;
    this.onResize();
  }
  
  dispose() {
    window.removeEventListener('resize', this.resizeHandler);
    Object.values(this.renderTargets).forEach(rt => rt?.dispose());
    this.composer?.dispose();
    this.renderer?.dispose();
    this.shadowManager?.dispose();
    this.pbrMaterials?.dispose();
  }
}