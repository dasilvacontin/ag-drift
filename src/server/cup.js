// @flow
const C = require('../common/constants.js')

const CUP_POINTS = [15, 12, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1]

const CUP_HOST_COMMANDS = 'Host commands: /restart, /bots [on|off], /boost [on|off], /gamemode timeattack.'
const TIMEATTACK_HOST_COMMANDS = 'Host commands: /restart, /track, /gamemode cup'

function hostCommandsForMode (sessionMode: string) {
  if (sessionMode === C.SESSION_MODE.TIMEATTACK) return TIMEATTACK_HOST_COMMANDS
  return CUP_HOST_COMMANDS
}

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

function trackIndices (count: number) {
  return Array.from({ length: count }, (_, i) => i)
}

function shuffleTracksOrder (avoidFirstTrackIndex: ?number, trackCount: number = 4) {
  const all = trackIndices(trackCount)
  if (avoidFirstTrackIndex == null) {
    return shuffleArray(all)
  }

  const firstCandidates = all.filter(i => i !== avoidFirstTrackIndex)
  const first = firstCandidates[Math.floor(Math.random() * firstCandidates.length)]
  const rest = shuffleArray(all.filter(i => i !== first))
  return [first, ...rest]
}

function compareShipsForPlacement (a, b) {
  if (a.lap > b.lap) return -1
  if (b.lap > a.lap) return 1
  if (a.checkpoint !== b.checkpoint) return a.checkpoint - b.checkpoint
  const aTotalTime = a.laptimes.reduce((prev, curr) => prev + curr, 0)
  const bTotalTime = b.laptimes.reduce((prev, curr) => prev + curr, 0)
  return aTotalTime - bTotalTime
}

function computePlacements (ships) {
  const racers = ships.filter(ship => ship)
  racers.sort(compareShipsForPlacement)
  return racers.map((ship, i) => ({
    username: ship.username,
    position: i + 1
  }))
}

function shouldAdvanceCupRace ({
  sessionMode,
  cupActive,
  state,
  counter,
  counterBeforeTick,
  resultsHoldEmitted
}) {
  return sessionMode === C.SESSION_MODE.CUP && cupActive &&
    state === C.GAME_STATE.RESULTS_SCREEN &&
    counter === 0 &&
    counterBeforeTick > 0 &&
    !resultsHoldEmitted
}

class CupManager {
  tracks: Array<Object>
  trackOrder: Array<number>
  raceIndex: number
  scores: Map<string, number>
  active: boolean
  hostUsername: ?string
  cupBotCount: number

  constructor (tracks: Array<Object>) {
    this.tracks = tracks
    this.trackOrder = trackIndices(tracks.length)
    this.raceIndex = 0
    this.scores = new Map()
    this.active = false
    this.hostUsername = null
    this.cupBotCount = 0
  }

  shuffleTracks (avoidFirstTrackIndex: ?number = null) {
    this.trackOrder = shuffleTracksOrder(avoidFirstTrackIndex, this.tracks.length)
  }

  start (hostUsername: string) {
    const lastTrackIndex = this.trackOrder[this.raceIndex]
    this.shuffleTracks(lastTrackIndex)
    this.scores = new Map()
    this.raceIndex = 0
    this.active = true
    this.hostUsername = hostUsername
  }

  resetForNextSession () {
    this.shuffleTracks()
    this.scores = new Map()
    this.raceIndex = 0
    this.active = false
    this.hostUsername = null
    this.cupBotCount = 0
  }

  restartCup (hostUsername: string) {
    this.start(hostUsername)
  }

  startNewCup () {
    const lastTrackIndex = this.trackOrder[this.raceIndex]
    this.shuffleTracks(lastTrackIndex)
    this.scores = new Map()
    this.raceIndex = 0
  }

  assignHost (username: string) {
    this.hostUsername = username
  }

  isHost (username: string) {
    return this.hostUsername === username
  }

  transferHost (humanUsernames: Array<string>) {
    if (humanUsernames.length === 0) {
      this.hostUsername = null
      return null
    }
    const next = humanUsernames[Math.floor(Math.random() * humanUsernames.length)]
    this.hostUsername = next
    return next
  }

  currentTrackIndex () {
    return this.trackOrder[this.raceIndex]
  }

