import * as THREE from 'three';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';

export class DOFPass {
  constructor(renderer, settings) {
    this.renderer = renderer;
    this.settings = settings;
    this.enabled = settings.graphics.dof;
    
    this.focusDistance = settings.graphics.dofFocusDistance;
    this.aperture = settings.graphics.dofAperture;
    this.focalLength = 0.05;
    this.maxCoC = 0.02;
    
    this.dofRT = null;
    this.cocRT = null;
    this.pass = null;
    this.cocPass = null;
  }
  
  getPass() {
    if (!this.pass) {
      this.createPasses();
    }
    return this.pass;
  }
  
  createPasses() {
    const width = this.renderer.renderTargets.hdr.width;
    const height = this.renderer.renderTargets.hdr.height;
    
    const hdrFormat = THREE.HalfFloatType;
    
    this.cocRT = new THREE.WebGLRenderTarget(width, height, {
      type: hdrFormat,
      format: THREE.RGBAFormat,
      encoding: THREE.LinearEncoding,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      depthBuffer: false
    });
    this.cocRT.texture.name = 'DOF_CoC';
    
    this.dofRT = new THREE.WebGLRenderTarget(width, height, {
      type: hdrFormat,
      format: THREE.RGBAFormat,
      encoding: THREE.LinearEncoding,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      depthBuffer: false
    });
    this.dofRT.texture.name = 'DOF_Result';
    
    // CoC calculation pass
    const cocMaterial = new THREE.ShaderMaterial({
      uniforms: {
        tDepth: { value: this.renderer.renderTargets.depth.depthTexture },
        cameraNear: { value: this.renderer.camera.near },
        cameraFar: { value: this.renderer.camera.far },
        focusDistance: { value: this.focusDistance },
        aperture: { value: this.aperture },
        focalLength: { value: this.focalLength },
        maxCoC: { value: this.maxCoC },
        resolution: { value: new THREE.Vector2(width, height) }
      },
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform sampler2D tDepth;
        uniform float cameraNear;
        uniform float cameraFar;
        uniform float focusDistance;
        uniform float aperture;
        uniform float focalLength;
        uniform float maxCoC;
        uniform vec2 resolution;
        varying vec2 vUv;
        
        float linearDepth(float depth) {
          return cameraNear * cameraFar / (cameraFar - depth * (cameraFar - cameraNear));
        }
        
        void main() {
          float depth = texture2D(tDepth, vUv).r;
          float viewZ = linearDepth(depth);
          
          float coc = focalLength * aperture * abs(viewZ - focusDistance) / (viewZ * focusDistance);
          coc = clamp(coc, -maxCoC, maxCoC);
          
          gl_FragColor = vec4(coc, 0.0, 0.0, 1.0);
        }
      `
    });
    
    this.cocPass = new ShaderPass(cocMaterial);
    this.cocPass.renderToScreen = false;
    
    // DOF blur pass (bokeh-style)
    const dofMaterial = new THREE.ShaderMaterial({
      uniforms: {
        tColor: { value: null },
        tCoc: { value: this.cocRT.texture },
        tDepth: { value: this.renderer.renderTargets.depth.depthTexture },
        cameraNear: { value: this.renderer.camera.near },
        cameraFar: { value: this.renderer.camera.far },
        focusDistance: { value: this.focusDistance },
        aperture: { value: this.aperture },
        maxCoC: { value: this.maxCoC },
        resolution: { value: new THREE.Vector2(width, height) },
        invResolution: { value: new THREE.Vector2(1/width, 1/height) },
        sampleCount: { value: 8 }
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
        uniform sampler2D tCoc;
        uniform sampler2D tDepth;
        uniform float cameraNear;
        uniform float cameraFar;
        uniform float focusDistance;
        uniform float aperture;
        uniform float maxCoC;
        uniform vec2 resolution;
        uniform vec2 invResolution;
        uniform int sampleCount;
        varying vec2 vUv;
        
        float linearDepth(float depth) {
          return cameraNear * cameraFar / (cameraFar - depth * (cameraFar - cameraNear));
        }
        
        float rand(vec2 co) {
          return fract(sin(dot(co.xy, vec2(12.9898, 78.233))) * 43758.5453);
        }
        
        void main() {
          float centerCoc = texture2D(tCoc, vUv).r;
          vec3 centerColor = texture2D(tColor, vUv).rgb;
          float centerDepth = linearDepth(texture2D(tDepth, vUv).r);
          
          if (abs(centerCoc) < 0.001) {
            gl_FragColor = vec4(centerColor, 1.0);
            return;
          }
          
          vec3 sum = centerColor;
          float weightSum = 1.0;
          
          // Poisson disk sampling for bokeh
          for (int i = 0; i < 8; i++) {
            float angle = 6.28318530718 * float(i) / 8.0 + rand(vUv * 100.0 + float(i)) * 0.5;
            float radius = abs(centerCoc) * 0.5;
            
            vec2 offset = vec2(cos(angle), sin(angle)) * radius * maxCoC * 100.0 * invResolution;
            vec2 sampleUv = vUv + offset;
            
            if (sampleUv.x < 0.0 || sampleUv.x > 1.0 || sampleUv.y < 0.0 || sampleUv.y > 1.0) continue;
            
            float sampleCoc = texture2D(tCoc, sampleUv).r;
            float sampleDepth = linearDepth(texture2D(tDepth, sampleUv).r);
            vec3 sampleColor = texture2D(tColor, sampleUv).rgb;
            
            // Depth test for proper layering
            float depthDiff = abs(sampleDepth - centerDepth);
            float depthWeight = smoothstep(0.0, 0.1, depthDiff);
            
            // Coc similarity weight
            float cocWeight = 1.0 - smoothstep(0.0, abs(centerCoc) * 0.5, abs(sampleCoc - centerCoc));
            
            float w = depthWeight * cocWeight;
            sum += sampleColor * w;
            weightSum += w;
          }
          
          gl_FragColor = vec4(sum / weightSum, 1.0);
        }
      `
    });
    
    this.pass = new ShaderPass(dofMaterial);
    this.pass.renderToScreen = false;
  }
  
