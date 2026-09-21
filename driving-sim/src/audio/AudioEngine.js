import * as THREE from 'three';

export class AudioEngine {
  constructor(vehicle, settings) {
    this.vehicle = vehicle;
    this.settings = settings;
    
    this.audioContext = null;
    this.masterGain = null;
    this.engineGain = null;
    this.tireGain = null;
    this.ambientGain = null;
    
    this.engineOscillators = [];
    this.engineFilter = null;
    this.engineDistortion = null;
    
    this.tireNoise = null;
    this.tireFilter = null;
    
    this.windNoise = null;
    this.windFilter = null;
    
    this.isPlaying = false;
    this.isPaused = false;
    
    this.lastRpm = 0;
    this.lastSpeed = 0;
    this.lastDrift = 0;
  }
  
  async init() {
    this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
    
    this.masterGain = this.audioContext.createGain();
    this.masterGain.gain.value = this.settings.audio.masterVolume;
    this.masterGain.connect(this.audioContext.destination);
    
    this.engineGain = this.audioContext.createGain();
    this.engineGain.gain.value = this.settings.audio.engineVolume;
    this.engineGain.connect(this.masterGain);
    
    this.tireGain = this.audioContext.createGain();
    this.tireGain.gain.value = this.settings.audio.tireVolume;
    this.tireGain.connect(this.masterGain);
    
    this.ambientGain = this.audioContext.createGain();
    this.ambientGain.gain.value = this.settings.audio.ambientVolume;
    this.ambientGain.connect(this.masterGain);
    
    this.createEngineSynth();
    this.createTireSynth();
    this.createAmbientSynth();
    
    this.start();
  }
  
  createEngineSynth() {
    const fundamental = this.audioContext.createOscillator();
    fundamental.type = 'sawtooth';
    fundamental.frequency.value = 60;
    
    const harmonics = [];
    const harmonicGains = [0.5, 0.3, 0.2, 0.15, 0.1, 0.08, 0.05, 0.03];
    
    for (let i = 0; i < 8; i++) {
      const osc = this.audioContext.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.value = 60 * (i + 2);
      
      const gain = this.audioContext.createGain();
      gain.gain.value = harmonicGains[i];
      
      osc.connect(gain);
      gain.connect(this.engineGain);
      osc.start();
      
      harmonics.push({ osc, gain });
    }
    
    this.engineFilter = this.audioContext.createBiquadFilter();
    this.engineFilter.type = 'lowpass';
    this.engineFilter.frequency.value = 2000;
    this.engineFilter.Q.value = 2;
    this.engineGain.connect(this.engineFilter);
    this.engineFilter.connect(this.masterGain);
    
    this.engineDistortion = this.audioContext.createWaveShaper();
    this.engineDistortion.curve = this.makeDistortionCurve(10);
    this.engineDistortion.oversample = '4x';
    this.engineFilter.connect(this.engineDistortion);
    this.engineDistortion.connect(this.masterGain);
    
    this.engineOscillators = [{ osc: fundamental, gain: this.engineGain }, ...harmonics];
  }
  
  makeDistortionCurve(amount) {
    const n_samples = 44100;
    const curve = new Float32Array(n_samples);
    const deg = Math.PI / 180;
    
    for (let i = 0; i < n_samples; i++) {
      const x = (i * 2) / n_samples - 1;
      curve[i] = ((3 + amount) * x * 20 * deg) / (Math.PI + amount * Math.abs(x));
    }
    return curve;
  }
  
  createTireSynth() {
    const bufferSize = 4096;
    this.tireNoise = this.audioContext.createBufferSource();
    const buffer = this.audioContext.createBuffer(1, bufferSize, this.audioContext.sampleRate);
    const data = buffer.getChannelData(0);
    
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    
    this.tireNoise.buffer = buffer;
    this.tireNoise.loop = true;
    
    this.tireFilter = this.audioContext.createBiquadFilter();
    this.tireFilter.type = 'bandpass';
    this.tireFilter.frequency.value = 1000;
    this.tireFilter.Q.value = 0.5;
    
    this.tireNoise.connect(this.tireFilter);
    this.tireFilter.connect(this.tireGain);
    this.tireNoise.start();
  }
  
  createAmbientSynth() {
    const bufferSize = 8192;
    this.windNoise = this.audioContext.createBufferSource();
    const buffer = this.audioContext.createBuffer(1, bufferSize, this.audioContext.sampleRate);
    const data = buffer.getChannelData(0);
    
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * 0.1;
    }
    
    this.windNoise.buffer = buffer;
    this.windNoise.loop = true;
    
    this.windFilter = this.audioContext.createBiquadFilter();
    this.windFilter.type = 'highpass';
    this.windFilter.frequency.value = 200;
    this.windFilter.Q.value = 0.3;
    
