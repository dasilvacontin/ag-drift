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
const NotionClient = require('@notionhq/client').Client
const notion = new NotionClient({ auth: process.env.NOTION_API_KEY })
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

app.get('*', function (req, res, next) {
  const host = req.get('host')
  console.log('host', host)
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

const track1 = {
  id: 'Chicane',
  name: 'Chicane',
  background: 'images/track1-background.png',
  foreground: 'images/track1-foreground.png',
  bgmusic: 'sounds/POL-night-in-motion-long.wav',
  finishedRaceMusic: 'sounds/POL-night-in-motion-stinger.wav',
  nBots: 5,
  boostDisabled: false,
  messages: [],
  startingCheckpoint: '9',
  zoom: 12,
  grid: [
    '###############',
    '# 5  ###  3   #',
    '# #   4  ### 2#',
    '#6########### #',
    '# ##########  #',
    '# 7   8  91   #',
    '###############'
  ].map((row) => row.split(''))
}

/*
const map = [
  '###################',
  '#      5          #',
  '#    ############4#',
  '#   ##  ####      #',
  '#6 6#  #####3######',
  '#   ##  ####      #',
  '#    ##### ######2#',
  '#     7    91     #',
  '#     7    91     #',
  '###################'
].map((row) => row.split(''))
*/

const track2 = {
  id: 'Hairpin',
  name: 'Hairpin',
  background: 'images/track2.png',
  foreground: '',
  bgmusic: 'sounds/POL-mathrix-short.wav',
  nBots: 5,
  boostDisabled: false,
  messages: [],
  startingCheckpoint: '9',
  zoom: 12,
  grid: [
    '##########################',
    '#   5              6     #',
    '#  ##################    #',
    '#  ##    8         7     #',
    '#  ##   ##################',
    '#  ##    91          2   #',
    '#44####################  #',
    '#  #####  #######  ##    #',
    '#   ################     #',
    '#         3              #',
    '##        3              #',
    '##########################',
    '#################  #######'
  ].map((row) => row.split(''))
}

const track3 = {
  id: 'Miracle Park',
  name: 'Miracle Park',
  background: '',
  foreground: '',
  bgmusic: 'sounds/POL-miracle-park-short.wav',
  nBots: 5,
  skyboxColor: 0x000000,
  wallColor: 0x000000,
  boostDisabled: true,
  startingCheckpoint: '5',
  messages: [
    'Welcome to track #3, Miracle Park, created on Oct 25th 2021. Boost is currently disabled for this track.'
  ],
  zoom: 12,
  grid: [
    '##########################',
    '####;;;;;;;#;;;;;#########',
    '####;      2    ;#########',
    '####; ;;;;;#;;; ;#########',
    '####; ;#######; ;;;;;;;;;#',
    '####; ;#######;         ;#',
    '####; ;#######;;;;;;;;; ;#',
    '####; ;###############; ;#',
    '####; ;;;;;####;;;;;;;; ;#',
    '####;      341          ;#',
    '####;;;;;;;####;;;;;;;;;;#',
    '##########################',
    '##########################',
    '##########################'
  ].map((row) => row.split(''))
}

function x2 (matrix) {
  const newMap = []
  matrix.forEach(row => {
    const newRow1 = []
    const newRow2 = []
    row.forEach(cell => {
      newRow1.push(cell)
      newRow1.push(cell)
      newRow2.push(cell)
      newRow2.push(cell)
    })
    newMap.push(newRow1)
    newMap.push(newRow2)
  })
  return newMap
}

const track4 = {
  id: 'Bowser Castle v0.1',
  name: 'Bowser Castle v0.1',
  background: 'images/Bowser_Castle.png',
  foreground: '',
  bgmusic: 'sounds/BowserCastle.wav',
  bgmusicFinalLap: 'sounds/BowserCastleFinalLap.wav',
  nBots: 0,
  skyboxColor: 0xB00000,
  wallColor: 0x000000,
  boostDisabled: true,
  startingCheckpoint: '9',
  zoom: 8,
  messages: [
    'Welcome to track #4, Bowser Castle, created on April 8, 2022. Boost is currently disabled for this track.'
  ],
  grid: x2([
    '#################',
    '#         91    #',
    '# ############  #',
    '# ############  #',
    '# ############  #',
    '# ##   8765432  #',
    '# ##  ###########',
    '# ##  ###########',
    '# ##            #',
    '# ############  #',
    '# ############  #',
    '# ############  #',
    '# ## # # # ##   #',
    '#               #',
    '#### # # # ##   #',
    '#################'
  ].map((row) => row.split('')))
}
console.log(track4)

const tracks = [track1, track2, track3]
const trackChoice = (new Date().getDay()) % tracks.length
const track = tracks[trackChoice]

const game = new Game(track, true)
let timerId
function tickAndSchedule () {
  game.tick()
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
function createNBots (n) {
  for (let i = 0; i < n; ++i) {
    const aiSocket = {
      id: `bot${i}`,
      client: {},
      emit: _ => {}
    }
    game.onPlayerJoin(aiSocket, `bot${i}`)
    bots.push(aiSocket)
  }
}

// Sometimes create bots, sometimes not
if (Math.random() > 0.5) {
  // createNBots(8)
}
/*
if (trackChoice === 0) {
  createNBots(5)
}
*/
createNBots(track.nBots)

const brain1 = require('../common/brains/brainChicane.js')
const brain2 = require('../common/brains/brainHairpin.js')
const brain3 = require('../common/brains/brainMiraclePark.js')
const brain4 = []
const brains = [brain1, brain2, brain3, brain4]
const brain = brains[trackChoice]

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
  bots.forEach(aiMakeMove)
}
function aiMakeMove (aiSocket, i) {
  const ship = game.turn.ships[i]
  if (!ship) return

  const events = []
  const oldInput = oldInputs[i] || new PlayerInput()

  if (game.turn.state === C.GAME_STATE.RESULTS_SCREEN) {
    // force engine shutoff, or it wont re-engage on
    // game re-start
    events.push(new PlayerEvent(C.PLAYER_EVENT.GAS, false))
    oldInputs[i] = new PlayerInput()
  } else {
    const closestMemory = findClosestMemory(ship)
    if (!closestMemory) return

    const shipAngle = getAngle(ship.angle)
    let input = new PlayerInput()
    input = new PlayerInput(closestMemory[3])
    const angle = closestMemory[2]
    input.turnL = ((shipAngle - 1) % 4 === angle) ||
                  ((shipAngle - 2) % 4 === angle)
    input.turnR = ((shipAngle + 1) % 4 === angle)

    // generate PlayerEvents from input - oldInput
    if (input.turnL && !oldInput.turnL) {
      events.push(new PlayerEvent(C.PLAYER_EVENT.TURN_L, input.turnL))
    }
    if (input.turnR && !oldInput.turnR) {
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
    oldInputs[i] = input
  }

  if (events.length > 0) {
    game.onPlayerEvents(game.getShipIdForSocket(aiSocket), events, game.turnIndex)
  }
}

io.on('connection', function (socket) {
  let username
  socket.on('game:join', (givenUsername, debug) => {
    if (typeof givenUsername !== 'string' ||
        givenUsername.trim().length === 0) {
      username = 'Anonymous'
    } else {
      username = givenUsername.slice(0, 20)
    }
    debug = Boolean(debug)

    // logMessage(`- ${username} joined - ${Object.keys(io.sockets.sockets).length} players connected`)

    game.onPlayerJoin(socket, username, debug)
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
    game.onPlayerLeave(socket)
    // logMessage(`- ${username} left - ${Object.keys(io.sockets.sockets).length} players connected`)
  })

  socket.on('msg', (text: string) => {
    if (!username) return
    if (!text || !(typeof text === 'string')) return
    const shipId = game.getShipIdForSocket(socket)
    const ship: Ship = game.turn.ships[shipId]
    io.sockets.emit('msg', username, ship.color, text.slice(0, 140))
  })

  setTimeout(() => {
    socket.emit('system-msg', lastBestLapsMessage)
    socket.emit('the-crown', lastCrownOwner)
  }, 500)
})

const LAP_RESULTS_DATABASE_ID = 'd8e17e9c905c4d19acfffbb33d6c7258'

const emojiForPosition = ['🥇', '🥈', '🥉', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣']

function renderUsernameAndBestLap (record) {
  if (record == null) {
    return '–'
  } else {
    return `${record.username}, ${utils.timeToString(record.bestLap)}`
  }
}

let lastBestLapsMessage = ''
let lastCrownOwner
async function calculateBestTimes () {
  let crono = Date.now()
  let lapResults
  let startCursor
  const bestLaps = {
    'Chicane': {},
    'Hairpin': {},
    'Miracle Park': {},
    'Bowser Castle v0.1': {}
  }

  while (!lapResults || lapResults.has_more) {
    lapResults = await notion.databases.query({
      database_id: LAP_RESULTS_DATABASE_ID,
      sorts: [
        {
          property: 'Lap time',
          direction: 'ascending'
        }
      ],
      filter: {
        property: 'Invalid',
        checkbox: {
          equals: false
        }
      },
      start_cursor: startCursor
    })
    lapResults.results.forEach(lap => {
      const username = lap.properties.Username.rich_text[0].plain_text
      const trackName = lap.properties['Track name'].rich_text[0].plain_text
      const lapTime = lap.properties['Lap time'].number
      if (!bestLaps[trackName]) return
      const bestLapTimeSoFar = bestLaps[trackName][username] || Infinity
      if (lapTime < bestLapTimeSoFar) bestLaps[trackName][username] = lapTime
    })
    startCursor = lapResults.next_cursor
  }

  for (let trackName in bestLaps) {
    const bestLapsForRacers = bestLaps[trackName]
    const bestLapsForTrack = []
    for (let username in bestLapsForRacers) {
      bestLapsForTrack.push({ username: username, bestLap: bestLapsForRacers[username] })
    }
    bestLapsForTrack.sort((r1, r2) => r1.bestLap - r2.bestLap)
    bestLaps[trackName] = bestLapsForTrack
  }

  let bestLapsMessage = ''
  for (let trackName in bestLaps) {
    const bestLapsForTrack = bestLaps[trackName]
    bestLapsMessage += `== Best lap in ${trackName} ==
    🥇 ${renderUsernameAndBestLap(bestLapsForTrack[0])}
    🥈 ${renderUsernameAndBestLap(bestLapsForTrack[1])}
    🥉 ${renderUsernameAndBestLap(bestLapsForTrack[2])}
    4️⃣ ${renderUsernameAndBestLap(bestLapsForTrack[3])}
    5️⃣ ${renderUsernameAndBestLap(bestLapsForTrack[4])}

    `
  }
  lastBestLapsMessage = bestLapsMessage

  let bestLapsForCurrentTrackMessage = `== Best lap in ${track.name} ==\n`
  const bestLapsForCurrentTrack = bestLaps[track.name]
  for (let position = 0; position < 9; position++) {
    const record = bestLapsForCurrentTrack[position]
    bestLapsForCurrentTrackMessage += `${emojiForPosition[position]} ${record ? (record.username + ', ' + utils.timeToString(record.bestLap)) : '-'}\n`
  }
  io.emit('system-msg', bestLapsForCurrentTrackMessage)

  lastCrownOwner = bestLapsForCurrentTrack.length > 0 ? bestLapsForCurrentTrack[0].username : ''
  io.emit('the-crown', lastCrownOwner)

  setTimeout(calculateBestTimes, 30 * 1000)
  console.log(`calculateBestTimes took ${Date.now() - crono}`)
}
calculateBestTimes()

const PORT = process.env.PORT || 3000
http.listen(PORT, function () {
  console.log(`listening on ${ip.address()}:${PORT}`)
})

function beforeExit () {
  console.log('beforeExit')
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
