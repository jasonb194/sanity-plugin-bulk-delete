// @vitest-environment jsdom
import {cleanup, fireEvent, render, screen, waitFor} from '@testing-library/react'
import React from 'react'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import {DocumentList} from '../src/components/DocumentList'

const mocks = vi.hoisted(() => ({
  perspective: 'drafts' as string | undefined,
  fetch: vi.fn(),
}))

vi.mock('sanity', () => ({
  useClient: () => ({fetch: mocks.fetch}),
  usePerspective: () => ({selectedPerspectiveName: mocks.perspective}),
}))

vi.mock('sanity/router', () => ({
  IntentLink: ({
    intent,
    params,
    children,
  }: {
    intent: string
    params: {id: string; type: string}
    children: React.ReactNode
  }) => (
    <a
      href={`/intent/${intent}/${params.type};${params.id}`}
      data-intent={intent}
      data-id={params.id}
      data-type={params.type}
    >
      {children}
    </a>
  ),
}))

vi.mock('groq', () => ({defineQuery: (query: string) => query}))

vi.mock('@sanity/ui', () => {
  const PassThrough = ({children, as, ...props}: {children?: React.ReactNode; as?: string}) =>
    React.createElement(as || 'div', props, children)
  const Button = ({
    children,
    text,
    onClick,
    disabled,
    ...props
  }: {
    children?: React.ReactNode
    text?: string
    onClick?: () => void
    disabled?: boolean
  }) =>
    React.createElement('button', {type: 'button', onClick, disabled, ...props}, children ?? text)
  return {
    Box: PassThrough,
    Button,
    Card: PassThrough,
    Checkbox: (props: React.InputHTMLAttributes<HTMLInputElement>) =>
      React.createElement('input', {type: 'checkbox', ...props}),
    Flex: PassThrough,
    Spinner: PassThrough,
    Stack: PassThrough,
    Text: PassThrough,
  }
})

const blockedDoc = {_id: 'blocked-1', _type: 'article', title: 'Blocked article'}

function renderList() {
  return render(
    <DocumentList
      documentsData={[]}
      stronglyReferencedDocs={[blockedDoc]}
      isDocSelected={() => false}
      handleSelectDoc={vi.fn()}
    />,
  )
}

function documentsForPage(start: number) {
  return Array.from({length: 10}, (_, index) => ({
    _id: `referrer-${start + index + 1}`,
    _type: 'article',
    title: `Referrer ${start + index + 1}`,
  }))
}

