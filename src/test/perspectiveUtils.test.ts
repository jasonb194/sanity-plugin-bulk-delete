import {describe, it, expect} from 'vitest'
import {getPerspectiveName, getPerspectiveMatch} from '../perspectiveUtils'

describe('getPerspectiveName', () => {
  it('returns "published" when perspective is undefined', () => {
    expect(getPerspectiveName(undefined)).toBe('published')
  })

  it('returns "published" when perspective is an empty object', () => {
    expect(getPerspectiveName({})).toBe('published')
  })

  it('prefers selectedPerspectiveName over selectedPerspective', () => {
    expect(
      getPerspectiveName({
        selectedPerspectiveName: 'drafts',
        selectedPerspective: 'published',
      }),
    ).toBe('drafts')
  })

  it('falls back to selectedPerspective when selectedPerspectiveName is absent', () => {
    expect(getPerspectiveName({selectedPerspective: 'drafts'})).toBe('drafts')
  })

  it('ignores selectedPerspective when it is not a string', () => {
    expect(getPerspectiveName({selectedPerspective: 42})).toBe('published')
  })

  it('returns the perspective name for a custom release perspective', () => {
    expect(getPerspectiveName({selectedPerspectiveName: 'my-release'})).toBe('my-release')
  })
})

describe('getPerspectiveMatch', () => {
  it('returns a published filter for "published" perspective', () => {
    const result = getPerspectiveMatch('published')
    expect(result.match).toContain('drafts.**')
    expect(result.match).toContain('versions.**')
    expect(result.perspectivePath).toBeUndefined()
  })

  it('returns a drafts filter for "drafts" perspective', () => {
    const result = getPerspectiveMatch('drafts')
    expect(result.match).toContain('drafts.**')
    expect(result.perspectivePath).toBeUndefined()
  })

  it('returns a versions path for a custom release name', () => {
    const result = getPerspectiveMatch('my-release')
    expect(result.match).toContain('$perspectivePath')
    expect(result.perspectivePath).toBe('versions.my-release.**')
  })

  it('uses the release name verbatim in the versions path', () => {
    const result = getPerspectiveMatch('summer-drop-2025')
    expect(result.perspectivePath).toBe('versions.summer-drop-2025.**')
  })
})