    this.windNoise.connect(this.windFilter);
    this.windFilter.connect(this.ambientGain);
    this.windNoise.start();
  }
  
  start() {
    if (this.isPlaying) return;
    this.isPlaying = true;
    this.isPaused = false;
    
    if (this.audioContext.state === 'suspended') {
      this.audioContext.resume();
    }
  }
  
  setPaused(paused) {
    this.isPaused = paused;
    if (paused) {
      this.masterGain.gain.value = 0;
    } else {
      this.masterGain.gain.value = this.settings.audio.masterVolume;
    }
  }
  
  update(dt) {
    if (this.isPaused || !this.vehicle) return;
    
    const rpm = this.vehicle.engineRpm;
    const speed = this.vehicle.speed;
    const drift = Math.abs(this.vehicle.driftAngle);
    const throttle = this.vehicle.throttle;
    const gear = this.vehicle.currentGear;
    
    this.updateEngineSound(rpm, throttle, gear);
    this.updateTireSound(speed, drift);
    this.updateAmbientSound(speed);
    
    this.lastRpm = rpm;
    this.lastSpeed = speed;
    this.lastDrift = drift;
  }
  
  updateEngineSound(rpm, throttle, gear) {
    const baseFreq = 30 + rpm * 0.08;
    const rpmFactor = THREE.MathUtils.clamp(rpm / this.vehicle.redlineRpm, 0, 1);
    const throttleFactor = THREE.MathUtils.clamp(throttle, 0, 1);
    
    this.engineOscillators.forEach((item, i) => {
      const mult = i === 0 ? 1 : i + 1;
      item.osc.frequency.value = baseFreq * mult;
      
      const harmonicGain = [1, 0.5, 0.3, 0.2, 0.15, 0.1, 0.08, 0.05, 0.03][i] || 0.01;
      item.gain.gain.value = harmonicGain * throttleFactor * (0.3 + rpmFactor * 0.7);
    });
    
    this.engineFilter.frequency.value = 800 + rpmFactor * 3000 + throttleFactor * 1000;
    this.engineFilter.Q.value = 1 + rpmFactor * 3;
    
    const distortionAmount = 5 + rpmFactor * 15 + throttleFactor * 10;
    this.engineDistortion.curve = this.makeDistortionCurve(distortionAmount);
  }
  
  updateTireSound(speed, drift) {
    const slipFactor = THREE.MathUtils.clamp(drift / 45, 0, 1);
    const speedFactor = THREE.MathUtils.clamp(speed / 100, 0, 1);
    
    this.tireFilter.frequency.value = 500 + speedFactor * 2000 + slipFactor * 1500;
    this.tireFilter.Q.value = 0.5 + slipFactor * 3;
    
    const tireVolume = (speedFactor * 0.3 + slipFactor * 0.7) * this.settings.audio.tireVolume;
    this.tireGain.gain.value = tireVolume;
  }
  
  updateAmbientSound(speed) {
    const speedFactor = THREE.MathUtils.clamp(speed / 80, 0, 1);
    this.windFilter.frequency.value = 100 + speedFactor * 500;
    this.ambientGain.gain.value = (0.1 + speedFactor * 0.4) * this.settings.audio.ambientVolume;
  }
  
  playGearShift() {
    if (!this.audioContext) return;
    
    const osc = this.audioContext.createOscillator();
    const gain = this.audioContext.createGain();
    
    osc.type = 'sine';
    osc.frequency.value = 800;
    osc.frequency.exponentialRampToValueAtTime(400, this.audioContext.currentTime + 0.1);
    
    gain.gain.value = 0.3;
    gain.gain.exponentialRampToValueAtTime(0.001, this.audioContext.currentTime + 0.15);
    
    osc.connect(gain);
    gain.connect(this.masterGain);
    
    osc.start();
    osc.stop(this.audioContext.currentTime + 0.2);
  }
  
  playImpact(intensity) {
    if (!this.audioContext) return;
    
    const osc = this.audioContext.createOscillator();
    const gain = this.audioContext.createGain();
    const filter = this.audioContext.createBiquadFilter();
    
    osc.type = 'square';
    osc.frequency.value = 200;
    
    filter.type = 'lowpass';
    filter.frequency.value = 500;
    
    gain.gain.value = intensity * 0.3;
    gain.gain.exponentialRampToValueAtTime(0.001, this.audioContext.currentTime + 0.2);
    
    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);
    
    osc.start();
    osc.stop(this.audioContext.currentTime + 0.3);
  }
  
  setMasterVolume(volume) {
    this.settings.audio.masterVolume = volume;
    if (this.masterGain && !this.isPaused) {
      this.masterGain.gain.value = volume;
    }
  }
  
  dispose() {
    this.engineOscillators.forEach(item => {
      item.osc.stop();
      item.osc.disconnect();
      item.gain.disconnect();
    });
    
    this.tireNoise?.stop();
    this.tireNoise?.disconnect();
    this.tireFilter?.disconnect();
    this.tireGain?.disconnect();
    
    this.windNoise?.stop();
    this.windNoise?.disconnect();
    this.windFilter?.disconnect();
    this.ambientGain?.disconnect();
    
    this.masterGain?.disconnect();
    this.audioContext?.close();
  }
}