#!/usr/bin/env node

import {execFileSync} from 'node:child_process'
import {resolve} from 'node:path'
import {fileURLToPath} from 'node:url'

const VERSION_PATTERN = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/
const SHA_PATTERN = /^[0-9a-f]{40}$/i

function validVersion(version) {
  if (!VERSION_PATTERN.test(version ?? '')) {
    throw new Error(`VERSION must be a stable SemVer version, got ${version ?? '(missing)'}`)
  }
  return version
}

export function planFinalization({
  version,
  pendingStages,
  liveTags,
  registryVersion,
  registryGitHead,
}) {
  validVersion(version)
  if (registryVersion !== version) {
    throw new Error(`npm registry returned ${registryVersion ?? '(missing)'}, expected ${version}`)
  }
  if (!SHA_PATTERN.test(registryGitHead ?? '')) {
    throw new Error(`npm ${version} has no valid gitHead; refusing to finalize its release tag`)
  }

  const markerName = `npm-stage/v${version}`
  const marker = pendingStages.find(({name}) => name === markerName)
  const otherMarkers = pendingStages.filter(({name}) => name !== markerName)
  if (otherMarkers.length > 0) {
    throw new Error(
      `Another npm stage is pending: ${otherMarkers.map(({name}) => name).join(', ')}`,
    )
  }

  const liveName = `v${version}`
  const liveTag = liveTags.find(({name}) => name === liveName)
  if (marker && marker.sha !== registryGitHead) {
    throw new Error(
      `npm ${version} gitHead ${registryGitHead} does not match pending stage commit ${marker.sha}`,
    )
  }
  if (liveTag && liveTag.sha !== registryGitHead) {
    throw new Error(
      `Release tag ${liveName} points to ${liveTag.sha}, but npm ${version} gitHead is ${registryGitHead}`,
    )
  }
  if (!marker && !liveTag) {
    throw new Error(`No pending stage or finalized release tag exists for ${version}`)
  }

  return {
    version,
    sha: registryGitHead,
    liveTag: liveName,
    marker: marker ? markerName : '',
    createTag: !liveTag,
    deleteMarker: Boolean(marker),
  }
}

export function planPublishedRecovery({
  version,
  targetSha,
  pendingStages,
  liveTags,
  registryVersion,
  registryGitHead,
}) {
  validVersion(version)
  if (!SHA_PATTERN.test(targetSha ?? '')) {
    throw new Error(`TARGET_SHA must be a full commit SHA, got ${targetSha ?? '(missing)'}`)
  }
  if (registryVersion !== version) {
    throw new Error(`npm registry returned ${registryVersion ?? '(missing)'}, expected ${version}`)
  }
  if (registryGitHead !== targetSha) {
    throw new Error(
      `npm ${version} gitHead ${registryGitHead ?? '(missing)'} does not match release commit ${targetSha}`,
    )
  }
  if (pendingStages.length > 0) {
    throw new Error(`A pending npm stage exists: ${pendingStages.map(({name}) => name).join(', ')}`)
  }

  const liveName = `v${version}`
  const liveTag = liveTags.find(({name}) => name === liveName)
  if (liveTag && liveTag.sha !== targetSha) {
    throw new Error(`Release tag ${liveName} points to ${liveTag.sha}, expected ${targetSha}`)
  }

  return {
    version,
    sha: targetSha,
    liveTag: liveName,
    createTag: !liveTag,
  }
}

function git(args) {
  return execFileSync('git', args, {encoding: 'utf8'}).trim()
}

function tagRefs(prefix) {
  const raw = git(['for-each-ref', '--format=%(refname:short)', `refs/tags/${prefix}`])
  if (!raw) return []
  return raw.split('\n').map((name) => ({name, sha: git(['rev-parse', `${name}^{commit}`])}))
}

function readRegistryPackage(name, version) {
  const raw = execFileSync('npm', ['view', `${name}@${version}`, 'version', 'gitHead', '--json'], {
    encoding: 'utf8',
  })
  const parsed = JSON.parse(raw)
  if (Array.isArray(parsed))
    throw new Error(`npm returned ambiguous metadata for ${name}@${version}`)
  return {version: parsed.version, gitHead: parsed.gitHead}
}

function clearMarker(version) {
  validVersion(version)
  if (process.env.CONFIRM_CLEAR !== 'true') {
    throw new Error(
      'Set CONFIRM_CLEAR=true only after inspecting npm and confirming this stage should be cleared',
    )
  }
  const marker = `npm-stage/v${version}`
  if (!tagRefs('npm-stage').some(({name}) => name === marker)) {
    throw new Error(`Pending stage marker ${marker} does not exist`)
  }
  git(['push', 'origin', `:refs/tags/${marker}`])
  console.log(`Cleared pending stage marker ${marker}`)
}

function finalize(version) {
  validVersion(version)
  git(['fetch', 'origin', '--tags', '--force'])
  const registry = readRegistryPackage(process.env.PACKAGE_NAME, version)
  const plan = planFinalization({
    version,
    pendingStages: tagRefs('npm-stage'),
    liveTags: tagRefs('v'),
    registryVersion: registry.version,
    registryGitHead: registry.gitHead,
  })

  if (plan.createTag) {
    git(['config', 'user.name', 'github-actions[bot]'])
    git(['config', 'user.email', '41898282+github-actions[bot]@users.noreply.github.com'])
    git(['tag', '-a', plan.liveTag, '-m', `Release ${version}`, plan.sha])
    git(['push', 'origin', `refs/tags/${plan.liveTag}`])
    console.log(`Created ${plan.liveTag} at ${plan.sha}`)
  } else {
    console.log(`${plan.liveTag} already points to verified npm gitHead ${plan.sha}`)
  }

  if (plan.deleteMarker) {
    git(['push', 'origin', `:refs/tags/${plan.marker}`])
    console.log(`Removed pending stage marker ${plan.marker}`)
  }
}

function recover(version) {
  validVersion(version)
  const targetSha = process.env.TARGET_SHA
  git(['fetch', 'origin', '--tags', '--force'])
  const registry = readRegistryPackage(process.env.PACKAGE_NAME, version)
  const plan = planPublishedRecovery({
    version,
    targetSha,
    pendingStages: tagRefs('npm-stage'),
    liveTags: tagRefs('v'),
    registryVersion: registry.version,
    registryGitHead: registry.gitHead,
  })

  if (plan.createTag) {
    git(['config', 'user.name', 'github-actions[bot]'])
    git(['config', 'user.email', '41898282+github-actions[bot]@users.noreply.github.com'])
    git(['tag', '-a', plan.liveTag, '-m', `Release ${version}`, plan.sha])
    git(['push', 'origin', `refs/tags/${plan.liveTag}`])
    console.log(`Recovered ${plan.liveTag} at ${plan.sha}`)
  } else {
    console.log(`${plan.liveTag} already points to verified npm gitHead ${plan.sha}`)
  }
}

function main() {
  const [action, version] = process.argv.slice(2)
  if (action === 'clear') return clearMarker(version)
  if (action === 'finalize') return finalize(version)
  if (action === 'recover') return recover(version)
  throw new Error('Usage: finalize-stage.mjs <finalize|recover|clear> <version>')
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  try {
    main()
  } catch (error) {
    console.error(error instanceof Error ? error.message : error)
    process.exit(1)
  }
}
