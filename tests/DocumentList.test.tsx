// @vitest-environment jsdom
import {cleanup, fireEvent, render, screen, waitFor} from '@testing-library/react'
import React from 'react'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import {DocumentList} from '../src/components/DocumentList'

const mocks = vi.hoisted(() => ({
  loadStrongReferences: vi.fn(),
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
const isDocSelected = () => false

function renderList(showReferenceDetails = false) {
  return render(
    <DocumentList
      documentsData={[]}
      stronglyReferencedDocs={[blockedDoc]}
      showReferenceDetails={showReferenceDetails}
      referenceScopeKey="test-scope"
      loadStrongReferences={mocks.loadStrongReferences}
      isDocSelected={isDocSelected}
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
    mocks.loadStrongReferences.mockReset()
  })

  afterEach(() => cleanup())

  it('hides reference controls when the parent disables reference details', () => {
    renderList()

    expect(screen.queryByRole('button', {name: /references for Blocked article/})).toBeNull()
    expect(mocks.loadStrongReferences).not.toHaveBeenCalled()
  })

  it('shows an accessible caret beside the blocked document and toggles its details', async () => {
    mocks.loadStrongReferences.mockResolvedValue({total: 0, documents: []})
    renderList(true)

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
    expect(mocks.loadStrongReferences).toHaveBeenCalledOnce()
    expect(mocks.loadStrongReferences).toHaveBeenCalledWith({
      targetId: blockedDoc._id,
      start: 0,
      end: 10,
    })
  })

  it('loads the count and first page together, then renders referrers as edit intent links', async () => {
    mocks.loadStrongReferences.mockResolvedValue({
      total: 2,
      documents: [
        {_id: 'ref-a', _type: 'article', title: 'Referenced A'},
        {_id: 'ref-b', _type: 'author', name: 'Referenced B'},
      ],
    })
    renderList(true)

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

    expect(mocks.loadStrongReferences).toHaveBeenCalledOnce()
    expect(mocks.loadStrongReferences).toHaveBeenCalledWith({
      targetId: blockedDoc._id,
      start: 0,
      end: 10,
    })
  })

  it('pages by ten and caps navigation at ten pages while showing the true count', async () => {
    mocks.loadStrongReferences.mockImplementation(({start}: {start: number}) =>
      Promise.resolve({total: 105, documents: documentsForPage(start)}),
    )
    renderList(true)

    fireEvent.click(screen.getByRole('button', {name: 'Show references for Blocked article'}))

    await screen.findByRole('link', {name: 'Referrer 1'})
    expect(screen.getByText(/105 documents reference this document/)).toBeTruthy()
    expect(screen.getByText(/Showing the first 100 in ID order/)).toBeTruthy()
    expect(screen.getByText('Page 1 of 10')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', {name: 'Next'}))
    await screen.findByRole('link', {name: 'Referrer 11'})
    expect(screen.getByText('Page 2 of 10')).toBeTruthy()
    expect(mocks.loadStrongReferences.mock.calls[1][0]).toEqual({
      targetId: blockedDoc._id,
      start: 10,
      end: 20,
    })

    for (let page = 3; page <= 10; page += 1) {
      fireEvent.click(screen.getByRole('button', {name: 'Next'}))
      await waitFor(() => expect(screen.getByText(`Page ${page} of 10`)).toBeTruthy())
    }

    expect(mocks.loadStrongReferences).toHaveBeenCalledTimes(10)
    expect(mocks.loadStrongReferences.mock.calls[9][0]).toEqual({
      targetId: blockedDoc._id,
      start: 90,
      end: 100,
    })
    expect(screen.getByRole('button', {name: 'Next'}).hasAttribute('disabled')).toBe(true)
    fireEvent.click(screen.getByRole('button', {name: 'Next'}))
    expect(mocks.loadStrongReferences).toHaveBeenCalledTimes(10)
    expect(screen.queryByText('Page 11 of 10')).toBeNull()
  })
})
