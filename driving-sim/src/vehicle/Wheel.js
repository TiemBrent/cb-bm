import * as THREE from 'three';

export class Wheel {
  constructor(vehicle, index, localPosition) {
    this.vehicle = vehicle;
    this.index = index;
    this.localPosition = localPosition.clone();
    
    this.radius = 0.33;
    this.width = 0.22;
    this.mass = 25;
    this.inertia = 0.5 * this.mass * this.radius * this.radius;
    
    this.isFront = index < 2;
    this.isLeft = index % 2 === 0;
    
    this.suspensionLength = 0;
    this.suspensionVelocity = 0;
    this.springForce = 0;
    this.damperForce = 0;
    this.suspensionForce = new THREE.Vector3();
    this.tractionForce = new THREE.Vector3();
    
    this.rotation = 0;
    this.angularVelocity = 0;
    this.steerAngle = 0;
    this.targetSteerAngle = 0;
    
    this.slipRatio = 0;
    this.slipAngle = 0;
    this.load = 0;
    this.contactPoint = new THREE.Vector3();
    this.contactNormal = new THREE.Vector3(0, 1, 0);
    this.isGrounded = false;
    
    this.brakeForce = 0;
    this.driveTorque = 0;
    
    this.mesh = null;
    this.createMesh();
  }
  
  createMesh() {
    const wheelGeometry = new THREE.CylinderGeometry(this.radius, this.radius, this.width, 24);
    wheelGeometry.rotateZ(Math.PI / 2);
    
    const tireMaterial = this.vehicle.renderer.pbrMaterials.createMaterial({
      name: 'tire',
      baseColor: new THREE.Color(0.05, 0.05, 0.05),
      metallic: 0.0,
      roughness: 0.9,
      ao: 0.5
    });
    
    const rimGeometry = new THREE.CylinderGeometry(this.radius * 0.6, this.radius * 0.6, this.width * 1.1, 16);
    rimGeometry.rotateZ(Math.PI / 2);
    
    const rimMaterial = this.vehicle.renderer.pbrMaterials.createMaterial({
      name: 'rim',
      baseColor: new THREE.Color(0.2, 0.2, 0.22),
      metallic: 0.85,
      roughness: 0.2
    });
    
    const tireMesh = new THREE.Mesh(wheelGeometry, tireMaterial);
    const rimMesh = new THREE.Mesh(rimGeometry, rimMaterial);
    
    tireMesh.castShadow = true;
    tireMesh.receiveShadow = true;
    rimMesh.castShadow = true;
    rimMesh.receiveShadow = true;
    
    this.mesh = new THREE.Group();
    this.mesh.add(tireMesh);
    this.mesh.add(rimMesh);
    this.mesh.position.copy(this.localPosition);
  }
  
  update(dt, contactPatch) {
    this.updateSteering(dt);
    this.updateSuspension(dt, contactPatch);
    this.updateTirePhysics(dt, contactPatch);
    this.updateRotation(dt);
    this.updateMesh();
  }
  
  updateSteering(dt) {
    if (this.isFront) {
      this.targetSteerAngle = this.vehicle.steerInput * this.vehicle.maxSteerAngle;
      this.steerAngle = THREE.MathUtils.lerp(this.steerAngle, this.targetSteerAngle, dt * 10);
    } else {
      this.steerAngle = 0;
    }
  }
  
  updateSuspension(dt, contactPatch) {
    const worldPos = this.localPosition.clone().applyQuaternion(this.vehicle.quaternion).add(this.vehicle.position);
    const down = new THREE.Vector3(0, -1, 0).applyQuaternion(this.vehicle.quaternion);
    
    const rayLength = this.radius + this.vehicle.suspensionTravel + 0.1;
    const rayOrigin = worldPos.clone().add(down.clone().multiplyScalar(0.1));
    
    const terrainHeight = this.vehicle.world.getHeightAt(rayOrigin.x, rayOrigin.z);
    const terrainNormal = this.vehicle.world.getNormalAt(rayOrigin.x, rayOrigin.z);
    
    const distance = rayOrigin.y - terrainHeight;
    
    if (distance < this.radius + this.vehicle.suspensionTravel) {
      this.isGrounded = true;
      this.suspensionLength = Math.max(0, distance - this.radius);
      this.suspensionLength = Math.min(this.suspensionLength, this.vehicle.suspensionTravel);
      
      const compression = 1 - this.suspensionLength / this.vehicle.suspensionTravel;
      this.springForce = compression * this.vehicle.suspensionStiffness;
      
      this.suspensionVelocity = (this.suspensionLength - contactPatch.point.distanceTo(worldPos)) / dt;
      this.damperForce = -this.suspensionVelocity * this.vehicle.suspensionDamping;
      
      const totalForce = this.springForce + this.damperForce;
      this.suspensionForce.copy(down).multiplyScalar(totalForce);
      
      this.contactPoint.set(rayOrigin.x, terrainHeight, rayOrigin.z);
      this.contactNormal.copy(terrainNormal);
      this.load = totalForce;
    } else {
      this.isGrounded = false;
      this.suspensionLength = this.vehicle.suspensionTravel;
      this.springForce = 0;
      this.damperForce = 0;
      this.suspensionForce.set(0, 0, 0);
      this.load = 0;
      
      this.contactPoint.copy(worldPos.clone().add(down.clone().multiplyScalar(this.radius + this.vehicle.suspensionTravel)));
      this.contactNormal.set(0, 1, 0);
    }
    
    contactPatch.point.copy(this.contactPoint);
    contactPatch.normal.copy(this.contactNormal);
    contactPatch.force.copy(this.suspensionForce);
    contactPatch.load = this.load;
    contactPatch.isGrounded = this.isGrounded;
  }
  
