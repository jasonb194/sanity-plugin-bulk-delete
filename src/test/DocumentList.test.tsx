import React from 'react'
import {render, screen, fireEvent} from '@testing-library/react'
import {describe, it, expect, vi} from 'vitest'
import {DocumentList} from '../components/DocumentList'

vi.mock('@sanity/ui', () => ({
  Box: ({children, ...props}: any) => <div {...props}>{children}</div>,
  Stack: ({children, ...props}: any) => <div {...props}>{children}</div>,
  Flex: ({children, ...props}: any) => <div {...props}>{children}</div>,
  Checkbox: ({checked, disabled, onChange}: any) => (
    <input type="checkbox" checked={checked} disabled={disabled} onChange={onChange || (() => {})} />
  ),
  Text: ({children, as: As = 'span', ...props}: any) => <As {...props}>{children}</As>,
}))

const sampleDocs = [
  {_id: 'doc-1', _type: 'post', title: 'First Post'},
  {_id: 'doc-2', _type: 'post', name: 'Second Post'},
  {_id: 'drafts.doc-3', _type: 'post', title: 'Draft Post'},
  {_id: 'doc-4', _type: 'post', hasWeakReferences: true},
]

const stronglyReferencedDocs = [{_id: 'doc-5', _type: 'post', title: 'Referenced Doc'}]

describe('DocumentList', () => {
  const defaultProps = {
    documentsData: sampleDocs,
    stronglyReferencedDocs: [],
    isDocSelected: vi.fn().mockReturnValue(false),
    handleSelectDoc: vi.fn(),
  }

  it('renders all deletable documents', () => {
    render(<DocumentList {...defaultProps} />)
    expect(screen.getByText('First Post')).toBeInTheDocument()
    expect(screen.getByText('Second Post')).toBeInTheDocument()
    expect(screen.getByText('Draft Post')).toBeInTheDocument()
  })

  it('falls back to _id when title and name are missing', () => {
    render(<DocumentList {...defaultProps} />)
    expect(screen.getByText('doc-4')).toBeInTheDocument()
  })

  it('shows "(Has weak reference)" for docs with weak references', () => {
    render(<DocumentList {...defaultProps} />)
    expect(screen.getByText('(Has weak reference)')).toBeInTheDocument()
  })

  it('renders checkboxes for each document', () => {
    render(<DocumentList {...defaultProps} />)
    const checkboxes = screen.getAllByRole('checkbox')
    expect(checkboxes).toHaveLength(sampleDocs.length)
  })

  it('calls handleSelectDoc when a document row is clicked', () => {
    const handleSelectDoc = vi.fn()
    render(<DocumentList {...defaultProps} handleSelectDoc={handleSelectDoc} />)
    fireEvent.click(screen.getByText('First Post'))
    expect(handleSelectDoc).toHaveBeenCalledWith('doc-1')
  })

  it('calls handleSelectDoc on Enter key press', () => {
    const handleSelectDoc = vi.fn()
    render(<DocumentList {...defaultProps} handleSelectDoc={handleSelectDoc} />)
    fireEvent.keyUp(screen.getByText('First Post'), {key: 'Enter'})
    expect(handleSelectDoc).toHaveBeenCalledWith('doc-1')
  })

  it('calls handleSelectDoc on Space key press', () => {
    const handleSelectDoc = vi.fn()
    render(<DocumentList {...defaultProps} handleSelectDoc={handleSelectDoc} />)
    fireEvent.keyUp(screen.getByText('First Post'), {key: ' '})
    expect(handleSelectDoc).toHaveBeenCalledWith('doc-1')
  })

  it('checks the checkbox for selected documents', () => {
    const isDocSelected = vi.fn((doc) => doc._id === 'doc-1')
    render(<DocumentList {...defaultProps} isDocSelected={isDocSelected} />)
    const checkboxes = screen.getAllByRole('checkbox')
    expect(checkboxes[0]).toBeChecked()
    expect(checkboxes[1]).not.toBeChecked()
  })

  it('does not render the strongly referenced section when list is empty', () => {
    render(<DocumentList {...defaultProps} stronglyReferencedDocs={[]} />)
    expect(
      screen.queryByText(/Documents with strong references/i),
    ).not.toBeInTheDocument()
  })

  it('renders strongly referenced documents as disabled', () => {
    render(
      <DocumentList {...defaultProps} stronglyReferencedDocs={stronglyReferencedDocs} />,
    )
    expect(
      screen.getByText(/Documents with strong references/i),
    ).toBeInTheDocument()
    expect(screen.getByText('Referenced Doc')).toBeInTheDocument()
    // Find disabled checkboxes specifically
    const allCheckboxes = screen.getAllByRole('checkbox')
    const disabledCheckboxes = allCheckboxes.filter((cb) => (cb as HTMLInputElement).disabled)
    expect(disabledCheckboxes).toHaveLength(1)
  })

  it('renders an empty list without errors', () => {
    render(
      <DocumentList
        documentsData={[]}
        stronglyReferencedDocs={[]}
        isDocSelected={vi.fn()}
        handleSelectDoc={vi.fn()}
      />,
    )
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
  })
})
