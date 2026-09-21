export class InputManager {
  constructor(simulator) {
    this.simulator = simulator;
    this.keys = new Map();
    this.keyMap = {
      'KeyW': 'throttle',
      'KeyS': 'brake',
      'KeyA': 'steerLeft',
      'KeyD': 'steerRight',
      'Space': 'handbrake',
      'ShiftLeft': 'boost',
      'KeyC': 'cameraCycle',
      'KeyP': 'pause',
      'Escape': 'menu',
      'KeyR': 'reset',
      'Digit1': 'gear1',
      'Digit2': 'gear2',
      'Digit3': 'gear3',
      'Digit4': 'gear4',
      'Digit5': 'gear5',
      'Digit6': 'gear6'
    };
    
    this.gamepad = null;
    this.gamepadIndex = -1;
    
    this.state = {
      throttle: 0,
      brake: 0,
      steer: 0,
      handbrake: false,
      boost: false,
      pause: false,
      menu: false,
      reset: false,
      gearUp: false,
      gearDown: false,
      gearDirect: null
    };
    
    this.prevState = { ...this.state };
    
    this.setupListeners();
    this.startGamepadPolling();
  }
  
  setupListeners() {
    window.addEventListener('keydown', (e) => this.onKeyDown(e));
    window.addEventListener('keyup', (e) => this.onKeyUp(e));
    window.addEventListener('blur', () => this.resetKeys());
    window.addEventListener('gamepadconnected', (e) => this.onGamepadConnected(e));
    window.addEventListener('gamepaddisconnected', (e) => this.onGamepadDisconnected(e));
  }
  
  onKeyDown(e) {
    if (e.repeat) return;
    this.keys.set(e.code, true);
    this.updateState();
    
    if (e.code === 'Escape') {
      e.preventDefault();
      this.simulator.ui.toggleMenu();
    }
  }
  
  onKeyUp(e) {
    this.keys.delete(e.code);
    this.updateState();
  }
  
  resetKeys() {
    this.keys.clear();
    this.updateState();
  }
  
  updateState() {
    this.prevState = { ...this.state };
    
    this.state.throttle = this.keys.has('KeyW') ? 1 : 0;
    this.state.brake = this.keys.has('KeyS') ? 1 : 0;
    
    let steer = 0;
    if (this.keys.has('KeyA')) steer -= 1;
    if (this.keys.has('KeyD')) steer += 1;
    this.state.steer = steer;
    
    this.state.handbrake = this.keys.has('Space');
    this.state.boost = this.keys.has('ShiftLeft');
    this.state.pause = this.keys.has('KeyP');
    this.state.menu = this.keys.has('Escape');
    this.state.reset = this.keys.has('KeyR');
    
    if (this.keys.has('Digit1')) this.state.gearDirect = 1;
    if (this.keys.has('Digit2')) this.state.gearDirect = 2;
    if (this.keys.has('Digit3')) this.state.gearDirect = 3;
    if (this.keys.has('Digit4')) this.state.gearDirect = 4;
    if (this.keys.has('Digit5')) this.state.gearDirect = 5;
    if (this.keys.has('Digit6')) this.state.gearDirect = 6;
  }
  
  onGamepadConnected(e) {
    this.gamepad = e.gamepad;
    this.gamepadIndex = e.gamepad.index;
    console.log(`Gamepad connected: ${e.gamepad.id}`);
  }
  
  onGamepadDisconnected(e) {
    if (e.gamepad.index === this.gamepadIndex) {
      this.gamepad = null;
      this.gamepadIndex = -1;
    }
  }
  
  startGamepadPolling() {
    setInterval(() => {
      if (this.gamepadIndex >= 0) {
        const gp = navigator.getGamepads()[this.gamepadIndex];
        if (gp) this.gamepad = gp;
      }
    }, 100);
  }
  
  update(dt) {
    this.prevState = { ...this.state };
    this.updateState();
    
    if (this.gamepad) {
      const deadzone = this.simulator.settings.controls.gamepadDeadzone;
      
      const lt = this.gamepad.buttons[6]?.value || 0;
      const rt = this.gamepad.buttons[7]?.value || 0;
      const lsx = this.gamepad.axes[0] || 0;
      const lsy = this.gamepad.axes[1] || 0;
      
      this.state.throttle = rt > deadzone ? rt : 0;
      this.state.brake = lt > deadzone ? lt : 0;
      this.state.steer = Math.abs(lsx) > deadzone ? lsx : 0;
      this.state.handbrake = this.gamepad.buttons[1]?.pressed || false;
      this.state.boost = this.gamepad.buttons[5]?.pressed || false;
      
      if (this.gamepad.buttons[12]?.pressed) this.state.gearUp = true;
      if (this.gamepad.buttons[13]?.pressed) this.state.gearDown = true;
      if (this.gamepad.buttons[9]?.pressed) this.simulator.togglePause();
      if (this.gamepad.buttons[8]?.pressed) this.simulator.ui.toggleMenu();
    }
    
    if (this.state.pause && !this.prevState.pause) {
      this.simulator.togglePause();
    }
    if (this.state.reset && !this.prevState.reset) {
      this.simulator.vehicle.reset();
    }
    if (this.state.gearUp && !this.prevState.gearUp) {
      this.simulator.vehicle.shiftUp();
    }
    if (this.state.gearDown && !this.prevState.gearDown) {
      this.simulator.vehicle.shiftDown();
    }
    if (this.state.gearDirect !== null) {
      this.simulator.vehicle.setGear(this.state.gearDirect);
      this.state.gearDirect = null;
    }
  }
  
  getState() {
    return { ...this.state };
  }
  
  getPrevState() {
    return { ...this.prevState };
  }
  
  isKeyPressed(code) {
    return this.keys.has(code);
  }
}