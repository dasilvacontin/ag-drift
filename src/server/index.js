const express = require('express')
const app = express()
const http = require('http').Server(app)
const io = require('socket.io')(http)
const path = require('path')
const ip = require('ip')
const TelegramBot = require('node-telegram-bot-api')
const { TELEGRAM_TOKEN, TELEGRAM_CHAT_ID } = process.env
const utils = require('../common/utils.js')
const Mixpanel = require('mixpanel')
const dotenv = require('dotenv')
dotenv.config()
Mixpanel.singleton = Mixpanel.init('e8281c4dfc67e5a7954bcb73f5633584', {debug: true})
Mixpanel.singleton.track('Server woke up')

// brain
const PlayerInput = require('../common/PlayerInput.js')
const PlayerEvent = require('../common/PlayerEvent.js')
const { vec2 } = require('p2')

let bot
if (TELEGRAM_TOKEN != null) {
  bot = new TelegramBot(TELEGRAM_TOKEN)

  // moneky patch logger function to send message to telegram
  const oldLog = utils.log
  utils.log = function log () {
    const args = Array.prototype.slice.call(arguments)
    bot.sendMessage(TELEGRAM_CHAT_ID, args.join(', '))
    oldLog.apply(utils, arguments)
  }
}

const Game = require('../common/Game.js')
const C = require('../common/constants.js')
const { CupManager, computePlacements, shouldAdvanceCupRace } = require('./cup.js')
const { handleHostCommand } = require('./commands.js')
const { tracks, DEFAULT_BOT_COUNT } = require('../common/tracks.js')
const { aiGridCellAtPosition } = require('../common/aiGrid.js')

app.get('*', function (req, res, next) {
  // const host = req.get('host')
  next()
  /*
  if (condition) {
      res.set('x-forwarded-proto', 'https');

      if (checkHost === 'www.' && ( req.get('host').indexOf('www.') >= 0)) {
          res.redirect('https://' + req.get('host') + req.url);
      }
      else {
          res.redirect('https://www.' + req.get('host') + req.url);
      }
  } else {
      next();
  }
  */
})
app.use(express.static('public'))
app.get('/', function (req, res) {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'))
})

const cup = new CupManager(tracks)
const FORCED_TRACK_CHOICE = process.env.FORCED_TRACK_CHOICE
const defaultTrackIndex = FORCED_TRACK_CHOICE != null
  ? Number(FORCED_TRACK_CHOICE)
  : cup.currentTrackIndex()
let track = tracks[defaultTrackIndex]
let trackIndex = defaultTrackIndex

const game = new Game(track, true)
game.sessionMode = C.SESSION_MODE.IDLE

let prevState = game.turn.state
let resultsHoldEmitted = false
let lastCompletedRaceWasFinal = false
let pendingTimeAttackTrack = null
let botsEnabled = true
let cupBoostEnabled = false

const BOT_NAME_POOL = [
  'Alice', 'Bob', 'Carlos', 'Diana', 'Elena', 'Frank', 'Grace', 'Hiro',
  'Ivy', 'Jack', 'Keiko', 'Leo', 'Maya', 'Noah', 'Olivia', 'Pablo',
  'Quinn', 'Rosa', 'Sam', 'Tara', 'Uma', 'Victor', 'Wendy', 'Xander',
  'Yuki', 'Zara', 'Marco', 'Nina', 'Oscar', 'Paula', 'Ren', 'Sofia',
  'Tom', 'Una', 'Vera', 'Will', 'Xia', 'Yara', 'Zoe', 'Alex', 'Blake',
  'Casey', 'Drew', 'Emery', 'Finley', 'Harper', 'Jordan', 'Kelly', 'Logan'
]
let botNamePool = []

function shuffleArray (arr) {
  const a = arr.slice()
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    const tmp = a[i]
    a[i] = a[j]
    a[j] = tmp
  }
  return a
}

