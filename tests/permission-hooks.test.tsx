// @vitest-environment jsdom
import {cleanup, fireEvent, render, screen, waitFor} from '@testing-library/react'
import React from 'react'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import {BulkDeleteComponent} from '../src/components/BulkDeleteComponent'

const hooks = vi.hoisted(() => ({
  currentUser: {roles: [] as {name: string}[]},
  client: {
    fetch: vi.fn(async (query: string) =>
      query.includes('array::unique')
        ? ['article']
        : [{_id: 'article-1', _type: 'article', title: 'One article'}],
    ),
    delete: vi.fn(),
    commit: vi.fn(async () => undefined),
    transaction: vi.fn(),
  },
}))

vi.mock('sanity', () => ({
  useCurrentUser: () => hooks.currentUser,
  usePerspective: () => ({selectedPerspectiveName: 'drafts'}),
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
      'button',
      {type: 'button', onClick: () => setSelectedType('article')},
      'Choose article',
    ),
}))
vi.mock('../src/components/DocumentList', () => ({
  DocumentList: ({
    documentsData,
    handleSelectDoc,
  }: {
    documentsData: {_id: string}[]
    handleSelectDoc: (id: string) => void
  }) =>
    documentsData.length > 0
      ? React.createElement(
          'button',
          {type: 'button', onClick: () => handleSelectDoc('article-1')},
          'Select article',
        )
      : null,
}))
vi.mock('../src/components/ConfirmDeleteDialog', () => ({
  ConfirmDeleteDialog: ({show, onDelete}: {show: boolean; onDelete: () => void}) =>
    show
      ? React.createElement('button', {type: 'button', onClick: onDelete}, 'Confirm delete')
      : null,
}))

describe('BulkDeleteComponent permission hooks', () => {
  beforeEach(() => {
    hooks.currentUser = {roles: []}
    hooks.client.fetch.mockClear()
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

    hooks.currentUser = {roles: [{name: 'administrator'}]}
    expect(() => rerender(<BulkDeleteComponent schemaTypes={[]} />)).not.toThrow()

    await waitFor(() => expect(hooks.client.fetch).toHaveBeenCalledTimes(1))

    hooks.currentUser = {roles: []}
    rerender(<BulkDeleteComponent schemaTypes={[]} />)
    expect(hooks.client.fetch).toHaveBeenCalledTimes(1)
  })

  it('shows accessible success feedback after a confirmed deletion', async () => {
    hooks.currentUser = {roles: [{name: 'administrator'}]}
    render(<BulkDeleteComponent schemaTypes={[]} />)

    await waitFor(() => expect(hooks.client.fetch).toHaveBeenCalledTimes(1))
    fireEvent.click(screen.getByRole('button', {name: 'Choose article'}))
    await waitFor(() => expect(screen.getByRole('button', {name: 'Select article'})).toBeTruthy())
    fireEvent.click(screen.getByRole('button', {name: 'Select article'}))
    fireEvent.click(screen.getByRole('button', {name: 'Delete Selected (1)'}))
    fireEvent.click(screen.getByRole('button', {name: 'Confirm delete'}))

    await waitFor(() =>
      expect(screen.getByRole('status').textContent).toContain('1 Documents Deleted'),
    )
    expect(hooks.client.delete).toHaveBeenCalledWith('article-1')
    expect(hooks.client.commit).toHaveBeenCalledOnce()
  })

  it('shows accessible error feedback when the delete transaction fails', async () => {
    hooks.currentUser = {roles: [{name: 'administrator'}]}
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
    hooks.currentUser = {roles: [{name: 'administrator'}]}
    render(<BulkDeleteComponent schemaTypes={[]} />)

    await waitFor(() => expect(hooks.client.fetch).toHaveBeenCalledTimes(1))
    fireEvent.click(screen.getByRole('button', {name: 'Choose article'}))
    await waitFor(() => expect(screen.getByRole('button', {name: 'Select article'})).toBeTruthy())
    fireEvent.click(screen.getByRole('button', {name: 'Select article'}))
    fireEvent.click(screen.getByRole('button', {name: 'Delete Selected (1)'}))

    hooks.client.fetch.mockRejectedValueOnce(new Error('network unavailable'))
    fireEvent.click(screen.getByRole('button', {name: 'Confirm delete'}))

    await waitFor(() =>
      expect(screen.getByRole('status').textContent).toContain('1 Documents Deleted'),
    )
    expect(screen.getByRole('alert').textContent).toContain("couldn't be refreshed")
    expect(screen.getByRole('alert').textContent).toContain('network unavailable')
    expect(hooks.client.commit).toHaveBeenCalledOnce()
  })
})
