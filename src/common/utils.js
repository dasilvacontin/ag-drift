export function log () {
  console.log.apply(console, arguments)
}

export function repeat (char, times) {
  if (char === ' ') char = '&nbsp;'
  return Array(times + 1).join(char)
}

export function timeToString (time) {
  let minutes = Math.floor(time / 60)
  minutes = (minutes > 10 ? '+' : minutes)
  let seconds = time % 60
  let decimals = Math.floor((seconds * 1000) % 1000)
  seconds = Math.floor(seconds)
  seconds = (seconds < 10 ? '0' : '') + seconds
  decimals = String(decimals)
  decimals = `${repeat('0', 3 - decimals.length)}${decimals}`
  return `${minutes}:${seconds}.${decimals}`
}
