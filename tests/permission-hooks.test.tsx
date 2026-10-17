// @vitest-environment jsdom
import {cleanup, fireEvent, render, screen, waitFor} from '@testing-library/react'
import React from 'react'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import {BulkDeleteComponent} from '../src/components/BulkDeleteComponent'

const hooks = vi.hoisted(() => ({
  currentUser: {id: 'user-a', roles: [] as {name: string}[]},
  perspective: 'drafts' as string | undefined,
  projectId: 'project-a',
  dataset: 'dataset-a',
  referenceResults: [] as unknown[],
  client: {
    fetch: vi.fn(async (query: string, params?: {type?: string}) => {
      if (query.includes('references($targetId)')) {
        return {
          total: 17,
          documents: [{_id: 'referrer-1', _type: 'article', title: 'Referrer one'}],
        }
      }
      if (query.includes('array::unique')) return ['article', 'blog']
      const type = params?.type ?? 'article'
      const perspective = query.includes('_id in path("drafts.**")') ? 'drafts' : 'published'
      if (query.includes('"hasWeakReferences"'))
        return (
          hooks.eligibleDocs ?? [
            {_id: `${perspective}-${type}-1`, _type: type, title: `One ${type}`},
          ]
        )
      return [{_id: `${perspective}-${type}-1`, _type: type, title: `One ${type}`}]
    }),
    config: vi.fn(() => ({projectId: hooks.projectId, dataset: hooks.dataset})),
    delete: vi.fn(),
    commit: vi.fn(async () => undefined),
    transaction: vi.fn(),
  },
  eligibleDocs: undefined as {_id: string; _type: string; title: string}[] | undefined,
}))
const baselineClientFetch = hooks.client.fetch.getMockImplementation()!

vi.mock('sanity', () => ({
  useCurrentUser: () => hooks.currentUser,
  usePerspective: () => ({selectedPerspectiveName: hooks.perspective}),
  useClient: () => hooks.client,
}))

vi.mock('@sanity/ui', () => {
  const PassThrough = ({
    children,
    role,
    style,
  }: {
    children?: React.ReactNode
    role?: string
    style?: React.CSSProperties
  }) => React.createElement('div', {role, style}, children)
  const Button = ({
    children,
    text,
    onClick,
    disabled,
  }: {
    children?: React.ReactNode
    text?: string
    onClick?: () => void
    disabled?: boolean
  }) => React.createElement('button', {type: 'button', onClick, disabled}, children ?? text)
  return {
    Button,
    Card: PassThrough,
    Flex: PassThrough,
    Spinner: PassThrough,
    Stack: PassThrough,
    Text: PassThrough,
    useToast: () => ({push: vi.fn()}),
  }
})

vi.mock('../src/components/DocumentTypeSelect', () => ({
  DocumentTypeSelect: ({setSelectedType}: {setSelectedType: (type: string) => void}) =>
    React.createElement(
      React.Fragment,
      null,
      React.createElement(
        'button',
        {type: 'button', onClick: () => setSelectedType('article')},
        'Choose article',
      ),
      React.createElement(
        'button',
        {type: 'button', onClick: () => setSelectedType('blog')},
        'Choose blog',
      ),
    ),
}))
vi.mock('../src/components/DocumentList', () => ({
  DocumentList: ({
    documentsData,
    handleSelectDoc,
    showReferenceDetails,
    loadStrongReferences,
  }: {
    documentsData: {_id: string; _type: string}[]
    handleSelectDoc: (id: string) => void
    showReferenceDetails: boolean
    loadStrongReferences: (request: {targetId: string; start: number; end: number}) => Promise<{
      total: number
      documents: {_id: string; _type: string; title?: unknown; name?: unknown}[]
    } | null>
  }) =>
    documentsData.length > 0
      ? React.createElement(DocumentListTestHarness, {
          documentsData,
          handleSelectDoc,
          showReferenceDetails,
          loadStrongReferences,
        })
      : null,
}))

function DocumentListTestHarness({
  documentsData,
  handleSelectDoc,
  showReferenceDetails,
  loadStrongReferences,
}: {
  documentsData: {_id: string; _type: string}[]
  handleSelectDoc: (id: string) => void
  showReferenceDetails: boolean
  loadStrongReferences: (request: {targetId: string; start: number; end: number}) => Promise<{
    total: number
    documents: {_id: string; _type: string; title?: unknown; name?: unknown}[]
  } | null>
}) {
  const [result, setResult] = React.useState<number | null>()
  return React.createElement(
    React.Fragment,
    null,
    React.createElement(
      'button',
      {type: 'button', onClick: () => handleSelectDoc(documentsData[0]._id)},
      `Select ${documentsData[0]._type}`,
    ),
    showReferenceDetails &&
      React.createElement(
        'button',
        {
          type: 'button',
          onClick: async () => {
            const loaded = await loadStrongReferences({targetId: 'blocked-1', start: 0, end: 10})
            hooks.referenceResults.push(loaded)
            setResult(loaded?.total ?? null)
          },
        },
        'Load references',
      ),
    result !== undefined &&
      React.createElement(
        'div',
        null,
        result === null ? 'Reference request discarded' : `Loaded references: ${result}`,
      ),
  )
}