  advanceRace () {
    this.raceIndex = Math.min(this.raceIndex + 1, 3)
  }

  isCupComplete () {
    return this.raceIndex === 3
  }

  awardPoints (placements: Array<{ username: string, position: number }>) {
    return placements.map(({ username, position }) => {
      const pointsEarned = CUP_POINTS[position - 1] || 0
      const total = (this.scores.get(username) || 0) + pointsEarned
      this.scores.set(username, total)
      return { username, position, pointsEarned, total }
    })
  }

  formatRaceResultsMessage (trackName: string, raceNum: number, results: Array<Object>) {
    let msg = `Race ${raceNum}/4 (${trackName}) results:\n`
    results.forEach(({ username, position, pointsEarned }) => {
      msg += `${position}. ${username} +${pointsEarned} pts\n`
    })
    return msg.trim()
  }

  formatStandingsMessage () {
    const entries = Array.from(this.scores.entries())
      .sort((a, b) => b[1] - a[1])
    if (entries.length === 0) return 'Standings: (no scores yet)'
    let msg = 'Cup standings:\n'
    entries.forEach(([username, total], i) => {
      msg += `${i + 1}. ${username} — ${total} pts\n`
    })
    return msg.trim()
  }

  formatCupWinnerMessage () {
    const entries = Array.from(this.scores.entries())
      .sort((a, b) => b[1] - a[1])
    if (entries.length === 0) return '🏆 Cup complete!'
    const topScore = entries[0][1]
    const winners = entries.filter(([, score]) => score === topScore).map(([name]) => name)
    if (winners.length === 1) {
      return `🏆 ${winners[0]} wins the cup with ${topScore} points!`
    }
    return `🏆 Cup tied! ${winners.join(', ')} with ${topScore} points!`
  }

  formatCupRaceMessage (
    hostUsername: string,
    trackName: string,
    raceNum: number,
    {
      botsEnabled = true,
      boostEnabled = false,
      cupStarting = false
    }: { botsEnabled?: boolean, boostEnabled?: boolean, cupStarting?: boolean } = {}
  ) {
    const bots = botsEnabled ? 'on' : 'off'
    const boost = boostEnabled ? 'on' : 'off'
    const lines = [
      `Race ${raceNum}/4: ${trackName}`,
      `Bots: ${bots}. Boost: ${boost}. Host: ${hostUsername}.`,
      '-------------------',
      CUP_HOST_COMMANDS
    ]
    if (cupStarting) lines.unshift('🏆 Cup starting!')
    return lines.join('\n')
  }

  formatCupStartMessage (
    hostUsername: string,
    trackName: string,
    raceNum: number,
    options: { botsEnabled?: boolean, boostEnabled?: boolean } = {}
  ) {
    return this.formatCupRaceMessage(hostUsername, trackName, raceNum, {
      ...options,
      cupStarting: true
    })
  }

  formatHostTransferMessage (hostUsername: string, sessionMode: string) {
    return `${hostUsername} is the new Host.\n${hostCommandsForMode(sessionMode)}`
  }

  formatTimeAttackStartMessage (trackName: string, hostUsername: string) {
    return `⏱ Time attack: ${trackName}\n${hostUsername} is the Host. ${TIMEATTACK_HOST_COMMANDS}`
  }

  formatTimeAttackTrackPrompt (tracks: Array<Object>) {
    let msg = 'Which track?\n'
    tracks.forEach((t, i) => {
      msg += `${i + 1}. ${t.name}\n`
    })
    return msg.trim()
  }

  formatCatchUpMessage () {
    if (!this.active) return ''
    const raceNum = this.raceIndex + 1
    const trackName = this.tracks[this.currentTrackIndex()].name
    let msg = `Cup in progress — Race ${raceNum}/4: ${trackName}`
    if (this.hostUsername) msg += `\nHost: ${this.hostUsername}`
    const standings = this.formatStandingsMessage()
    if (this.scores.size > 0) msg += `\n${standings}`
    return msg
  }
}

module.exports = {
  CUP_POINTS,
  CUP_HOST_COMMANDS,
  TIMEATTACK_HOST_COMMANDS,
  hostCommandsForMode,
  compareShipsForPlacement,
  computePlacements,
  shuffleTracksOrder,
  shouldAdvanceCupRace,
  CupManager
}
