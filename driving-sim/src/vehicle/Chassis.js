import * as THREE from 'three';

export class Chassis {
  constructor(vehicle) {
    this.vehicle = vehicle;
    this.localInertia = new THREE.Vector3(1200, 1800, 1000);
    this.worldInertia = new THREE.Matrix3();
  }
  
  updateWorldInertia() {
    const q = this.vehicle.quaternion;
    const qx = q.x, qy = q.y, qz = q.z, qw = q.w;
    
    const xx = qx * qx, yy = qy * qy, zz = qz * qz;
    const xy = qx * qy, xz = qx * qz, yz = qy * qz;
    const wx = qw * qx, wy = qw * qy, wz = qw * qz;
    
    const ix = this.localInertia.x;
    const iy = this.localInertia.y;
    const iz = this.localInertia.z;
    
    this.worldInertia.set(
      ix * (1 - 2 * (yy + zz)) + iy * (2 * xy + 2 * wz) + iz * (2 * xz - 2 * wy),
      ix * (2 * xy - 2 * wz) + iy * (1 - 2 * (xx + zz)) + iz * (2 * yz + 2 * wx),
      ix * (2 * xz + 2 * wy) + iy * (2 * yz - 2 * wx) + iz * (1 - 2 * (xx + yy)),
      
      ix * (2 * xy + 2 * wz) + iy * (1 - 2 * (xx + zz)) + iz * (2 * yz - 2 * wx),
      ix * (2 * xy - 2 * wz) + iy * (1 - 2 * (xx + zz)) + iz * (2 * yz + 2 * wx),
      ix * (2 * xz - 2 * wy) + iy * (2 * yz + 2 * wx) + iz * (1 - 2 * (xx + yy)),
      
      ix * (2 * xz - 2 * wy) + iy * (2 * yz + 2 * wx) + iz * (1 - 2 * (xx + yy)),
      ix * (2 * xz + 2 * wy) + iy * (2 * yz - 2 * wx) + iz * (1 - 2 * (xx + zz)),
      ix * (1 - 2 * (yy + zz)) + iy * (2 * xy - 2 * wz) + iz * (1 - 2 * (xx + yy))
    );
  }
}