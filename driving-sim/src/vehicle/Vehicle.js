import * as THREE from 'three';
import { Chassis } from './Chassis.js';
import { Wheel } from './Wheel.js';
import { Engine } from './Engine.js';
import { Drivetrain } from './Drivetrain.js';

export class Vehicle {
  constructor(renderer, world, settings) {
    this.renderer = renderer;
    this.world = world;
    this.settings = settings;
    
    this.chassis = null;
    this.wheels = [];
    this.engine = null;
    this.drivetrain = null;
    
    this.mesh = null;
    this.bodyMesh = null;
    
    this.position = new THREE.Vector3(0, 5, 0);
    this.velocity = new THREE.Vector3();
    this.angularVelocity = new THREE.Vector3();
    this.rotation = new THREE.Euler(0, 0, 0);
    this.quaternion = new THREE.Quaternion();
    
    this.mass = 1400;
    this.inertia = new THREE.Vector3(1200, 1800, 1000);
    this.wheelbase = 2.7;
    this.trackWidth = 1.6;
    this.cgHeight = 0.45;
    
    this.maxEngineTorque = 450;
    this.maxEngineRpm = 7500;
    this.idleRpm = 800;
    this.redlineRpm = 7800;
    
    this.gearRatios = [3.5, 2.2, 1.5, 1.1, 0.85, 0.7];
    this.finalDriveRatio = 3.73;
    this.currentGear = 1;
    this.clutchEngaged = true;
    this.shiftTime = 0;
    this.shiftDuration = 0.15;
    this.isShifting = false;
    
    this.throttle = 0;
    this.brake = 0;
    this.handbrake = false;
    this.steerInput = 0;
    this.steerAngle = 0;
    this.maxSteerAngle = 0.6;
    
    this.speed = 0;
    this.speedKmh = 0;
    this.engineRpm = 0;
    this.wheelRpm = 0;
    this.driftAngle = 0;
    this.isDrifting = false;
    this.driftScore = 0;
    this.totalDriftScore = 0;
    
    this.suspensionStiffness = 35000;
    this.suspensionDamping = 3500;
    this.suspensionTravel = 0.15;
    this.springRestLength = 0.35;
    
    this.tireFriction = 1.8;
    this.tireSlipAngle = 0;
    this.tireLoadSensitivity = 0.01;
    
    this.downforceCoefficient = 0.5;
    this.dragCoefficient = 0.32;
    this.frontalArea = 2.2;
    
    this.contactPatches = [];
    this.totalTractionForce = new THREE.Vector3();
    
    this.lastPosition = new THREE.Vector3();
    this.lastRotation = new THREE.Euler();
  }
  
  async init() {
    this.createChassis();
    this.createWheels();
    this.createEngine();
    this.createDrivetrain();
    this.createBody();
    this.reset();
  }
  
  createChassis() {
    this.chassis = new Chassis(this);
  }
  
  createWheels() {
    const positions = [
      new THREE.Vector3(-this.trackWidth / 2, 0, this.wheelbase / 2),
      new THREE.Vector3(this.trackWidth / 2, 0, this.wheelbase / 2),
      new THREE.Vector3(-this.trackWidth / 2, 0, -this.wheelbase / 2),
      new THREE.Vector3(this.trackWidth / 2, 0, -this.wheelbase / 2)
    ];
    
    for (let i = 0; i < 4; i++) {
      const wheel = new Wheel(this, i, positions[i]);
      this.wheels.push(wheel);
      this.contactPatches.push({
        point: new THREE.Vector3(),
        normal: new THREE.Vector3(0, 1, 0),
        force: new THREE.Vector3(),
        slip: 0,
        slipAngle: 0,
        load: 0,
        isGrounded: false
      });
    }
  }
  
  createEngine() {
    this.engine = new Engine(this);
  }
  
  createDrivetrain() {
    this.drivetrain = new Drivetrain(this);
  }
  
