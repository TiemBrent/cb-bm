import * as THREE from 'three';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';

export class BloomPass {
  constructor(renderer, settings) {
    this.renderer = renderer;
    this.settings = settings;
    this.enabled = settings.graphics.bloom;
    
    this.passes = [];
    this.blurPasses = [];
    this.combinePass = null;
    
    this.threshold = settings.graphics.bloomThreshold;
    this.intensity = settings.graphics.bloomIntensity;
    this.radius = 0.5;
    
    this.bloomRTs = [];
  }
  
  getPass() {
    if (this.passes.length === 0) {
      this.createPasses();
    }
    return this.passes[this.passes.length - 1];
  }
  
  createPasses() {
    const width = this.renderer.renderTargets.hdr.width;
    const height = this.renderer.renderTargets.hdr.height;
    
    const hdrFormat = THREE.HalfFloatType;
    
    for (let i = 0; i < 5; i++) {
      const w = width >> (i + 1);
      const h = height >> (i + 1);
      
      const rt1 = new THREE.WebGLRenderTarget(w, h, {
        type: hdrFormat,
        format: THREE.RGBAFormat,
        encoding: THREE.LinearEncoding,
        minFilter: THREE.LinearFilter,
        magFilter: THREE.LinearFilter,
        depthBuffer: false
      });
      rt1.texture.name = `Bloom_Mip${i}_A`;
      
      const rt2 = new THREE.WebGLRenderTarget(w, h, {
        type: hdrFormat,
        format: THREE.RGBAFormat,
        encoding: THREE.LinearEncoding,
        minFilter: THREE.LinearFilter,
        magFilter: THREE.LinearFilter,
        depthBuffer: false
      });
      rt2.texture.name = `Bloom_Mip${i}_B`;
      
      this.bloomRTs.push({ rt1, rt2 });
    }
    
    // Threshold pass
    const thresholdMaterial = new THREE.ShaderMaterial({
      uniforms: {
        tDiffuse: { value: null },
        threshold: { value: this.threshold },
        knee: { value: this.threshold * 0.5 }
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
        uniform float threshold;
        uniform float knee;
        varying vec2 vUv;
        void main() {
          vec3 color = texture2D(tDiffuse, vUv).rgb;
          float maxComponent = max(max(color.r, color.g), color.b);
          float kneeValue = threshold * knee;
          float underCurve = max(maxComponent - threshold + kneeValue, 0.0);
          float contribution = underCurve * underCurve / (4.0 * kneeValue + 0.0001);
          color = mix(color, vec3(contribution), step(threshold, maxComponent));
          gl_FragColor = vec4(color, 1.0);
        }
      `
    });
    
    const thresholdPass = new ShaderPass(thresholdMaterial);
    thresholdPass.renderToScreen = false;
    this.passes.push(thresholdPass);
    
    // Downsample + blur passes (Kawase blur)
    for (let i = 0; i < 5; i++) {
      const blurMaterial = new THREE.ShaderMaterial({
        uniforms: {
          tDiffuse: { value: null },
          resolution: { value: new THREE.Vector2(
            this.bloomRTs[i].rt1.width,
            this.bloomRTs[i].rt1.height
          )},
          invResolution: { value: new THREE.Vector2(
            1/this.bloomRTs[i].rt1.width,
            1/this.bloomRTs[i].rt1.height
          )},
          radius: { value: this.radius * (i + 1) },
          direction: { value: new THREE.Vector2(1, 0) }
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
          uniform vec2 resolution;
          uniform vec2 invResolution;
          uniform float radius;
          uniform vec2 direction;
          varying vec2 vUv;
          
          void main() {
            vec3 sum = vec3(0.0);
            float weightSum = 0.0;
            
            for (int i = -4; i <= 4; i++) {
              float offset = float(i) * radius;
              vec2 sampleUv = vUv + direction * offset * invResolution;
              vec3 sample = texture2D(tDiffuse, sampleUv).rgb;
              
              float w = exp(-0.5 * (offset * offset) / (radius * radius));
              sum += sample * w;
              weightSum += w;
            }
            
            gl_FragColor = vec4(sum / weightSum, 1.0);
          }
        `
      });
      
      const horizontalPass = new ShaderPass(blurMaterial);
      horizontalPass.material.uniforms.direction.value.set(1, 0);
      horizontalPass.renderToScreen = false;
      
      const verticalPass = new ShaderPass(blurMaterial);
      verticalPass.material.uniforms.direction.value.set(0, 1);
      verticalPass.renderToScreen = false;
      
      this.blurPasses.push({ horizontal: horizontalPass, vertical: verticalPass, index: i });
    }
    
    // Combine pass
    const combineMaterial = new THREE.ShaderMaterial({
      uniforms: {
        tBase: { value: null },
        tBloom1: { value: this.bloomRTs[0].rt2.texture },
        tBloom2: { value: this.bloomRTs[1].rt2.texture },
        tBloom3: { value: this.bloomRTs[2].rt2.texture },
        tBloom4: { value: this.bloomRTs[3].rt2.texture },
        tBloom5: { value: this.bloomRTs[4].rt2.texture },
        intensity: { value: this.intensity },
        exposure: { value: 1.0 }
      },
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform sampler2D tBase;
        uniform sampler2D tBloom1;
        uniform sampler2D tBloom2;
        uniform sampler2D tBloom3;
        uniform sampler2D tBloom4;
        uniform sampler2D tBloom5;
        uniform float intensity;
        uniform float exposure;
        varying vec2 vUv;
        
        void main() {
          vec3 base = texture2D(tBase, vUv).rgb;
          vec3 bloom = texture2D(tBloom1, vUv).rgb * 1.0;
          bloom += texture2D(tBloom2, vUv).rgb * 0.8;
          bloom += texture2D(tBloom3, vUv).rgb * 0.6;
          bloom += texture2D(tBloom4, vUv).rgb * 0.4;
          bloom += texture2D(tBloom5, vUv).rgb * 0.2;
          
          vec3 color = base + bloom * intensity;
          color = color / (color + vec3(1.0)) * exposure;
          gl_FragColor = vec4(color, 1.0);
        }
      `
    });
    
    this.combinePass = new ShaderPass(combineMaterial);
    this.combinePass.renderToScreen = false;
    this.passes.push(this.combinePass);
  }
  
  onResize(width, height) {
    for (let i = 0; i < 5; i++) {
      const w = width >> (i + 1);
      const h = height >> (i + 1);
      
      this.bloomRTs[i].rt1.setSize(w, h);
      this.bloomRTs[i].rt2.setSize(w, h);
      
      if (this.blurPasses[i]) {
        this.blurPasses[i].horizontal.material.uniforms.resolution.value.set(w, h);
        this.blurPasses[i].horizontal.material.uniforms.invResolution.value.set(1/w, 1/h);
        this.blurPasses[i].vertical.material.uniforms.resolution.value.set(w, h);
        this.blurPasses[i].vertical.material.uniforms.invResolution.value.set(1/w, 1/h);
      }
    }
  }
  
  setEnabled(enabled) {
    this.enabled = enabled;
  }
  
  setThreshold(threshold) {
    this.threshold = threshold;
    if (this.passes[0]) {
      this.passes[0].material.uniforms.threshold.value = threshold;
      this.passes[0].material.uniforms.knee.value = threshold * 0.5;
    }
  }
  
  setIntensity(intensity) {
    this.intensity = intensity;
    if (this.combinePass) {
      this.combinePass.material.uniforms.intensity.value = intensity;
    }
  }
  
  dispose() {
    this.bloomRTs.forEach(({ rt1, rt2 }) => {
      rt1.dispose();
      rt2.dispose();
    });
    this.passes.forEach(p => p.dispose());
    this.blurPasses.forEach(({ horizontal, vertical }) => {
      horizontal.dispose();
      vertical.dispose();
    });
  }
}