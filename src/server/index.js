const express = require('express')
const app = express()
const http = require('http').Server(app)
const io = require('socket.io')(http)
const path = require('path')
const ip = require('ip')

app.use(express.static('public'))
app.get('/', function (req, res) {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'))
})

io.on('connection', function (socket) {
  console.log('a user connected')
})

const PORT = process.env.PORT || 3000
http.listen(PORT, function () {
  console.log(`listening on ${ip.address()}:${PORT}`)
})
