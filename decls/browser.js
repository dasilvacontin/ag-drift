declare function requestAnimationFrame (cb: function) : void

declare var navigator: {
  getGamepads(): Array<Gamepad>
}

declare class FPSMeter {
  tickStart(): void;
  tick(): void;
}

declare type Track = {
  background: string,
  foreground: string,
  bgmusic: String,
  grid: Array<Array<number>>
}
declare type GameEvent = { type: string, val: any }
