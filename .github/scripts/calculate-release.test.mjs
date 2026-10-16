import {describe, expect, it} from 'vitest'
import {
  calculateNextVersion,
  chooseBaseline,
  compareVersions,
  parseStableVersion,
  planRelease,
  planReleaseForTarget,
} from './calculate-release.mjs'

const targetSha = 'a'.repeat(40)
const npmSha = 'b'.repeat(40)
const isAncestor = (sha, target) => sha === target || sha === npmSha || sha === 'c'.repeat(40)

describe('stable SemVer helpers', () => {
  it('accepts only plain stable SemVer', () => {
    expect(parseStableVersion('1.2.3')).toEqual([1, 2, 3])
    expect(parseStableVersion('01.2.3')).toBeNull()
    expect(parseStableVersion('1.2.3-beta.1')).toBeNull()
  })

  it('compares versions numerically', () => {
    expect(compareVersions('1.10.0', '1.9.9')).toBe(1)
  })
})

describe('calculateNextVersion', () => {
  it.each([
    ['fix: correct selection', '1.2.4'],
    ['fix(core): handle empty selection', '1.2.4'],
    ['perf: avoid duplicate fetches', '1.2.4'],
    ['feat: add scoped deletion', '1.3.0'],
    ['feat(ui): add scoped deletion', '1.3.0'],
    ['feat!: replace the public API', '2.0.0'],
    ['fix(core)!: change callback contract', '2.0.0'],
    ['docs: clarify setup\n\nBREAKING CHANGE: remove old option', '2.0.0'],
    ['chore: update dependencies\n\nBREAKING-CHANGE: drop node 16', '2.0.0'],
  ])('maps %s to %s', (commit, expected) => {
    expect(calculateNextVersion('1.2.3', [commit])).toBe(expected)
  })

  it('chooses the highest bump across the full range', () => {
    expect(
      calculateNextVersion('0.4.2', [
        'fix: handle retry',
        'feat(api): add option',
        'docs: update readme\n\nBREAKING CHANGE: rename the option',
      ]),
    ).toBe('1.0.0')
  })

  it('does not release for non-release commit types', () => {
    expect(
      calculateNextVersion('1.2.3', [
        'docs: update readme',
        'ci: adjust workflow',
        'test: cover edge case',
        'chore: update dependencies',
        'Merge pull request #8 from feature/example',
      ]),
    ).toBeNull()
  })
})

describe('release baseline and retry planning', () => {
  it('uses the highest stable tag and ignores prerelease tags', () => {
    expect(
      chooseBaseline({
        tags: [
          {name: 'v1.8.0', sha: 'c'.repeat(40)},
          {name: 'v1.10.0', sha: targetSha},
          {name: 'v2.0.0-beta.1', sha: 'd'.repeat(40)},
        ],
        npm: {version: '1.9.0', gitHead: npmSha},
        targetSha,
        isAncestor,
      }),
    ).toEqual({version: '1.10.0', sha: targetSha, source: 'tag'})
  })

  it('bootstraps from npm gitHead and calculates commits after it', () => {
    const plan = planRelease({
      tags: [],
      npm: {version: '1.2.3', gitHead: npmSha},
      targetSha,
      commits: ['feat(scope): add filtering'],
      registryVersions: new Set(['1.2.3']),
      isAncestor,
    })
    expect(plan).toMatchObject({version: '1.3.0', shouldPublish: true, shouldTag: true})
  })

  it('fails closed when npm gitHead is missing or not an ancestor', () => {
    expect(() =>
      chooseBaseline({
        tags: [],
        npm: {version: '1.2.3'},
        targetSha,
        isAncestor,
      }),
    ).toThrow('no valid gitHead')
    expect(() =>
      chooseBaseline({
        tags: [],
        npm: {version: '1.2.3', gitHead: 'e'.repeat(40)},
        targetSha,
        isAncestor,
      }),
    ).toThrow('not an ancestor')
  })

  it('recovers a missing npm tag only when npm gitHead equals the current SHA', () => {
    const recovery = planRelease({
      tags: [],
      npm: {version: '1.2.3', gitHead: targetSha},
      targetSha,
      commits: [],
      registryVersions: new Set(['1.2.3']),
      isAncestor,
    })
    expect(recovery).toMatchObject({version: '1.2.3', shouldPublish: false, shouldTag: true})

    const noRecovery = planRelease({
      tags: [],
      npm: {version: '1.2.3', gitHead: npmSha},
      targetSha,
      commits: [],
      registryVersions: new Set(['1.2.3']),
      isAncestor,
    })
    expect(noRecovery.shouldTag).toBe(false)
  })

  it('skips non-release ranges and refuses immutable registry versions', () => {
    const noRelease = planRelease({
      tags: [{name: 'v1.2.3', sha: npmSha}],
      npm: {version: '1.2.3', gitHead: npmSha},
      targetSha,
      commits: ['docs: update readme'],
      registryVersions: new Set(['1.2.3']),
      isAncestor,
    })
    expect(noRelease.shouldPublish).toBe(false)
    expect(() =>
      planRelease({
        tags: [{name: 'v1.2.3', sha: npmSha}],
        npm: {version: '1.2.3', gitHead: npmSha},
        targetSha,
        commits: ['fix: patch issue'],
        registryVersions: new Set(['1.2.3', '1.2.4']),
        isAncestor,
      }),
    ).toThrow('already exists')
  })

  it('blocks a new release while any npm stage is pending', () => {
    const plan = planRelease({
      tags: [{name: 'v1.1.1', sha: npmSha}],
      npm: {version: '1.1.1', gitHead: npmSha},
      targetSha,
      commits: ['fix: patch issue'],
      registryVersions: new Set(['1.1.1']),
      pendingStages: [{name: 'npm-stage/v1.1.2', version: '1.1.2', sha: targetSha}],
      isAncestor,
    })
    expect(plan).toMatchObject({
      shouldPublish: false,
      shouldTag: false,
      version: '',
      pendingStage: {name: 'npm-stage/v1.1.2', sha: targetSha},
    })
  })

  it('reports a pending stage without selecting a baseline or reading the commit range', () => {
    const result = planReleaseForTarget({
      tags: [],
      npm: {version: 'invalid', gitHead: 'e'.repeat(40)},
      targetSha,
      registryVersions: new Set(),
      pendingStages: [{name: 'npm-stage/v1.1.2', version: '1.1.2', sha: targetSha}],
      isAncestor: () => {
        throw new Error('baseline selection should be skipped')
      },
      getCommits: () => {
        throw new Error('commit range lookup should be skipped')
      },
    })

    expect(result).toMatchObject({
      commits: [],
      plan: {
        baselineVersion: '',
        baselineSha: '',
        shouldPublish: false,
        shouldTag: false,
        version: '',
        pendingStage: {name: 'npm-stage/v1.1.2', sha: targetSha},
      },
    })
  })

  it.each([
    [{version: 'invalid', gitHead: npmSha}, 'invalid stable version'],
    [{version: '1.1.1'}, 'no valid gitHead'],
    [{version: '1.1.1', gitHead: 'e'.repeat(40)}, 'not an ancestor'],
  ])('still fails closed without a pending stage for npm latest %j', (npm, expectedError) => {
    expect(() =>
      planReleaseForTarget({
        tags: [],
        npm,
        targetSha,
        registryVersions: new Set(),
        pendingStages: [],
        isAncestor,
        getCommits: () => [],
      }),
    ).toThrow(expectedError)
  })
})

