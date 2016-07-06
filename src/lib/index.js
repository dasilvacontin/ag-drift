// @flow
const fs = require('fs')
const promisify = require('es6-promisify')
const readFile = promisify(fs.readFile)

function sleep (ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

export async function listWords (files: Array<string>) {
  let promises = files.map(filename => readFile(filename))
  let buffers = await Promise.all(promises)
  let wordsPerFile = buffers.map(file => {
    return file.toString()
    .replace(/[^\w\s]|_/g, '') // replace non-alphanumeric chars
    .match(/\S+/g) // split grouping non-whitespace
  })
  let words = wordsPerFile.reduce((all, words) => all.concat(words), [])
  words = Array.from(new Set(words)) // make array elements unique
  words = words.filter(word => word.match(/\D/)) // filter out numbers
  return words
}

export async function fun () {
  console.log('hello')
  await sleep(1000)
  console.log('world')
  await sleep(1000)
  let words = await listWords(['package.json', '.babelrc', '.eslintrc'])
  console.log(words.join(', '))
}
