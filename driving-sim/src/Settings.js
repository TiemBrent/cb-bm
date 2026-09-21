export class Settings {
  constructor() {
    this.graphics = {
      quality: 'high',
      resolutionScale: 1.0,
      taa: true,
      bloom: true,
      dof: true,
      motionBlur: true,
      ssr: true,
      shadows: true,
      particles: true,
      shadowCascades: 4,
      shadowMapSize: 2048,
      ssrResolution: 0.5,
      bloomThreshold: 1.0,
      bloomIntensity: 1.2,
      dofFocusDistance: 50,
      dofAperture: 2.8,
      motionBlurStrength: 1.0,
      exposure: 1.0,
      toneMapping: 'ACESFilmic'
    };
    
    this.physics = {
      gravity: -9.81,
      fixedTimestep: 1/120,
      maxSubSteps: 4
    };
    
    this.audio = {
      masterVolume: 0.7,
      engineVolume: 0.8,
      tireVolume: 0.6,
      ambientVolume: 0.4
    };
    
    this.controls = {
      steeringSensitivity: 1.0,
      steeringReturnSpeed: 3.0,
      gamepadDeadzone: 0.15
    };
  }
  
  setQuality(preset) {
    const presets = {
      low: {
        resolutionScale: 0.75,
        taa: false,
        bloom: false,
        dof: false,
        motionBlur: false,
        ssr: false,
        shadows: true,
        particles: false,
        shadowCascades: 2,
        shadowMapSize: 1024,
        ssrResolution: 0.25
      },
      medium: {
        resolutionScale: 0.9,
        taa: true,
        bloom: true,
        dof: false,
        motionBlur: true,
        ssr: true,
        shadows: true,
        particles: true,
        shadowCascades: 3,
        shadowMapSize: 1536,
        ssrResolution: 0.5
      },
      high: {
        resolutionScale: 1.0,
        taa: true,
        bloom: true,
        dof: true,
        motionBlur: true,
        ssr: true,
        shadows: true,
        particles: true,
        shadowCascades: 4,
        shadowMapSize: 2048,
        ssrResolution: 0.5
      },
      ultra: {
        resolutionScale: 1.0,
        taa: true,
        bloom: true,
        dof: true,
        motionBlur: true,
        ssr: true,
        shadows: true,
        particles: true,
        shadowCascades: 4,
        shadowMapSize: 4096,
        ssrResolution: 1.0
      }
    };
    
    const p = presets[preset];
    if (p) {
      this.graphics = { ...this.graphics, ...p, quality: preset };
    }
  }
  
  applyQuality() {
    this.setQuality(this.graphics.quality);
  }
}