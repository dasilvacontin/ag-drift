/* global FPSMeter */
// @flow
const PIXI = global.PIXI = require('pixi.js')
const { Howl } = require('howler')
const kbd = require('@dasilvacontin/keyboard')
const { vec2 } = require('p2')
const io = require('socket.io-client')
const socket = io()

const Ship = require('../common/Ship.js')
const Turn = require('../common/Turn.js')
const Game = require('../common/Game.js')
const GameController = require('./GameController.js')
const PlayerEvent = require('../common/PlayerEvent.js')
const PlayerInput = require('../common/PlayerInput.js')
const C = require('../common/constants.js')
const { timeToString, repeat } = require('../common/utils.js')

const DEBUG_MODE = Boolean(localStorage.getItem('DEBUG'))
const MUSIC_OFF = Boolean(localStorage.getItem('MUSIC_OFF'))

let playing = false
const musicTracks = [
  'POL-divide-by-zero-short.wav', // +2
  'POL-night-in-motion-short.wav', // +2
  'POL-parallel-fields-short.wav', // +2
  'POL-mathrix-short.wav' // +1
  /*
  'POL-catch-me-short.wav', // +1
  'POL-grid-breaking-short.wav', // +1
  'POL-higher-short.wav', // +1
  'POL-humanoid-short.wav', // +1
  */
]
function getRandomMusicTrack () {
  // night in motion is bae
  const index = Number(localStorage.getItem('trackIndex') || 3)
  const track = musicTracks[index]
  console.log(track)
  return 'sounds/' + track
}
const bgMusic = new Howl({
  urls: [getRandomMusicTrack()],
  buffer: true,
  loop: true
})

function bool (a) {
  return (a === 'true' || a === '1' || a === true || a === 1)
}

const renderer = new PIXI.autoDetectRenderer(
  window.innerWidth,
  window.innerHeight,
  { backgroundColor: C.WALL_COLOR })
document.body.appendChild(renderer.view)

// so that you can lose focus from the chat box
const chatContainer = document.getElementById('chat')
const tempChatInput = chatContainer.querySelector('input')
let chatInput: HTMLInputElement
if (!(tempChatInput instanceof HTMLInputElement)) throw new Error('kek')
chatInput = tempChatInput

function loseFocus () {
  if (document.activeElement) document.activeElement.blur()
}
renderer.view.addEventListener('click', loseFocus)
const TAB_KEYCODE = 9
const ESC_KEYCODE = 27
const RETURN_KEYCODE = 13
const SPACEBAR_KEYCODE = 32
document.addEventListener('keydown', (e: KeyboardEvent) => {
  if (e.keyCode === ESC_KEYCODE) loseFocus()
  if (e.keyCode === TAB_KEYCODE) {
    console.log('got tab')
    if (document.activeElement === chatInput) document.activeElement.blur()
    else chatInput.focus()
    e.preventDefault()
  }
  if (e.keyCode === RETURN_KEYCODE) {
    if (document.activeElement === chatInput) {
      const text = chatInput.value
      chatInput.value = ''
      socket.emit('msg', text)
      // lose focus so that player can continue racing
      document.activeElement.blur()
    } else {
      // additional way for chat input to gain focus
      chatInput.focus()
    }
  }
  if (e.keyCode === SPACEBAR_KEYCODE) {
    if (document.activeElement !== chatInput) e.preventDefault()
  }
})

function magic (input) {
  input = input.replace(/&/g, '&amp;')
  input = input.replace(/</g, '&lt;')
  input = input.replace(/>/g, '&gt;')
  return input
}
socket.on('msg', (username: string, color: number, text: string) => {
  const msgWrapper = document.createElement('div')
  msgWrapper.className = 'chat-message'

  const msg = document.createElement('p')
  msg.innerHTML = `<b><span style="color: ${numberToHexColor(color)}">${magic(username)}:</b> ${magic(text)}`

  msgWrapper.appendChild(msg)
  chatContainer.appendChild(msgWrapper)

  chatContainer.scrollTop = chatContainer.scrollHeight
})

const camera = new PIXI.Container()
const ZOOM = 12

function onResize () {
  const width = window.innerWidth
  const height = window.innerHeight
  renderer.view.style.width = width + 'px'
  renderer.view.style.height = height + 'px'
  renderer.resize(width, height)
}
onResize()
window.addEventListener('resize', onResize)

function padIsKeyDown (gamepad, key) {
  if (gamepad == null) return false
  const { buttons } = gamepad
  const axes = gamepad.axes.map(Math.round)

  switch (key) {
    case kbd.RIGHT_ARROW: return axes[0] === 1 || buttons[15] && buttons[15].pressed
    case kbd.LEFT_ARROW: return axes[0] === -1 || buttons[14] && buttons[14].pressed
    case kbd.UP_ARROW: return buttons[2].pressed
    case 'a': return buttons[4].pressed
    case 'd': return buttons[5].pressed || buttons[6].pressed
    case 's': return buttons[0].pressed
    default: throw new Error('Unsupported key')
  }
}

let sentPing
let ping
let minPing = Infinity
// client's Date.now() - server's Date.now()

function sendPing () {
  sentPing = Date.now()
  socket.emit('game:ping')
}
sendPing()

socket.on('game:pong', (serverNow) => {
  const now = Date.now()
  ping = (now - sentPing) / 2
  if (ping < minPing) {
    minPing = ping
    C.CLIENT_LEAD = now - (serverNow + minPing)
  }
  setTimeout(sendPing, 500)
})
setInterval(() => {
  console.log({ ping, clientLead: C.CLIENT_LEAD })
}, 5 * 1000)

let game, gameController, myShipId
let debugGame, debugGameController
const oldInputs = []

const getGamepads = navigator.getGamepads || (() => [])

const meter = typeof FPSMeter !== 'undefined' && DEBUG_MODE
  ? new FPSMeter()
  : { tickStart: () => {}, tick: () => {} }

type Memory = [[number, number], [number, number], number, {gas: boolean, boost: boolean, leanL: boolean, leanR: boolean, turnL: boolean, turnR: boolean}]

