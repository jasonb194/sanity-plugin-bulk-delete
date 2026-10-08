#!/usr/bin/env node

import {execFileSync, spawnSync} from 'node:child_process'
import {appendFileSync, readFileSync} from 'node:fs'
import {resolve} from 'node:path'
import {fileURLToPath} from 'node:url'

const VERSION_PATTERN = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/
const COMMIT_HEADER_PATTERN = /^([a-z][a-z0-9-]*)(?:\([^\r\n)]+\))?(!)?:\s+\S/i

export function parseStableVersion(version) {
  const match = VERSION_PATTERN.exec(version)
  if (!match) return null
  return match.slice(1).map(Number)
}

export function compareVersions(left, right) {
  const a = parseStableVersion(left)
  const b = parseStableVersion(right)
  if (!a || !b) throw new Error(`Expected stable SemVer versions, got ${left} and ${right}`)
  for (let index = 0; index < a.length; index += 1) {
    if (a[index] !== b[index]) return a[index] < b[index] ? -1 : 1
  }
  return 0
}

export function chooseBaseline({tags, npm, targetSha, isAncestor}) {
  const stableTags = tags
    .map(({name, sha}) => ({version: name.startsWith('v') ? name.slice(1) : name, sha}))
    .filter(({version}) => parseStableVersion(version))
    .sort((left, right) => compareVersions(right.version, left.version))
  const latestTag = stableTags[0]

  if (!npm?.version || !parseStableVersion(npm.version)) {
    throw new Error(`npm latest returned an invalid stable version: ${npm?.version ?? '(missing)'}`)
  }

  if (latestTag && compareVersions(latestTag.version, npm.version) >= 0) {
    return {version: latestTag.version, sha: latestTag.sha, source: 'tag'}
  }

  if (!npm.gitHead || !/^[0-9a-f]{40}$/i.test(npm.gitHead)) {
    throw new Error(
      `npm latest ${npm.version} has no valid gitHead; refusing to infer a release range`,
    )
  }
  if (!isAncestor(npm.gitHead, targetSha)) {
    throw new Error(`npm latest gitHead ${npm.gitHead} is not an ancestor of ${targetSha}`)
  }
  return {version: npm.version, sha: npm.gitHead, source: 'npm'}
}

function commitBump(commit) {
  const [header = '', ...body] = commit.trim().split(/\r?\n/)
  const match = COMMIT_HEADER_PATTERN.exec(header)
  const breakingFooter = /^BREAKING(?: CHANGE|-CHANGE):\s*\S/im.test(body.join('\n'))
  if (match?.[2] || breakingFooter) return 3
  const type = match?.[1]?.toLowerCase()
  if (type === 'feat') return 2
  if (type === 'fix' || type === 'perf') return 1
  return 0
}

export function calculateNextVersion(baseVersion, commits) {
  const base = parseStableVersion(baseVersion)
  if (!base) throw new Error(`Expected a stable SemVer baseline, got ${baseVersion}`)
  const bump = commits.reduce((maximum, commit) => Math.max(maximum, commitBump(commit)), 0)
  if (bump === 0) return null
  if (bump === 3) return `${base[0] + 1}.0.0`
  if (bump === 2) return `${base[0]}.${base[1] + 1}.0`
  return `${base[0]}.${base[1]}.${base[2] + 1}`
}

function git(args, options = {}) {
  return execFileSync('git', args, {encoding: 'utf8', ...options}).trim()
}

function isAncestor(sha, targetSha) {
  return spawnSync('git', ['merge-base', '--is-ancestor', sha, targetSha]).status === 0
}

function reachableStableTags(targetSha) {
  const refs = git([
    'for-each-ref',
    '--merged',
    targetSha,
    '--format=%(refname:short)%00%(*objectname)',
    'refs/tags/v*',
  ])
  if (!refs) return []
  return refs.split('\n').flatMap((row) => {
    const [name, peeledSha] = row.split('\0')
    const version = name?.startsWith('v') ? name.slice(1) : ''
    if (!parseStableVersion(version)) return []
    const sha = peeledSha || git(['rev-parse', `${name}^{commit}`])
    return [{name, sha}]
  })
}

function commitsAfter(sha, targetSha) {
  const raw = git(['log', '--format=%B%x00', `${sha}..${targetSha}`])
  return raw
    .split('\0')
    .map((commit) => commit.trim())
    .filter(Boolean)
}

function exactRegistryVersions(parsed) {
  if (!Array.isArray(parsed) || parsed.some((version) => typeof version !== 'string')) {
    throw new Error('npm versions response must be a JSON array of version strings')
  }
  return new Set(parsed)
}

export function planRelease({
  tags,
  npm,
  targetSha,
  commits,
  registryVersions,
  isAncestor: ancestorCheck,
}) {
  const baseline = chooseBaseline({tags, npm, targetSha, isAncestor: ancestorCheck})
  const nextVersion = calculateNextVersion(baseline.version, commits)
  const hasTag = tags.some(({name}) => name === `v${baseline.version}`)

  if (!nextVersion) {
    const recoverTag = baseline.source === 'npm' && baseline.sha === targetSha && !hasTag
    return {
      baselineVersion: baseline.version,
      baselineSha: baseline.sha,
      shouldPublish: false,
      shouldTag: recoverTag,
      version: recoverTag ? baseline.version : '',
    }
  }

  if (compareVersions(nextVersion, npm.version) <= 0) {
    throw new Error(
      `Calculated ${nextVersion} is not newer than npm latest ${npm.version}; refusing to publish`,
    )
  }
  if (registryVersions.has(nextVersion)) {
    throw new Error(
      `npm version ${nextVersion} already exists; refusing to republish an immutable version`,
    )
  }

  return {
    baselineVersion: baseline.version,
    baselineSha: baseline.sha,
    shouldPublish: true,
    shouldTag: true,
    version: nextVersion,
  }
}

function main() {
  const targetSha = process.env.TARGET_SHA
  const npm = JSON.parse(readFileSync('npm-latest.json', 'utf8'))
  const registryVersions = exactRegistryVersions(
    JSON.parse(readFileSync('npm-versions.json', 'utf8')),
  )
  if (!targetSha || !/^[0-9a-f]{40}$/i.test(targetSha)) {
    throw new Error(`TARGET_SHA must be a full commit SHA, got ${targetSha ?? '(missing)'}`)
  }

  const tags = reachableStableTags(targetSha)
  const baseline = chooseBaseline({tags, npm, targetSha, isAncestor})
  const commits = commitsAfter(baseline.sha, targetSha)
  const plan = planRelease({
    tags,
    npm,
    targetSha,
    commits,
    registryVersions,
    isAncestor,
  })
  appendFileSync(
    process.env.GITHUB_OUTPUT,
    [
      `version=${plan.version}`,
      `should_publish=${plan.shouldPublish}`,
      `should_tag=${plan.shouldTag}`,
      `baseline_version=${plan.baselineVersion}`,
      `baseline_sha=${plan.baselineSha}`,
      '',
    ].join('\n'),
  )
  console.log(
    plan.shouldPublish
      ? `Releasing ${plan.version} from ${plan.baselineVersion} (${commits.length} commits)`
      : plan.shouldTag
        ? `Recovering missing tag v${plan.version} for already-published npm version`
        : `No release-worthy commits since ${plan.baselineVersion}`,
  )
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  try {
    main()
  } catch (error) {
    console.error(error instanceof Error ? error.message : error)
    process.exit(1)
  }
}
