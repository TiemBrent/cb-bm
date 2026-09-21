import * as THREE from 'three';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';

export class MotionBlurPass {
  constructor(renderer, settings) {
    this.renderer = renderer;
    this.settings = settings;
    this.enabled = settings.graphics.motionBlur;
    
    this.strength = settings.graphics.motionBlurStrength;
    this.maxVelocity = 100;
    this.sampleCount = 16;
    
    this.pass = null;
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
    
    const material = new THREE.ShaderMaterial({
      uniforms: {
        tColor: { value: null },
        tVelocity: { value: this.renderer.renderTargets.velocity.texture },
        tDepth: { value: this.renderer.renderTargets.depth.depthTexture },
        cameraNear: { value: this.renderer.camera.near },
        cameraFar: { value: this.renderer.camera.far },
        strength: { value: this.strength },
        maxVelocity: { value: this.maxVelocity },
        sampleCount: { value: this.sampleCount },
        resolution: { value: new THREE.Vector2(width, height) },
        invResolution: { value: new THREE.Vector2(1/width, 1/height) }
      },
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform sampler2D tColor;
        uniform sampler2D tVelocity;
        uniform sampler2D tDepth;
        uniform float cameraNear;
        uniform float cameraFar;
        uniform float strength;
        uniform float maxVelocity;
        uniform int sampleCount;
        uniform vec2 resolution;
        uniform vec2 invResolution;
        varying vec2 vUv;
        
        float linearDepth(float depth) {
          return cameraNear * cameraFar / (cameraFar - depth * (cameraFar - cameraNear));
        }
        
        vec3 rand3(vec2 co) {
          vec3 r;
          r.x = fract(sin(dot(co, vec2(12.9898, 78.233))) * 43758.5453);
          r.y = fract(sin(dot(co, vec2(39.346, 11.135))) * 43758.5453);
          r.z = fract(sin(dot(co, vec2(73.156, 52.23))) * 43758.5453);
          return r;
        }
        
        void main() {
          vec2 velocity = texture2D(tVelocity, vUv).rg * maxVelocity;
          float centerDepth = linearDepth(texture2D(tDepth, vUv).r);
          vec3 centerColor = texture2D(tColor, vUv).rgb;
          
          float velLen = length(velocity);
          if (velLen < 0.5) {
            gl_FragColor = vec4(centerColor, 1.0);
            return;
          }
          
          vec3 sum = centerColor;
          float weightSum = 1.0;
          
          int samples = min(sampleCount, 32);
          float invSamples = 1.0 / float(samples);
          
          vec3 seed = rand3(vUv * 100.0);
          
          for (int i = 0; i < 32; i++) {
            if (i >= samples) break;
            
            float t = float(i) * invSamples;
            
            // Jittered sampling along velocity vector
            float jitter = (seed.x + float(i) * 0.31830988618) * 2.0 - 1.0;
            vec2 sampleUv = vUv - velocity * t * invResolution + vec2(jitter * 0.001, 0.0);
            
            if (sampleUv.x < 0.0 || sampleUv.x > 1.0 || sampleUv.y < 0.0 || sampleUv.y > 1.0) continue;
            
            vec2 sampleVel = texture2D(tVelocity, sampleUv).rg * maxVelocity;
            float sampleDepth = linearDepth(texture2D(tDepth, sampleUv).r);
            vec3 sampleColor = texture2D(tColor, sampleUv).rgb;
            
            // Depth rejection to prevent ghosting
            float depthDiff = abs(sampleDepth - centerDepth);
            float depthWeight = smoothstep(0.1, 0.0, depthDiff);
            
            // Velocity similarity
            float velDiff = length(sampleVel - velocity);
            float velWeight = smoothstep(20.0, 0.0, velDiff);
            
            float w = depthWeight * velWeight * strength;
            sum += sampleColor * w;
            weightSum += w;
          }
          
          gl_FragColor = vec4(sum / weightSum, 1.0);
        }
      `
    });
    
    this.pass = new ShaderPass(material);
    this.pass.renderToScreen = false;
  }
  
  onResize(width, height) {
    if (this.pass) {
      this.pass.material.uniforms.resolution.value.set(width, height);
      this.pass.material.uniforms.invResolution.value.set(1/width, 1/height);
    }
  }
  
  setEnabled(enabled) {
    this.enabled = enabled;
    if (this.pass) {
      this.pass.material.uniforms.strength.value = enabled ? this.strength : 0.0;
    }
  }
  
  setStrength(strength) {
    this.strength = strength;
    if (this.pass) {
      this.pass.material.uniforms.strength.value = strength;
    }
  }
  
  dispose() {
    this.pass?.dispose();
  }
}