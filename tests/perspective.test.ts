import {evaluate, parse} from 'groq-js'
import {describe, expect, it} from 'vitest'

import {getPerspectiveFilter} from '../src/utils/perspective'

const dataset = [
  {_id: 'article-1', _type: 'article'},
  {_id: 'drafts.article-1', _type: 'article'},
  {_id: 'versions.spring.article-1', _type: 'article'},
  {_id: 'versions.autumn.article-1', _type: 'article'},
]

async function matchingIds(perspective: string | undefined): Promise<string[]> {
  const filter = getPerspectiveFilter(perspective)
  const query = parse(`*[${filter} _type == "article"]{_id}`)
  const result = await evaluate(query, {dataset})
  const rows = await result.get()
  return rows.map((row: {_id: string}) => row._id)
}

describe('getPerspectiveFilter', () => {
  it('limits published queries to published documents', async () => {
    await expect(matchingIds('published')).resolves.toEqual(['article-1'])
  })

  it('limits drafts queries to draft documents', async () => {
    await expect(matchingIds('drafts')).resolves.toEqual(['drafts.article-1'])
  })

  it('limits release queries to that release', async () => {
    await expect(matchingIds('spring')).resolves.toEqual(['versions.spring.article-1'])
  })

  it('keeps release names inside a GROQ string literal', async () => {
    await expect(
      matchingIds('unknown") || _type == "article" || path("versions.spring'),
    ).resolves.toEqual([])
  })

  it('defaults an unresolved perspective to drafts instead of all raw documents', async () => {
    await expect(matchingIds(undefined)).resolves.toEqual(['drafts.article-1'])
  })
})