function refreshBotNamePool () {
  botNamePool = shuffleArray(BOT_NAME_POOL)
}

function pickBotName () {
  if (botNamePool.length === 0) refreshBotNamePool()
  return botNamePool.pop()
}

function countHumans () {
  return game.turn.ships.filter(ship => ship && !ship.isABot()).length
}

function humanUsernames () {
  return game.turn.ships
    .filter(ship => ship && !ship.isABot())
    .map(ship => ship.username)
}

function setSessionMode (mode) {
  game.sessionMode = mode
}

function trackForSession (sourceTrack) {
  if (game.sessionMode === C.SESSION_MODE.CUP) {
    return { ...sourceTrack, boostDisabled: !cupBoostEnabled }
  }
  return sourceTrack
}

function changeTrack (newTrack, { gridOrder }: { gridOrder?: Array<string> } = {}) {
  const trackChanged = track.id !== newTrack.id
  track = newTrack
  trackIndex = tracks.indexOf(newTrack)
  brain = brains[trackIndex]
  if (!botsEnabled) {
    destroyAllBots()
  }
  game.resetForTrackChange(trackForSession(newTrack), { includeBots: botsEnabled, gridOrder })
  if (botsEnabled && bots.length === 0) {
    spawnBotsForTrack(DEFAULT_BOT_COUNT)
  }
  bots.forEach((aiSocket) => {
    aiSocket.version = track.aiType
  })
  oldInputs.length = 0
  prevState = game.turn.state
  resultsHoldEmitted = false
  updateBestLapsForCurrentTrack({ broadcast: trackChanged })
  game.bootstrapAllSockets()
}

function destroyAllBots () {
  bots.slice().forEach((aiSocket) => {
    game.onPlayerLeave(aiSocket)
    const shipId = game.getShipIdForSocket(aiSocket)
    if (shipId != null) oldInputs[shipId] = undefined
  })
  bots.length = 0
}

function spawnBotsForTrack (nBots) {
  if (!botsEnabled) return
  refreshBotNamePool()
  for (let i = 0; i < nBots; ++i) {
    const displayName = `${pickBotName()} (Bot)`
    const aiType = track.aiType
    const aiSocket = {
      id: `bot${bots.length} ${aiType}`,
      client: {},
      emit: _ => {},
      version: aiType,
      canBoost: false,
      displayName
    }
    game.onPlayerJoin(aiSocket, displayName)
    bots.push(aiSocket)
  }
}

function setBotsEnabled (enabled) {
  if (enabled === botsEnabled) return false
  botsEnabled = enabled
  if (!botsEnabled) {
    destroyAllBots()
  }
  return true
}

function setBoostEnabled (enabled) {
  if (enabled === cupBoostEnabled) return false
  cupBoostEnabled = enabled
  return true
}

function restartCurrentRace () {
  if (!botsEnabled) {
    destroyAllBots()
  }
  game.resetForTrackChange(trackForSession(track), { includeBots: botsEnabled })
  if (botsEnabled && bots.length === 0) {
    spawnBotsForTrack(DEFAULT_BOT_COUNT)
  }
  bots.forEach((aiSocket) => {
    aiSocket.version = track.aiType
  })
  oldInputs.length = 0
  prevState = game.turn.state
  resultsHoldEmitted = false
  game.bootstrapAllSockets()
}

function emitCupStartMessage () {
  if (!cup.hostUsername) return
  io.emit('system-msg', cup.formatCupStartMessage(
    cup.hostUsername,
    track.name,
    cup.raceIndex + 1,
    { botsEnabled, boostEnabled: cupBoostEnabled }
  ))
}

function restartCupSession (hostUsername) {
  if (cup.active) {
    cup.restartCup(hostUsername)
  } else {
    cup.start(hostUsername)
  }
  cupBoostEnabled = false
  game.sessionMode = C.SESSION_MODE.CUP
  changeTrack(tracks[cup.currentTrackIndex()])
  emitCupStartMessage()
}

