const express = require('express')
const app = express()
const http = require('http').Server(app)
const io = require('socket.io')(http)
const path = require('path')
const ip = require('ip')

const Game = require('../common/Game.js')
const C = require('../common/constants.js')

app.use(express.static('public'))
app.get('/', function (req, res) {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'))
})

const map = [
  '111111111111111',
  '100001110000001',
  '101000000111001',
  '101111111111101',
  '101111111111001',
  '100000000000001',
  '111111111111111'
].map((row) => row.split('').map(Number))

const game = new Game(map, true)
function tickAndSchedule () {
  game.tick()
  setTimeout(tickAndSchedule, Date.now() + C.TIME_STEP - game.lastTick)
}
tickAndSchedule()

io.on('connection', function (socket) {
  console.log(`${socket.client.id} connected`)

  socket.on('game:join', () => game.onPlayerJoin(socket))

  socket.on('player:events', (events, turnIndex) => {
    const shipId = game.getShipIdForSocket(socket)
    console.log(`${socket.client.id} (shipId: ${shipId}) sent event`)
    if (shipId == null) return // TO-DO: some kind of error sent to the client
    game.onPlayerEvents(shipId, events, turnIndex)
  })
})

const PORT = process.env.PORT || 3000
http.listen(PORT, function () {
  console.log(`listening on ${ip.address()}:${PORT}`)
})