  onResize(width, height) {
    this.cocRT.setSize(width, height);
    this.dofRT.setSize(width, height);
    
    this.cocPass.material.uniforms.resolution.value.set(width, height);
    this.pass.material.uniforms.resolution.value.set(width, height);
    this.pass.material.uniforms.invResolution.value.set(1/width, 1/height);
  }
  
  setEnabled(enabled) {
    this.enabled = enabled;
  }
  
  setFocusDistance(distance) {
    this.focusDistance = distance;
    if (this.cocPass) this.cocPass.material.uniforms.focusDistance.value = distance;
    if (this.pass) this.pass.material.uniforms.focusDistance.value = distance;
  }
  
  setAperture(aperture) {
    this.aperture = aperture;
    if (this.cocPass) this.cocPass.material.uniforms.aperture.value = aperture;
    if (this.pass) this.pass.material.uniforms.aperture.value = aperture;
  }
  
  update(camera, vehicle) {
    if (!this.enabled) return;
    
    // Auto-focus based on look-ahead
    const lookAhead = vehicle ? vehicle.chassis.position.clone().add(
      vehicle.chassis.getWorldDirection(new THREE.Vector3()).multiplyScalar(20 + vehicle.speed * 0.5)
    ) : camera.position.clone().add(camera.getWorldDirection(new THREE.Vector3()).multiplyScalar(50));
    
    const focusDist = camera.position.distanceTo(lookAhead);
    this.setFocusDistance(focusDist);
    
    // Adjust aperture based on speed (wider aperture at speed for cinematic feel)
    const speedFactor = vehicle ? Math.min(vehicle.speed / 100, 1) : 0;
    this.setAperture(THREE.MathUtils.lerp(4.0, 1.8, speedFactor));
  }
  
  dispose() {
    this.cocRT?.dispose();
    this.dofRT?.dispose();
    this.cocPass?.dispose();
    this.pass?.dispose();
  }
}