function startTimeAttackSession (hostUsername) {
  pendingTimeAttackTrack = null
  cup.resetForNextSession()
  cup.assignHost(hostUsername)
  setSessionMode(C.SESSION_MODE.TIMEATTACK)
  restartCurrentRace()
  io.emit('system-msg', cup.formatTimeAttackStartMessage(track.name, hostUsername))
  updateBestLapsForCurrentTrack({ broadcast: true })
}

function switchToTimeAttackTrack (hostUsername, trackNumber) {
  pendingTimeAttackTrack = null
  changeTrack(tracks[trackNumber - 1])
  io.emit('system-msg', cup.formatTimeAttackStartMessage(tracks[trackNumber - 1].name, hostUsername))
}

function restartSession (hostUsername) {
  if (game.sessionMode === C.SESSION_MODE.TIMEATTACK) {
    changeTrack(track)
    const host = cup.hostUsername || hostUsername
    io.emit('system-msg', cup.formatTimeAttackStartMessage(track.name, host))
  } else {
    restartCupSession(hostUsername)
  }
}

let timerId

function tickAndSchedule () {
  const counterBeforeTick = game.turn.counter

  game.tick()

  const { state, counter } = game.turn

  if (prevState !== C.GAME_STATE.RESULTS_SCREEN && state === C.GAME_STATE.RESULTS_SCREEN) {
    resultsHoldEmitted = false
    if (game.sessionMode === C.SESSION_MODE.CUP && cup.active) {
      const placements = computePlacements(game.turn.ships)
      const results = cup.awardPoints(placements)
      const raceNum = cup.raceIndex + 1
      io.emit('system-msg', cup.formatRaceResultsMessage(track.name, raceNum, results))
      io.emit('system-msg', cup.formatStandingsMessage())

      if (cup.isCupComplete()) {
        lastCompletedRaceWasFinal = true
        io.emit('system-msg', cup.formatCupWinnerMessage())
        cup.startNewCup()
        game.turn.counter = C.RESULTS_SCREEN_S * 3
      } else {
        lastCompletedRaceWasFinal = false
      }
    }
  }

  if (shouldAdvanceCupRace({
    sessionMode: game.sessionMode,
    cupActive: cup.active,
    state,
    counter,
    counterBeforeTick,
    resultsHoldEmitted
  })) {
    resultsHoldEmitted = true

    if (!lastCompletedRaceWasFinal) {
      const gridOrder = computePlacements(game.turn.ships).map(p => p.username)
      cup.advanceRace()
      changeTrack(tracks[cup.currentTrackIndex()], { gridOrder })
      io.emit('system-msg', cup.formatCupRaceMessage(
        cup.hostUsername,
        track.name,
        cup.raceIndex + 1,
        { botsEnabled, boostEnabled: cupBoostEnabled }
      ))
    } else {
      changeTrack(tracks[cup.currentTrackIndex()])
      emitCupStartMessage()
    }
    lastCompletedRaceWasFinal = false
  }

  prevState = state

  timerId = setTimeout(tickAndSchedule, Date.now() + C.TIME_STEP - game.lastTick)
  setTimeout(executeAIs, 0)
}
tickAndSchedule()

/*
function logMessage (msg) {
  console.log(msg)
  if (bot) bot.sendMessage(TELEGRAM_CHAT_ID, msg)
}
*/

const bots = []
spawnBotsForTrack(DEFAULT_BOT_COUNT)

const brain1 = require('../common/brains/brainChicane.js')
const brain2 = require('../common/brains/brainHairpin.js')
const brain3 = require('../common/brains/brainMiraclePark.js')
const brain4 = []
const brains = [brain1, brain2, brain3, brain4]
let brain = brains[trackIndex]