vi.mock('../src/components/ConfirmDeleteDialog', () => ({
  ConfirmDeleteDialog: ({show, onDelete}: {show: boolean; onDelete: () => void}) =>
    show
      ? React.createElement('button', {type: 'button', onClick: onDelete}, 'Confirm delete')
      : null,
}))

describe('BulkDeleteComponent permission hooks', () => {
  beforeEach(() => {
    hooks.currentUser = {id: 'user-a', roles: []}
    hooks.perspective = 'drafts'
    hooks.projectId = 'project-a'
    hooks.dataset = 'dataset-a'
    hooks.referenceResults = []
    hooks.eligibleDocs = undefined
    hooks.client.fetch.mockReset().mockImplementation(baselineClientFetch)
    hooks.client.delete.mockClear()
    hooks.client.commit.mockReset().mockResolvedValue(undefined)
    hooks.client.transaction.mockReset().mockImplementation(() => ({
      delete: hooks.client.delete,
      commit: hooks.client.commit,
    }))
  })

  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  it('does not fetch dataset data for a user without an allowed role', async () => {
    render(<BulkDeleteComponent schemaTypes={[]} />)

    expect(screen.getByText(/administrator/i)).toBeTruthy()
    await waitFor(() => expect(hooks.client.fetch).not.toHaveBeenCalled())
  })

  it('keeps hooks in the same order when permission changes', async () => {
    const {rerender} = render(<BulkDeleteComponent schemaTypes={[]} />)

    hooks.currentUser = {id: 'user-a', roles: [{name: 'administrator'}]}
    expect(() => rerender(<BulkDeleteComponent schemaTypes={[]} />)).not.toThrow()

    await waitFor(() => expect(hooks.client.fetch).toHaveBeenCalledTimes(1))

    hooks.currentUser = {id: 'user-a', roles: []}
    rerender(<BulkDeleteComponent schemaTypes={[]} />)
    expect(hooks.client.fetch).toHaveBeenCalledTimes(1)
  })

  it('loads reference details in the current scope using a raw perspective query', async () => {
    hooks.currentUser = {id: 'user-a', roles: [{name: 'administrator'}]}
    hooks.perspective = 'published'
    render(<BulkDeleteComponent schemaTypes={[]} />)

    await waitFor(() => expect(hooks.client.fetch).toHaveBeenCalledTimes(1))
    fireEvent.click(screen.getByRole('button', {name: 'Choose article'}))
    await waitFor(() => expect(screen.getByRole('button', {name: 'Select article'})).toBeTruthy())
    fireEvent.click(screen.getByRole('button', {name: 'Load references'}))

    await waitFor(() => expect(screen.getByText('Loaded references: 17')).toBeTruthy())
    const [query, params, options] = hooks.client.fetch.mock.calls.find(([candidate]) =>
      candidate.includes('references($targetId)'),
    )!
    expect(query).toContain('count(*[references($targetId)])')
    expect(query).toContain('*[references($targetId)] | order(_id asc) [$start...$end]')
    expect(params).toEqual({targetId: 'blocked-1', start: 0, end: 10})
    expect(options).toEqual({perspective: 'raw'})
  })

  it.each(['user', 'project', 'dataset', 'role', 'perspective'] as const)(
    'discards a pending reference request after the %s scope changes',
    async (changedScope) => {
      hooks.currentUser = {id: 'user-a', roles: [{name: 'administrator'}]}
      hooks.perspective = 'published'
      let resolveReferences!: (value: {
        total: number
        documents: {_id: string; _type: string; title: string}[]
      }) => void
      const pendingReferences = new Promise<{
        total: number
        documents: {_id: string; _type: string; title: string}[]
      }>((resolve) => {
        resolveReferences = resolve
      })
      hooks.client.fetch.mockImplementation((query: string, params?: {type?: string}) =>
        query.includes('references($targetId)')
          ? pendingReferences
          : baselineClientFetch(query, params),
      )

      const {rerender} = render(<BulkDeleteComponent schemaTypes={[]} />)
      await waitFor(() => expect(hooks.client.fetch).toHaveBeenCalledTimes(1))
      fireEvent.click(screen.getByRole('button', {name: 'Choose article'}))
      await waitFor(() =>
        expect(screen.getByRole('button', {name: 'Load references'})).toBeTruthy(),
      )
      fireEvent.click(screen.getByRole('button', {name: 'Load references'}))
      await waitFor(() =>
        expect(
          hooks.client.fetch.mock.calls.some(([query]) => query.includes('references($targetId)')),
        ).toBe(true),
      )

      if (changedScope === 'user')
        hooks.currentUser = {id: 'user-b', roles: [{name: 'administrator'}]}
      if (changedScope === 'project') hooks.projectId = 'project-b'
      if (changedScope === 'dataset') hooks.dataset = 'dataset-b'
      if (changedScope === 'role')
        hooks.currentUser = {
          id: 'user-a',
          roles: [{name: 'administrator'}, {name: 'editor'}],
        }
      if (changedScope === 'perspective') hooks.perspective = 'drafts'
      rerender(<BulkDeleteComponent schemaTypes={[]} />)

      resolveReferences({
        total: 99,
        documents: [{_id: 'stale-referrer', _type: 'article', title: 'Stale reference'}],
      })
      await waitFor(() => expect(hooks.referenceResults).toHaveLength(1))
      expect(hooks.referenceResults).toEqual([null])
      expect(screen.queryByText('Loaded references: 99')).toBeNull()
      expect(screen.queryByText('Stale reference')).toBeNull()
    },
  )

  it('shows accessible success feedback after a confirmed deletion', async () => {
    hooks.currentUser = {id: 'user-a', roles: [{name: 'administrator'}]}
    render(<BulkDeleteComponent schemaTypes={[]} />)

    await waitFor(() => expect(hooks.client.fetch).toHaveBeenCalledTimes(1))
    fireEvent.click(screen.getByRole('button', {name: 'Choose article'}))
    await waitFor(() => expect(screen.getByRole('button', {name: 'Select article'})).toBeTruthy())
    expect(
      hooks.client.fetch.mock.calls.some(
        ([query, params]) => query.includes('_type == $type') && params?.type === 'article',
      ),
    ).toBe(true)
    fireEvent.click(screen.getByRole('button', {name: 'Select article'}))
    fireEvent.click(screen.getByRole('button', {name: 'Delete Selected (1)'}))
    fireEvent.click(screen.getByRole('button', {name: 'Confirm delete'}))

    await waitFor(() =>
      expect(screen.getByRole('status').textContent).toContain('1 Documents Deleted'),
    )
    expect(hooks.client.delete).toHaveBeenCalledWith('drafts-article-1')
    expect(hooks.client.commit).toHaveBeenCalledOnce()
  })

  it('removes a deleted ID reselected after leaving and returning to its scope', async () => {
    hooks.currentUser = {id: 'user-a', roles: [{name: 'administrator'}]}
    render(<BulkDeleteComponent schemaTypes={[]} />)

    await waitFor(() => expect(hooks.client.fetch).toHaveBeenCalledTimes(1))
    fireEvent.click(screen.getByRole('button', {name: 'Choose article'}))
    await waitFor(() => expect(screen.getByRole('button', {name: 'Select article'})).toBeTruthy())
    fireEvent.click(screen.getByRole('button', {name: 'Select article'}))
    fireEvent.click(screen.getByRole('button', {name: 'Delete Selected (1)'}))

    let resolveCommit!: () => void
    const pendingCommit = new Promise<void>((resolve) => {
      resolveCommit = resolve
    })
    hooks.client.commit.mockImplementationOnce(() => pendingCommit)
    fireEvent.click(screen.getByRole('button', {name: 'Confirm delete'}))
    await waitFor(() => expect(hooks.client.commit).toHaveBeenCalledOnce())

    fireEvent.click(screen.getByRole('button', {name: 'Choose blog'}))
    await waitFor(() => expect(screen.getByRole('button', {name: 'Select blog'})).toBeTruthy())
    fireEvent.click(screen.getByRole('button', {name: 'Choose article'}))
    await waitFor(() => expect(screen.getByRole('button', {name: 'Select article'})).toBeTruthy())
    fireEvent.click(screen.getByRole('button', {name: 'Select article'}))
    expect(screen.getByRole('button', {name: 'Delete Selected (1)'})).toBeTruthy()

    resolveCommit()
    await waitFor(() =>
      expect(screen.getByRole('button', {name: 'Delete Selected (0)'})).toBeTruthy(),
    )
    expect(hooks.client.delete).toHaveBeenCalledWith('drafts-article-1')
  })

  it('preserves a different-scope selection when an earlier delete commit resolves', async () => {
    hooks.currentUser = {id: 'user-a', roles: [{name: 'administrator'}]}
    render(<BulkDeleteComponent schemaTypes={[]} />)

    await waitFor(() => expect(hooks.client.fetch).toHaveBeenCalledTimes(1))
    fireEvent.click(screen.getByRole('button', {name: 'Choose article'}))
    await waitFor(() => expect(screen.getByRole('button', {name: 'Select article'})).toBeTruthy())
    fireEvent.click(screen.getByRole('button', {name: 'Select article'}))
    fireEvent.click(screen.getByRole('button', {name: 'Delete Selected (1)'}))

    let resolveCommit!: () => void
    const pendingCommit = new Promise<void>((resolve) => {
      resolveCommit = resolve
    })
    hooks.client.commit.mockImplementationOnce(() => pendingCommit)
    fireEvent.click(screen.getByRole('button', {name: 'Confirm delete'}))
    await waitFor(() => expect(hooks.client.commit).toHaveBeenCalledOnce())

    fireEvent.click(screen.getByRole('button', {name: 'Choose blog'}))
    await waitFor(() => expect(screen.getByRole('button', {name: 'Select blog'})).toBeTruthy())
    fireEvent.click(screen.getByRole('button', {name: 'Select blog'}))
    expect(screen.getByRole('button', {name: 'Delete Selected (1)'})).toBeTruthy()

    resolveCommit()
    await waitFor(() =>
      expect(screen.getByRole('button', {name: 'Delete Selected (1)'})).toBeTruthy(),
    )
    expect(hooks.client.delete).toHaveBeenCalledWith('drafts-article-1')
  })

  it('rechecks selected document eligibility before creating a transaction', async () => {
    hooks.currentUser = {id: 'user-a', roles: [{name: 'administrator'}]}
    render(<BulkDeleteComponent schemaTypes={[]} />)

    await waitFor(() => expect(hooks.client.fetch).toHaveBeenCalledTimes(1))
    fireEvent.click(screen.getByRole('button', {name: 'Choose article'}))
    await waitFor(() => expect(screen.getByRole('button', {name: 'Select article'})).toBeTruthy())
    fireEvent.click(screen.getByRole('button', {name: 'Select article'}))
    fireEvent.click(screen.getByRole('button', {name: 'Delete Selected (1)'}))

    hooks.eligibleDocs = []
    fireEvent.click(screen.getByRole('button', {name: 'Confirm delete'}))

    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).toContain('Selection Changed'),
    )
    expect(hooks.client.delete).not.toHaveBeenCalled()
    expect(hooks.client.commit).not.toHaveBeenCalled()
    expect(screen.getByRole('button', {name: 'Delete Selected (0)'})).toBeTruthy()
  })

  it('does not transact if permission is revoked while eligibility verification is pending', async () => {
    hooks.currentUser = {id: 'user-a', roles: [{name: 'administrator'}]}
    const {rerender} = render(<BulkDeleteComponent schemaTypes={[]} />)

    await waitFor(() => expect(hooks.client.fetch).toHaveBeenCalledTimes(1))
    fireEvent.click(screen.getByRole('button', {name: 'Choose article'}))
    await waitFor(() => expect(screen.getByRole('button', {name: 'Select article'})).toBeTruthy())
    fireEvent.click(screen.getByRole('button', {name: 'Select article'}))
    fireEvent.click(screen.getByRole('button', {name: 'Delete Selected (1)'}))

    let resolveEligibility!: (docs: {_id: string; _type: string; title: string}[]) => void
    const pendingEligibility = new Promise<{_id: string; _type: string; title: string}[]>(
      (resolve) => {
        resolveEligibility = resolve
      },
    )
    hooks.client.fetch.mockImplementationOnce(() => pendingEligibility)
    fireEvent.click(screen.getByRole('button', {name: 'Confirm delete'}))

    await waitFor(() => expect(hooks.client.fetch).toHaveBeenCalledTimes(4))
    hooks.currentUser = {id: 'user-a', roles: []}
    rerender(<BulkDeleteComponent schemaTypes={[]} />)
    resolveEligibility([{_id: 'drafts-article-1', _type: 'article', title: 'One article'}])

    await waitFor(() => expect(screen.getByText(/administrator/i)).toBeTruthy())
    expect(hooks.client.delete).not.toHaveBeenCalled()
    expect(hooks.client.commit).not.toHaveBeenCalled()
  })

  it('clears selection and confirmation when the current user or client context changes', async () => {
    hooks.currentUser = {id: 'user-a', roles: [{name: 'administrator'}]}
    const {rerender} = render(<BulkDeleteComponent schemaTypes={[]} />)

    await waitFor(() => expect(hooks.client.fetch).toHaveBeenCalledTimes(1))
    fireEvent.click(screen.getByRole('button', {name: 'Choose article'}))
    await waitFor(() => expect(screen.getByRole('button', {name: 'Select article'})).toBeTruthy())
    fireEvent.click(screen.getByRole('button', {name: 'Select article'}))
    fireEvent.click(screen.getByRole('button', {name: 'Delete Selected (1)'}))

    hooks.currentUser = {id: 'user-b', roles: [{name: 'administrator'}]}
    rerender(<BulkDeleteComponent schemaTypes={[]} />)
    await waitFor(() =>
      expect(screen.getByRole('button', {name: 'Delete Selected (0)'})).toBeTruthy(),
    )
    expect(screen.queryByRole('button', {name: 'Confirm delete'})).toBeNull()

    fireEvent.click(screen.getByRole('button', {name: 'Select article'}))
    fireEvent.click(screen.getByRole('button', {name: 'Delete Selected (1)'}))
    hooks.projectId = 'project-b'
    rerender(<BulkDeleteComponent schemaTypes={[]} />)
    await waitFor(() =>
      expect(screen.getByRole('button', {name: 'Delete Selected (0)'})).toBeTruthy(),
    )
    expect(screen.queryByRole('button', {name: 'Confirm delete'})).toBeNull()
    expect(hooks.client.commit).not.toHaveBeenCalled()
  })

  it('shows accessible error feedback when the delete transaction fails', async () => {
    hooks.currentUser = {id: 'user-a', roles: [{name: 'administrator'}]}
    hooks.client.commit.mockRejectedValueOnce(new Error('write denied'))
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    render(<BulkDeleteComponent schemaTypes={[]} />)

    await waitFor(() => expect(hooks.client.fetch).toHaveBeenCalledTimes(1))
    fireEvent.click(screen.getByRole('button', {name: 'Choose article'}))
    await waitFor(() => expect(screen.getByRole('button', {name: 'Select article'})).toBeTruthy())
    fireEvent.click(screen.getByRole('button', {name: 'Select article'}))
    fireEvent.click(screen.getByRole('button', {name: 'Delete Selected (1)'}))
    fireEvent.click(screen.getByRole('button', {name: 'Confirm delete'}))

    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('write denied'))
    consoleError.mockRestore()
  })

  it('keeps success feedback and warns when refreshing the list fails after deletion', async () => {
    hooks.currentUser = {id: 'user-a', roles: [{name: 'administrator'}]}
    render(<BulkDeleteComponent schemaTypes={[]} />)

    await waitFor(() => expect(hooks.client.fetch).toHaveBeenCalledTimes(1))
    fireEvent.click(screen.getByRole('button', {name: 'Choose article'}))
    await waitFor(() => expect(screen.getByRole('button', {name: 'Select article'})).toBeTruthy())
    fireEvent.click(screen.getByRole('button', {name: 'Select article'}))
    fireEvent.click(screen.getByRole('button', {name: 'Delete Selected (1)'}))

    const defaultFetch = hooks.client.fetch.getMockImplementation()!
    hooks.client.fetch.mockImplementationOnce((query: string, params?: {type?: string}) =>
      defaultFetch(query, params),
    )
    hooks.client.fetch.mockRejectedValueOnce(new Error('network unavailable'))
    fireEvent.click(screen.getByRole('button', {name: 'Confirm delete'}))

    await waitFor(() =>
      expect(screen.getByRole('status').textContent).toContain('1 Documents Deleted'),
    )
    expect(screen.getByRole('alert').textContent).toContain("couldn't be refreshed")
    expect(screen.getByRole('alert').textContent).toContain('network unavailable')
    expect(hooks.client.commit).toHaveBeenCalledOnce()

    fireEvent.click(screen.getByRole('button', {name: 'Choose blog'}))
    await waitFor(() => expect(screen.getByRole('button', {name: 'Select blog'})).toBeTruthy())
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('clears the selected documents and confirmation when the document type changes', async () => {
    hooks.currentUser = {id: 'user-a', roles: [{name: 'administrator'}]}
    render(<BulkDeleteComponent schemaTypes={[]} />)

    await waitFor(() => expect(hooks.client.fetch).toHaveBeenCalledTimes(1))
    fireEvent.click(screen.getByRole('button', {name: 'Choose article'}))
    await waitFor(() => expect(screen.getByRole('button', {name: 'Select article'})).toBeTruthy())
    fireEvent.click(screen.getByRole('button', {name: 'Select article'}))
    fireEvent.click(screen.getByRole('button', {name: 'Delete Selected (1)'}))
    expect(screen.getByRole('button', {name: 'Confirm delete'})).toBeTruthy()

    const fetchCountBeforeSwitch = hooks.client.fetch.mock.calls.length
    let resolveBlogFetch!: (docs: {_id: string; _type: string; title: string}[]) => void
    const pendingBlogFetch = new Promise<{_id: string; _type: string; title: string}[]>(
      (resolve) => {
        resolveBlogFetch = resolve
      },
    )
    const defaultFetch = hooks.client.fetch.getMockImplementation()!
    hooks.client.fetch.mockImplementation((query: string, params?: {type?: string}) =>
      params?.type === 'blog' ? pendingBlogFetch : defaultFetch(query, params),
    )
    fireEvent.click(screen.getByRole('button', {name: 'Choose blog'}))

    await waitFor(() =>
      expect(hooks.client.fetch).toHaveBeenCalledTimes(fetchCountBeforeSwitch + 2),
    )
    expect(screen.queryByRole('button', {name: 'Select article'})).toBeNull()
    expect(screen.queryByRole('button', {name: 'Confirm delete'})).toBeNull()
    resolveBlogFetch([{_id: 'blog-1', _type: 'blog', title: 'One blog'}])

    await waitFor(() => expect(screen.getByRole('button', {name: 'Select blog'})).toBeTruthy())
    expect(screen.queryByRole('button', {name: 'Confirm delete'})).toBeNull()
    expect(screen.getByRole('button', {name: 'Delete Selected (0)'})).toBeTruthy()
    expect(hooks.client.delete).not.toHaveBeenCalled()
    expect(hooks.client.commit).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', {name: 'Choose article'}))
    await waitFor(() => expect(screen.getByRole('button', {name: 'Select article'})).toBeTruthy())
    expect(screen.getByRole('button', {name: 'Delete Selected (0)'})).toBeTruthy()
  })

  it('ignores an obsolete document fetch without clearing the active scope loading state', async () => {
    hooks.currentUser = {id: 'user-a', roles: [{name: 'administrator'}]}
    const {rerender} = render(<BulkDeleteComponent schemaTypes={[]} />)
    await waitFor(() => expect(hooks.client.fetch).toHaveBeenCalledTimes(1))
    fireEvent.click(screen.getByRole('button', {name: 'Choose article'}))
    await waitFor(() => expect(screen.getByRole('button', {name: 'Select article'})).toBeTruthy())

    let resolveOldPerspective!: (docs: {_id: string; _type: string; title: string}[]) => void
    const pendingOldPerspective = new Promise<{_id: string; _type: string; title: string}[]>(
      (resolve) => {
        resolveOldPerspective = resolve
      },
    )
    let resolveCurrentPerspectiveDocs!: (
      docs: {_id: string; _type: string; title: string}[],
    ) => void
    let resolveCurrentPerspectiveStrongRefs!: (
      docs: {_id: string; _type: string; title: string}[],
    ) => void
    const pendingCurrentPerspectiveDocs = new Promise<
      {_id: string; _type: string; title: string}[]
    >((resolve) => {
      resolveCurrentPerspectiveDocs = resolve
    })
    const pendingCurrentPerspectiveStrongRefs = new Promise<
      {_id: string; _type: string; title: string}[]
    >((resolve) => {
      resolveCurrentPerspectiveStrongRefs = resolve
    })
    const defaultFetch = hooks.client.fetch.getMockImplementation()!
    hooks.client.fetch.mockImplementation((query: string, params?: {type?: string}) => {
      if (!query.includes('array::unique')) {
        const isDrafts = query.includes('_id in path("drafts.**")')
        if (!isDrafts) return pendingOldPerspective
        return query.includes('"hasWeakReferences"')
          ? pendingCurrentPerspectiveDocs
          : pendingCurrentPerspectiveStrongRefs
      }
      return defaultFetch(query, params)
    })

    const fetchCount = hooks.client.fetch.mock.calls.length
    hooks.perspective = 'published'
    rerender(<BulkDeleteComponent schemaTypes={[]} />)
    await waitFor(() => expect(hooks.client.fetch).toHaveBeenCalledTimes(fetchCount + 2))
    hooks.perspective = 'drafts'
    rerender(<BulkDeleteComponent schemaTypes={[]} />)
    await waitFor(() => expect(hooks.client.fetch).toHaveBeenCalledTimes(fetchCount + 4))

    resolveOldPerspective([{_id: 'published-article-1', _type: 'article', title: 'Old article'}])
    await waitFor(() => expect(screen.getByText('Loading...')).toBeTruthy())
    expect(screen.queryByRole('button', {name: 'Select article'})).toBeNull()

    resolveCurrentPerspectiveDocs([
      {_id: 'drafts-article-1', _type: 'article', title: 'Current article'},
    ])
    resolveCurrentPerspectiveStrongRefs([])
    await waitFor(() => expect(screen.getByRole('button', {name: 'Select article'})).toBeTruthy())
    expect(screen.queryByText('Loading...')).toBeNull()
  })

  it('does not let a pending post-delete refresh clear loading for a newer scope', async () => {
    hooks.currentUser = {id: 'user-a', roles: [{name: 'administrator'}]}
    render(<BulkDeleteComponent schemaTypes={[]} />)

    await waitFor(() => expect(hooks.client.fetch).toHaveBeenCalledTimes(1))
    fireEvent.click(screen.getByRole('button', {name: 'Choose article'}))
    await waitFor(() => expect(screen.getByRole('button', {name: 'Select article'})).toBeTruthy())
    fireEvent.click(screen.getByRole('button', {name: 'Select article'}))
    fireEvent.click(screen.getByRole('button', {name: 'Delete Selected (1)'}))

    let resolveRefresh!: (docs: {_id: string; _type: string; title: string}[]) => void
    const pendingRefresh = new Promise<{_id: string; _type: string; title: string}[]>((resolve) => {
      resolveRefresh = resolve
    })
    let resolveBlogDocs!: (docs: {_id: string; _type: string; title: string}[]) => void
    let resolveBlogStrongRefs!: (docs: {_id: string; _type: string; title: string}[]) => void
    const pendingBlogDocs = new Promise<{_id: string; _type: string; title: string}[]>(
      (resolve) => {
        resolveBlogDocs = resolve
      },
    )
    const pendingBlogStrongRefs = new Promise<{_id: string; _type: string; title: string}[]>(
      (resolve) => {
        resolveBlogStrongRefs = resolve
      },
    )
    let articleEligibleFetches = 0
    const defaultFetch = hooks.client.fetch.getMockImplementation()!
    hooks.client.fetch.mockImplementation((query: string, params?: {type?: string}) => {
      if (params?.type === 'article' && query.includes('"hasWeakReferences"')) {
        articleEligibleFetches += 1
        if (articleEligibleFetches === 2) return pendingRefresh
      }
      if (params?.type === 'blog') {
        return query.includes('"hasWeakReferences"') ? pendingBlogDocs : pendingBlogStrongRefs
      }
      return defaultFetch(query, params)
    })

    fireEvent.click(screen.getByRole('button', {name: 'Confirm delete'}))
    await waitFor(() => expect(hooks.client.commit).toHaveBeenCalledOnce())
    await waitFor(() => expect(articleEligibleFetches).toBe(2))
    fireEvent.click(screen.getByRole('button', {name: 'Choose blog'}))
    await waitFor(() =>
      expect(
        hooks.client.fetch.mock.calls.filter(([, params]) => params?.type === 'blog'),
      ).toHaveLength(2),
    )

    resolveRefresh([{_id: 'drafts-article-1', _type: 'article', title: 'Old article'}])
    await waitFor(() => expect(screen.getByText('Loading...')).toBeTruthy())
    expect(screen.queryByRole('button', {name: 'Select blog'})).toBeNull()

    resolveBlogDocs([{_id: 'blog-1', _type: 'blog', title: 'Current blog'}])
    resolveBlogStrongRefs([])
    await waitFor(() => expect(screen.getByRole('button', {name: 'Select blog'})).toBeTruthy())
    expect(screen.queryByText('Loading...')).toBeNull()
    expect(screen.getByRole('status').textContent).toContain('1 Documents Deleted')
    expect(hooks.client.commit).toHaveBeenCalledOnce()
  })

  it('does not show an old transaction result or clear a newer scope selection', async () => {
    hooks.currentUser = {id: 'user-a', roles: [{name: 'administrator'}]}
    render(<BulkDeleteComponent schemaTypes={[]} />)

    await waitFor(() => expect(hooks.client.fetch).toHaveBeenCalledTimes(1))
    fireEvent.click(screen.getByRole('button', {name: 'Choose article'}))
    await waitFor(() => expect(screen.getByRole('button', {name: 'Select article'})).toBeTruthy())
    fireEvent.click(screen.getByRole('button', {name: 'Select article'}))
    fireEvent.click(screen.getByRole('button', {name: 'Delete Selected (1)'}))

    let resolveCommit!: () => void
    const pendingCommit = new Promise<void>((resolve) => {
      resolveCommit = resolve
    })
    hooks.client.commit.mockImplementationOnce(() => pendingCommit)
    fireEvent.click(screen.getByRole('button', {name: 'Confirm delete'}))
    await waitFor(() => expect(hooks.client.commit).toHaveBeenCalledOnce())

    fireEvent.click(screen.getByRole('button', {name: 'Choose blog'}))
    await waitFor(() => expect(screen.getByRole('button', {name: 'Select blog'})).toBeTruthy())
    fireEvent.click(screen.getByRole('button', {name: 'Select blog'}))
    expect(screen.getByRole('button', {name: 'Delete Selected (1)'})).toBeTruthy()

    const fetchCountBeforeCommitResolves = hooks.client.fetch.mock.calls.length
    resolveCommit()

    await waitFor(() =>
      expect(hooks.client.fetch).toHaveBeenCalledTimes(fetchCountBeforeCommitResolves + 1),
    )
    expect(screen.getByRole('button', {name: 'Delete Selected (1)'})).toBeTruthy()
    expect(screen.getByRole('status').textContent).toContain('1 Documents Deleted')
    expect(hooks.client.commit).toHaveBeenCalledOnce()
  })

  it('hides a pending transaction result after the user context changes', async () => {
    hooks.currentUser = {id: 'user-a', roles: [{name: 'administrator'}]}
    const {rerender} = render(<BulkDeleteComponent schemaTypes={[]} />)

    await waitFor(() => expect(hooks.client.fetch).toHaveBeenCalledTimes(1))
    fireEvent.click(screen.getByRole('button', {name: 'Choose article'}))
    await waitFor(() => expect(screen.getByRole('button', {name: 'Select article'})).toBeTruthy())
    fireEvent.click(screen.getByRole('button', {name: 'Select article'}))
    fireEvent.click(screen.getByRole('button', {name: 'Delete Selected (1)'}))

    let resolveCommit!: () => void
    const pendingCommit = new Promise<void>((resolve) => {
      resolveCommit = resolve
    })
    hooks.client.commit.mockImplementationOnce(() => pendingCommit)
    fireEvent.click(screen.getByRole('button', {name: 'Confirm delete'}))
    await waitFor(() => expect(hooks.client.commit).toHaveBeenCalledOnce())

    hooks.currentUser = {id: 'user-b', roles: [{name: 'administrator'}]}
    rerender(<BulkDeleteComponent schemaTypes={[]} />)
    await waitFor(() => expect(screen.getByRole('button', {name: 'Select article'})).toBeTruthy())
    fireEvent.click(screen.getByRole('button', {name: 'Select article'}))
    expect(screen.getByRole('button', {name: 'Delete Selected (1)'})).toBeTruthy()

    const fetchCountBeforeCommitResolves = hooks.client.fetch.mock.calls.length
    resolveCommit()

    await waitFor(() =>
      expect(hooks.client.fetch).toHaveBeenCalledTimes(fetchCountBeforeCommitResolves + 1),
    )
    expect(screen.getByRole('button', {name: 'Delete Selected (1)'})).toBeTruthy()
    expect(screen.queryByRole('status')).toBeNull()
    expect(hooks.client.commit).toHaveBeenCalledOnce()
  })

  it('does not let a stale eligibility failure clear loading for a new scope', async () => {
    hooks.currentUser = {id: 'user-a', roles: [{name: 'administrator'}]}
    render(<BulkDeleteComponent schemaTypes={[]} />)

    await waitFor(() => expect(hooks.client.fetch).toHaveBeenCalledTimes(1))
    fireEvent.click(screen.getByRole('button', {name: 'Choose article'}))
    await waitFor(() => expect(screen.getByRole('button', {name: 'Select article'})).toBeTruthy())
    fireEvent.click(screen.getByRole('button', {name: 'Select article'}))
    fireEvent.click(screen.getByRole('button', {name: 'Delete Selected (1)'}))

    let rejectEligibility!: (error: Error) => void
    const pendingEligibility = new Promise<{_id: string; _type: string; title: string}[]>(
      (_, reject) => {
        rejectEligibility = reject
      },
    )
    let resolveBlogDocs!: (docs: {_id: string; _type: string; title: string}[]) => void
    let resolveBlogStrongRefs!: (docs: {_id: string; _type: string; title: string}[]) => void
    const pendingBlogDocs = new Promise<{_id: string; _type: string; title: string}[]>(
      (resolve) => {
        resolveBlogDocs = resolve
      },
    )
    const pendingBlogStrongRefs = new Promise<{_id: string; _type: string; title: string}[]>(
      (resolve) => {
        resolveBlogStrongRefs = resolve
      },
    )
    let articleEligibleFetches = 1
    const defaultFetch = hooks.client.fetch.getMockImplementation()!
    hooks.client.fetch.mockImplementation((query: string, params?: {type?: string}) => {
      if (params?.type === 'article' && query.includes('"hasWeakReferences"')) {
        articleEligibleFetches += 1
        if (articleEligibleFetches === 2) return pendingEligibility
      }
      if (params?.type === 'blog') {
        return query.includes('"hasWeakReferences"') ? pendingBlogDocs : pendingBlogStrongRefs
      }
      return defaultFetch(query, params)
    })

    fireEvent.click(screen.getByRole('button', {name: 'Confirm delete'}))
    await waitFor(() => expect(articleEligibleFetches).toBe(2))
    fireEvent.click(screen.getByRole('button', {name: 'Choose blog'}))
    await waitFor(() => expect(screen.getByText('Loading...')).toBeTruthy())

    rejectEligibility(new Error('verification failed'))
    await waitFor(() => expect(screen.getByText('Loading...')).toBeTruthy())
    expect(screen.queryByRole('button', {name: 'Select blog'})).toBeNull()

    resolveBlogDocs([{_id: 'blog-1', _type: 'blog', title: 'Current blog'}])
    resolveBlogStrongRefs([])
    await waitFor(() => expect(screen.getByRole('button', {name: 'Select blog'})).toBeTruthy())
    expect(screen.queryByText('Loading...')).toBeNull()
    expect(hooks.client.commit).not.toHaveBeenCalled()
  })

  it('clears the selected documents and confirmation when the perspective changes', async () => {
    hooks.currentUser = {id: 'user-a', roles: [{name: 'administrator'}]}
    const {rerender} = render(<BulkDeleteComponent schemaTypes={[]} />)

    await waitFor(() => expect(hooks.client.fetch).toHaveBeenCalledTimes(1))
    fireEvent.click(screen.getByRole('button', {name: 'Choose article'}))
    await waitFor(() => expect(screen.getByRole('button', {name: 'Select article'})).toBeTruthy())
    fireEvent.click(screen.getByRole('button', {name: 'Select article'}))
    fireEvent.click(screen.getByRole('button', {name: 'Delete Selected (1)'}))
    expect(screen.getByRole('button', {name: 'Confirm delete'})).toBeTruthy()

    const fetchCountBeforeSwitch = hooks.client.fetch.mock.calls.length
    hooks.perspective = 'published'
    rerender(<BulkDeleteComponent schemaTypes={[]} />)

    await waitFor(() =>
      expect(hooks.client.fetch).toHaveBeenCalledTimes(fetchCountBeforeSwitch + 2),
    )
    expect(screen.queryByRole('button', {name: 'Confirm delete'})).toBeNull()
    expect(screen.getByRole('button', {name: 'Delete Selected (0)'})).toBeTruthy()
    expect(hooks.client.delete).not.toHaveBeenCalled()
    expect(hooks.client.commit).not.toHaveBeenCalled()

    hooks.perspective = 'drafts'
    rerender(<BulkDeleteComponent schemaTypes={[]} />)
    await waitFor(() =>
      expect(hooks.client.fetch).toHaveBeenCalledTimes(fetchCountBeforeSwitch + 4),
    )
    expect(screen.getByRole('button', {name: 'Delete Selected (0)'})).toBeTruthy()
  })

  it('keeps the selection when an unresolved perspective normalizes to drafts', async () => {
    hooks.currentUser = {id: 'user-a', roles: [{name: 'administrator'}]}
    const {rerender} = render(<BulkDeleteComponent schemaTypes={[]} />)

    await waitFor(() => expect(hooks.client.fetch).toHaveBeenCalledTimes(1))
    fireEvent.click(screen.getByRole('button', {name: 'Choose article'}))
    await waitFor(() => expect(screen.getByRole('button', {name: 'Select article'})).toBeTruthy())
    fireEvent.click(screen.getByRole('button', {name: 'Select article'}))
    expect(screen.getByRole('button', {name: 'Delete Selected (1)'})).toBeTruthy()

    hooks.perspective = undefined
    rerender(<BulkDeleteComponent schemaTypes={[]} />)

    expect(screen.getByRole('button', {name: 'Delete Selected (1)'})).toBeTruthy()
    expect(hooks.client.fetch).toHaveBeenCalledTimes(3)
  })
})
