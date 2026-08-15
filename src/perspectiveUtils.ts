type PerspectiveState = {
  selectedPerspective?: unknown
  selectedPerspectiveName?: string
}

type PerspectiveFilter = {
  match: string
  perspectivePath?: string
}

/**
 * Resolves the active perspective name from the perspective state object.
 * Prefers `selectedPerspectiveName`, then `selectedPerspective` (if a string),
 * and falls back to `'published'`.
 * @internal
 */
export function getPerspectiveName(perspective: PerspectiveState | undefined): string {
  if (typeof perspective?.selectedPerspectiveName === 'string') {
    return perspective.selectedPerspectiveName
  }

  if (typeof perspective?.selectedPerspective === 'string') {
    return perspective.selectedPerspective
  }

  return 'published'
}

/**
 * Returns the GROQ filter fragment and optional path parameter for the given perspective.
 * @internal
 */
export function getPerspectiveMatch(perspectiveName: string): PerspectiveFilter {
  if (perspectiveName === 'published') {
    return {match: '!(_id in path("drafts.**") || _id in path("versions.**")) &&'}
  }

  if (perspectiveName === 'drafts') {
    return {match: '(_id in path("drafts.**")) &&'}
  }

  return {
    match: '(_id in path($perspectivePath)) &&',
    perspectivePath: `versions.${perspectiveName}.**`,
  }
}