describe('DocumentList strong reference details', () => {
  beforeEach(() => {
    mocks.perspective = 'drafts'
    mocks.fetch.mockReset()
  })

  afterEach(() => cleanup())

  it('hides reference controls outside the published perspective', () => {
    renderList()

    expect(screen.queryByRole('button', {name: /references for Blocked article/})).toBeNull()
    expect(mocks.fetch).not.toHaveBeenCalled()
  })

  it('shows an accessible caret beside the blocked document and toggles its details', async () => {
    mocks.perspective = 'published'
    mocks.fetch.mockResolvedValue({total: 0, documents: []})
    renderList()

    const showButton = screen.getByRole('button', {name: 'Show references for Blocked article'})
    expect(showButton.textContent).toBe('▸')
    expect(showButton.getAttribute('aria-expanded')).toBe('false')
    expect(screen.queryByText('Show references')).toBeNull()
    expect(showButton.parentElement?.parentElement?.textContent).toContain('Blocked article')

    const referencesId = showButton.getAttribute('aria-controls')
    expect(referencesId).toBeTruthy()
    fireEvent.click(showButton)

    const hideButton = screen.getByRole('button', {name: 'Hide references for Blocked article'})
    expect(hideButton.textContent).toBe('▾')
    expect(hideButton.getAttribute('aria-expanded')).toBe('true')
    expect(document.getElementById(referencesId!)?.hasAttribute('hidden')).toBe(false)
    await screen.findByText('0 documents reference this document.')

    fireEvent.click(hideButton)
    const collapsedButton = screen.getByRole('button', {
      name: 'Show references for Blocked article',
    })
    expect(collapsedButton.getAttribute('aria-expanded')).toBe('false')
    expect(document.getElementById(referencesId!)?.hasAttribute('hidden')).toBe(true)

    fireEvent.click(collapsedButton)
    expect(await screen.findByText('0 documents reference this document.')).toBeTruthy()
    expect(mocks.fetch).toHaveBeenCalledOnce()
  })

  it('loads the count and first page together, then renders referrers as edit intent links', async () => {
    mocks.perspective = 'published'
    mocks.fetch.mockResolvedValue({
      total: 2,
      documents: [
        {_id: 'ref-a', _type: 'article', title: 'Referenced A'},
        {_id: 'ref-b', _type: 'author', name: 'Referenced B'},
      ],
    })
    renderList()

    fireEvent.click(screen.getByRole('button', {name: 'Show references for Blocked article'}))

    await screen.findByRole('link', {name: 'Referenced A'})
    expect(screen.getByText('2 documents reference this document.')).toBeTruthy()
    expect(screen.getByRole('link', {name: 'Referenced A'}).getAttribute('href')).toBe(
      '/intent/edit/article;ref-a',
    )
    expect(screen.getByRole('link', {name: 'Referenced A'}).getAttribute('data-intent')).toBe(
      'edit',
    )
    expect(screen.getByRole('link', {name: 'Referenced A'}).getAttribute('data-id')).toBe('ref-a')
    expect(screen.getByRole('link', {name: 'Referenced B'}).getAttribute('data-type')).toBe(
      'author',
    )

    expect(mocks.fetch).toHaveBeenCalledOnce()
    const [query, params, options] = mocks.fetch.mock.calls[0]
    expect(query).toContain('count(*[references($targetId)])')
    expect(query).toContain('*[references($targetId)] | order(_id asc) [$start...$end]')
    expect(params).toEqual({targetId: blockedDoc._id, start: 0, end: 10})
    expect(options).toEqual({perspective: 'raw'})
  })

  it('pages by ten and caps navigation at ten pages while showing the true count', async () => {
    mocks.perspective = 'published'
    mocks.fetch.mockImplementation((_query: string, params: {start: number}) =>
      Promise.resolve({total: 105, documents: documentsForPage(params.start)}),
    )
    renderList()

    fireEvent.click(screen.getByRole('button', {name: 'Show references for Blocked article'}))

    await screen.findByRole('link', {name: 'Referrer 1'})
    expect(screen.getByText(/105 documents reference this document/)).toBeTruthy()
    expect(screen.getByText(/Showing the first 100 in ID order/)).toBeTruthy()
    expect(screen.getByText('Page 1 of 10')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', {name: 'Next'}))
    await screen.findByRole('link', {name: 'Referrer 11'})
    expect(screen.getByText('Page 2 of 10')).toBeTruthy()
    expect(mocks.fetch.mock.calls[1][1]).toEqual({targetId: blockedDoc._id, start: 10, end: 20})

    for (let page = 3; page <= 10; page += 1) {
      fireEvent.click(screen.getByRole('button', {name: 'Next'}))
      await waitFor(() => expect(screen.getByText(`Page ${page} of 10`)).toBeTruthy())
    }

    expect(mocks.fetch).toHaveBeenCalledTimes(10)
    expect(mocks.fetch.mock.calls[9][1]).toEqual({targetId: blockedDoc._id, start: 90, end: 100})
    expect(screen.getByRole('button', {name: 'Next'}).hasAttribute('disabled')).toBe(true)
    fireEvent.click(screen.getByRole('button', {name: 'Next'}))
    expect(mocks.fetch).toHaveBeenCalledTimes(10)
    expect(screen.queryByText('Page 11 of 10')).toBeNull()
  })
})
