// @flow
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
  aiType: 'ml',
  grid: [
    '###############',
    '# 5  ###  3   #',
    '# #   4  ### 2#',
    '#6########### #',
    '# ##########  #',
    '# 7   8  91   #',
    '###############'
  ].map((row) => row.split('')),
  aiGrid: [
    '###############',
    '#rrdd###rrrrdd#',
    '#u#rrrrru###rd#',
    '#u###########d#',
    '#u##########dl#',
    '#ullllllllllll#',
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
  aiType: 'grid',
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
  ].map((row) => row.split('')),
  aiGrid: [
    '##########################',
    '#ddllllllllllllllllllllll#',
    '#dd##################ulll#',
    '#dd##rrrrrrrrrrrrrrrruuul#',
    '#dd##rru##################',
    '#dd##uuulllllllllllllllll#',
    '#dd####################ul#',
    '#rd#####  #######  ##rruu#',
    '#rrd################ruuuu#',
    '#rrrrrrrrrrrrrrrrrrruuuuu#',
    '##rrrrrrrrrrrrrrrrrrruuuu#',
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
  nBots: 8,
  skyboxColor: 0x000000,
  wallColor: 0x000000,
  boostDisabled: true,
  startingCheckpoint: '1',
  messages: [],
  zoom: 12,
  aiType: 'grid',
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
  ].map((row) => row.split('')),
  aiGrid: [
    '##########################',
    '####ddddddd#ddddd#########',
    '####rrrrrrrrrdddd#########',
    '####rruuuuu#urrdd#########',
    '####rru#######rrddddddddl#',
    '####rul#######rrrrrrrdddl#',
    '####rul#######uuuuuuurrdl#',
    '####rul###############ddl#',
    '####rullldd####ddddddddll#',
    '####ruuuullllllllllllllll#',
    '####uuuuuuu####uuuuuuuuuu#',
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
  id: 'Bowser Castle',
  name: 'Bowser Castle',
  background: 'images/Bowser_Castle.png',
  foreground: '',
  bgmusic: 'sounds/BowserCastle.wav',
  bgmusicFinalLap: 'sounds/BowserCastleFinalLap.wav',
  nBots: 10,
  skyboxColor: 0xB00000,
  wallColor: 0x000000,
  boostDisabled: true,
  startingCheckpoint: '9',
  zoom: 8,
  messages: [],
  aiType: 'grid',
  grid: x2([
    '#################',
    '#         91    #',
    '#8############  #',
    '# ############  #',
    '# ############  #',
    '# ##  2         #',
    '# ##  ###########',
    '# ##33###########',
    '# ##         4  #',
    '# ############  #',
    '# ############  #',
    '# ############55#',
    '# ## # # # ##   #',
    '# 7         6   #',
    '#### # # # ##   #',
    '#################'
  ].map((row) => row.split(''))),
  aiGrid: [
    '##################################',
    '##################################',
    '##ddddddllllllllllllllllllllllll##',
    '##ddllllllllllllllllllllllllllll##',
    '##dd########################ulll##',
    '##dd########################uull##',
    '##dd########################uull##',
    '##dd########################uuuu##',
    '##dd########################uuuu##',
    '##dd########################uuuu##',
    '##dd####rrrrrrrrrrrrrrrrrrrruuuu##',
    '##dd####rrrrrrrrrrrrrrrruuuuuuuu##',
    '##dd####rrru######################',
    '##dd####rruu######################',
    '##dd####uuuu######################',
    '##dd####uuuu######################',
    '##dd####uuuullllllllllllllllllll##',
    '##dd####uuuuuuulllllllllllllllll##',
    '##dd########################ulll##',
    '##dd########################uull##',
    '##dd########################uull##',
    '##dd########################uuuu##',
    '##dd########################uuuu##',
    '##dd########################uuuu##',
    '##rd####dd##dd##dd##dd####rruuuu##',
    '##rd####dd##dd##dd##dd####ruuuuu##',
    '##rrrrrrrrrrrrrrrrrrrrrrrruuuuuu##',
    '##rrrrrrrrrrrrrrrrrrrrrruuuuuuuu##',
    '########uu##uu##uu##uu####uuuuuu##',
    '########uu##uu##uu##uu####uuuuuu##',
    '##################################',
    '##################################'
  ].map((row) => row.split(''))
}

const tracks = [track1, track2, track3, track4]

module.exports = { tracks, track1, track2, track3, track4 }
