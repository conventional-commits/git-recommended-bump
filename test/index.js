'use strict'
const { suite, test, beforeEach } = require('mocha')
const assert = require('assert')
const path = require('path')
const fs = require('fs').promises
const pkg = require('../package.json')
const git = require('../lib/git')
const whatBump = require('..')

suite(pkg.name, () => {
  const cwd = path.join(__dirname, '__tmp')
  beforeEach(async () => {
    try { await fs.rmdir(cwd, { recursive: true }) } catch (e) {}
    await fs.mkdir(cwd)
  })
  test('...', async () => {
    await git(['init'], { cwd })
    await git(['checkout', '-b', 'main'], { cwd })

    await fs.writeFile(path.join(cwd, 'one.txt'), 'one')
    await git(['add', '.'], { cwd })
    await git(['commit', '-m', 'initial commit'], { cwd })
    await git(['tag', 'v1.0.0'], { cwd })

    await fs.writeFile(path.join(cwd, 'two.txt'), 'two')
    await git(['add', '.'], { cwd })
    await git(['commit', '-m', 'feat!: some work'], { cwd })
    await git(['tag', 'v2.0.0'], { cwd })
    await git(['checkout', '-b', 'test-branch'], { cwd })
    await git(['checkout', 'main'], { cwd })

    await fs.writeFile(path.join(cwd, 'three.txt'), 'three')
    await git(['add', '.'], { cwd })
    await git(['commit', '-m', 'fix(three): oops'], { cwd })

    const bumpOne = await whatBump({
      path: cwd
    })
    assert.deepStrictEqual(bumpOne.releaseType, 'patch')
    assert.deepStrictEqual(bumpOne.commits.length, 1)

    await fs.writeFile(path.join(cwd, 'four.txt'), 'four')
    await git(['add', '.'], { cwd })
    await git(['commit', '-m', 'feat: more features\n\nsome body text'], { cwd })

    const bumpTwo = await whatBump({
      path: cwd
    })
    assert.deepStrictEqual(bumpTwo.releaseType, 'minor')
    assert.deepStrictEqual(bumpTwo.commits.length, 2)

    const bumpThree = await whatBump({
      path: cwd,
      currentVersion: '1.0.0'
    })
    assert.deepStrictEqual(bumpThree.releaseType, 'major')
    assert.deepStrictEqual(bumpThree.commits.length, 3)
  })
})
