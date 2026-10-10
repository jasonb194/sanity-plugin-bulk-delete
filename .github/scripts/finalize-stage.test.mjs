import {describe, expect, it} from 'vitest'
import {planFinalization, planPublishedRecovery} from './finalize-stage.mjs'

const sha = 'a'.repeat(40)
const marker = {name: 'npm-stage/v1.1.2', sha}

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
