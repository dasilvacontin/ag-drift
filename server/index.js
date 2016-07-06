'use strict';

var express = require('express');
var app = express();
var http = require('http').Server(app);
var io = require('socket.io')(http);
var path = require('path');
var ip = require('ip');

app.use(express.static('public'));
app.get('/', function (req, res) {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

io.on('connection', function (socket) {
  console.log('a user connected');
});

var PORT = process.env.PORT || 3000;
http.listen(PORT, function () {
  console.log('listening on ' + ip.address() + ':' + PORT);
});