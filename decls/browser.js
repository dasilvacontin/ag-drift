declare function requestAnimationFrame (cb: function) : void

declare var navigator: {
  getGamepads(): Array<Gamepad>
}

declare class FPSMeter {
  tickStart(): void;
  tick(): void;
}

declare type Track = Array<Array<number>>
declare type GameEvent = { type: string, val: any }

declare type Socket = { id: string }
