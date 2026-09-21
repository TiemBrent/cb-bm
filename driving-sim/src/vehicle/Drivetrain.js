import * as THREE from 'three';

export class Drivetrain {
  constructor(vehicle) {
    this.vehicle = vehicle;
    
    this.gearRatios = vehicle.gearRatios;
    this.finalDriveRatio = vehicle.finalDriveRatio;
    this.currentGear = 1;
    this.clutchEngaged = true;
    this.clutchSlip = 0;
    
    this.differentialType = 'lsd';
    this.lsdLockup = 0.3;
    this.lsdPreload = 50;
    
    this.driveWheels = [2, 3];
    
    this.outputTorque = 0;
    this.outputRpm = 0;
  }
  
  update(dt) {
    this.currentGear = this.vehicle.currentGear;
    this.clutchEngaged = this.vehicle.clutchEngaged;
    
    const engineRpm = this.vehicle.engineRpm;
    const gearRatio = this.gearRatios[this.currentGear - 1];
    const totalRatio = gearRatio * this.finalDriveRatio;
    
    this.outputRpm = engineRpm / totalRatio;
    
    let engineTorque = this.vehicle.engine.getOutputTorque();
    
    if (!this.clutchEngaged) {
      this.clutchSlip = Math.abs(engineRpm - this.outputRpm * totalRatio) / Math.max(engineRpm, 1);
      engineTorque *= (1 - this.clutchSlip * 0.5);
    } else {
      this.clutchSlip = 0;
    }
    
    this.outputTorque = engineTorque * totalRatio * 0.95;
    
    this.distributeTorque();
  }
  
  distributeTorque() {
    const rearWheels = this.driveWheels.map(i => this.vehicle.wheels[i]);
    const totalLoad = rearWheels.reduce((sum, w) => sum + w.load, 0);
    
    if (totalLoad <= 0) return;
    
    if (this.differentialType === 'open') {
      rearWheels.forEach(wheel => {
        wheel.applyDriveTorque(this.outputTorque / 2);
      });
    } else if (this.differentialType === 'lsd') {
      const speedDiff = Math.abs(rearWheels[0].angularVelocity - rearWheels[1].angularVelocity);
      const lockup = this.lsdPreload + this.lsdLockup * this.outputTorque;
      
      const bias = THREE.MathUtils.clamp(lockup / Math.max(speedDiff * 10, 1), 0, 1);
      
      const wheel0Load = rearWheels[0].load / totalLoad;
      const wheel1Load = rearWheels[1].load / totalLoad;
      
      const baseTorque0 = this.outputTorque * wheel0Load;
      const baseTorque1 = this.outputTorque * wheel1Load;
      
      const transfer = (baseTorque1 - baseTorque0) * bias;
      
      rearWheels[0].applyDriveTorque(baseTorque0 + transfer);
      rearWheels[1].applyDriveTorque(baseTorque1 - transfer);
    } else if (this.differentialType === 'locked') {
      rearWheels.forEach(wheel => {
        wheel.applyDriveTorque(this.outputTorque / 2);
      });
    }
  }
  
  getWheelRpm(wheelIndex) {
    return this.vehicle.wheels[wheelIndex].angularVelocity * 30 / Math.PI;
  }
  
  getGearRatio() {
    return this.gearRatios[this.currentGear - 1];
  }
  
  getTotalRatio() {
    return this.getGearRatio() * this.finalDriveRatio;
  }
}