function computeMemoryDistance (memory, ship) {
  return vec2.distance(memory[0], ship.position) +
         vec2.distance(memory[1], ship.velocity) / 7
}
function findClosestMemory (ship) {
  let closestMemory = null
  let closestDistance = Infinity
  brain.forEach(memory => {
    const distance = computeMemoryDistance(memory, ship)
    if (distance < closestDistance) {
      closestDistance = distance
      closestMemory = memory
    }
  })
  return closestMemory
}
function getAngle (angle) {
  angle += (Math.PI * 2)
  return Math.round((angle % (Math.PI * 2)) / (Math.PI / 2))
}
let oldInputs = []
function executeAIs () {
  bots.forEach((aiSocket) => aiMakeMove(aiSocket))
}
function aiMakeMove (aiSocket) {
  const shipId = game.getShipIdForSocket(aiSocket)
  if (shipId == null) return
  const ship = game.turn.ships[shipId]
  if (!ship) return

  const events = []
  const oldInput = oldInputs[shipId] || new PlayerInput()

  if (game.turn.state === C.GAME_STATE.RESULTS_SCREEN) {
    // force engine shutoff, or it wont re-engage on
    // game re-start
    events.push(new PlayerEvent(C.PLAYER_EVENT.GAS, false))
    oldInputs[shipId] = new PlayerInput()
  } else {
    const shipAngle = getAngle(ship.angle)
    let input = new PlayerInput()
    let targetAngle
    let gridCell
    aiSocket.prevPosition = aiSocket.prevPosition || vec2.clone(ship.position)
    const distanceMoved = vec2.distance(ship.position, aiSocket.prevPosition)
    aiSocket.prevPosition = vec2.clone(ship.position)

    const botAiType = track.aiType
    const useMlPath = botAiType === 'ml' &&
      !(game.turn.state !== C.GAME_STATE.START_COUNTDOWN && distanceMoved === 0)

    // check if it moved to avoid ml AI getting stuck, fallback to grid ai
    if (useMlPath) {
      const closestMemory = findClosestMemory(ship)
      if (!closestMemory) return
      input = new PlayerInput(closestMemory[3])
      targetAngle = closestMemory[2]
      input.turnL = ((shipAngle - 1 + 4) % 4 === targetAngle) ||
                    ((shipAngle - 2 + 4) % 4 === targetAngle)
      input.turnR = ((shipAngle + 1 + 4) % 4 === targetAngle)
    } else {
      gridCell = aiGridCellAtPosition(game.map, ship.position)
      switch (gridCell) {
        case 'u':
          targetAngle = 0
          break
        case 'r':
          targetAngle = 1
          break
        case 'l':
          targetAngle = 3
          break
        case 'd':
          targetAngle = 2
          break
      }
      input.gas = true
      input.turnL = ((shipAngle - 1 + 4) % 4 === targetAngle) ||
                    ((shipAngle - 2 + 4) % 4 === targetAngle)
      input.turnR = ((shipAngle + 1 + 4) % 4 === targetAngle)
      input.boost = aiSocket.canBoost
    }

    // generate PlayerEvents from input - oldInput
    if (input.turnL) {
      events.push(new PlayerEvent(C.PLAYER_EVENT.TURN_L, input.turnL))
    }
    if (input.turnR) {
      events.push(new PlayerEvent(C.PLAYER_EVENT.TURN_R, input.turnR))
    }
    if (input.leanL !== oldInput.leanL) {
      events.push(new PlayerEvent(C.PLAYER_EVENT.LEAN_L, input.leanL))
    }
    if (input.leanR !== oldInput.leanR) {
      events.push(new PlayerEvent(C.PLAYER_EVENT.LEAN_R, input.leanR))
    }
    if (input.gas !== oldInput.gas) {
      events.push(new PlayerEvent(C.PLAYER_EVENT.GAS, input.gas))
    }
    if (input.boost !== oldInput.boost) {
      events.push(new PlayerEvent(C.PLAYER_EVENT.BOOST, input.boost))
    }
    oldInputs[shipId] = input
  }

  if (events.length > 0) {
    game.onPlayerEvents(game.getShipIdForSocket(aiSocket), events, game.turnIndex)
  }
}

