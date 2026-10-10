import {describe, expect, it} from 'vitest'
import {execFileSync} from 'node:child_process'
import {mkdtempSync, rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {
  isDefiniteNpm404,
  planFinalization,
  planMarkerClear,
  planPublishedRecovery,
  readPublishedVersion,
  tagRefs,
} from './finalize-stage.mjs'

const sha = 'a'.repeat(40)
const marker = {name: 'npm-stage/v1.1.2', sha}

describe('pending marker clearing', () => {
  const args = {
    version: '1.1.2',
    status: 'rejected',
    confirmed: 'true',
    pendingStages: [marker],
  }

  it('requires an explicit rejected or missing npm stage status', () => {
    for (const status of [undefined, '', 'pending', 'approved', 'not-clearing', 'invalid']) {
      expect(() => planMarkerClear({...args, status})).toThrow(
        'STAGE_STATUS must be rejected or missing',
      )
    }
    expect(planMarkerClear(args)).toBe('npm-stage/v1.1.2')
    expect(planMarkerClear({...args, status: 'missing'})).toBe('npm-stage/v1.1.2')
  })

  it('requires confirmation and an existing Git marker', () => {
    expect(() => planMarkerClear({...args, confirmed: 'false'})).toThrow('Set CONFIRM_CLEAR=true')
    expect(() => planMarkerClear({...args, pendingStages: []})).toThrow(
      'Pending stage marker npm-stage/v1.1.2 does not exist',
    )
  })

  it('refuses to clear a marker for a version already published on npm', () => {
    expect(() => planMarkerClear({...args, publishedVersion: '1.1.2'})).toThrow(
      'npm 1.1.2 is already published; finalize its release instead of clearing its marker',
    )
  })

  it('treats only an explicit npm E404 as an unpublished version', () => {
    expect(isDefiniteNpm404({status: 1, stderr: 'npm error code E404\nnpm error 404'})).toBe(true)
    expect(isDefiniteNpm404({status: 1, stderr: 'npm error code E401'})).toBe(false)
    expect(isDefiniteNpm404({status: 1, stderr: 'npm error ECONNRESET'})).toBe(false)
    expect(isDefiniteNpm404({stderr: 'npm error code E404'})).toBe(false)
  })

  it('confirms a version 404 against the readable package version list', () => {
    const calls = []
    const run = (_command, args) => {
      calls.push(args)
      if (calls.length === 1) {
        throw Object.assign(new Error('version missing'), {
          status: 1,
          stderr: 'npm error code E404',
        })
      }
      return JSON.stringify(['1.1.1'])
    }

    expect(readPublishedVersion('sanity-plugin-bulk-delete', '1.1.2', run)).toBeUndefined()
    expect(calls).toHaveLength(2)
    expect(calls[1]).toEqual(['view', 'sanity-plugin-bulk-delete', 'versions', '--json'])
  })

  it('fails closed if the package version list cannot confirm an exact 404', () => {
    let callCount = 0
    const run = () => {
      callCount += 1
      throw Object.assign(new Error('registry failure'), {
        status: 1,
        stderr: callCount === 1 ? 'npm error code E404' : 'npm error code E401',
      })
    }

    expect(() => readPublishedVersion('sanity-plugin-bulk-delete', '1.1.2', run)).toThrow(
      'refusing to clear marker',
    )
    expect(callCount).toBe(2)
  })

  it('fails closed on registry auth or transport errors', () => {
    for (const stderr of ['npm error code E401', 'npm error ECONNRESET']) {
      const run = () => {
        throw Object.assign(new Error('registry failure'), {status: 1, stderr})
      }
      expect(() => readPublishedVersion('sanity-plugin-bulk-delete', '1.1.2', run)).toThrow(
        'refusing to clear marker',
      )
    }
  })
})

describe('git tag lookup', () => {
  it('matches version tags with a glob and keeps npm-stage prefix lookup intact', () => {
    const originalCwd = process.cwd()
    const repo = mkdtempSync(join(tmpdir(), 'finalize-stage-tags-'))

    try {
      execFileSync('git', ['init', '--quiet'], {cwd: repo})
      execFileSync(
        'git',
        [
          '-c',
          'user.name=Test',
          '-c',
          'user.email=test@example.com',
          'commit',
          '--allow-empty',
          '-m',
          'test',
        ],
        {cwd: repo},
      )
      execFileSync('git', ['tag', 'v1.1.2'], {cwd: repo})
      execFileSync('git', ['tag', 'npm-stage/v1.1.2'], {cwd: repo})
      process.chdir(repo)

      expect(tagRefs('v*')).toMatchObject([{name: 'v1.1.2'}])
      expect(tagRefs('npm-stage')).toMatchObject([{name: 'npm-stage/v1.1.2'}])
    } finally {
      process.chdir(originalCwd)
      rmSync(repo, {recursive: true, force: true})
    }
  })
})

describe('staged release finalization', () => {
  it('creates a release tag only when npm metadata matches the pending marker', () => {
    expect(
      planFinalization({
        version: '1.1.2',
        pendingStages: [marker],
        liveTags: [],
        registryVersion: '1.1.2',
        registryGitHead: sha,
      }),
    ).toEqual({
      version: '1.1.2',
      sha,
      liveTag: 'v1.1.2',
      marker: 'npm-stage/v1.1.2',
      createTag: true,
      deleteMarker: true,
    })
  })

  it('recovers a missing tag only when the published version matches the release commit', () => {
    expect(
      planPublishedRecovery({
        version: '1.1.2',
        targetSha: sha,
        pendingStages: [],
        liveTags: [],
        registryVersion: '1.1.2',
        registryGitHead: sha,
      }),
    ).toEqual({version: '1.1.2', sha, liveTag: 'v1.1.2', createTag: true})
  })

  it('rejects published-tag recovery when a stage is pending or metadata does not match', () => {
    const args = {
      version: '1.1.2',
      targetSha: sha,
      pendingStages: [],
      liveTags: [],
      registryVersion: '1.1.2',
      registryGitHead: sha,
    }
    expect(() => planPublishedRecovery({...args, pendingStages: [marker]})).toThrow(
      'A pending npm stage exists',
    )
    expect(() => planPublishedRecovery({...args, registryGitHead: 'b'.repeat(40)})).toThrow(
      'does not match release commit',
    )
  })

  it('rejects a mismatched npm version or gitHead', () => {
    const args = {
      version: '1.1.2',
      pendingStages: [marker],
      liveTags: [],
      registryVersion: '1.1.2',
      registryGitHead: sha,
    }
    expect(() => planFinalization({...args, registryVersion: '1.1.3'})).toThrow('expected 1.1.2')
    expect(() => planFinalization({...args, registryGitHead: 'b'.repeat(40)})).toThrow(
      'does not match pending stage commit',
    )
  })

  it('is idempotent after tag creation and marker removal', () => {
    expect(
      planFinalization({
        version: '1.1.2',
        pendingStages: [],
        liveTags: [{name: 'v1.1.2', sha}],
        registryVersion: '1.1.2',
        registryGitHead: sha,
      }),
    ).toMatchObject({createTag: false, deleteMarker: false, sha})
  })

  it('rejects unrelated pending stages and unsafe existing release tags', () => {
    expect(() =>
      planFinalization({
        version: '1.1.2',
        pendingStages: [{name: 'npm-stage/v1.1.3', sha}],
        liveTags: [],
        registryVersion: '1.1.2',
        registryGitHead: sha,
      }),
    ).toThrow('Another npm stage is pending')
    expect(() =>
      planFinalization({
        version: '1.1.2',
        pendingStages: [marker],
        liveTags: [{name: 'v1.1.2', sha: 'b'.repeat(40)}],
        registryVersion: '1.1.2',
        registryGitHead: sha,
      }),
    ).toThrow('but npm 1.1.2 gitHead is')
  })
})
