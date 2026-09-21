import * as THREE from 'three';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';

const HALTON_2_3 = [
  [0.0, 0.0],
  [0.5, 0.333333333],
  [0.25, 0.666666667],
  [0.75, 0.111111111],
  [0.125, 0.444444444],
  [0.625, 0.777777778],
  [0.375, 0.222222222],
  [0.875, 0.555555556],
  [0.0625, 0.888888889],
  [0.5625, 0.037037037],
  [0.3125, 0.37037037],
  [0.8125, 0.703703704],
  [0.1875, 0.148148148],
  [0.6875, 0.481481481],
  [0.4375, 0.814814815],
  [0.9375, 0.259259259]
];

export class TAAManager {
  constructor(renderer, settings) {
    this.renderer = renderer;
    this.settings = settings;
    this.enabled = settings.graphics.taa;
    
    this.sampleIndex = 0;
    this.sampleCount = 16;
    this.jitterScale = 1.0;
    
    this.currentRT = null;
    this.historyRT = null;
    this.velocityRT = renderer.renderTargets.velocity;
    this.depthRT = renderer.renderTargets.depth;
    
    this.pass = null;
    this.material = null;
  }
  
  getPass() {
    if (!this.pass) {
      this.createPass();
    }
    return this.pass;
  }
  
  createPass() {
    const width = this.renderer.renderTargets.hdr.width;
    const height = this.renderer.renderTargets.hdr.height;
    
    this.currentRT = new THREE.WebGLRenderTarget(width, height, {
      type: THREE.HalfFloatType,
      format: THREE.RGBAFormat,
      encoding: THREE.LinearEncoding,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      depthBuffer: false
    });
    this.currentRT.texture.name = 'TAA_Current';
    
    this.historyRT = new THREE.WebGLRenderTarget(width, height, {
      type: THREE.HalfFloatType,
      format: THREE.RGBAFormat,
      encoding: THREE.LinearEncoding,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      depthBuffer: false
    });
    this.historyRT.texture.name = 'TAA_History';
    
    this.material = new THREE.ShaderMaterial({
      uniforms: {
        tCurrent: { value: this.currentRT.texture },
        tHistory: { value: this.historyRT.texture },
        tVelocity: { value: this.velocityRT.texture },
        tDepth: { value: this.depthRT.depthTexture },
        cameraNear: { value: this.renderer.camera.near },
        cameraFar: { value: this.renderer.camera.far },
        jitter: { value: new THREE.Vector2() },
        jitterPrev: { value: new THREE.Vector2() },
        resolution: { value: new THREE.Vector2(width, height) },
        invResolution: { value: new THREE.Vector2(1/width, 1/height) },
        frameCount: { value: 0 },
        clipInfo: { value: new THREE.Vector4() },
        blendFactor: { value: 0.9 },
        sharpness: { value: 0.5 },
        maxVelocity: { value: 100 }
      },
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: TAAShaderFragment
    });
    
    this.pass = new ShaderPass(this.material);
    this.pass.renderToScreen = false;
    this.pass.needsSwap = true;
  }
  
  onResize(width, height) {
    this.currentRT.setSize(width, height);
    this.historyRT.setSize(width, height);
    this.material.uniforms.resolution.value.set(width, height);
    this.material.uniforms.invResolution.value.set(1/width, 1/height);
  }
  
  updateJitter(camera) {
    if (!this.enabled) return;
    
    const sample = HALTON_2_3[this.sampleIndex % this.sampleCount];
    this.sampleIndex++;
    
    const jitterX = (sample[0] - 0.5) * this.jitterScale / this.renderer.width;
    const jitterY = (sample[1] - 0.5) * this.jitterScale / this.renderer.height;
    
    this.material.uniforms.jitter.value.set(jitterX, jitterY);
    
    if (this.sampleIndex > 1) {
      const prevSample = HALTON_2_3[(this.sampleIndex - 2) % this.sampleCount];
      const prevJitterX = (prevSample[0] - 0.5) * this.jitterScale / this.renderer.width;
      const prevJitterY = (prevSample[1] - 0.5) * this.jitterScale / this.renderer.height;
      this.material.uniforms.jitterPrev.value.set(prevJitterX, prevJitterY);
    }
    
    camera.setViewOffset(
      this.renderer.width,
      this.renderer.height,
      jitterX * this.renderer.width,
      jitterY * this.renderer.height,
      this.renderer.width,
      this.renderer.height
    );
  }
  
  clearJitter(camera) {
    if (!this.enabled) return;
    camera.clearViewOffset();
  }
  
