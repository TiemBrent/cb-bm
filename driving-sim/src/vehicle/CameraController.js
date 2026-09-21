import * as THREE from 'three';

export class CameraController {
  constructor(vehicle, camera, settings) {
    this.vehicle = vehicle;
    this.camera = camera;
    this.settings = settings;
    
    this.mode = 'chase';
    this.modes = ['chase', 'hood', 'cockpit', 'top'];
    this.modeIndex = 0;
    
    this.chaseDistance = 8;
    this.chaseHeight = 3;
    this.chaseOffset = new THREE.Vector3(0, 0, 0);
    
    this.springConstant = 150;
    this.damperConstant = 25;
    this.targetPosition = new THREE.Vector3();
    this.currentPosition = new THREE.Vector3();
    this.velocity = new THREE.Vector3();
    
    this.targetRotation = new THREE.Quaternion();
    this.currentRotation = new THREE.Quaternion();
    this.rotationVelocity = new THREE.Vector3();
    
    this.baseFov = 70;
    this.currentFov = this.baseFov;
    this.targetFov = this.baseFov;
    
    this.leanAngle = 0;
    this.targetLeanAngle = 0;
    
    this.lookAheadDistance = 15;
    this.targetLookAt = new THREE.Vector3();
    this.currentLookAt = new THREE.Vector3();
    
    this.shakeIntensity = 0;
    this.shakeDecay = 0.9;
    this.shakeOffset = new THREE.Vector3();
    this.shakeRotation = new THREE.Euler();
    
    this.cockpitOffset = new THREE.Vector3(0, 1.1, 0.3);
    this.hoodOffset = new THREE.Vector3(0, 1.5, -2.5);
    this.topOffset = new THREE.Vector3(0, 30, 0);
    
    this.lastVehiclePosition = new THREE.Vector3();
    this.lastVehicleRotation = new THREE.Euler();
  }
  
  update(dt) {
    this.updateShake(dt);
    
    switch (this.mode) {
      case 'chase':
        this.updateChaseCamera(dt);
        break;
      case 'hood':
        this.updateHoodCamera(dt);
        break;
      case 'cockpit':
        this.updateCockpitCamera(dt);
        break;
      case 'top':
        this.updateTopCamera(dt);
        break;
    }
    
    this.applyShake();
    this.camera.updateProjectionMatrix();
    
    this.lastVehiclePosition.copy(this.vehicle.position);
    this.lastVehicleRotation.copy(this.vehicle.rotation);
  }
  
  updateChaseCamera(dt) {
    const vehicleForward = this.vehicle.getForwardVector();
    const vehicleRight = this.vehicle.getRightVector();
    const vehicleUp = this.vehicle.getUpVector();
    
    const speedFactor = Math.min(this.vehicle.speed / 80, 1);
    
    this.targetFov = THREE.MathUtils.lerp(this.baseFov, this.baseFov + 15, speedFactor);
    this.currentFov = THREE.MathUtils.lerp(this.currentFov, this.targetFov, dt * 5);
    this.camera.fov = this.currentFov;
    
    this.lookAheadDistance = THREE.MathUtils.lerp(15, 40, speedFactor);
    this.targetLookAt.copy(this.vehicle.position).add(vehicleForward.clone().multiplyScalar(this.lookAheadDistance));
    this.currentLookAt.lerp(this.targetLookAt, dt * 3);
    
    this.targetLeanAngle = -this.vehicle.driftAngle * 0.02;
    this.leanAngle = THREE.MathUtils.lerp(this.leanAngle, this.targetLeanAngle, dt * 8);
    
    const chaseOffset = vehicleForward.clone().multiplyScalar(-this.chaseDistance)
      .add(vehicleUp.clone().multiplyScalar(this.chaseHeight))
      .add(vehicleRight.clone().multiplyScalar(this.leanAngle * 2));
    
    this.targetPosition.copy(this.vehicle.position).add(chaseOffset);
    
    const terrainHeight = this.vehicle.world.getHeightAt(this.targetPosition.x, this.targetPosition.z);
    if (this.targetPosition.y < terrainHeight + 2) {
      this.targetPosition.y = terrainHeight + 2;
    }
    
    const springForce = this.targetPosition.clone().sub(this.currentPosition).multiplyScalar(this.springConstant);
    const damperForce = this.velocity.clone().multiplyScalar(-this.damperConstant);
    const acceleration = springForce.add(damperForce).divideScalar(1);
    
    this.velocity.addScaledVector(acceleration, dt);
    this.currentPosition.addScaledVector(this.velocity, dt);
    
    this.camera.position.copy(this.currentPosition).add(this.shakeOffset);
    
    const lookDir = this.currentLookAt.clone().sub(this.camera.position).normalize();
    const up = vehicleUp.clone().applyAxisAngle(vehicleForward, this.leanAngle);
    
    this.targetRotation.setFromRotationMatrix(
      new THREE.Matrix4().lookAt(this.camera.position, this.currentLookAt, up)
    );
    
    const rotationSlerp = 1 - Math.exp(-dt * 10);
    this.currentRotation.slerp(this.targetRotation, rotationSlerp);
    this.camera.quaternion.copy(this.currentRotation);
  }
  
