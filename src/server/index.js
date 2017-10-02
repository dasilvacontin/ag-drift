const express = require('express')
const app = express()
const http = require('http').Server(app)
const io = require('socket.io')(http)
const path = require('path')
const ip = require('ip')
const TelegramBot = require('node-telegram-bot-api')
const { TELEGRAM_TOKEN, TELEGRAM_CHAT_ID } = process.env

const Game = require('../common/Game.js')
const C = require('../common/constants.js')

let bot
if (TELEGRAM_TOKEN != null) {
  bot = new TelegramBot(TELEGRAM_TOKEN)
}

app.use(express.static('public'))
app.get('/', function (req, res) {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'))
})

const map = [
  '###############',
  '# 5  ###  3   #',
  '# #   4  ### 2#',
  '#6########### #',
  '# ##########  #',
  '# 7   8  91   #',
  '###############'
].map((row) => row.split(''))

/*
const map = [
  '###################',
  '#                 #',
  '#    ############ #',
  '#   ##  ####      #',
  '#   #  ##### ######',
  '#   ##  ####      #',
  '#    ##### ###### #',
  '#          91     #',
  '#          91     #',
  '###################'
].map((row) => row.split(''))
*/

const game = new Game(map, true)
let timerId
function tickAndSchedule () {
  game.tick()
  timerId = setTimeout(tickAndSchedule, Date.now() + C.TIME_STEP - game.lastTick)
}
tickAndSchedule()

function logMessage (msg) {
  console.log(msg)
  if (bot) bot.sendMessage(TELEGRAM_CHAT_ID, msg)
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

    logMessage(`- ${username} joined - ${Object.keys(io.sockets.sockets).length} players connected`)

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
    logMessage(`- ${username} left - ${Object.keys(io.sockets.sockets).length} players connected`)
  })
})

const PORT = process.env.PORT || 3000
http.listen(PORT, function () {
  console.log(`listening on ${ip.address()}:${PORT}`)
})

function beforeExit () {
  console.log('beforeExit')
  if (TELEGRAM_TOKEN == null) return
  console.log('sending reb  t notification via telegram')
  bot.sendMessage(TELEGRAM_CHAT_ID, 'reb  ting')
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
