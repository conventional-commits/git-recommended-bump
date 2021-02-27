'use strict'
const { promisify } = require('util')
const cp = require('child_process')
const execFile = promisify(cp.execFile)

module.exports = execGit
function execGit (args, opts) {
  return execFile('git', args, opts)
}

module.exports.root = async function root (cwd) {
  const p = await execGit(['rev-parse', '--show-toplevel'], { cwd })
  return p.stdout.trim()
}

module.exports.getCurrentBranch = async function getCurrentBranch (cwd) {
  try {
    // Git >2.22
    // return (await execGit(['branch', '--show-current'], { cwd })).stdout.trim()
    return (await execGit(['rev-parse', '--abbrev-ref', 'HEAD'], { cwd })).stdout.trim()
  } catch (e) {
    if (e.stderr.includes('ambiguous argument \'HEAD\'')) {
      // Ignore error, this is a repo which has not been initalized yet
      return null
    }
    throw e
  }
}

module.exports.branchExists = async function branchExists (branch, cwd) {
  try {
    await execGit(['show-ref', '--verify', '--quiet', `refs/heads/${branch}`], { cwd })
    return true
  } catch (e) {
    if (e.code !== 1) {
      throw e
    }
    return false
  }
}

const DELIMITER = '------------------------ >8 ------------------------'
const commitRegexp = /^([0-9a-f]{5,40})\s*(?:\((.*)\))?\s*\n(.*)/i
const tagsRegexp = /tag:\s*([^,)]+)/i
module.exports.paginatedLog = async function * paginatedGitLog (opts = {}) {
  const cwd = opts.cwd || process.cwd()
  let page = opts.page || 0
  const number = opts.number || 10
  const skip = page * number
  const delim = opts.delimiter || DELIMITER
  const format = `%h %d\n%B\n${delim}`
  const subpath = opts.subpath && opts.subpath !== cwd ? opts.subpath : null

  let logs
  while ((logs = await paginatedLog({ number, skip, format, cwd, subpath }))) {
    if (!logs) {
      return
    }
    for (const commitText of logs.split(`\n${delim}\n`)) {
      if (!commitText) {
        return
      }
      const matches = commitText.match(commitRegexp)
      const [, hash, decorations, message] = matches

      // Parse decorations
      const tags = (decorations || '')
        .split(',').map((s) => s.trim()).filter((s) => !!s)
        .reduce((tags, d) => {
          const tagMatches = tagsRegexp.exec(d)
          if (tagMatches) {
            tags.push(tagMatches[1])
          }
          return tags
        }, [])

      yield { hash, tags, message }
    }
    page++
  }
}

async function paginatedLog ({ number, skip, format, cwd, subpath }) {
  const args = ['log', '--no-color', '-n', number, '--skip', skip, `--format=${format}`]
  if (subpath) {
    args.push('--', subpath)
  }
  const cp = await execGit(args, {
    maxBuffer: Infinity,
    cwd: cwd
  })
  return cp.stdout
}
