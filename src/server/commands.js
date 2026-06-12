// @flow
const C = require('../common/constants.js')

const HOST_COMMANDS = [
  '/restart',
  '/gamemode cup',
  '/gamemode timeattack',
  '/track',
  '/bots on',
  '/bots off',
  '/boost on',
  '/boost off'
]

function levenshtein (a: string, b: string): number {
  const m = a.length
  const n = b.length
  const dp = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
  )
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + cost
      )
    }
  }
  return dp[m][n]
}

function commandDistance (input: string, known: string): number {
  const distances = [levenshtein(input, known)]
  const tail = known.includes(' ') ? known.slice(known.indexOf(' ') + 1) : known.slice(1)
  if (tail) {
    distances.push(levenshtein(input.slice(1), tail))
    distances.push(levenshtein(input, `/${tail}`))
  }
  return Math.min(...distances)
}

function closestCommand (input: string): ?string {
  let best = null
  let bestDistance = Infinity
  for (const known of HOST_COMMANDS) {
    const distance = commandDistance(input, known)
    if (distance < bestDistance) {
      bestDistance = distance
      best = known
    }
  }
  const threshold = Math.max(3, Math.floor(input.length * 0.45))
  if (best != null && bestDistance <= threshold) return best
  return null
}

function formatUnknownCommandMessage (input: string): string {
  const suggestion = closestCommand(input)
  if (suggestion) return `Unrecognized command. Did you mean ${suggestion}?`
  return 'Unrecognized command.'
}

/**
 * Pure command parser / dispatcher. All side-effects are injected so this
 * module can be exercised in unit tests without booting the HTTP server.
 *
 * @param {string} text - Raw chat text starting with '/'
 * @param {Object} ctx  - Injected context
 * @param {string}   ctx.sessionMode
 * @param {Array}    ctx.tracks
 * @param {boolean}  ctx.botsEnabled
 * @param {Object}   ctx.pendingTimeAttackTrack  - mutable ref { value }
 * @param {Function} ctx.replyFn        - send error/info back to the sender
 * @param {Function} ctx.restartSession
 * @param {Function} ctx.restartCupSession
 * @param {Function} ctx.restartCurrentRace
 * @param {Function} ctx.startTimeAttackSession
 * @param {Function} ctx.switchToTimeAttackTrack (n)
 * @param {Function} ctx.setBotsEnabled  (enabled) → boolean (was changed)
 * @param {Function} ctx.setBoostEnabled  (enabled) → boolean (was changed)
 * @param {Function} ctx.broadcastTrackPrompt
 * @returns {boolean} true if a recognised command was handled
 */
function handleHostCommand (text: string, username: string, ctx: Object) {
  const {
    sessionMode,
    tracks,
    pendingTimeAttackTrack,
    replyFn,
    restartSession,
    restartCupSession,
    restartCurrentRace,
    startTimeAttackSession,
    switchToTimeAttackTrack,
    setBotsEnabled,
    setBoostEnabled,
    broadcastTrackPrompt
  } = ctx

  const trimmed = text.trim()
  const cmd = trimmed.toLowerCase()
  const parts = trimmed.split(/\s+/)

  if (cmd === '/restart') {
    restartSession(username)
    return true
  }

  if (cmd === '/gamemode cup') {
    if (sessionMode === C.SESSION_MODE.CUP) {
      replyFn('Already in cup mode.')
      return true
    }
    restartCupSession(username)
    return true
  }

  if (cmd === '/gamemode timeattack') {
    if (sessionMode === C.SESSION_MODE.TIMEATTACK) {
      replyFn('Already in time attack mode.')
      return true
    }
    startTimeAttackSession(username)
    return true
  }

  if (cmd === '/track' || cmd.startsWith('/track ')) {
    if (sessionMode !== C.SESSION_MODE.TIMEATTACK) {
      replyFn('Track switching is only available in time attack mode.')
      return true
    }
    if (parts.length >= 2) {
      const n = parseInt(parts[1], 10)
      if (n >= 1 && n <= tracks.length) {
        switchToTimeAttackTrack(username, n)
        return true
      }
      replyFn(`Invalid track. Use a number 1–${tracks.length}.`)
      return true
    }
    pendingTimeAttackTrack.value = { hostUsername: username }
    broadcastTrackPrompt()
    return true
  }

  if (cmd === '/bots on') {
    if (sessionMode !== C.SESSION_MODE.CUP) {
      replyFn('Bot commands are only available in cup mode.')
      return true
    }
    if (!setBotsEnabled(true)) {
      replyFn('Bots are already on.')
      return true
    }
    restartCurrentRace()
    return true
  }

  if (cmd === '/bots off') {
    if (sessionMode !== C.SESSION_MODE.CUP) {
      replyFn('Bot commands are only available in cup mode.')
      return true
    }
    if (!setBotsEnabled(false)) {
      replyFn('Bots are already off.')
      return true
    }
    restartCurrentRace()
    return true
  }

  if (cmd === '/boost on') {
    if (sessionMode !== C.SESSION_MODE.CUP) {
      replyFn('Boost commands are only available in cup mode.')
      return true
    }
    if (!setBoostEnabled(true)) {
      replyFn('Boost is already on.')
      return true
    }
    restartCurrentRace()
    return true
  }

  if (cmd === '/boost off') {
    if (sessionMode !== C.SESSION_MODE.CUP) {
      replyFn('Boost commands are only available in cup mode.')
      return true
    }
    if (!setBoostEnabled(false)) {
      replyFn('Boost is already off.')
      return true
    }
    restartCurrentRace()
    return true
  }

  replyFn(formatUnknownCommandMessage(cmd))
  return true
}

module.exports = {
  HOST_COMMANDS,
  handleHostCommand,
  closestCommand,
  formatUnknownCommandMessage
}
