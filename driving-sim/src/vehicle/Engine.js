import * as THREE from 'three';

export class Engine {
  constructor(vehicle) {
    this.vehicle = vehicle;
    
    this.maxTorque = vehicle.maxEngineTorque;
    this.maxRpm = vehicle.maxEngineRpm;
    this.idleRpm = vehicle.idleRpm;
    this.redlineRpm = vehicle.redlineRpm;
    
    this.currentRpm = this.idleRpm;
    this.targetRpm = this.idleRpm;
    this.throttle = 0;
    this.load = 0;
    
    this.inertia = 0.15;
    this.frictionTorque = 15;
    this.pumpingLoss = 0.0005;
    
    this.torqueCurve = this.generateTorqueCurve();
  }
  
  generateTorqueCurve() {
    const curve = [];
    for (let rpm = 0; rpm <= this.maxRpm; rpm += 100) {
      const x = rpm / this.maxRpm;
      let torque = 0;
      
      if (x < 0.15) {
        torque = this.maxTorque * 0.3 * (x / 0.15);
      } else if (x < 0.5) {
        torque = this.maxTorque * (0.3 + 0.7 * (x - 0.15) / 0.35);
      } else if (x < 0.85) {
        torque = this.maxTorque * (1.0 - 0.2 * (x - 0.5) / 0.35);
      } else {
        torque = this.maxTorque * (0.8 - 0.6 * (x - 0.85) / 0.15);
      }
      
      curve.push({ rpm, torque });
    }
    return curve;
  }
  
  getTorque(rpm) {
    const clampedRpm = THREE.MathUtils.clamp(rpm, 0, this.maxRpm);
    const index = Math.floor(clampedRpm / 100);
    const nextIndex = Math.min(index + 1, this.torqueCurve.length - 1);
    const t = (clampedRpm % 100) / 100;
    
    return THREE.MathUtils.lerp(
      this.torqueCurve[index].torque,
      this.torqueCurve[nextIndex].torque,
      t
    );
  }
  
  getPower(rpm) {
    const torque = this.getTorque(rpm);
    return torque * rpm * Math.PI / 30000;
  }
  
  update(dt) {
    this.throttle = this.vehicle.throttle;
    
    let engineTorque = 0;
    if (this.currentRpm > this.idleRpm) {
      engineTorque = this.getTorque(this.currentRpm) * this.throttle;
    }
    
    const friction = this.frictionTorque + this.currentRpm * this.pumpingLoss;
    const netTorque = engineTorque - friction - this.load;
    
    const angularAccel = netTorque / this.inertia;
    this.currentRpm += angularAccel * dt * 30 / Math.PI;
    
    this.currentRpm = THREE.MathUtils.clamp(this.currentRpm, this.idleRpm, this.redlineRpm * 1.1);
    
    if (this.currentRpm > this.redlineRpm && this.throttle > 0) {
      this.currentRpm = this.redlineRpm;
    }
  }
  
  setLoad(load) {
    this.load = load;
  }
  
  getOutputTorque() {
    return this.getTorque(this.currentRpm) * this.throttle;
  }
}