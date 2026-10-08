/**
 * Return a GROQ filter for the selected Studio perspective when querying the
 * raw API perspective. An unresolved selection is treated as drafts so a
 * query can never accidentally include every raw document.
 */
export function getPerspectiveFilter(selectedPerspectiveName?: string): string {
  if (selectedPerspectiveName === 'published') {
    return '!(_id in path("drafts.**") || _id in path("versions.**")) &&'
  }

  if (selectedPerspectiveName === undefined || selectedPerspectiveName === 'drafts') {
    return '(_id in path("drafts.**")) &&'
  }

  const versionPath = JSON.stringify(`versions.${selectedPerspectiveName}.**`)
  return `(_id in path(${versionPath})) &&`
}