  updateHoodCamera(dt) {
    const vehicleForward = this.vehicle.getForwardVector();
    const vehicleUp = this.vehicle.getUpVector();
    
    const offset = this.hoodOffset.clone().applyQuaternion(this.vehicle.quaternion);
    this.targetPosition.copy(this.vehicle.position).add(offset);
    
    this.currentPosition.lerp(this.targetPosition, dt * 20);
    
    this.camera.position.copy(this.currentPosition).add(this.shakeOffset);
    
    this.targetLookAt.copy(this.vehicle.position).add(vehicleForward.clone().multiplyScalar(30));
    this.camera.lookAt(this.targetLookAt);
    
    this.camera.fov = THREE.MathUtils.lerp(this.camera.fov, this.baseFov + 5, dt * 3);
  }
  
  updateCockpitCamera(dt) {
    const offset = this.cockpitOffset.clone().applyQuaternion(this.vehicle.quaternion);
    this.targetPosition.copy(this.vehicle.position).add(offset);
    
    this.currentPosition.lerp(this.targetPosition, dt * 30);
    
    this.camera.position.copy(this.currentPosition).add(this.shakeOffset);
    this.camera.quaternion.copy(this.vehicle.quaternion).multiply(new THREE.Quaternion().setFromEuler(this.shakeRotation));
    
    this.camera.fov = THREE.MathUtils.lerp(this.camera.fov, this.baseFov - 5, dt * 3);
  }
  
  updateTopCamera(dt) {
    const offset = this.topOffset.clone();
    this.targetPosition.copy(this.vehicle.position).add(offset);
    
    this.currentPosition.lerp(this.targetPosition, dt * 5);
    
    this.camera.position.copy(this.currentPosition);
    this.camera.lookAt(this.vehicle.position);
    this.camera.up.set(0, 0, -1);
    
    this.camera.fov = THREE.MathUtils.lerp(this.camera.fov, this.baseFov, dt * 3);
  }
  
  updateShake(dt) {
    const speed = this.vehicle.speed;
    const drift = Math.abs(this.vehicle.driftAngle);
    
    const baseShake = speed * 0.0005 + drift * 0.002;
    const impactShake = this.shakeIntensity;
    
    this.shakeIntensity *= this.shakeDecay;
    
    if (baseShake > 0.001 || impactShake > 0.001) {
      this.shakeOffset.x = (Math.random() - 0.5) * (baseShake + impactShake) * 2;
      this.shakeOffset.y = (Math.random() - 0.5) * (baseShake + impactShake) * 1;
      this.shakeOffset.z = (Math.random() - 0.5) * (baseShake + impactShake) * 0.5;
      
      this.shakeRotation.x = (Math.random() - 0.5) * (baseShake + impactShake) * 0.05;
      this.shakeRotation.y = (Math.random() - 0.5) * (baseShake + impactShake) * 0.02;
      this.shakeRotation.z = (Math.random() - 0.5) * (baseShake + impactShake) * 0.03;
    } else {
      this.shakeOffset.set(0, 0, 0);
      this.shakeRotation.set(0, 0, 0);
    }
  }
  
  applyShake() {
    // Already applied in position/rotation updates
  }
  
  addShake(intensity) {
    this.shakeIntensity = Math.max(this.shakeIntensity, intensity);
  }
  
  cycleMode() {
    this.modeIndex = (this.modeIndex + 1) % this.modes.length;
    this.mode = this.modes[this.modeIndex];
    
    if (this.mode === 'chase') {
      this.currentPosition.copy(this.camera.position);
      this.velocity.set(0, 0, 0);
    }
  }
  
  setMode(mode) {
    const index = this.modes.indexOf(mode);
    if (index !== -1) {
      this.mode = mode;
      this.modeIndex = index;
    }
  }
  
  getMode() {
    return this.mode;
  }
}