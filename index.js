'use strict'
const path = require('path')
const semver = require('semver')
const { parser } = require('@conventional-commits/parser')
const visit = require('unist-util-visit-parents')
const git = require('./lib/git')

const UNKNOWN_TYPE = Symbol('UNKNOWN_TYPE')

/**
 * @TODO There are many features and improvements I think
 * we can add.  Here are a few:
 *
 * - options for tab parsing to support lerna style tags
 * - footer conventional commits
 * - revert commit handling
 * - suggest pre-release version when not on main/master
 * - add option for existingVersions to check against
 */

module.exports = async function gitRecommendedBump (opts = {}) {
  const cwd = path.resolve(opts.path || process.cwd())
  const gitRoot = opts.gitRoot || await git.root(cwd)
  // const primaryBranch = opts.primaryBranch || 'main'
  const commitFilter = typeof opts.commitFilter === 'function' ? opts.commitFilter : () => true
  const revertCommit = typeof opts.revertCommit === 'function' ? opts.revertCommit : () => false
  const tagPrefix = 'v'
  const currentVersion = opts.currentVersion || null
  const parse = opts.parse || parser
  const types = Object.entries(opts.types || {
    fix: 'patch',
    feat: 'minor'
  }).reduce((t, [key, bump]) => {
    if (bump !== 'patch' && bump !== 'minor') {
      throw new TypeError('types.bump must be either patch or minor')
    }

    t[key] = { bump, commits: new Set() }
    return t
  }, {
    [UNKNOWN_TYPE]: {
      bump: 'patch',
      commits: new Set()
    }
  })

  const commits = []
  let minors = 0
  let majors = 0

  // eslint-disable-next-line no-labels
  gitLogLoop:
  for await (const commit of git.paginatedLog({ cwd: gitRoot, subpath: cwd })) {
    if (!commitFilter(commit)) {
      // @TODO
      continue
    }

    const revert = revertCommit(commit)
    if (revert) {
      // @TODO
      continue
    }

    // Check tags, if we have a version tag, optionally back to
    // currentVersion, then we can stop reading git log
    for (let tag of commit.tags) {
      if (tagPrefix) {
        tag = tag.replace(tagPrefix, '')
      }
      if (!tag || !semver.valid(tag)) {
        continue
      }

      if (!currentVersion || tag === currentVersion) {
        // eslint-disable-next-line no-labels
        break gitLogLoop
      }
    }

    // Parse as conventional commit
    try {
      const parsedBody = parse(commit.message)

      if (parsedBody) {
        visit(parsedBody, ['summary', 'type', 'scope', 'text', 'breaking-change'], (node, ancestors) => {
          switch (node.type) {
            case 'summary':
              // eslint-disable-next-line no-return-assign
              commit.summary = node.children.reduce((s, n) => s += n.value, '')
              break
            case 'type':
              commit.type = node.value
              if (types[node.value]) {
                types[node.value].commits.add(commit.hash)
                if (types[node.value].bump === 'minor') {
                  minors++
                }
              } else {
                types[UNKNOWN_TYPE].commits.add(commit.hash)
              }
              break
            case 'scope':
              commit.scope = node.value
              break
            case 'breaking-change':
              commit.breakingChange = true
              majors++
              break
          }
        })
        commit.parsedBody = parsedBody
      }
    } catch (e) {
      types[UNKNOWN_TYPE].commits.add(commit.hash)
    }

    // @TODO parse nested commits
    // https://github.com/googleapis/release-please/blob/master/src/util/to-conventional-changelog-format.ts#L204

    commits.push(commit)
  }

  const releaseType = majors ? 'major' : minors ? 'minor' : 'patch'
  return {
    releaseType,
    commits
  }
}