  beforeRender() {
    if (!this.enabled) return;
    
    this.material.uniforms.frameCount.value = this.sampleIndex;
    this.material.uniforms.tCurrent.value = this.renderer.renderTargets.hdr.texture;
    this.material.uniforms.tHistory.value = this.historyRT.texture;
    this.material.uniforms.tVelocity.value = this.velocityRT.texture;
    this.material.uniforms.tDepth.value = this.depthRT.depthTexture;
    this.material.uniforms.cameraNear.value = this.renderer.camera.near;
    this.material.uniforms.cameraFar.value = this.renderer.camera.far;
    
    const proj = this.renderer.camera.projectionMatrix;
    this.material.uniforms.clipInfo.value.set(
      proj[10], proj[14], proj[10] - 1.0, proj[14]
    );
  }
  
  afterRender() {
    if (!this.enabled) return;
    
    this.renderer.renderer.setRenderTarget(this.historyRT);
    this.renderer.renderer.clear();
    
    const temp = this.currentRT;
    this.currentRT = this.historyRT;
    this.historyRT = temp;
    
    this.material.uniforms.tHistory.value = this.historyRT.texture;
  }
  
  setEnabled(enabled) {
    this.enabled = enabled;
    this.material.uniforms.blendFactor.value = enabled ? 0.9 : 0.0;
  }
  
  dispose() {
    this.currentRT?.dispose();
    this.historyRT?.dispose();
    this.material?.dispose();
    this.pass?.dispose();
  }
}

const TAAShaderFragment = `
  uniform sampler2D tCurrent;
  uniform sampler2D tHistory;
  uniform sampler2D tVelocity;
  uniform sampler2D tDepth;
  uniform float cameraNear;
  uniform float cameraFar;
  uniform vec2 jitter;
  uniform vec2 jitterPrev;
  uniform vec2 resolution;
  uniform vec2 invResolution;
  uniform float frameCount;
  uniform vec4 clipInfo;
  uniform float blendFactor;
  uniform float sharpness;
  uniform float maxVelocity;
  varying vec2 vUv;
  
  float sampleDepth(vec2 uv) {
    float depth = texture2D(tDepth, uv).r;
    #ifdef USE_LOGDEPTHBUF
      depth = exp(depth * log(cameraFar + 1.0)) - 1.0;
    #else
      depth = cameraNear * cameraFar / (cameraFar - depth * (cameraFar - cameraNear));
    #endif
    return depth;
  }
  
  vec3 fetchCurrent(vec2 uv) {
    return texture2D(tCurrent, uv).rgb;
  }
  
  vec3 fetchHistory(vec2 uv) {
    return texture2D(tHistory, uv).rgb;
  }
  
  vec2 fetchVelocity(vec2 uv) {
    return texture2D(tVelocity, uv).rg * maxVelocity;
  }
  
  vec3 neighborhoodClamping(vec3 current, vec3 history, vec2 uv) {
    vec3 minColor = current;
    vec3 maxColor = current;
    
    for (int x = -1; x <= 1; x++) {
      for (int y = -1; y <= 1; y++) {
        if (x == 0 && y == 0) continue;
        vec2 offset = vec2(float(x), float(y)) * invResolution;
        vec3 neighbor = fetchCurrent(uv + offset);
        minColor = min(minColor, neighbor);
        maxColor = max(maxColor, neighbor);
      }
    }
    
    return clamp(history, minColor, maxColor);
  }
  
  void main() {
    vec3 currentColor = fetchCurrent(vUv);
    
    if (frameCount < 2.0) {
      gl_FragColor = vec4(currentColor, 1.0);
      return;
    }
    
    vec2 velocity = fetchVelocity(vUv);
    vec2 prevUv = vUv - velocity * invResolution + jitterPrev - jitter;
    
    prevUv = clamp(prevUv, vec2(0.0), vec2(1.0) - invResolution);
    
    vec3 historyColor = fetchHistory(prevUv);
    
    float depth = sampleDepth(vUv);
    float prevDepth = sampleDepth(prevUv);
    float depthDiff = abs(depth - prevDepth) / max(depth, prevDepth);
    
    float velocityMagnitude = length(velocity);
    float velocityWeight = smoothstep(0.0, 2.0, velocityMagnitude);
    float depthWeight = smoothstep(0.0, 0.05, depthDiff);
    
    float rejection = max(velocityWeight, depthWeight);
    
    historyColor = neighborhoodClamping(currentColor, historyColor, vUv);
    
    float blend = mix(blendFactor, 0.0, rejection);
    
    vec3 finalColor = mix(currentColor, historyColor, blend);
    
    // Sharpening
    vec3 sharp = currentColor * 2.0;
    for (int x = -1; x <= 1; x++) {
      for (int y = -1; y <= 1; y++) {
        if (x == 0 && y == 0) continue;
        vec2 offset = vec2(float(x), float(y)) * invResolution;
        sharp -= fetchCurrent(vUv + offset) * 0.125;
    }
    }
    finalColor = mix(finalColor, sharp, sharpness * 0.5);
    
    gl_FragColor = vec4(finalColor, 1.0);
  }
`;