  updateTirePhysics(dt, contactPatch) {
    if (!this.isGrounded) {
      this.slipRatio = 0;
      this.slipAngle = 0;
      this.tractionForce.set(0, 0, 0);
      contactPatch.slip = 0;
      contactPatch.slipAngle = 0;
      return;
    }
    
    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(this.vehicle.quaternion);
    if (this.isFront && Math.abs(this.steerAngle) > 0.01) {
      const steerQuat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), this.steerAngle);
      forward.applyQuaternion(steerQuat);
    }
    forward.normalize();
    
    const right = new THREE.Vector3().crossVectors(this.contactNormal, forward).normalize();
    
    const wheelVel = this.vehicle.velocity.clone();
    const angularVel = this.vehicle.angularVelocity.clone();
    const r = this.contactPoint.clone().sub(this.vehicle.position);
    const tangentialVel = new THREE.Vector3().crossVectors(angularVel, r);
    const contactVel = wheelVel.add(tangentialVel);
    
    const forwardVel = contactVel.dot(forward);
    const lateralVel = contactVel.dot(right);
    
    const wheelSpeed = this.angularVelocity * this.radius;
    this.slipRatio = (wheelSpeed - forwardVel) / Math.max(Math.abs(wheelSpeed), Math.abs(forwardVel), 1);
    
    this.slipAngle = Math.atan2(lateralVel, Math.abs(forwardVel));
    
    const friction = this.getTireFriction(Math.abs(this.slipAngle), this.slipRatio, this.load);
    
    const maxLongForce = friction * this.load;
    const maxLatForce = friction * this.load * 1.2;
    
    let longForce = -this.slipRatio * maxLongForce * 10;
    longForce = THREE.MathUtils.clamp(longForce, -maxLongForce, maxLongForce);
    
    if (this.brakeForce > 0) {
      longForce -= this.brakeForce * Math.sign(forwardVel);
    }
    
    longForce += this.driveTorque / this.radius;
    
    let latForce = -this.slipAngle * maxLatForce * 8;
    latForce = THREE.MathUtils.clamp(latForce, -maxLatForce, maxLatForce);
    
    this.tractionForce.copy(forward).multiplyScalar(longForce).add(right.clone().multiplyScalar(latForce));
    
    contactPatch.slip = this.slipRatio;
    contactPatch.slipAngle = this.slipAngle;
    contactPatch.force.add(this.tractionForce);
  }
  
  getTireFriction(slipAngle, slipRatio, load) {
    const baseFriction = this.vehicle.tireFriction;
    const loadFactor = 1 - this.vehicle.tireLoadSensitivity * (load / 4000);
    const slipFactor = Math.exp(-slipAngle * 5) * Math.exp(-Math.abs(slipRatio) * 3);
    return baseFriction * loadFactor * slipFactor + 0.3;
  }
  
  updateRotation(dt) {
    if (this.isGrounded) {
      const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(this.vehicle.quaternion);
      const wheelVel = this.vehicle.velocity.dot(forward);
      this.angularVelocity = wheelVel / this.radius + this.slipRatio * Math.abs(wheelVel) / this.radius;
    } else {
      const drag = 0.99;
      this.angularVelocity *= drag;
      this.angularVelocity += this.driveTorque / this.inertia * dt;
      this.angularVelocity -= this.brakeForce / this.inertia * dt * Math.sign(this.angularVelocity);
    }
    
    this.rotation += this.angularVelocity * dt;
  }
  
  updateMesh() {
    if (!this.mesh) return;
    
    const worldPos = this.contactPoint.clone().add(this.contactNormal.clone().multiplyScalar(this.radius));
    this.mesh.position.copy(worldPos);
    
    const forward = new THREE.Vector3(0, 0, -1);
    const right = new THREE.Vector3(1, 0, 0);
    const up = new THREE.Vector3(0, 1, 0);
    
    const steerQuat = new THREE.Quaternion().setFromAxisAngle(up, this.steerAngle);
    forward.applyQuaternion(steerQuat);
    
    const rotQuat = new THREE.Quaternion().setFromAxisAngle(right, this.rotation);
    const finalQuat = new THREE.Quaternion().multiplyQuaternions(this.vehicle.quaternion, steerQuat).multiply(rotQuat);
    
    this.mesh.quaternion.copy(finalQuat);
  }
  
  applyBrake(force) {
    this.brakeForce = force;
  }
  
  applyDriveTorque(torque) {
    this.driveTorque = torque;
  }
  
  dispose() {
    this.mesh?.children.forEach(child => {
      child.geometry?.dispose();
      child.material?.dispose();
    });
  }
}