  createBody() {
    const bodyGeometry = new THREE.BufferGeometry();
    
    const length = 4.5;
    const width = 1.85;
    const height = 1.25;
    
    const positions = [];
    const normals = [];
    const uvs = [];
    const indices = [];
    
    const createBox = (x, y, z, w, h, d, uvScale = 1) => {
      const base = positions.length / 3;
      const hw = w / 2, hh = h / 2, hd = d / 2;
      
      positions.push(
        x - hw, y - hh, z - hd,
        x + hw, y - hh, z - hd,
        x + hw, y + hh, z - hd,
        x - hw, y + hh, z - hd,
        x - hw, y - hh, z + hd,
        x + hw, y - hh, z + hd,
        x + hw, y + hh, z + hd,
        x - hw, y + hh, z + hd
      );
      
      normals.push(
        0, 0, -1, 0, 0, -1, 0, 0, -1, 0, 0, -1,
        0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1,
        -1, 0, 0, -1, 0, 0, -1, 0, 0, -1, 0, 0,
        1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0,
        0, -1, 0, 0, -1, 0, 0, -1, 0, 0, -1, 0,
        0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0
      );
      
      for (let i = 0; i < 6; i++) {
        uvs.push(0, 0, 1 * uvScale, 0, 1 * uvScale, 1 * uvScale, 0, 1 * uvScale);
      }
      
      const faces = [
        [0, 1, 2, 0, 2, 3],
        [4, 5, 6, 4, 6, 7],
        [4, 0, 3, 4, 3, 7],
        [1, 5, 6, 1, 6, 2],
        [3, 2, 6, 3, 6, 7],
        [4, 7, 6, 4, 6, 5]
      ];
      
      faces.forEach(face => {
        indices.push(
          base + face[0], base + face[1], base + face[2],
          base + face[3], base + face[4], base + face[5]
        );
      });
    };
    
    createBox(0, height * 0.2, 0, width * 0.9, height * 0.6, length * 0.6);
    createBox(0, height * 0.7, -length * 0.1, width * 0.7, height * 0.4, length * 0.3);
    createBox(0, height * 0.5, length * 0.35, width * 0.8, height * 0.3, length * 0.2);
    
    bodyGeometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    bodyGeometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    bodyGeometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    bodyGeometry.setIndex(indices);
    bodyGeometry.computeVertexNormals();
    bodyGeometry.computeTangents();
    bodyGeometry.center();
    
    const bodyMaterial = this.renderer.pbrMaterials.createCarPaintMaterial(0xcc2200, 0.95, 0.15);
    
    this.bodyMesh = new THREE.Mesh(bodyGeometry, bodyMaterial);
    this.bodyMesh.castShadow = true;
    this.bodyMesh.receiveShadow = true;
    this.bodyMesh.name = 'CarBody';
    
    this.mesh = new THREE.Group();
    this.mesh.name = 'Vehicle';
    this.mesh.add(this.bodyMesh);
    
    this.wheels.forEach(wheel => {
      this.mesh.add(wheel.mesh);
    });
    
    this.world.scene.add(this.mesh);
  }
  
  reset() {
    const startPos = this.findRoadStart();
    this.position.copy(startPos);
    this.position.y = this.world.getHeightAt(startPos.x, startPos.z) + 1;
    this.velocity.set(0, 0, 0);
    this.angularVelocity.set(0, 0, 0);
    this.rotation.set(0, 0, 0);
    this.quaternion.identity();
    this.currentGear = 1;
    this.engineRpm = this.idleRpm;
    this.speed = 0;
    this.speedKmh = 0;
    this.driftScore = 0;
    this.totalDriftScore = 0;
    this.updateMeshTransform();
  }
  
  findRoadStart() {
    const road = this.world.roadNetwork.roads.find(r => r.isMain);
    if (road && road.points.length > 0) {
      return road.points[0].clone();
    }
    return new THREE.Vector3(0, 0, 0);
  }
  
  update(dt) {
    if (this.isShifting) {
      this.shiftTime += dt;
      if (this.shiftTime >= this.shiftDuration) {
        this.isShifting = false;
        this.clutchEngaged = true;
      }
      return;
    }
    
    this.lastPosition.copy(this.position);
    this.lastRotation.copy(this.rotation);
    
    this.processInput();
    this.updatePhysics(dt);
    this.updateWheels(dt);
    this.updateEngine(dt);
    this.updateDrivetrain(dt);
    this.updateAerodynamics(dt);
    this.updateDrift(dt);
    this.updateMeshTransform();
    this.updateContactPatches();
  }
  
  processInput() {
    const input = this.world.simulator?.input?.getState();
    if (!input) return;
    
    this.throttle = input.throttle;
    this.brake = input.brake;
    this.handbrake = input.handbrake;
    this.steerInput = input.steer;
  }
  