function purify (username) {
  return username.slice(0, 20).replace(/卐/g, '')
}

io.on('connection', function (socket) {
  let username
  socket.on('game:join', (givenUsername, debug) => {
    if (typeof givenUsername !== 'string' ||
        givenUsername.trim().length === 0) {
      username = 'Anonymous'
    } else {
      username = purify(givenUsername)
    }
    debug = Boolean(debug)

    const humansBefore = countHumans()

    if (humansBefore === 0) {
      restartCupSession(username)
    }

    game.onPlayerJoin(socket, username, debug, null, true)
    game.tick()
    game.bootstrapSocket(socket)

    io.emit('system-msg', `${username} connected`)

    if (humansBefore > 0 && cup.active) {
      const catchUp = cup.formatCatchUpMessage()
      if (catchUp) socket.emit('system-msg', catchUp)
    } else if (game.sessionMode === C.SESSION_MODE.TIMEATTACK && cup.hostUsername) {
      socket.emit('system-msg', cup.formatTimeAttackStartMessage(track.name, cup.hostUsername))
    }
  })

  socket.on('player:events', (events, turnIndex) => {
    const shipId = game.getShipIdForSocket(socket)
    if (shipId == null) return // TO-DO: some kind of error sent to the client
    try {
      game.onPlayerEvents(shipId, events, turnIndex)
    } catch (e) {
      if (e instanceof C.InvalidTurnError) {
        console.log(`${socket.client.id} got lost`)
        game.bootstrapSocket(socket)
      }
    }
  })

  socket.on('player:lost', () => {
    console.log(`${socket.client.id} requesting bootstrap`)
    game.bootstrapSocket(socket)
  })

  socket.on('game:ping', () => socket.emit('game:pong', Date.now()))

  socket.on('disconnect', () => {
    const shipId = game.getShipIdForSocket(socket)
    if (shipId == null) return

    const wasHost = cup.isHost(username)
    const leavingUsername = username

    game.onPlayerLeave(socket)
    io.emit('system-msg', `${leavingUsername} left`)

    if (pendingTimeAttackTrack && pendingTimeAttackTrack.hostUsername === leavingUsername) {
      pendingTimeAttackTrack = null
    }

    const humans = humanUsernames()
    if (humans.length === 0) {
      cup.resetForNextSession()
      setSessionMode(C.SESSION_MODE.IDLE)
      pendingTimeAttackTrack = null
    } else if (wasHost) {
      const newHost = cup.transferHost(humans)
      if (newHost) {
        io.emit('system-msg', cup.formatHostTransferMessage(newHost, game.sessionMode))
      }
    }
  })

  socket.on('msg', (text: string) => {
    if (!username) return
    if (!text || !(typeof text === 'string')) return
    const shipId = game.getShipIdForSocket(socket)
    const ship: Ship = game.turn.ships[shipId]

    if (pendingTimeAttackTrack && username === pendingTimeAttackTrack.hostUsername) {
      const n = parseInt(text.trim(), 10)
      if (n >= 1 && n <= tracks.length) {
        switchToTimeAttackTrack(username, n)
        return
      }
      socket.emit('system-msg', 'Invalid track. Reply with a number 1–4.')
      return
    }

    if (text.startsWith('/')) {
      if (!cup.isHost(username)) {
        socket.emit('system-msg', 'Only the Host can use commands.')
        return
      }

      const handled = handleHostCommand(text, username, {
        sessionMode: game.sessionMode,
        tracks,
        botsEnabled,
        pendingTimeAttackTrack: { get value () { return pendingTimeAttackTrack }, set value (v) { pendingTimeAttackTrack = v } },
        replyFn: (msg) => socket.emit('system-msg', msg),
        restartSession,
        restartCupSession,
        restartCurrentRace,
        startTimeAttackSession,
        switchToTimeAttackTrack,
        setBotsEnabled,
        setBoostEnabled,
        broadcastTrackPrompt: () => io.emit('system-msg', cup.formatTimeAttackTrackPrompt(tracks))
      })
      if (handled) return
    }

    io.sockets.emit('msg', username, ship.color, text.slice(0, 140))
  })

  setTimeout(() => {
    if (game.sessionMode === C.SESSION_MODE.TIMEATTACK) {
      socket.emit('system-msg', lastBestLapsMessage)
      socket.emit('the-crown', lastCrownOwner)
    } else {
      socket.emit('the-crown', '')
    }
  }, 500)
})