const brain : Array<Memory> = JSON.parse('[[{"0":95.04560852050781,"1":52},{"0":-17.120420455932617,"1":-1.04832333914747e-15},3,{"gas":true,"boost":false,"leanL":false,"leanR":false,"turnL":false,"turnR":false}],[{"0":92.68395233154297,"1":52},{"0":-22.520694732666016,"1":-1.3789947314810634e-15},3,{"gas":true,"boost":false,"leanL":false,"leanR":false,"turnL":false,"turnR":false}],[{"0":86.20492553710938,"1":52},{"0":-32.07014846801758,"1":-1.963730479970032e-15},3,{"gas":true,"boost":false,"leanL":false,"leanR":false,"turnL":false,"turnR":false}],[{"0":81.56481170654297,"1":52},{"0":-36.85871124267578,"1":-2.2569466047716322e-15},3,{"gas":true,"boost":false,"leanL":false,"leanR":false,"turnL":false,"turnR":false}],[{"0":78.35359954833984,"1":52},{"0":-39.629852294921875,"1":-2.4266310210291917e-15},3,{"gas":true,"boost":false,"leanL":false,"leanR":false,"turnL":false,"turnR":false}],[{"0":75.62350463867188,"1":52},{"0":-41.731956481933594,"1":-2.555347630001613e-15},3,{"gas":true,"boost":false,"leanL":false,"leanR":false,"turnL":false,"turnR":false}],[{"0":62.57643508911133,"1":52},{"0":-49.63677215576172,"1":-3.039379737270636e-15},3,{"gas":true,"boost":false,"leanL":false,"leanR":false,"turnL":false,"turnR":false}],[{"0":52.12911605834961,"1":52},{"0":-54.33475875854492,"1":-3.327048643300668e-15},3,{"gas":true,"boost":false,"leanL":false,"leanR":false,"turnL":false,"turnR":false}],[{"0":49.376434326171875,"1":52},{"0":-55.40888214111328,"1":-3.392819904622017e-15},3,{"gas":true,"boost":false,"leanL":false,"leanR":false,"turnL":false,"turnR":false}],[{"0":39.881919860839844,"1":51.9501953125},{"0":-56.7382926940918,"1":-1.9882631301879883},0,{"gas":true,"boost":false,"leanL":false,"leanR":false,"turnL":false,"turnR":true}],[{"0":15.88757038116455,"1":49.17780303955078},{"0":-28.509801864624023,"1":-14.178979873657227},0,{"gas":true,"boost":false,"leanL":false,"leanR":true,"turnL":false,"turnR":false}],[{"0":10.67606258392334,"1":41.73979568481445},{"0":-6.582417011260986,"1":-29.11634063720703},0,{"gas":true,"boost":false,"leanL":false,"leanR":false,"turnL":false,"turnR":false}],[{"0":10.044337272644043,"1":38.60222625732422},{"0":-6.132262706756592,"1":-32.95182800292969},0,{"gas":true,"boost":false,"leanL":false,"leanR":false,"turnL":false,"turnR":false}],[{"0":8.478395462036133,"1":26.131328582763672},{"0":-1.9807775020599365,"1":-34.184078216552734},1,{"gas":false,"boost":false,"leanL":false,"leanR":true,"turnL":false,"turnR":false}],[{"0":8.288297653198242,"1":23.193866729736328},{"0":-1.8453177213668823,"1":-26.019643783569336},1,{"gas":false,"boost":false,"leanL":false,"leanR":true,"turnL":false,"turnR":false}],[{"0":8.247984886169434,"1":21.97260093688965},{"0":0.20716071128845215,"1":-24.13751792907715},1,{"gas":true,"boost":false,"leanL":false,"leanR":false,"turnL":false,"turnR":false}],[{"0":9.956324577331543,"1":16.811941146850586},{"0":13.156100273132324,"1":-20.46013641357422},1,{"gas":true,"boost":false,"leanL":false,"leanR":false,"turnL":false,"turnR":false}],[{"0":10.972684860229492,"1":15.487488746643066},{"0":16.4793701171875,"1":-19.516359329223633},1,{"gas":true,"boost":false,"leanL":false,"leanR":false,"turnL":false,"turnR":false}],[{"0":11.562169075012207,"1":14.84835147857666},{"0":18.083070755004883,"1":-19.060922622680664},1,{"gas":true,"boost":false,"leanL":false,"leanR":true,"turnL":false,"turnR":false}],[{"0":27.367237091064453,"1":14.252735137939453},{"0":39.20075225830078,"1":13.743541717529297},1,{"gas":true,"boost":false,"leanL":false,"leanR":true,"turnL":false,"turnR":false}],[{"0":37.41250991821289,"1":17.97005271911621},{"0":46.20897674560547,"1":15.142168045043945},1,{"gas":true,"boost":false,"leanL":false,"leanR":false,"turnL":false,"turnR":false}],[{"0":38.19028854370117,"1":18.219459533691406},{"0":46.6666259765625,"1":14.964446067810059},1,{"gas":true,"boost":false,"leanL":false,"leanR":false,"turnL":false,"turnR":false}],[{"0":39.768367767333984,"1":18.70952796936035},{"0":47.56587600708008,"1":14.615233421325684},1,{"gas":true,"boost":false,"leanL":false,"leanR":false,"turnL":false,"turnR":false}],[{"0":45.51908493041992,"1":20.286636352539062},{"0":50.551170349121094,"1":11.467666625976562},1,{"gas":true,"boost":false,"leanL":true,"leanR":false,"turnL":false,"turnR":false}],[{"0":58.92734909057617,"1":21.41010856628418},{"0":56.17486572265625,"1":0.5483416318893433},1,{"gas":false,"boost":false,"leanL":true,"leanR":false,"turnL":false,"turnR":false}],[{"0":62.56373596191406,"1":21.280881881713867},{"0":53.58364486694336,"1":-3.4070799350738525},1,{"gas":false,"boost":false,"leanL":true,"leanR":false,"turnL":false,"turnR":false}],[{"0":68.52845764160156,"1":20.445749282836914},{"0":49.33331298828125,"1":-9.89511489868164},1,{"gas":false,"boost":false,"leanL":true,"leanR":false,"turnL":false,"turnR":false}],[{"0":72.49705505371094,"1":19.40361976623535},{"0":46.50537872314453,"1":-14.211894035339355},1,{"gas":false,"boost":false,"leanL":true,"leanR":false,"turnL":false,"turnR":false}],[{"0":74.7681655883789,"1":18.610355377197266},{"0":44.88703536987305,"1":-16.68225860595703},1,{"gas":false,"boost":false,"leanL":true,"leanR":false,"turnL":false,"turnR":false}],[{"0":75.50749969482422,"1":18.31891441345215},{"0":44.360198974609375,"1":-17.486459732055664},1,{"gas":false,"boost":false,"leanL":true,"leanR":false,"turnL":false,"turnR":false}],[{"0":79.76480865478516,"1":16.29747772216797},{"0":41.32652282714844,"1":-22.117286682128906},1,{"gas":false,"boost":false,"leanL":true,"leanR":false,"turnL":false,"turnR":false}],[{"0":86.22323608398438,"1":12.2853422164917},{"0":36.72439193725586,"1":-21.28207778930664},1,{"gas":true,"boost":false,"leanL":false,"leanR":true,"turnL":false,"turnR":false}],[{"0":86.84479522705078,"1":11.951470375061035},{"0":37.29336166381836,"1":-20.03229331970215},1,{"gas":true,"boost":false,"leanL":false,"leanR":true,"turnL":false,"turnR":false}],[{"0":88.11591339111328,"1":11.34524154663086},{"0":38.41134262084961,"1":-17.576555252075195},1,{"gas":true,"boost":false,"leanL":false,"leanR":true,"turnL":false,"turnR":false}],[{"0":88.7652587890625,"1":11.072403907775879},{"0":38.96051025390625,"1":-16.37026023864746},1,{"gas":true,"boost":false,"leanL":false,"leanR":true,"turnL":false,"turnR":false}],[{"0":99.53358459472656,"1":9.23836612701416},{"0":46.46537399291992,"1":0.11478263139724731},1,{"gas":true,"boost":false,"leanL":false,"leanR":true,"turnL":false,"turnR":false}],[{"0":123.10408020019531,"1":16.66156005859375},{"0":30.681406021118164,"1":26.193334579467773},2,{"gas":true,"boost":false,"leanL":false,"leanR":true,"turnL":false,"turnR":false}],[{"0":127.01375579833984,"1":21.640134811401367},{"0":17.776681900024414,"1":32.76446533203125},2,{"gas":true,"boost":false,"leanL":false,"leanR":true,"turnL":false,"turnR":false}],[{"0":128.6782989501953,"1":26.368061065673828},{"0":8.4955472946167,"1":37.49045181274414},2,{"gas":true,"boost":false,"leanL":false,"leanR":true,"turnL":false,"turnR":false}],[{"0":129.1156005859375,"1":29.63008689880371},{"0":3.1245555877685547,"1":40.22538757324219},2,{"gas":true,"boost":false,"leanL":false,"leanR":true,"turnL":false,"turnR":false}],[{"0":112.76473236083984,"1":51.32439041137695},{"0":-36.82984161376953,"1":7.564586639404297},3,{"gas":true,"boost":false,"leanL":false,"leanR":true,"turnL":false,"turnR":false}],[{"0":103.9630355834961,"1":51.73038101196289},{"0":-43.712318420410156,"1":0.19215643405914307},3,{"gas":true,"boost":false,"leanL":false,"leanR":false,"turnL":false,"turnR":false}],[{"0":97.05216979980469,"1":51.757564544677734},{"0":-47.89466857910156,"1":0.17278578877449036},3,{"gas":true,"boost":false,"leanL":false,"leanR":false,"turnL":false,"turnR":false}],[{"0":87.80818176269531,"1":51.7372932434082},{"0":-52.43824005126953,"1":-1.8365209102630615},3,{"gas":true,"boost":false,"leanL":false,"leanR":true,"turnL":false,"turnR":false}],[{"0":83.34368133544922,"1":51.508155822753906},{"0":-54.316314697265625,"1":-2.6851179599761963},3,{"gas":true,"boost":false,"leanL":false,"leanR":false,"turnL":false,"turnR":false}],[{"0":79.66287994384766,"1":51.3343391418457},{"0":-55.74095916748047,"1":-2.5612597465515137},3,{"gas":true,"boost":false,"leanL":false,"leanR":false,"turnL":false,"turnR":false}],[{"0":74.93269348144531,"1":51.128299713134766},{"0":-57.429710388183594,"1":-2.414440155029297},3,{"gas":true,"boost":false,"leanL":false,"leanR":false,"turnL":false,"turnR":false}],[{"0":71.05035400390625,"1":50.97200393676758},{"0":-58.71074295043945,"1":-2.303067684173584},3,{"gas":true,"boost":false,"leanL":false,"leanR":false,"turnL":false,"turnR":false}],[{"0":67.08509063720703,"1":50.82292175292969},{"0":-59.93268585205078,"1":-2.1968328952789307},3,{"gas":true,"boost":false,"leanL":false,"leanR":false,"turnL":false,"turnR":false}],[{"0":26.60218048095703,"1":48.05760955810547},{"0":-36.14480209350586,"1":-2.2500905990600586},0,{"gas":false,"boost":false,"leanL":true,"leanR":false,"turnL":false,"turnR":false}],[{"0":15.734515190124512,"1":47.05026626586914},{"0":-26.376972198486328,"1":-7.60352897644043},0,{"gas":true,"boost":false,"leanL":false,"leanR":true,"turnL":false,"turnR":false}],[{"0":11.621304512023926,"1":43.42393112182617},{"0":-8.267841339111328,"1":-20.1976261138916},0,{"gas":true,"boost":false,"leanL":false,"leanR":true,"turnL":false,"turnR":false}],[{"0":11.249622344970703,"1":38.91378402709961},{"0":2.115774631500244,"1":-28.11442756652832},0,{"gas":true,"boost":false,"leanL":false,"leanR":false,"turnL":false,"turnR":false}],[{"0":11.48514175415039,"1":35.32832336425781},{"0":1.9479484558105469,"1":-32.64263916015625},0,{"gas":true,"boost":false,"leanL":false,"leanR":false,"turnL":false,"turnR":false}],[{"0":11.611238479614258,"1":33.050533294677734},{"0":1.8580942153930664,"1":-35.067039489746094},0,{"gas":true,"boost":false,"leanL":false,"leanR":false,"turnL":false,"turnR":false}],[{"0":11.874098777770996,"1":27.362693786621094},{"0":1.6707862615585327,"1":-40.120887756347656},0,{"gas":true,"boost":false,"leanL":false,"leanR":false,"turnL":false,"turnR":false}],[{"0":12.460943222045898,"1":20.33249855041504},{"0":3.276367425918579,"1":-36.12319564819336},1,{"gas":false,"boost":false,"leanL":false,"leanR":true,"turnL":false,"turnR":false}],[{"0":13.953450202941895,"1":14.881649017333984},{"0":12.3316011428833,"1":-20.096519470214844},1,{"gas":true,"boost":false,"leanL":false,"leanR":true,"turnL":false,"turnR":false}],[{"0":14.33553409576416,"1":10.877716064453125},{"0":7.457181930541992,"1":-8.035332679748535},1,{"gas":true,"boost":false,"leanL":false,"leanR":true,"turnL":false,"turnR":false}],[{"0":15.18154525756836,"1":10.477438926696777},{"0":11.913712501525879,"1":-2.6907219886779785},1,{"gas":true,"boost":false,"leanL":false,"leanR":true,"turnL":false,"turnR":false}],[{"0":15.862577438354492,"1":10.445255279541016},{"0":14.4640531539917,"1":0.3678395748138428},1,{"gas":true,"boost":false,"leanL":false,"leanR":true,"turnL":false,"turnR":false}],[{"0":20.19839859008789,"1":11.720290184020996},{"0":24.52883529663086,"1":7.554287910461426},1,{"gas":true,"boost":false,"leanL":false,"leanR":false,"turnL":false,"turnR":false}],[{"0":21.950952529907227,"1":12.209304809570312},{"0":27.32750701904297,"1":7.205826759338379},1,{"gas":true,"boost":false,"leanL":false,"leanR":false,"turnL":false,"turnR":false}],[{"0":34.61314392089844,"1":15.580552101135254},{"0":40.56597137451172,"1":15.934185028076172},1,{"gas":true,"boost":false,"leanL":false,"leanR":true,"turnL":false,"turnR":false}],[{"0":40.32780838012695,"1":17.933650970458984},{"0":44.58882141113281,"1":17.293045043945312},1,{"gas":true,"boost":false,"leanL":false,"leanR":false,"turnL":false,"turnR":false}],[{"0":41.07889938354492,"1":18.21848487854004},{"0":45.065486907958984,"1":17.090078353881836},1,{"gas":true,"boost":false,"leanL":false,"leanR":false,"turnL":false,"turnR":false}],[{"0":43.378910064697266,"1":19.05308723449707},{"0":46.46217727661133,"1":16.495359420776367},1,{"gas":true,"boost":false,"leanL":false,"leanR":false,"turnL":false,"turnR":false}],[{"0":44.160858154296875,"1":19.324783325195312},{"0":46.91685485839844,"1":16.301755905151367},1,{"gas":true,"boost":false,"leanL":false,"leanR":false,"turnL":false,"turnR":false}],[{"0":44.950294494628906,"1":19.593290328979492},{"0":47.36619567871094,"1":16.110424041748047},1,{"gas":true,"boost":false,"leanL":false,"leanR":false,"turnL":false,"turnR":false}],[{"0":73.10128021240234,"1":20.11182975769043},{"0":51.5914192199707,"1":-11.579737663269043},1,{"gas":false,"boost":false,"leanL":true,"leanR":false,"turnL":false,"turnR":false}],[{"0":78.84423065185547,"1":18.366945266723633},{"0":47.499114990234375,"1":-17.419506072998047},1,{"gas":false,"boost":false,"leanL":true,"leanR":false,"turnL":false,"turnR":false}],[{"0":83.77149963378906,"1":15.580689430236816},{"0":-21.609073638916016,"1":-23.478504180908203},1,{"gas":false,"boost":false,"leanL":true,"leanR":false,"turnL":false,"turnR":false}],[{"0":80.42141723632812,"1":11.549513816833496},{"0":-13.150623321533203,"1":-16.558469772338867},1,{"gas":true,"boost":false,"leanL":false,"leanR":true,"turnL":false,"turnR":false}],[{"0":79.79302978515625,"1":9.572046279907227},{"0":7.534687519073486,"1":-0.9830982089042664},1,{"gas":true,"boost":false,"leanL":false,"leanR":false,"turnL":false,"turnR":false}],[{"0":82.74522399902344,"1":9.375747680664062},{"0":18.585407257080078,"1":-0.8432188034057617},1,{"gas":true,"boost":false,"leanL":false,"leanR":false,"turnL":false,"turnR":false}],[{"0":87.90396118164062,"1":9.207376480102539},{"0":28.063783645629883,"1":-0.7232420444488525},1,{"gas":true,"boost":false,"leanL":false,"leanR":false,"turnL":false,"turnR":false}],[{"0":89.37368774414062,"1":9.172056198120117},{"0":30.05211639404297,"1":-0.6980738639831543},1,{"gas":true,"boost":false,"leanL":false,"leanR":false,"turnL":false,"turnR":false}],[{"0":96.82205963134766,"1":9.032669067382812},{"0":37.898956298828125,"1":-0.598749041557312},1,{"gas":true,"boost":false,"leanL":false,"leanR":false,"turnL":false,"turnR":false}],[{"0":102.19939422607422,"1":8.956938743591309},{"0":42.16218185424805,"1":-0.5447853207588196},1,{"gas":true,"boost":false,"leanL":false,"leanR":false,"turnL":false,"turnR":true}],[{"0":104.25840759277344,"1":9.029553413391113},{"0":40.69498062133789,"1":2.4390997886657715},2,{"gas":true,"boost":false,"leanL":false,"leanR":true,"turnL":false,"turnR":true}],[{"0":106.14655303955078,"1":9.24788761138916},{"0":36.31390380859375,"1":5.319148063659668},2,{"gas":false,"boost":false,"leanL":false,"leanR":true,"turnL":false,"turnR":true}],[{"0":112.21660614013672,"1":10.398672103881836},{"0":27.94100570678711,"1":8.546628952026367},2,{"gas":true,"boost":false,"leanL":false,"leanR":false,"turnL":false,"turnR":false}],[{"0":120.0740966796875,"1":14.9769287109375},{"0":31.448816299438477,"1":22.48615264892578},2,{"gas":true,"boost":false,"leanL":false,"leanR":false,"turnL":false,"turnR":false}],[{"0":124.98885345458984,"1":19.37615394592285},{"0":27.94666290283203,"1":29.47012710571289},2,{"gas":true,"boost":false,"leanL":false,"leanR":true,"turnL":false,"turnR":false}],[{"0":126.63320922851562,"1":21.448575973510742},{"0":22.7274227142334,"1":32.040870666503906},2,{"gas":true,"boost":false,"leanL":false,"leanR":true,"turnL":false,"turnR":false}],[{"0":129.29986572265625,"1":27.340991973876953},{"0":10.708455085754395,"1":37.9608268737793},2,{"gas":true,"boost":false,"leanL":false,"leanR":true,"turnL":false,"turnR":false}],[{"0":129.84434509277344,"1":37.881629943847656},{"0":-4.857677459716797,"1":45.6279411315918},2,{"gas":true,"boost":false,"leanL":false,"leanR":true,"turnL":false,"turnR":false}],[{"0":128.28201293945312,"1":46.41807556152344},{"0":-7.791904926300049,"1":35.49753952026367},3,{"gas":true,"boost":false,"leanL":false,"leanR":true,"turnL":false,"turnR":false}],[{"0":121.89102172851562,"1":54.02280807495117},{"0":-25.49909019470215,"1":10.852919578552246},3,{"gas":true,"boost":false,"leanL":false,"leanR":false,"turnL":false,"turnR":false}],[{"0":118.60232543945312,"1":53.41875457763672},{"0":-30.188173294067383,"1":-4.9960246086120605},3,{"gas":true,"boost":false,"leanL":false,"leanR":false,"turnL":false,"turnR":false}],[{"0":115.92771911621094,"1":53.016849517822266},{"0":-33.34169006347656,"1":-4.70963716506958},3,{"gas":true,"boost":false,"leanL":false,"leanR":false,"turnL":false,"turnR":false}],[{"0":103.57127380371094,"1":50.62456130981445},{"0":-43.76240539550781,"1":-7.052454948425293},3,{"gas":true,"boost":false,"leanL":true,"leanR":false,"turnL":false,"turnR":false}],[{"0":102.83379364013672,"1":50.52506637573242},{"0":-44.2487678527832,"1":-5.9696807861328125},3,{"gas":true,"boost":false,"leanL":true,"leanR":false,"turnL":false,"turnR":false}],[{"0":90.00601959228516,"1":50.87873840332031},{"0":-51.29798889160156,"1":3.8970654010772705},3,{"gas":true,"boost":false,"leanL":false,"leanR":false,"turnL":false,"turnR":false}],[{"0":85.63325500488281,"1":51.192237854003906},{"0":-53.241432189941406,"1":3.673673391342163},3,{"gas":true,"boost":false,"leanL":false,"leanR":false,"turnL":false,"turnR":false}],[{"0":82.93396759033203,"1":51.37164306640625},{"0":-54.35360336303711,"1":3.545832872390747},3,{"gas":true,"boost":false,"leanL":false,"leanR":true,"turnL":false,"turnR":false}],[{"0":76.42765808105469,"1":51.327144622802734},{"0":-56.80048370361328,"1":-2.493717908859253},3,{"gas":true,"boost":false,"leanL":false,"leanR":false,"turnL":false,"turnR":false}],[{"0":67.66525268554688,"1":50.974365234375},{"0":-59.6634635925293,"1":-2.242335319519043},3,{"gas":true,"boost":false,"leanL":false,"leanR":false,"turnL":false,"turnR":false}],[{"0":61.59602355957031,"1":50.7591667175293},{"0":-61.409915924072266,"1":-2.0889885425567627},3,{"gas":true,"boost":false,"leanL":false,"leanR":false,"turnL":false,"turnR":false}],[{"0":58.49782180786133,"1":50.65715026855469},{"0":-62.23783493041992,"1":-2.0162932872772217},3,{"gas":true,"boost":false,"leanL":false,"leanR":false,"turnL":false,"turnR":false}],[{"0":56.4098014831543,"1":50.607784271240234},{"0":-62.773712158203125,"1":-0.9692409038543701},3,{"gas":true,"boost":false,"leanL":true,"leanR":false,"turnL":false,"turnR":false}],[{"0":26.956695556640625,"1":51.264583587646484},{"0":-42.79793167114258,"1":-3.4610066413879395},0,{"gas":true,"boost":false,"leanL":false,"leanR":true,"turnL":false,"turnR":false}],[{"0":20.90733528137207,"1":49.83857727050781},{"0":-33.42790222167969,"1":-12.563624382019043},0,{"gas":true,"boost":false,"leanL":false,"leanR":false,"turnL":false,"turnR":false}],[{"0":14.232616424560547,"1":45.882232666015625},{"0":-28.671640396118164,"1":-22.898801803588867},0,{"gas":true,"boost":false,"leanL":false,"leanR":false,"turnL":false,"turnR":false}],[{"0":8.081812858581543,"1":46.157432556152344},{"0":-6.02433967590332,"1":-8.98422622680664},0,{"gas":true,"boost":false,"leanL":false,"leanR":true,"turnL":false,"turnR":false}],[{"0":7.84330940246582,"1":45.188575744628906},{"0":-0.7950055599212646,"1":-13.353222846984863},0,{"gas":true,"boost":false,"leanL":false,"leanR":true,"turnL":false,"turnR":false}],[{"0":8.260970115661621,"1":42.21662902832031},{"0":2.9548838138580322,"1":-21.354236602783203},0,{"gas":true,"boost":false,"leanL":false,"leanR":false,"turnL":false,"turnR":false}],[{"0":8.452248573303223,"1":40.669578552246094},{"0":2.8185818195343018,"1":-24.299345016479492},0,{"gas":true,"boost":false,"leanL":false,"leanR":false,"turnL":false,"turnR":false}],[{"0":10.402647018432617,"1":21.7926025390625},{"0":7.500027179718018,"1":-31.085529327392578},1,{"gas":true,"boost":false,"leanL":false,"leanR":false,"turnL":false,"turnR":false}],[{"0":13.038660049438477,"1":16.48584747314453},{"0":17.764175415039062,"1":-20.220916748046875},1,{"gas":true,"boost":false,"leanL":false,"leanR":true,"turnL":false,"turnR":false}],[{"0":13.45369815826416,"1":14.447957992553711},{"0":-6.626701354980469,"1":-16.694414138793945},1,{"gas":true,"boost":false,"leanL":false,"leanR":false,"turnL":false,"turnR":false}],[{"0":15.216123580932617,"1":11.03012752532959},{"0":14.378711700439453,"1":-4.140178680419922},1,{"gas":true,"boost":false,"leanL":false,"leanR":false,"turnL":false,"turnR":false}],[{"0":22.22517967224121,"1":11.707347869873047},{"0":28.609859466552734,"1":8.531641006469727},1,{"gas":true,"boost":false,"leanL":false,"leanR":false,"turnL":false,"turnR":false}],[{"0":23.721576690673828,"1":12.123994827270508},{"0":30.57918930053711,"1":8.234746932983398},1,{"gas":true,"boost":false,"leanL":false,"leanR":false,"turnL":false,"turnR":false}],[{"0":31.27518653869629,"1":14.11150074005127},{"0":38.351043701171875,"1":12.889748573303223},1,{"gas":true,"boost":false,"leanL":false,"leanR":true,"turnL":false,"turnR":false}],[{"0":47.47609329223633,"1":18.886079788208008},{"0":49.06789779663086,"1":5.4399824142456055},1,{"gas":true,"boost":false,"leanL":true,"leanR":false,"turnL":false,"turnR":false}],[{"0":48.300960540771484,"1":18.959014892578125},{"0":49.49198913574219,"1":4.376133441925049},1,{"gas":true,"boost":false,"leanL":true,"leanR":false,"turnL":false,"turnR":false}],[{"0":58.721431732177734,"1":18.980470657348633},{"0":54.20908737182617,"1":-0.6985374093055725},1,{"gas":true,"boost":false,"leanL":true,"leanR":false,"turnL":false,"turnR":false}],[{"0":71.97550964355469,"1":17.16707420349121},{"0":58.93076705932617,"1":-13.572617530822754},1,{"gas":true,"boost":false,"leanL":true,"leanR":false,"turnL":false,"turnR":false}],[{"0":77.97441101074219,"1":15.521257400512695},{"0":60.72732925415039,"1":-18.471099853515625},1,{"gas":false,"boost":false,"leanL":true,"leanR":false,"turnL":false,"turnR":false}],[{"0":93.9277572631836,"1":8.902538299560547},{"0":56.44245147705078,"1":-20.837873458862305},1,{"gas":true,"boost":false,"leanL":false,"leanR":true,"turnL":false,"turnR":false}],[{"0":109.60147094726562,"1":6.007849216461182},{"0":57.41623306274414,"1":-2.585158586502075},2,{"gas":true,"boost":false,"leanL":false,"leanR":true,"turnL":false,"turnR":true}],[{"0":119.60033416748047,"1":7.184131622314453},{"0":37.03568649291992,"1":11.051389694213867},2,{"gas":true,"boost":false,"leanL":false,"leanR":true,"turnL":false,"turnR":false}],[{"0":126.40779113769531,"1":11.992676734924316},{"0":15.994810104370117,"1":23.814945220947266},2,{"gas":true,"boost":false,"leanL":false,"leanR":true,"turnL":false,"turnR":false}],[{"0":126.65457916259766,"1":12.40160083770752},{"0":14.807080268859863,"1":24.535430908203125},2,{"gas":true,"boost":false,"leanL":false,"leanR":true,"turnL":false,"turnR":false}],[{"0":127.2784652709961,"1":13.699019432067871},{"0":11.32688045501709,"1":26.646547317504883},2,{"gas":true,"boost":false,"leanL":false,"leanR":true,"turnL":false,"turnR":false}],[{"0":127.4483642578125,"1":14.154582977294922},{"0":10.193937301635742,"1":27.333797454833984},2,{"gas":true,"boost":false,"leanL":false,"leanR":true,"turnL":false,"turnR":false}],[{"0":127.94352722167969,"1":16.088712692260742},{"0":5.793587684631348,"1":30.003082275390625},2,{"gas":true,"boost":false,"leanL":false,"leanR":true,"turnL":false,"turnR":false}],[{"0":127.86854553222656,"1":27.503707885742188},{"0":-1.2361170053482056,"1":41.09464645385742},2,{"gas":true,"boost":false,"leanL":false,"leanR":false,"turnL":false,"turnR":false}],[{"0":127.71930694580078,"1":31.05567169189453},{"0":-3.15352201461792,"1":43.62297439575195},2,{"gas":true,"boost":false,"leanL":false,"leanR":true,"turnL":false,"turnR":false}],[{"0":126.91239929199219,"1":36.03804016113281},{"0":-9.661669731140137,"1":39.060768127441406},3,{"gas":true,"boost":false,"leanL":false,"leanR":true,"turnL":false,"turnR":true}],[{"0":116.99235534667969,"1":47.69074249267578},{"0":-30.92540168762207,"1":14.56728744506836},3,{"gas":true,"boost":false,"leanL":false,"leanR":true,"turnL":false,"turnR":false}],[{"0":115.38288116455078,"1":48.302921295166016},{"0":-32.81414794921875,"1":11.095431327819824},3,{"gas":true,"boost":false,"leanL":false,"leanR":true,"turnL":false,"turnR":false}],[{"0":104.6115951538086,"1":50.58198928833008},{"0":-42.340667724609375,"1":5.4239115715026855},3,{"gas":true,"boost":false,"leanL":false,"leanR":true,"turnL":false,"turnR":false}],[{"0":87.12995910644531,"1":51.28861618041992},{"0":-52.1449089050293,"1":-1.1508740186691284},3,{"gas":true,"boost":false,"leanL":false,"leanR":false,"turnL":false,"turnR":false}],[{"0":86.25440979003906,"1":51.26966094970703},{"0":-52.53288650512695,"1":-1.1373662948608398},3,{"gas":true,"boost":false,"leanL":false,"leanR":false,"turnL":false,"turnR":false}],[{"0":81.78230285644531,"1":51.17816925048828},{"0":-54.40553665161133,"1":-1.0721690654754639},3,{"gas":true,"boost":false,"leanL":false,"leanR":false,"turnL":false,"turnR":false}],[{"0":14.992108345031738,"1":46.21110916137695},{"0":-28.061647415161133,"1":-13.722771644592285},0,{"gas":true,"boost":false,"leanL":false,"leanR":false,"turnL":false,"turnR":false}],[{"0":8.171610832214355,"1":45.352508544921875},{"0":-9.996526718139648,"1":-10.494038581848145},0,{"gas":true,"boost":false,"leanL":false,"leanR":true,"turnL":false,"turnR":false}],[{"0":7.555462837219238,"1":44.00214767456055},{"0":-3.4862141609191895,"1":-15.603055953979492},0,{"gas":true,"boost":false,"leanL":false,"leanR":true,"turnL":false,"turnR":false}],[{"0":7.656983852386475,"1":35.103660583496094},{"0":0.48894912004470825,"1":-31.523466110229492},0,{"gas":true,"boost":false,"leanL":false,"leanR":false,"turnL":false,"turnR":false}],[{"0":7.6729960441589355,"1":34.02149963378906},{"0":0.47753897309303284,"1":-32.776092529296875},0,{"gas":true,"boost":false,"leanL":false,"leanR":false,"turnL":false,"turnR":false}],[{"0":8.890368461608887,"1":20.995141983032227},{"0":7.705074787139893,"1":-30.57691764831543},1,{"gas":true,"boost":false,"leanL":false,"leanR":false,"turnL":false,"turnR":false}],[{"0":9.03394603729248,"1":20.49150848388672},{"0":8.614641189575195,"1":-30.21803855895996},1,{"gas":true,"boost":false,"leanL":false,"leanR":false,"turnL":false,"turnR":false}],[{"0":9.553866386413574,"1":19.015796661376953},{"0":11.27978515625,"1":-29.16647720336914},1,{"gas":true,"boost":false,"leanL":false,"leanR":false,"turnL":false,"turnR":false}],[{"0":23.509817123413086,"1":9.784224510192871},{"0":25.62010383605957,"1":2.7086620330810547},1,{"gas":false,"boost":false,"leanL":false,"leanR":true,"turnL":false,"turnR":false}],[{"0":24.348844528198242,"1":9.922734260559082},{"0":25.02223014831543,"1":4.633715629577637},1,{"gas":false,"boost":false,"leanL":false,"leanR":true,"turnL":false,"turnR":false}],[{"0":54.989845275878906,"1":20.385334014892578},{"0":49.734405517578125,"1":-0.7979626059532166},1,{"gas":true,"boost":false,"leanL":false,"leanR":false,"turnL":false,"turnR":false}],[{"0":59.23683547973633,"1":20.321142196655273},{"0":51.767478942871094,"1":-0.7522208094596863},1,{"gas":true,"boost":false,"leanL":false,"leanR":false,"turnL":false,"turnR":false}],[{"0":91.90177154541016,"1":10.771671295166016},{"0":45.69302749633789,"1":-11.149359703063965},1,{"gas":true,"boost":false,"leanL":false,"leanR":true,"turnL":false,"turnR":false}],[{"0":100.76945495605469,"1":9.924161911010742},{"0":50.50474166870117,"1":0.5851978063583374},1,{"gas":true,"boost":false,"leanL":false,"leanR":true,"turnL":false,"turnR":false}],[{"0":118.73014068603516,"1":13.669358253479004},{"0":42.76572799682617,"1":19.16585350036621},2,{"gas":true,"boost":false,"leanL":false,"leanR":true,"turnL":false,"turnR":false}],[{"0":120.08086395263672,"1":14.346821784973145},{"0":39.77947998046875,"1":20.70686149597168},2,{"gas":true,"boost":false,"leanL":false,"leanR":true,"turnL":false,"turnR":false}],[{"0":123.55532836914062,"1":16.677324295043945},{"0":31.23238754272461,"1":25.117454528808594},2,{"gas":true,"boost":false,"leanL":false,"leanR":true,"turnL":false,"turnR":false}],[{"0":128.56884765625,"1":23.711549758911133},{"0":13.4935941696167,"1":34.27128219604492},2,{"gas":true,"boost":false,"leanL":false,"leanR":true,"turnL":false,"turnR":false}],[{"0":129.79246520996094,"1":29.952529907226562},{"0":2.502908706665039,"1":39.94285202026367},2,{"gas":true,"boost":false,"leanL":false,"leanR":true,"turnL":false,"turnR":false}],[{"0":128.8445281982422,"1":37.276336669921875},{"0":-9.976000785827637,"1":26.62905502319336},3,{"gas":true,"boost":false,"leanL":false,"leanR":false,"turnL":false,"turnR":false}],[{"0":126.70623016357422,"1":41.04347610473633},{"0":-17.55919647216797,"1":23.944669723510742},3,{"gas":true,"boost":false,"leanL":false,"leanR":false,"turnL":false,"turnR":false}],[{"0":118.80030822753906,"1":47.085330963134766},{"0":-31.15125274658203,"1":11.544363975524902},3,{"gas":true,"boost":false,"leanL":false,"leanR":false,"turnL":false,"turnR":false}],[{"0":104.91063690185547,"1":49.89787673950195},{"0":-43.51504898071289,"1":2.457071304321289},3,{"gas":true,"boost":false,"leanL":false,"leanR":false,"turnL":false,"turnR":false}],[{"0":94.77405548095703,"1":50.289283752441406},{"0":-49.44634246826172,"1":-0.8574578762054443},3,{"gas":true,"boost":false,"leanL":false,"leanR":true,"turnL":false,"turnR":false}],[{"0":83.45314025878906,"1":49.91602325439453},{"0":-54.5337028503418,"1":-1.6033573150634766},3,{"gas":true,"boost":false,"leanL":false,"leanR":false,"turnL":false,"turnR":false}],[{"0":73.07444763183594,"1":49.64198303222656},{"0":-58.26871109008789,"1":-1.4080841541290283},3,{"gas":true,"boost":false,"leanL":false,"leanR":false,"turnL":false,"turnR":false}],[{"0":20.50531005859375,"1":47.27126693725586},{"0":-36.99907302856445,"1":-1.7425177097320557},0,{"gas":false,"boost":false,"leanL":true,"leanR":false,"turnL":false,"turnR":false}],[{"0":19.879230499267578,"1":47.2425651550293},{"0":-37.564815521240234,"1":-1.7220659255981445},0,{"gas":false,"boost":false,"leanL":true,"leanR":false,"turnL":false,"turnR":false}],[{"0":14.521113395690918,"1":46.94914245605469},{"0":-31.72296905517578,"1":-3.536733388900757},0,{"gas":true,"boost":false,"leanL":false,"leanR":true,"turnL":false,"turnR":false}],[{"0":13.532029151916504,"1":46.78351593017578},{"0":-28.994415283203125,"1":-5.442462921142578},0,{"gas":true,"boost":false,"leanL":false,"leanR":true,"turnL":false,"turnR":false}],[{"0":11.44570541381836,"1":46.099578857421875},{"0":-22.448362350463867,"1":-10.014484405517578},0,{"gas":true,"boost":false,"leanL":false,"leanR":true,"turnL":false,"turnR":false}],[{"0":10.448648452758789,"1":45.51129913330078},{"0":-18.702251434326172,"1":-12.630916595458984},0,{"gas":true,"boost":false,"leanL":false,"leanR":true,"turnL":false,"turnR":false}],[{"0":9.885976791381836,"1":45.047847747802734},{"0":-16.277549743652344,"1":-14.324422836303711},0,{"gas":true,"boost":false,"leanL":false,"leanR":true,"turnL":false,"turnR":false}],[{"0":9.402710914611816,"1":44.528934478759766},{"0":-13.909433364868164,"1":-15.978410720825195},0,{"gas":true,"boost":false,"leanL":false,"leanR":true,"turnL":false,"turnR":false}],[{"0":8.227291107177734,"1":41.92411804199219},{"0":-4.976841926574707,"1":-22.217287063598633},0,{"gas":true,"boost":false,"leanL":false,"leanR":true,"turnL":false,"turnR":false}],[{"0":8.334654808044434,"1":37.56690979003906},{"0":5.065415382385254,"1":-29.23119354248047},0,{"gas":true,"boost":false,"leanL":false,"leanR":true,"turnL":false,"turnR":false}],[{"0":8.434754371643066,"1":37.06877517700195},{"0":6.005963325500488,"1":-29.88810920715332},0,{"gas":true,"boost":false,"leanL":false,"leanR":true,"turnL":false,"turnR":false}],[{"0":8.938458442687988,"1":34.96929168701172},{"0":7.670787811279297,"1":-32.43956756591797},0,{"gas":true,"boost":false,"leanL":false,"leanR":false,"turnL":false,"turnR":false}],[{"0":9.189666748046875,"1":33.85713195800781},{"0":7.491781234741211,"1":-33.67081832885742},0,{"gas":true,"boost":false,"leanL":false,"leanR":false,"turnL":false,"turnR":false}],[{"0":9.90866470336914,"1":30.282461166381836},{"0":6.979438304901123,"1":-37.19483947753906},0,{"gas":true,"boost":false,"leanL":false,"leanR":false,"turnL":false,"turnR":false}],[{"0":10.24950885772705,"1":28.36681365966797},{"0":6.736559867858887,"1":-38.86541748046875},0,{"gas":true,"boost":false,"leanL":false,"leanR":false,"turnL":false,"turnR":false}],[{"0":12.505373001098633,"1":16.386913299560547},{"0":9.176581382751465,"1":-33.36442184448242},1,{"gas":true,"boost":false,"leanL":false,"leanR":true,"turnL":false,"turnR":false}],[{"0":12.855698585510254,"1":15.344073295593262},{"0":10.950699806213379,"1":-30.59756088256836},1,{"gas":true,"boost":false,"leanL":false,"leanR":true,"turnL":false,"turnR":false}],[{"0":13.264124870300293,"1":14.391844749450684},{"0":12.683417320251465,"1":-27.8952693939209},1,{"gas":true,"boost":false,"leanL":false,"leanR":true,"turnL":false,"turnR":false}],[{"0":19.34086799621582,"1":9.566161155700684},{"0":26.567035675048828,"1":-6.242819309234619},1,{"gas":true,"boost":false,"leanL":false,"leanR":true,"turnL":false,"turnR":false}],[{"0":19.795122146606445,"1":9.480002403259277},{"0":27.255220413208008,"1":-5.169548034667969},1,{"gas":true,"boost":false,"leanL":false,"leanR":true,"turnL":false,"turnR":false}],[{"0":21.724166870117188,"1":9.310081481933594},{"0":29.928131103515625,"1":-1.0009615421295166},1,{"gas":true,"boost":false,"leanL":false,"leanR":true,"turnL":false,"turnR":false}],[{"0":25.750118255615234,"1":9.767334938049316},{"0":29.08307456970215,"1":6.768221378326416},1,{"gas":false,"boost":false,"leanL":false,"leanR":true,"turnL":false,"turnR":false}],[{"0":40.04811477661133,"1":15.638867378234863},{"0":42.16777420043945,"1":12.703056335449219},1,{"gas":true,"boost":false,"leanL":true,"leanR":false,"turnL":false,"turnR":false}],[{"0":49.91567611694336,"1":17.31149673461914},{"0":48.29075622558594,"1":6.4517951011657715},1,{"gas":true,"boost":false,"leanL":false,"leanR":false,"turnL":false,"turnR":false}],[{"0":63.62061309814453,"1":18.526775360107422},{"0":51.67930603027344,"1":-0.4854409098625183},1,{"gas":false,"boost":false,"leanL":true,"leanR":false,"turnL":false,"turnR":false}],[{"0":78.8739013671875,"1":15.130454063415527},{"0":40.81013488769531,"1":-18.30281639099121},1,{"gas":false,"boost":false,"leanL":true,"leanR":false,"turnL":false,"turnR":false}],[{"0":80.86688995361328,"1":14.137407302856445},{"0":39.389976501464844,"1":-20.63082504272461},1,{"gas":false,"boost":false,"leanL":true,"leanR":false,"turnL":false,"turnR":false}],[{"0":81.51568603515625,"1":13.780929565429688},{"0":38.92766189575195,"1":-21.388683319091797},1,{"gas":false,"boost":false,"leanL":true,"leanR":false,"turnL":false,"turnR":false}],[{"0":89.05413055419922,"1":10.67934513092041},{"0":43.6746826171875,"1":-11.08354663848877},1,{"gas":true,"boost":false,"leanL":false,"leanR":true,"turnL":false,"turnR":false}],[{"0":96.7646713256836,"1":9.832366943359375},{"0":48.299095153808594,"1":-0.3612450361251831},1,{"gas":true,"boost":false,"leanL":false,"leanR":true,"turnL":false,"turnR":false}],[{"0":103.45742797851562,"1":10.370530128479004},{"0":51.62498474121094,"1":7.350281238555908},1,{"gas":true,"boost":false,"leanL":false,"leanR":true,"turnL":false,"turnR":false}],[{"0":106.96400451660156,"1":11.011059761047363},{"0":53.173770904541016,"1":10.94135856628418},1,{"gas":true,"boost":false,"leanL":false,"leanR":true,"turnL":false,"turnR":false}],[{"0":109.65999603271484,"1":11.64460563659668},{"0":54.288299560546875,"1":13.525535583496094},1,{"gas":true,"boost":false,"leanL":false,"leanR":true,"turnL":false,"turnR":false}],[{"0":111.4876708984375,"1":12.137354850769043},{"0":55.009681701660156,"1":15.198164939880371},1,{"gas":true,"boost":false,"leanL":false,"leanR":true,"turnL":false,"turnR":false}],[{"0":124.59510803222656,"1":18.413070678710938},{"0":34.5389518737793,"1":27.928119659423828},2,{"gas":true,"boost":false,"leanL":false,"leanR":true,"turnL":false,"turnR":false}],[{"0":125.67640686035156,"1":19.377485275268555},{"0":31.74468231201172,"1":29.2646484375},2,{"gas":true,"boost":false,"leanL":false,"leanR":true,"turnL":false,"turnR":false}],[{"0":126.66620635986328,"1":20.385671615600586},{"0":29.015623092651367,"1":30.569988250732422},2,{"gas":true,"boost":false,"leanL":false,"leanR":true,"turnL":false,"turnR":false}],[{"0":127.5666275024414,"1":21.436607360839844},{"0":26.350250244140625,"1":31.844867706298828},2,{"gas":true,"boost":false,"leanL":false,"leanR":true,"turnL":false,"turnR":false}],[{"0":127.98397827148438,"1":21.977792739868164},{"0":25.040979385375977,"1":32.471107482910156},2,{"gas":true,"boost":false,"leanL":false,"leanR":true,"turnL":false,"turnR":false}],[{"0":130.56732177734375,"1":26.66861343383789},{"0":15.10512924194336,"1":37.223541259765625},2,{"gas":true,"boost":false,"leanL":false,"leanR":true,"turnL":false,"turnR":false}],[{"0":131.79287719726562,"1":31.268068313598633},{"0":7.148676872253418,"1":41.029205322265625},2,{"gas":true,"boost":false,"leanL":false,"leanR":true,"turnL":false,"turnR":false}],[{"0":131.21998596191406,"1":40.346771240234375},{"0":-9.64501953125,"1":21.405517578125},3,{"gas":true,"boost":false,"leanL":false,"leanR":true,"turnL":false,"turnR":false}],[{"0":129.95108032226562,"1":42.057857513427734},{"0":-14.812100410461426,"1":14.11497688293457},3,{"gas":true,"boost":false,"leanL":false,"leanR":true,"turnL":false,"turnR":false}],[{"0":124.23409271240234,"1":44.57421112060547},{"0":-26.928316116333008,"1":8.274372100830078},3,{"gas":true,"boost":false,"leanL":false,"leanR":false,"turnL":false,"turnR":false}],[{"0":122.81981658935547,"1":44.978294372558594},{"0":-28.956159591674805,"1":7.98643159866333},3,{"gas":true,"boost":false,"leanL":true,"leanR":false,"turnL":false,"turnR":false}],[{"0":121.30651092529297,"1":45.46753692626953},{"0":-30.913436889648438,"1":10.67343807220459},3,{"gas":true,"boost":false,"leanL":true,"leanR":false,"turnL":false,"turnR":false}],[{"0":117.99646759033203,"1":46.588993072509766},{"0":-34.62602996826172,"1":10.886188507080078},3,{"gas":true,"boost":false,"leanL":false,"leanR":false,"turnL":false,"turnR":false}],[{"0":111.70006561279297,"1":48.24046325683594},{"0":-40.25810241699219,"1":7.685637474060059},3,{"gas":true,"boost":false,"leanL":false,"leanR":true,"turnL":false,"turnR":false}],[{"0":107.49320983886719,"1":48.68463897705078},{"0":-43.331634521484375,"1":3.3216235637664795},3,{"gas":true,"boost":false,"leanL":false,"leanR":false,"turnL":false,"turnR":false}],[{"0":106.76282501220703,"1":48.739349365234375},{"0":-43.823055267333984,"1":3.28263783454895},3,{"gas":true,"boost":false,"leanL":false,"leanR":false,"turnL":false,"turnR":false}],[{"0":106.02434539794922,"1":48.793418884277344},{"0":-44.3087043762207,"1":3.244109630584717},3,{"gas":true,"boost":false,"leanL":false,"leanR":false,"turnL":false,"turnR":false}],[{"0":98.2147445678711,"1":49.300392150878906},{"0":-48.86250305175781,"1":2.8828444480895996},3,{"gas":true,"boost":false,"leanL":false,"leanR":false,"turnL":false,"turnR":false}],[{"0":97.39326477050781,"1":49.347877502441406},{"0":-49.28900909423828,"1":2.849008798599243},3,{"gas":true,"boost":false,"leanL":false,"leanR":false,"turnL":false,"turnR":false}],[{"0":91.61544799804688,"1":49.66501235961914},{"0":-48.20750045776367,"1":2.623020887374878},3,{"gas":true,"boost":false,"leanL":false,"leanR":false,"turnL":false,"turnR":false}],[{"0":84.7956771850586,"1":50.03608322143555},{"0":-43.34786605834961,"1":2.3586032390594482},3,{"gas":true,"boost":false,"leanL":false,"leanR":false,"turnL":false,"turnR":false}],[{"0":79.97035217285156,"1":50.29862976074219},{"0":-39.909446716308594,"1":2.1715152263641357},3,{"gas":true,"boost":false,"leanL":false,"leanR":false,"turnL":false,"turnR":false}],[{"0":22.17654800415039,"1":10.585994720458984},{"0":27.709657669067383,"1":6.914553165435791},1,{"gas":true,"boost":false,"leanL":false,"leanR":true,"turnL":false,"turnR":false}],[{"0":55.23763656616211,"1":23.65742301940918},{"0":51.709205627441406,"1":9.742640495300293},1,{"gas":true,"boost":false,"leanL":true,"leanR":false,"turnL":false,"turnR":false}],[{"0":76.73657989501953,"1":20.139110565185547},{"0":43.42204284667969,"1":-18.65770721435547},1,{"gas":false,"boost":false,"leanL":true,"leanR":false,"turnL":false,"turnR":false}],[{"0":104.50908660888672,"1":9.398808479309082},{"0":43.28345489501953,"1":4.807346343994141},1,{"gas":true,"boost":false,"leanL":false,"leanR":true,"turnL":false,"turnR":false}],[{"0":123.90132141113281,"1":22.861515045166016},{"0":-13.084433555603027,"1":10.73684310913086},2,{"gas":true,"boost":false,"leanL":true,"leanR":false,"turnL":false,"turnR":false}],[{"0":125.10569763183594,"1":24.002710342407227},{"0":15.249981880187988,"1":-0.268049955368042},2,{"gas":true,"boost":false,"leanL":true,"leanR":false,"turnL":false,"turnR":false}],[{"0":110.24742126464844,"1":50.44639587402344},{"0":-41.14856719970703,"1":12.509961128234863},3,{"gas":true,"boost":false,"leanL":false,"leanR":true,"turnL":false,"turnR":false}],[{"0":38.16322326660156,"1":51.86336898803711},{"0":-61.62611389160156,"1":-3.677891969680786},0,{"gas":true,"boost":false,"leanL":false,"leanR":false,"turnL":false,"turnR":false}],[{"0":11.349736213684082,"1":33.45777893066406},{"0":7.285128593444824,"1":-33.52690887451172},0,{"gas":true,"boost":false,"leanL":true,"leanR":false,"turnL":false,"turnR":false}],[{"0":24.593589782714844,"1":11.260555267333984},{"0":29.82851791381836,"1":9.712214469909668},1,{"gas":false,"boost":false,"leanL":false,"leanR":true,"turnL":false,"turnR":false}],[{"0":26.050277709960938,"1":11.834075927734375},{"0":28.79051399230957,"1":12.339165687561035},1,{"gas":false,"boost":false,"leanL":false,"leanR":true,"turnL":false,"turnR":false}],[{"0":28.830015182495117,"1":13.361516952514648},{"0":27.821609497070312,"1":17.321998596191406},1,{"gas":true,"boost":false,"leanL":false,"leanR":true,"turnL":false,"turnR":false}],[{"0":68.86820220947266,"1":20.500654220581055},{"0":43.81381607055664,"1":-16.09773826599121},1,{"gas":false,"boost":false,"leanL":true,"leanR":false,"turnL":false,"turnR":false}],[{"0":84.05633544921875,"1":10.382057189941406},{"0":34.002960205078125,"1":-31.14871597290039},1,{"gas":true,"boost":false,"leanL":false,"leanR":true,"turnL":false,"turnR":false}],[{"0":91.60462951660156,"1":5.9859395027160645},{"0":40.716129302978516,"1":10.780393600463867},1,{"gas":true,"boost":false,"leanL":false,"leanR":true,"turnL":false,"turnR":false}],[{"0":132.53086853027344,"1":18.77528190612793},{"0":7.353675842285156,"1":23.710886001586914},2,{"gas":true,"boost":false,"leanL":false,"leanR":false,"turnL":false,"turnR":false}],[{"0":121.49462127685547,"1":51.297462463378906},{"0":-31.65978240966797,"1":29.77948760986328},3,{"gas":true,"boost":false,"leanL":false,"leanR":true,"turnL":false,"turnR":false}],[{"0":77.41902160644531,"1":46.27450942993164},{"0":-57.82821273803711,"1":-7.136597156524658},3,{"gas":true,"boost":false,"leanL":false,"leanR":false,"turnL":false,"turnR":false}],[{"0":71.5308609008789,"1":46.14524841308594},{"0":-59.602516174316406,"1":4.352998733520508},3,{"gas":true,"boost":false,"leanL":true,"leanR":false,"turnL":false,"turnR":false}],[{"0":9.451018333435059,"1":43.38608932495117},{"0":17.045738220214844,"1":-18.157766342163086},0,{"gas":true,"boost":false,"leanL":true,"leanR":false,"turnL":false,"turnR":false}],[{"0":11.811511039733887,"1":37.35588836669922},{"0":5.244936943054199,"1":-29.038909912109375},0,{"gas":true,"boost":false,"leanL":true,"leanR":false,"turnL":false,"turnR":false}],[{"0":15.545613288879395,"1":11.146028518676758},{"0":12.445001602172852,"1":-7.1243133544921875},1,{"gas":true,"boost":false,"leanL":false,"leanR":false,"turnL":false,"turnR":false}],[{"0":79.00780487060547,"1":13.833285331726074},{"0":4.811596870422363,"1":1.8099944591522217},1,{"gas":true,"boost":false,"leanL":false,"leanR":false,"turnL":false,"turnR":false}],[{"0":122.67972564697266,"1":14.428202629089355},{"0":33.1396369934082,"1":7.1686930656433105},2,{"gas":false,"boost":false,"leanL":false,"leanR":true,"turnL":false,"turnR":false}],[{"0":129.16751098632812,"1":17.191699981689453},{"0":10.302780151367188,"1":14.306370735168457},2,{"gas":true,"boost":false,"leanL":false,"leanR":true,"turnL":false,"turnR":false}],[{"0":119.50074768066406,"1":45.63975143432617},{"0":-28.34330940246582,"1":29.450572967529297},3,{"gas":false,"boost":false,"leanL":true,"leanR":false,"turnL":false,"turnR":false}],[{"0":71.6290512084961,"1":48.28374481201172},{"0":-56.86614227294922,"1":-4.833868980407715},3,{"gas":true,"boost":false,"leanL":false,"leanR":false,"turnL":false,"turnR":false}],[{"0":45.55577087402344,"1":46.934383392333984},{"0":-61.56001281738281,"1":-0.8367175459861755},3,{"gas":true,"boost":false,"leanL":false,"leanR":false,"turnL":false,"turnR":false}],[{"0":37.23556900024414,"1":46.778751373291016},{"0":-61.70247268676758,"1":-2.7495694160461426},0,{"gas":true,"boost":false,"leanL":false,"leanR":false,"turnL":false,"turnR":false}],[{"0":123.666748046875,"1":23.166641235351562},{"0":17.853181838989258,"1":-8.434139251708984},2,{"gas":false,"boost":false,"leanL":true,"leanR":false,"turnL":false,"turnR":false}],[{"0":13.795742988586426,"1":24.010074615478516},{"0":-0.39937400817871094,"1":0.02399161271750927},1,{"gas":false,"boost":false,"leanL":true,"leanR":false,"turnL":false,"turnR":false}],[{"0":13.667537689208984,"1":20.357160568237305},{"0":-0.30801817774772644,"1":-15.586792945861816},1,{"gas":false,"boost":false,"leanL":true,"leanR":false,"turnL":false,"turnR":false}],[{"0":122.5841293334961,"1":22.102725982666016},{"0":5.080044269561768,"1":26.02973175048828},2,{"gas":false,"boost":false,"leanL":true,"leanR":false,"turnL":false,"turnR":false}],[{"0":122.80339813232422,"1":45.15327453613281},{"0":-17.43471336364746,"1":15.244215965270996},3,{"gas":false,"boost":false,"leanL":true,"leanR":false,"turnL":false,"turnR":false}],[{"0":124.24210357666016,"1":18.82768440246582},{"0":-9.7742919921875,"1":19.0046329498291},2,{"gas":false,"boost":false,"leanL":true,"leanR":false,"turnL":false,"turnR":false}],[{"0":113.10671997070312,"1":53.716190338134766},{"0":-25.93869972229004,"1":10.425748825073242},3,{"gas":false,"boost":false,"leanL":false,"leanR":true,"turnL":false,"turnR":false}],[{"0":26.59751319885254,"1":45.9884147644043},{"0":-21.682430267333984,"1":2.029151886517866e-7},0,{"gas":false,"boost":false,"leanL":true,"leanR":false,"turnL":false,"turnR":false}],[{"0":23.316770553588867,"1":45.9884147644043},{"0":-26.781936645507812,"1":1.8462695550169883e-7},0,{"gas":false,"boost":false,"leanL":true,"leanR":false,"turnL":false,"turnR":false}],[{"0":21.40892219543457,"1":45.9884147644043},{"0":2.0440332889556885,"1":8.600069634212559e-8},0,{"gas":false,"boost":false,"leanL":true,"leanR":false,"turnL":false,"turnR":false}],[{"0":19.150123596191406,"1":45.9884147644043},{"0":-14.71194839477539,"1":6.871962199284098e-8},0,{"gas":false,"boost":false,"leanL":true,"leanR":false,"turnL":false,"turnR":false}],[{"0":18.891969680786133,"1":45.9884147644043},{"0":-15.489274978637695,"1":6.791306361719762e-8},0,{"gas":false,"boost":false,"leanL":true,"leanR":false,"turnL":false,"turnR":false}],[{"0":116.02932739257812,"1":38.94834899902344},{"0":-9.99022739364599e-16,"1":17.120420455932617},3,{"gas":false,"boost":false,"leanL":true,"leanR":false,"turnL":false,"turnR":false}],[{"0":116.02932739257812,"1":42.50902557373047},{"0":-1.4687457072974186e-15,"1":24.70192527770996},3,{"gas":false,"boost":false,"leanL":true,"leanR":false,"turnL":false,"turnR":false}],[{"0":41.61862564086914,"1":7.07478141784668},{"0":-0.1382218599319458,"1":10.37475299835205},1,{"gas":false,"boost":false,"leanL":false,"leanR":true,"turnL":false,"turnR":false}],[{"0":41.6053581237793,"1":8.413695335388184},{"0":-0.12876926362514496,"1":15.491929054260254},1,{"gas":false,"boost":false,"leanL":false,"leanR":true,"turnL":false,"turnR":false}],[{"0":41.597023010253906,"1":9.581260681152344},{"0":-0.12282942980527878,"1":18.707448959350586},1,{"gas":false,"boost":false,"leanL":false,"leanR":true,"turnL":false,"turnR":false}],[{"0":42.29268264770508,"1":16.752538681030273},{"0":8.488347053527832,"1":30.799240112304688},1,{"gas":true,"boost":false,"leanL":false,"leanR":true,"turnL":false,"turnR":false}],[{"0":84.01482391357422,"1":21.971435546875},{"0":-8.467316682228738e-16,"1":-13.932555198669434},1,{"gas":false,"boost":false,"leanL":true,"leanR":false,"turnL":false,"turnR":false}],[{"0":84.01482391357422,"1":21.726118087768555},{"0":-8.980260247449037e-16,"1":-14.719030380249023},1,{"gas":false,"boost":false,"leanL":true,"leanR":false,"turnL":false,"turnR":false}],[{"0":84.01482391357422,"1":16.99830436706543},{"0":-1.556037322951421e-15,"1":-24.808059692382812},1,{"gas":true,"boost":false,"leanL":false,"leanR":true,"turnL":false,"turnR":false}],[{"0":84.01482391357422,"1":14.92802906036377},{"0":0,"1":-18.981761932373047},1,{"gas":true,"boost":false,"leanL":true,"leanR":true,"turnL":false,"turnR":false}],[{"0":84.01482391357422,"1":14.616212844848633},{"0":0,"1":-18.708974838256836},1,{"gas":true,"boost":false,"leanL":true,"leanR":true,"turnL":false,"turnR":false}],[{"0":84.73465728759766,"1":11.435126304626465},{"0":8.543346405029297,"1":-16.341014862060547},1,{"gas":true,"boost":false,"leanL":false,"leanR":true,"turnL":false,"turnR":false}],[{"0":85.2510986328125,"1":10.73632526397705},{"0":11.210972785949707,"1":-12.807435035705566},1,{"gas":false,"boost":false,"leanL":false,"leanR":true,"turnL":false,"turnR":false}],[{"0":99.5545425415039,"1":14.017532348632812},{"0":11.516644477844238,"1":-1.2488378331454442e-7},1,{"gas":true,"boost":false,"leanL":false,"leanR":false,"turnL":false,"turnR":false}],[{"0":100.00373840332031,"1":14.017532348632812},{"0":4.907668113708496,"1":-1.1920928955078125e-7},1,{"gas":true,"boost":false,"leanL":false,"leanR":true,"turnL":false,"turnR":false}],[{"0":100.10040283203125,"1":14.017532348632812},{"0":5.800066947937012,"1":5.960464477539063e-8},1,{"gas":true,"boost":false,"leanL":false,"leanR":true,"turnL":false,"turnR":false}],[{"0":100.98311614990234,"1":14.017532348632812},{"0":10.938756942749023,"1":5.960464477539063e-8},1,{"gas":true,"boost":false,"leanL":false,"leanR":true,"turnL":false,"turnR":false}],[{"0":102.15652465820312,"1":14.017532348632812},{"0":-2.9476635456085205,"1":-1.1920928955078125e-7},1,{"gas":true,"boost":false,"leanL":false,"leanR":true,"turnL":false,"turnR":false}],[{"0":103.64604949951172,"1":14.017532348632812},{"0":-5.1493120193481445,"1":-0.000019343890016898513},1,{"gas":true,"boost":false,"leanL":false,"leanR":false,"turnL":false,"turnR":false}],[{"0":103.5787353515625,"1":14.017532348632812},{"0":-4.038874626159668,"1":-0.000019116852854494937},1,{"gas":true,"boost":false,"leanL":false,"leanR":true,"turnL":false,"turnR":false}],[{"0":103.83134460449219,"1":14.017532348632812},{"0":5.697502613067627,"1":0},1,{"gas":true,"boost":false,"leanL":false,"leanR":true,"turnL":false,"turnR":false}],[{"0":104.65355682373047,"1":14.017532348632812},{"0":4.40329647064209,"1":0},1,{"gas":true,"boost":false,"leanL":false,"leanR":true,"turnL":false,"turnR":false}],[{"0":104.84258270263672,"1":14.017532348632812},{"0":6.089978218078613,"1":0},1,{"gas":true,"boost":false,"leanL":false,"leanR":true,"turnL":false,"turnR":false}],[{"0":105.00980377197266,"1":14.017532348632812},{"0":-1.5809991359710693,"1":0},1,{"gas":true,"boost":false,"leanL":false,"leanR":true,"turnL":false,"turnR":false}],[{"0":105.46907043457031,"1":14.017532348632812},{"0":6.490307807922363,"1":0},1,{"gas":true,"boost":false,"leanL":false,"leanR":true,"turnL":false,"turnR":false}],[{"0":107.6791000366211,"1":14.017532348632812},{"0":7.055866241455078,"1":-2.990587463135236e-16},1,{"gas":true,"boost":false,"leanL":false,"leanR":false,"turnL":false,"turnR":false}],[{"0":109.6226577758789,"1":14.017532348632812},{"0":15.283753395080566,"1":-8.467299741569793e-16},1,{"gas":true,"boost":false,"leanL":false,"leanR":false,"turnL":false,"turnR":false}],[{"0":112.14319610595703,"1":14.017532348632812},{"0":11.99339771270752,"1":0},1,{"gas":true,"boost":false,"leanL":false,"leanR":true,"turnL":false,"turnR":false}],[{"0":115.86349487304688,"1":14.017532348632812},{"0":19.8153133392334,"1":0},1,{"gas":false,"boost":false,"leanL":false,"leanR":true,"turnL":false,"turnR":true}],[{"0":13.112754821777344,"1":45.997135162353516},{"0":-10.195755004882812,"1":0},0,{"gas":false,"boost":false,"leanL":true,"leanR":false,"turnL":false,"turnR":false}],[{"0":82.44790649414062,"1":17.665678024291992},{"0":0.21103917062282562,"1":-1.866334080696106},1,{"gas":false,"boost":false,"leanL":true,"leanR":false,"turnL":false,"turnR":false}],[{"0":82.4615707397461,"1":17.380142211914062},{"0":0.20130443572998047,"1":-5.710372447967529},1,{"gas":false,"boost":false,"leanL":true,"leanR":false,"turnL":false,"turnR":false}],[{"0":82.4681625366211,"1":17.14333152770996},{"0":0.19660677015781403,"1":-7.565377712249756},1,{"gas":false,"boost":false,"leanL":true,"leanR":false,"turnL":false,"turnR":false}],[{"0":82.47459411621094,"1":16.84576988220215},{"0":0.19201873242855072,"1":-9.377095222473145},1,{"gas":false,"boost":false,"leanL":true,"leanR":false,"turnL":false,"turnR":false}],[{"0":16.61652183532715,"1":45.99654006958008},{"0":-0.8553789854049683,"1":2.7764219368009435e-8},0,{"gas":false,"boost":false,"leanL":true,"leanR":false,"turnL":false,"turnR":false}],[{"0":16.586599349975586,"1":45.99654006958008},{"0":-1.7953394651412964,"1":2.7438352034891977e-8},0,{"gas":false,"boost":false,"leanL":true,"leanR":false,"turnL":false,"turnR":false}],[{"0":16.4046630859375,"1":45.99654006958008},{"0":-4.549543857574463,"1":2.6483522930220715e-8},0,{"gas":false,"boost":false,"leanL":true,"leanR":false,"turnL":false,"turnR":false}],[{"0":119.97221374511719,"1":41.35383224487305},{"0":-0.11618871986865997,"1":7.422468662261963},3,{"gas":false,"boost":false,"leanL":true,"leanR":false,"turnL":false,"turnR":false}],[{"0":119.96653747558594,"1":41.81553268432617},{"0":-0.11214544624090195,"1":10.129101753234863},3,{"gas":false,"boost":false,"leanL":true,"leanR":false,"turnL":false,"turnR":false}],[{"0":119.36029052734375,"1":45.285762786865234},{"0":-7.775157928466797,"1":20.8106746673584},3,{"gas":true,"boost":false,"leanL":true,"leanR":false,"turnL":false,"turnR":false}],[{"0":120.85783386230469,"1":21.564001083374023},{"0":17.76744270324707,"1":31.213504791259766},2,{"gas":true,"boost":false,"leanL":true,"leanR":false,"turnL":false,"turnR":false}],[{"0":125.38673400878906,"1":22.411550521850586},{"0":26.581571578979492,"1":-15.793435096740723},2,{"gas":false,"boost":false,"leanL":true,"leanR":false,"turnL":false,"turnR":false}],[{"0":126.30705261230469,"1":21.89433479309082},{"0":27.949525833129883,"1":-15.424878120422363},2,{"gas":false,"boost":false,"leanL":true,"leanR":false,"turnL":false,"turnR":false}],[{"0":121.92737579345703,"1":15.436979293823242},{"0":26.392099380493164,"1":19.583383560180664},2,{"gas":false,"boost":false,"leanL":true,"leanR":false,"turnL":false,"turnR":false}],[{"0":125.32110595703125,"1":17.616928100585938},{"0":31.056928634643555,"1":18.03000259399414},2,{"gas":false,"boost":false,"leanL":true,"leanR":false,"turnL":false,"turnR":false}],[{"0":118.45756530761719,"1":14.339010238647461},{"0":18.279359817504883,"1":17.873891830444336},2,{"gas":true,"boost":false,"leanL":true,"leanR":false,"turnL":false,"turnR":false}],[{"0":121.77049255371094,"1":17.594581604003906},{"0":25.025522232055664,"1":24.660926818847656},2,{"gas":true,"boost":false,"leanL":true,"leanR":false,"turnL":false,"turnR":false}],[{"0":123.09185028076172,"1":18.881460189819336},{"0":27.119583129882812,"1":25.767677307128906},2,{"gas":false,"boost":false,"leanL":true,"leanR":false,"turnL":false,"turnR":false}],[{"0":123.55520629882812,"1":19.30588150024414},{"0":27.80128288269043,"1":25.46524429321289},2,{"gas":false,"boost":false,"leanL":true,"leanR":false,"turnL":false,"turnR":false}],[{"0":128.14871215820312,"1":22.908376693725586},{"0":30.599308013916016,"1":22.898178100585938},2,{"gas":false,"boost":false,"leanL":false,"leanR":true,"turnL":false,"turnR":false}],[{"0":14.004927635192871,"1":19.805036544799805},{"0":-1.0593409882631022e-7,"1":5.3345489501953125},1,{"gas":false,"boost":false,"leanL":true,"leanR":false,"turnL":false,"turnR":false}],[{"0":14.004927635192871,"1":19.961589813232422},{"0":-9.868955430647475e-8,"1":-0.9494514465332031},1,{"gas":false,"boost":false,"leanL":true,"leanR":false,"turnL":false,"turnR":false}],[{"0":14.004927635192871,"1":19.544397354125977},{"0":-9.194044281457536e-8,"1":-6.419864177703857},1,{"gas":false,"boost":false,"leanL":true,"leanR":false,"turnL":false,"turnR":false}],[{"0":14.004927635192871,"1":19.286840438842773},{"0":-8.979490928595624e-8,"1":-8.158899307250977},1,{"gas":false,"boost":false,"leanL":true,"leanR":false,"turnL":false,"turnR":false}],[{"0":14.004927635192871,"1":18.396684646606445},{"0":-8.46475813887082e-8,"1":-12.33100414276123},1,{"gas":false,"boost":false,"leanL":true,"leanR":false,"turnL":false,"turnR":false}],[{"0":52.545127868652344,"1":45.99514389038086},{"0":-5.535343170166016,"1":0},0,{"gas":false,"boost":false,"leanL":true,"leanR":false,"turnL":false,"turnR":false}],[{"0":52.18054962158203,"1":45.99514389038086},{"0":-8.15939712524414,"1":0},0,{"gas":false,"boost":false,"leanL":true,"leanR":false,"turnL":false,"turnR":false}],[{"0":51.68782043457031,"1":45.99514389038086},{"0":-10.692137718200684,"1":0},0,{"gas":false,"boost":false,"leanL":true,"leanR":false,"turnL":false,"turnR":false}],[{"0":50.83919906616211,"1":45.99514389038086},{"0":-13.932555198669434,"1":0},0,{"gas":false,"boost":false,"leanL":true,"leanR":false,"turnL":false,"turnR":false}],[{"0":47.82097244262695,"1":45.99514389038086},{"0":-21.394662857055664,"1":0},0,{"gas":false,"boost":false,"leanL":true,"leanR":false,"turnL":false,"turnR":false}],[{"0":46.279541015625,"1":45.99514389038086},{"0":-24.141403198242188,"1":0},0,{"gas":false,"boost":false,"leanL":true,"leanR":false,"turnL":false,"turnR":false}],[{"0":45.86607360839844,"1":45.99514389038086},{"0":-24.808059692382812,"1":0},0,{"gas":false,"boost":false,"leanL":true,"leanR":false,"turnL":false,"turnR":false}],[{"0":38.46635818481445,"1":45.99514389038086},{"0":-33.701454162597656,"1":0},0,{"gas":false,"boost":false,"leanL":true,"leanR":false,"turnL":false,"turnR":false}],[{"0":37.315364837646484,"1":45.99514389038086},{"0":-34.8038444519043,"1":0},0,{"gas":false,"boost":false,"leanL":true,"leanR":false,"turnL":false,"turnR":false}],[{"0":34.28425979614258,"1":45.99514389038086},{"0":-37.34917068481445,"1":0},0,{"gas":false,"boost":false,"leanL":true,"leanR":false,"turnL":false,"turnR":false}],[{"0":88.59745788574219,"1":14.002036094665527},{"0":1.7085984238953917e-20,"1":-2.945253285702165e-8},1,{"gas":true,"boost":false,"leanL":false,"leanR":false,"turnL":false,"turnR":false}],[{"0":88.61328887939453,"1":14.002036094665527},{"0":0.949999988079071,"1":-2.9106850263360684e-8},1,{"gas":true,"boost":false,"leanL":false,"leanR":false,"turnL":false,"turnR":false}],[{"0":89.60263061523438,"1":14.002036094665527},{"0":9.85783863067627,"1":-2.5865499964083938e-8},1,{"gas":true,"boost":false,"leanL":false,"leanR":false,"turnL":false,"turnR":false}],[{"0":90.62945556640625,"1":14.002036094665527},{"0":13.932555198669434,"1":-2.4382808661016497e-8},1,{"gas":true,"boost":false,"leanL":false,"leanR":false,"turnL":false,"turnR":false}],[{"0":91.13304138183594,"1":14.002036094665527},{"0":15.4962739944458,"1":-2.381380781457665e-8},1,{"gas":true,"boost":false,"leanL":false,"leanR":false,"turnL":false,"turnR":false}]]')
window.brain = brain