  updatePhysics(dt) {
    const gravity = new THREE.Vector3(0, this.settings.physics.gravity, 0);
    const forces = new THREE.Vector3();
    const torque = new THREE.Vector3();
    
    forces.add(gravity.clone().multiplyScalar(this.mass));
    
    this.wheels.forEach((wheel, i) => {
      const contact = this.contactPatches[i];
      forces.add(contact.force);
      
      const r = wheel.localPosition.clone().applyQuaternion(this.quaternion);
      torque.add(new THREE.Vector3().crossVectors(r, contact.force));
    });
    
    const dragForce = this.velocity.clone().multiplyScalar(-this.dragCoefficient * this.frontalArea * 0.5 * 1.225 * this.velocity.length());
    forces.add(dragForce);
    
    const downforce = new THREE.Vector3(0, -this.downforceCoefficient * 0.5 * 1.225 * this.velocity.lengthSq(), 0);
    forces.add(downforce);
    
    const accel = forces.divideScalar(this.mass);
    this.velocity.addScaledVector(accel, dt);
    
    this.position.addScaledVector(this.velocity, dt);
    
    const angAccel = new THREE.Vector3(
      torque.x / this.inertia.x,
      torque.y / this.inertia.y,
      torque.z / this.inertia.z
    );
    this.angularVelocity.addScaledVector(angAccel, dt);
    
    const angularDamping = 0.98;
    this.angularVelocity.multiplyScalar(angularDamping);
    
    const deltaRotation = new THREE.Euler(
      this.angularVelocity.x * dt,
      this.angularVelocity.y * dt,
      this.angularVelocity.z * dt
    );
    
    this.quaternion.multiply(new THREE.Quaternion().setFromEuler(deltaRotation));
    this.quaternion.normalize();
    this.rotation.setFromQuaternion(this.quaternion);
    
    this.speed = this.velocity.length();
    this.speedKmh = this.speed * 3.6;
  }
  
  updateWheels(dt) {
    this.wheels.forEach((wheel, i) => {
      wheel.update(dt, this.contactPatches[i]);
    });
  }
  
  updateEngine(dt) {
    this.engine.update(dt);
    this.engineRpm = this.engine.currentRpm;
  }
  
  updateDrivetrain(dt) {
    this.drivetrain.update(dt);
  }
  
  updateAerodynamics(dt) {
    // Already handled in physics
  }
  
  updateDrift(dt) {
    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(this.quaternion);
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(this.quaternion);
    const velDir = this.velocity.clone().normalize();
    
    const forwardVel = this.velocity.dot(forward);
    const lateralVel = this.velocity.dot(right);
    
    if (Math.abs(forwardVel) > 2) {
      this.driftAngle = Math.atan2(lateralVel, Math.abs(forwardVel)) * THREE.MathUtils.RAD2DEG;
    } else {
      this.driftAngle = 0;
    }
    
    this.isDrifting = Math.abs(this.driftAngle) > 15 && this.speed > 20;
    
    if (this.isDrifting) {
      this.driftScore += Math.abs(this.driftAngle) * dt * (this.speed / 50);
      this.totalDriftScore += Math.abs(this.driftAngle) * dt * (this.speed / 50);
    } else {
      this.driftScore *= 0.98;
    }
  }
  
  updateContactPatches() {
    this.wheels.forEach((wheel, i) => {
      const contact = this.contactPatches[i];
      contact.point.copy(wheel.contactPoint);
      contact.normal.copy(wheel.contactNormal);
      contact.force.copy(wheel.suspensionForce).add(wheel.tractionForce);
      contact.slip = wheel.slipRatio;
      contact.slipAngle = wheel.slipAngle;
      contact.load = wheel.load;
      contact.isGrounded = wheel.isGrounded;
    });
  }
  
  updateMeshTransform() {
    if (!this.mesh) return;
    
    this.mesh.position.copy(this.position);
    this.mesh.quaternion.copy(this.quaternion);
    
    this.bodyMesh.position.set(0, this.cgHeight, 0);
  }
  
  shiftUp() {
    if (this.currentGear < this.gearRatios.length && !this.isShifting && this.engineRpm > 3000) {
      this.currentGear++;
      this.isShifting = true;
      this.shiftTime = 0;
      this.clutchEngaged = false;
      this.engineRpm *= this.gearRatios[this.currentGear - 1] / this.gearRatios[this.currentGear - 2];
    }
  }
  
  shiftDown() {
    if (this.currentGear > 1 && !this.isShifting) {
      this.currentGear--;
      this.isShifting = true;
      this.shiftTime = 0;
      this.clutchEngaged = false;
      this.engineRpm *= this.gearRatios[this.currentGear - 1] / this.gearRatios[this.currentGear];
    }
  }
  
  setGear(gear) {
    gear = THREE.MathUtils.clamp(gear, 1, this.gearRatios.length);
    if (gear !== this.currentGear && !this.isShifting) {
      this.currentGear = gear;
      this.isShifting = true;
      this.shiftTime = 0;
      this.clutchEngaged = false;
    }
  }
  
  getGear() {
    return this.currentGear;
  }
  
  getForwardVector() {
    return new THREE.Vector3(0, 0, -1).applyQuaternion(this.quaternion);
  }
  
  getRightVector() {
    return new THREE.Vector3(1, 0, 0).applyQuaternion(this.quaternion);
  }
  
  getUpVector() {
    return new THREE.Vector3(0, 1, 0).applyQuaternion(this.quaternion);
  }
  
  dispose() {
    this.wheels.forEach(w => w.dispose());
    this.bodyMesh?.geometry.dispose();
    this.bodyMesh?.material.dispose();
    this.mesh?.clear();
    this.world.scene.remove(this.mesh);
  }
}