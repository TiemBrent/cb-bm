export class DayNightCycle {
  constructor(world) {
    this.world = world;
    this.timeOfDay = 0.5;
    this.dayDuration = 24 * 60 * 60; // 24 hours in seconds
    this.currentSpeed = 1.0;
    this.isPaused = false;
  }
  
  update(dt) {
    if (this.isPaused) return;
    
    const delta = dt * this.currentSpeed / this.dayDuration;
    this.timeOfDay = (this.timeOfDay + delta) % 1.0;
    this.world.timeOfDay = this.timeOfDay;
  }
  
  setTimeOfDay(time) {
    this.timeOfDay = THREE.MathUtils.clamp(time, 0, 1);
    this.world.timeOfDay = this.timeOfDay;
  }
  
  setSpeed(speed) {
    this.currentSpeed = speed;
  }
  
  pause() {
    this.isPaused = true;
  }
  
  resume() {
    this.isPaused = false;
  }
  
  getTimeString() {
    const hours = Math.floor(this.timeOfDay * 24);
    const minutes = Math.floor((this.timeOfDay * 24 * 60) % 60);
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
  }
  
  getSunAngle() {
    return this.timeOfDay * Math.PI * 2 - Math.PI / 2;
  }
  
  isDay() {
    return this.timeOfDay > 0.25 && this.timeOfDay < 0.75;
  }
  
  isNight() {
    return !this.isDay();
  }
}