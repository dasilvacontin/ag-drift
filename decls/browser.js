declare function requestAnimationFrame (cb: function) : void

declare var navigator: {
  getGamepads(): Array<Gamepad>
}

declare class FPSMeter {
  tickStart(): void;
  tick(): void;
}