function computeMemoryDistance (memory, ship) {
  return vec2.distance(memory[0], ship.position) +
         vec2.distance(memory[1], ship.velocity) / 10
}

function findClosestMemory (ship) : Memory {
  let closestMemory = brain[0]
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

function gameLoop () {
  requestAnimationFrame(gameLoop)

  if (game == null) return
  meter.tickStart()

  // get inputs for this turn
  let gamepads = getGamepads.apply(navigator)
  game.turn.ships.forEach((ship, i) => {
    if (ship == null || i !== myShipId) return

    const gamepad = gamepads[i]
    const oldInput = oldInputs[i] || new PlayerInput()
    let input = new PlayerInput()

    if (shouldAILearn || (!shouldAILearn && !shouldAIExecute)) {
      input.turnL = padIsKeyDown(gamepad, kbd.LEFT_ARROW)
      input.turnR = padIsKeyDown(gamepad, kbd.RIGHT_ARROW)
      input.leanL = padIsKeyDown(gamepad, 'a')
      input.leanR = padIsKeyDown(gamepad, 'd')
      input.gas = padIsKeyDown(gamepad, kbd.UP_ARROW)
      input.boost = padIsKeyDown(gamepad, 's')

      // keyboard
      input.turnL = input.turnL || kbd.isKeyDown(kbd.LEFT_ARROW)
      input.turnR = input.turnR || kbd.isKeyDown(kbd.RIGHT_ARROW)
      input.leanL = input.leanL || kbd.isKeyDown('a')
      input.leanR = input.leanR || kbd.isKeyDown('d')
      input.gas = input.gas || kbd.isKeyDown(kbd.UP_ARROW)
      input.boost = input.boost || kbd.isKeyDown('s')
    }

    // save into brain if ai disabled
    const shipAngle = getAngle(ship.angle)

    if (shouldAILearn) {
      const anyKeyIsDown = input.leanL || input.leanR || input.gas
      if (Math.random() < 0.1 && anyKeyIsDown) {
        brain.push([ship.position, ship.velocity, getAngle(ship.angle), input])
      }
    } else if (shouldAIExecute) {
      const closestMemory = findClosestMemory(ship)
      input = new PlayerInput(closestMemory[3])
      const angle = closestMemory[2]
      input.turnL = ((shipAngle - 1) % 4 === angle) ||
                    ((shipAngle - 2) % 4 === angle)
      input.turnR = ((shipAngle + 1) % 4 === angle)
    }

    // generate PlayerEvents from input - oldInput
    const events = []
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

    if (events.length > 0) {
      game.onPlayerEvents(myShipId, events, game.turnIndex)
      socket.emit('player:events', events, game.turnIndex)
    }
    oldInputs[i] = input
  })

  // perform physics updates
  const currentTurn = game.canTick()
    ? game.tick()
    : game.fakeTick()

  // update ship sprites
  gameController.update(currentTurn)

  // update camera
  const [halfWidth, halfHeight] = [
    window.innerWidth,
    window.innerHeight
  ].map(e => e / 2)

  const player = gameController.ships[myShipId]
  if (player) {
    const { stage } = gameController
    stage.position = new PIXI.Point(
      halfWidth - player.sprite.position.x * stage.scale.x,
      halfHeight - player.sprite.position.y * stage.scale.y)
    camera.pivot = { x: halfWidth, y: halfHeight }
    camera.position = new PIXI.Point(halfWidth, halfHeight)
    const deg360 = (Math.PI * 2)
    while (-player.sprite.rotation < camera.rotation - deg360) {
      camera.rotation -= deg360
    }
    while (-player.sprite.rotation > camera.rotation + deg360) {
      camera.rotation += deg360
    }
    camera.rotation += (-player.sprite.rotation - camera.rotation) / 15
  }

  console.log(-player.sprite.rotation, camera.rotation)

  renderer.render(camera)
  renderLeaderboard()
  meter.tick()
}

function numberToHexColor (color: number) {
  let hexcolor = color.toString(16)
  return `#${repeat('0', 6 - hexcolor.length)}${hexcolor}`
}

function filterNulls<T> (arr: Array<?T>) : Array<T> {
  const result = []
  arr.forEach((elem) => {
    if (elem != null) result.push(elem)
  })
  return result
}

const leaderboard = document.getElementById('leaderboard')
function renderLeaderboard () {
  const ships: Array<Ship> = filterNulls(game.turn.ships)
  ships.sort((a: Ship, b: Ship) => {
    if (a.lap > b.lap) return -1
    else if (b.lap > a.lap) return 1

    if (a.checkpoint !== b.checkpoint) return (a.checkpoint - b.checkpoint)
    const aTotalTime = a.laptimes.reduce((prev, curr, i) => prev + curr, 0)
    const bTotalTime = b.laptimes.reduce((prev, curr, i) => prev + curr, 0)
    return (aTotalTime - bTotalTime)
  })
  const maxUsernameLength = ships.reduce((max, ship) => {
    if (ship == null) return max
    return Math.max(max, ship.username.length)
  }, 0)

  let title = 'Username'
  let leaderboardContent = `| ${title}${repeat(' ', Math.max(0, maxUsernameLength - title.length))} | `

  title = 'Laps'
  leaderboardContent += `${title} | `

  title = 'Time'
  const timeLength = '0:00.000'.length
  leaderboardContent += `${title}${repeat(' ', timeLength - title.length)} | `

  title = 'Best lap'
  leaderboardContent += `${title}${repeat(' ', timeLength - title.length)} |<br>`

  const usernameSectionLength = Math.max(maxUsernameLength, 'Username'.length)

  leaderboardContent += `| ${repeat('-', usernameSectionLength)} | ${repeat('-', 'Laps'.length)} | ${repeat('-', timeLength)} | ${repeat('-', timeLength)} |<br>`

  ships.forEach((ship) => {
    if (ship == null) return
    const { color, username } = ship
    const lap = ship.lap > C.MAX_LAPS
      ? '⚑'
      : `${Math.max(1, ship.lap)}/${C.MAX_LAPS}`

    // time stuff
    const totalTime = ship.totalTime()
    let bestLap = ship.bestLap()
    bestLap = (bestLap === Infinity ? repeat(' ', timeLength) : timeToString(bestLap))

    leaderboardContent += `| <span style="color: ${numberToHexColor(color)}">${username}</span>${repeat(' ', usernameSectionLength - username.length)} | ${repeat(' ', 'Laps'.length - lap.length)}${lap} | ${timeToString(totalTime)} | ${bestLap} |<br>`
  })

  if (game.turn.state === C.GAME_STATE.FINISH_COUNTDOWN) {
    leaderboardContent += `&nbsp;&nbsp;Finishing race in ${Math.ceil(game.turn.counter * C.TIME_STEP / 1000)}...`
  } else if (game.turn.state === C.GAME_STATE.RESULTS_SCREEN) {
    leaderboardContent += `&nbsp;&nbsp;Restarting game in ${Math.ceil(game.turn.counter * C.TIME_STEP / 1000)}...`
  }

  if (leaderboard.innerHTML !== leaderboardContent) {
    leaderboard.innerHTML = leaderboardContent
  }
}

const AI_ENABLED = bool(localStorage.getItem('AI_ENABLED'))
let shouldAIExecute = false
let shouldAILearn = false

function updateLeaderboardBGColor () {
  let bg = ''
  if (shouldAILearn) bg = 'red'
  else if (shouldAIExecute) bg = 'blue'
  leaderboard.style.background = bg
}

// avoid moving the page around
document.addEventListener('keydown', (e: KeyboardEvent) => {
  switch (e.keyCode) {
    case kbd.LEFT_ARROW:
    case kbd.RIGHT_ARROW:
    case kbd.UP_ARROW:
    case kbd.DOWN_ARROW:
      e.preventDefault()
      break
    case kbd.SPACE_BAR:
      console.log('spacebar!')
      if (AI_ENABLED) {
        shouldAILearn = true
        updateLeaderboardBGColor()
      }
      break
    case 77: // 'm' for MODE
      if (AI_ENABLED) {
        shouldAIExecute = !shouldAIExecute
        updateLeaderboardBGColor()
      }
      break
    default:
      break
  }
}, false)
document.addEventListener('keyup', (e: KeyboardEvent) => {
  if (e.keyCode === kbd.SPACE_BAR) {
    if (AI_ENABLED) {
      shouldAILearn = false
      updateLeaderboardBGColor()
    }
  }
})

socket.on('game:bootstrap', (data) => {
  const { initialTurn, map, turnsSlice, shipId, lastTick } = data
  myShipId = shipId

  // so that I don't go cray cray with the music
  if (MUSIC_OFF || (DEBUG_MODE && shipId !== 0)) {
    console.log('not playing music')
  } else if (!playing) {
    console.log('play music')
    playing = true
    bgMusic.play()
  }

  game = new Game(map)
  game.turns = []
  let lastTurn
  for (let i = 0; i < turnsSlice.length; ++i) {
    let { ships, events, serverEvents } = turnsSlice[i]
    ships = ships.map((rawShip) => rawShip && new Ship(rawShip))
    const turn = new Turn(ships, events, serverEvents)
    game.turns[initialTurn + i] = turn
    lastTurn = turn
  }
  if (lastTurn == null) return
  game.turn = lastTurn
  game.turnIndex = game.turns.length - 1
  game.lastTick = lastTick
  game.lava = initialTurn
  game.resimulateFrom(initialTurn)

  if (gameController != null) {
    camera.removeChild(gameController.stage)
  }

  gameController = new GameController(game)
  gameController.stage.scale = { x: ZOOM, y: ZOOM }
  camera.addChild(gameController.stage)

  if (DEBUG_MODE) {
    debugGame = new Game(map)
    debugGameController = new GameController(debugGame, true)
    debugGameController.stage.alpha = 0.5
    gameController.stage.addChild(debugGameController.stage)
  }

  console.log('got bootstrapped by server')
  setTimeout(function () {
    const myShip = game.turn.ships[myShipId]
    if (myShip != null) {
      const hexColor = numberToHexColor(myShip.color)
      leaderboard.style.boxShadow = `${hexColor} 2px 2px`
      chatInput.style.boxShadow = `${hexColor} 2px 2px`
    }
  }, 0)
})

socket.on('server:event', (event, turnIndex) => {
  game.onServerEvent(event, turnIndex)
})

socket.on('player:events', (shipId, events, turnIndex) => {
  // applying own inputs since game might have been bootstrapped after
  // client issued such commands
  // if (shipId === myShipId) return
  if (game == null) return
  try {
    game.onPlayerEvents(shipId, events, turnIndex)
  } catch (e) {
    if (e instanceof C.InvalidTurnError) {
      console.log('got lost, requesting bootstrap')
      socket.emit('player:lost')
    }
  }
})

socket.on('game:debug', (turn) => {
  if (!DEBUG_MODE) return
  debugGameController.update(turn)
})

gameLoop()

const username = localStorage.getItem('username') || prompt('Username:')
localStorage.setItem('username', username)

socket.emit('game:join', username, DEBUG_MODE)

const version = require('../package.json').version
document.getElementById('gameVersion').innerHTML = `v${version}`