const emojiForPosition = ['🥇', '🥈', '🥉', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣']

const HARDCODED_BEST_LAPS = {
  'Bowser Castle': [
    { username: 'dasilvacontin', bestLap: 21.4 },
    { username: 'jimbo_bingus', bestLap: 22.166 },
    { username: 'CxruptExo', bestLap: 22.266 },
    { username: 'silliest goober', bestLap: 24.433 }
  ],
  'Chicane': [
    { username: 'papi', bestLap: 3.983 },
    { username: '<b>Among</b>', bestLap: 4.016 },
    { username: 'TATE', bestLap: 4.033 },
    { username: 'C4spanier', bestLap: 4.033 },
    { username: 'silenced', bestLap: 4.083 }
  ],
  'Hairpin': [
    { username: 'Dincan', bestLap: 9.383 },
    { username: 'C4spanier', bestLap: 9.466 },
    { username: 'Bingus', bestLap: 9.533 },
    { username: 'Shrek卐', bestLap: 9.55 },
    { username: 'clayton', bestLap: 9.583 }
  ],
  'Miracle Park': [
    { username: 'Just in', bestLap: 8.266 },
    { username: 'dasilvacontin', bestLap: 9.033 },
    { username: 'C4spanier', bestLap: 9.283 },
    { username: 'Dincan', bestLap: 9.983 },
    { username: 'silenced', bestLap: 10.033 }
  ]
}

let lastBestLapsMessage = ''
let lastCrownOwner

function formatBestLapsMessage (trackName) {
  const bestLapsForTrack = HARDCODED_BEST_LAPS[trackName] || []
  let message = `== Best lap in ${trackName} ==\n`
  for (let position = 0; position < 9; position++) {
    const record = bestLapsForTrack[position]
    message += `${emojiForPosition[position]} ${record ? (record.username + ', ' + utils.timeToString(record.bestLap)) : '-'}\n`
  }
  return message
}

function updateBestLapsForCurrentTrack ({ broadcast = false } = {}) {
  lastBestLapsMessage = formatBestLapsMessage(track.name)
  const bestLapsForCurrentTrack = HARDCODED_BEST_LAPS[track.name] || []
  lastCrownOwner = bestLapsForCurrentTrack.length > 0 ? bestLapsForCurrentTrack[0].username : ''
  if (!broadcast) return

  if (game.sessionMode === C.SESSION_MODE.TIMEATTACK) {
    io.emit('system-msg', lastBestLapsMessage)
    io.emit('the-crown', lastCrownOwner)
  } else {
    io.emit('the-crown', '')
  }
}

updateBestLapsForCurrentTrack({ broadcast: false })

const PORT = process.env.PORT || 3000
http.listen(PORT, function () {
  console.log(`listening on ${ip.address()}:${PORT}`)
})

module.exports = {}

function beforeExit () {
  if (TELEGRAM_TOKEN == null) return
  console.log('sending reboot notification via telegram')
  bot.sendMessage(TELEGRAM_CHAT_ID, 'rebooting')
  .then(function () { console.log(arguments) })
  .catch(function () { console.log(arguments) })
}
process.on('beforeExit', beforeExit)

process.on('SIGTERM', () => {
  console.log('got SIGTERM')
  clearTimeout(timerId)
  http.close((err) => {
    if (err) throw err
    console.log('closed server')
    beforeExit()
  })
})