describe('revert-aware release planning', () => {
  const featureSha = 'c'.repeat(40)
  const mergeSha = 'd'.repeat(40)
  const revertSha = 'e'.repeat(40)
  const fixSha = 'f'.repeat(40)
  const revertedMergeRecords = [
    {sha: featureSha, parents: [npmSha], message: 'feat(ui): support UI 5'},
    {
      sha: mergeSha,
      parents: [npmSha, featureSha],
      message: 'Merge pull request #6 from feature/ui-5',
    },
    {
      sha: revertSha,
      parents: [mergeSha],
      message: `Revert "Merge pull request #6 from feature/ui-5"\n\nThis reverts commit ${mergeSha}.`,
    },
  ]

  function plan(records, options = {}) {
    return planReleaseForTarget({
      tags: [],
      npm: {version: '1.1.2', gitHead: npmSha},
      targetSha,
      registryVersions: new Set(['1.1.2']),
      isAncestor,
      getCommitRecords: () => records,
      getIntroducedCommits: () => new Set([featureSha, mergeSha]),
      ...options,
    }).plan
  }

  it('does not release when a feature merge is reverted', () => {
    expect(plan(revertedMergeRecords)).toMatchObject({shouldPublish: false, version: ''})
  })

  it('keeps an unrelated fix after a reverted feature merge', () => {
    expect(
      plan([
        ...revertedMergeRecords,
        {sha: fixSha, parents: [revertSha], message: 'fix: handle empty list'},
      ]),
    ).toMatchObject({shouldPublish: true, version: '1.1.3'})
  })

  it('treats a revert of an already released commit as a patch', () => {
    const outOfRangeRevert = {
      sha: revertSha,
      parents: [npmSha],
      message: `Revert "feat: released feature"\n\nThis reverts commit ${'9'.repeat(40)}.`,
    }
    expect(plan([outOfRangeRevert])).toMatchObject({shouldPublish: true, version: '1.1.3'})
  })

  it('does not release when an in-range conventional commit is reverted', () => {
    const feature = {sha: featureSha, parents: [npmSha], message: 'feat: add filtering'}
    const revert = {
      sha: revertSha,
      parents: [featureSha],
      message: `Revert "feat: add filtering"\n\nThis reverts commit ${featureSha}.`,
    }
    expect(plan([feature, revert])).toMatchObject({shouldPublish: false, version: ''})
  })

  it('keeps an unreverted feature release-worthy', () => {
    expect(
      plan([{sha: featureSha, parents: [npmSha], message: 'feat: add filtering'}]),
    ).toMatchObject({shouldPublish: true, version: '1.2.0'})
  })
})
