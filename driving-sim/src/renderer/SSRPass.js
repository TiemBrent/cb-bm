import * as THREE from 'three';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';

export class SSRPass {
  constructor(renderer, settings) {
    this.renderer = renderer;
    this.settings = settings;
    this.enabled = settings.graphics.ssr;
    
    this.resolutionScale = settings.graphics.ssrResolution;
    this.maxSteps = 32;
    this.maxDistance = 100;
    this.thickness = 0.1;
    this.fadeDistance = 50;
    
    this.ssrRT = null;
    this.pass = null;
    this.envMap = null;
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
    
    const ssrWidth = Math.floor(width * this.resolutionScale);
    const ssrHeight = Math.floor(height * this.resolutionScale);
    
    const hdrFormat = THREE.HalfFloatType;
    
    this.ssrRT = new THREE.WebGLRenderTarget(ssrWidth, ssrHeight, {
      type: hdrFormat,
      format: THREE.RGBAFormat,
      encoding: THREE.LinearEncoding,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      depthBuffer: false
    });
    this.ssrRT.texture.name = 'SSR_Result';
    
    const material = new THREE.ShaderMaterial({
      uniforms: {
        tColor: { value: null },
        tNormal: { value: this.renderer.renderTargets.normal.texture },
        tDepth: { value: this.renderer.renderTargets.depth.depthTexture },
        tBaseColor: { value: this.renderer.renderTargets.baseColor.texture },
        tEnvMap: { value: null },
        cameraNear: { value: this.renderer.camera.near },
        cameraFar: { value: this.renderer.camera.far },
        projectionMatrix: { value: this.renderer.camera.projectionMatrix },
        inverseProjectionMatrix: { value: new THREE.Matrix4() },
        cameraPosition: { value: new THREE.Vector3() },
        resolution: { value: new THREE.Vector2(ssrWidth, ssrHeight) },
        invResolution: { value: new THREE.Vector2(1/ssrWidth, 1/ssrHeight) },
        maxSteps: { value: this.maxSteps },
        maxDistance: { value: this.maxDistance },
        thickness: { value: this.thickness },
        fadeDistance: { value: this.fadeDistance },
        resolutionScale: { value: this.resolutionScale }
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
        uniform sampler2D tNormal;
        uniform sampler2D tDepth;
        uniform sampler2D tBaseColor;
        uniform samplerCube tEnvMap;
        uniform float cameraNear;
        uniform float cameraFar;
        uniform mat4 projectionMatrix;
        uniform mat4 inverseProjectionMatrix;
        uniform vec3 cameraPosition;
        uniform vec2 resolution;
        uniform vec2 invResolution;
        uniform int maxSteps;
        uniform float maxDistance;
        uniform float thickness;
        uniform float fadeDistance;
        uniform float resolutionScale;
        varying vec2 vUv;
        
        float linearDepth(float depth) {
          return cameraNear * cameraFar / (cameraFar - depth * (cameraFar - cameraNear));
        }
        
        vec3 getViewPosition(vec2 uv, float depth) {
          vec4 clipPos = vec4(uv * 2.0 - 1.0, depth, 1.0);
          vec4 viewPos = inverseProjectionMatrix * clipPos;
          return viewPos.xyz / viewPos.w;
        }
        
        vec3 getWorldPosition(vec3 viewPos, mat4 viewMatrix) {
          return (inverse(viewMatrix) * vec4(viewPos, 1.0)).xyz;
        }
        
        void main() {
          float depth = texture2D(tDepth, vUv).r;
          if (depth >= 1.0) {
            gl_FragColor = vec4(0.0);
            return;
          }
          
          vec3 normal = texture2D(tNormal, vUv).xyz * 2.0 - 1.0;
          vec3 baseColor = texture2D(tBaseColor, vUv).rgb;
          vec3 viewPos = getViewPosition(vUv, depth);
          vec3 viewDir = normalize(viewPos);
          
          float NdotV = dot(normal, viewDir);
          if (NdotV > -0.1) {
            gl_FragColor = vec4(0.0);
            return;
          }
          
          vec3 reflectDir = reflect(viewDir, normal);
          
          // Roughness from base color alpha (metalness) or use a fixed value
          float roughness = 0.5;
          if (roughness > 0.4) {
            gl_FragColor = vec4(0.0);
            return;
          }
          
          // Ray march
          vec3 rayOrigin = viewPos;
          vec3 rayDir = reflectDir;
          float stepSize = maxDistance / float(maxSteps);
          float currentDist = 0.0;
          vec3 hitPos = vec3(0.0);
          bool hit = false;
          
          for (int i = 0; i < 64; i++) {
            if (i >= maxSteps) break;
            
            currentDist += stepSize;
            if (currentDist > maxDistance) break;
            
            vec3 samplePos = rayOrigin + rayDir * currentDist;
            vec4 clipPos = projectionMatrix * vec4(samplePos, 1.0);
            vec2 sampleUv = clipPos.xy / clipPos.w * 0.5 + 0.5;
            
            if (sampleUv.x < 0.0 || sampleUv.x > 1.0 || sampleUv.y < 0.0 || sampleUv.y > 1.0) break;
            
            float sampleDepth = texture2D(tDepth, sampleUv).r;
            float sampleViewZ = linearDepth(sampleDepth);
            
            if (sampleViewZ > samplePos.z - thickness) {
              hitPos = samplePos;
              hit = true;
              break;
            }
          }
          
          if (!hit) {
            // Fallback to environment map
            if (textureCube(tEnvMap, reflectDir).r > 0.0) {
              vec3 envColor = textureCube(tEnvMap, reflectDir).rgb;
              gl_FragColor = vec4(envColor, 1.0);
            } else {
              gl_FragColor = vec4(0.0);
            }
            return;
          }
          
          // Project hit position to screen
          vec4 hitClip = projectionMatrix * vec4(hitPos, 1.0);
          vec2 hitUv = hitClip.xy / hitClip.w * 0.5 + 0.5;
          
          if (hitUv.x < 0.0 || hitUv.x > 1.0 || hitUv.y < 0.0 || hitUv.y > 1.0) {
            gl_FragColor = vec4(0.0);
            return;
          }
          
          vec3 reflectedColor = texture2D(tColor, hitUv).rgb;
          
          // Fade based on distance and roughness
          float distFade = smoothstep(0.0, fadeDistance, currentDist);
          float roughFade = smoothstep(0.0, 0.4, roughness);
          float fresnel = pow(1.0 + NdotV, 5.0);
          
          float weight = (1.0 - distFade) * (1.0 - roughFade) * fresnel;
          
          gl_FragColor = vec4(reflectedColor * weight, weight);
        }
      `
    });
    
    this.pass = new ShaderPass(material);
    this.pass.renderToScreen = false;
    this.pass.needsSwap = true;
  }
  
  setEnvironmentMap(envMap) {
    this.envMap = envMap;
    if (this.pass) {
      this.pass.material.uniforms.tEnvMap.value = envMap;
    }
  }
  
  onResize(width, height) {
    const ssrWidth = Math.floor(width * this.resolutionScale);
    const ssrHeight = Math.floor(height * this.resolutionScale);
    
    this.ssrRT.setSize(ssrWidth, ssrHeight);
    
    if (this.pass) {
      this.pass.material.uniforms.resolution.value.set(ssrWidth, ssrHeight);
      this.pass.material.uniforms.invResolution.value.set(1/ssrWidth, 1/ssrHeight);
    }
  }
  
  setEnabled(enabled) {
    this.enabled = enabled;
  }
  
  update(camera) {
    if (!this.enabled) return;
    
    this.pass.material.uniforms.cameraNear.value = camera.near;
    this.pass.material.uniforms.cameraFar.value = camera.far;
    this.pass.material.uniforms.projectionMatrix.value.copy(camera.projectionMatrix);
    this.pass.material.uniforms.inverseProjectionMatrix.value.copy(camera.projectionMatrixInverse);
    this.pass.material.uniforms.cameraPosition.value.copy(camera.position);
    this.pass.material.uniforms.tColor.value = this.renderer.renderTargets.hdr.texture;
    this.pass.material.uniforms.tNormal.value = this.renderer.renderTargets.normal.texture;
    this.pass.material.uniforms.tDepth.value = this.renderer.renderTargets.depth.depthTexture;
    this.pass.material.uniforms.tBaseColor.value = this.renderer.renderTargets.baseColor.texture;
  }
  
  dispose() {
    this.ssrRT?.dispose();
    this.pass?.dispose();
  }
}