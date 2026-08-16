import React from 'react'
import {render, screen, fireEvent} from '@testing-library/react'
import {describe, it, expect, vi} from 'vitest'
import {ConfirmDeleteDialog} from '../components/ConfirmDeleteDialog'

vi.mock('@sanity/ui', () => ({
  Dialog: ({children, footer, header, onClose}: any) => (
    <div role="dialog" aria-label={header}>
      <button aria-label="close" onClick={onClose} />
      <div>{children}</div>
      <div>{footer}</div>
    </div>
  ),
  Flex: ({children, ...props}: any) => <div {...props}>{children}</div>,
  Button: ({text, onClick, loading, ...props}: any) => (
    <button onClick={onClick} disabled={loading} {...props}>
      {text}
    </button>
  ),
  Box: ({children, ...props}: any) => <div {...props}>{children}</div>,
  Text: ({children, ...props}: any) => <span {...props}>{children}</span>,
}))

describe('ConfirmDeleteDialog', () => {
  const defaultProps = {
    show: true,
    onCancel: vi.fn(),
    onDelete: vi.fn(),
    loading: false,
    count: 3,
  }

  it('renders nothing when show is false', () => {
    render(<ConfirmDeleteDialog {...defaultProps} show={false} />)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('renders the dialog when show is true', () => {
    render(<ConfirmDeleteDialog {...defaultProps} />)
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('shows the correct document count (plural)', () => {
    render(<ConfirmDeleteDialog {...defaultProps} count={3} />)
    expect(screen.getByText(/delete 3 documents/i)).toBeInTheDocument()
  })

  it('uses singular form for a single document', () => {
    render(<ConfirmDeleteDialog {...defaultProps} count={1} />)
    // "document" not "documents"
    expect(screen.queryByText(/1 documents/i)).not.toBeInTheDocument()
    expect(screen.getByText(/1 document/i)).toBeInTheDocument()
  })

  it('calls onCancel when Cancel button is clicked', () => {
    const onCancel = vi.fn()
    render(<ConfirmDeleteDialog {...defaultProps} onCancel={onCancel} />)
    fireEvent.click(screen.getByText('Cancel'))
    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  it('calls onDelete when Delete button is clicked', () => {
    const onDelete = vi.fn()
    render(<ConfirmDeleteDialog {...defaultProps} onDelete={onDelete} />)
    fireEvent.click(screen.getByText('Delete'))
    expect(onDelete).toHaveBeenCalledTimes(1)
  })

  it('disables Delete button while loading', () => {
    render(<ConfirmDeleteDialog {...defaultProps} loading={true} />)
    expect(screen.getByText('Delete')).toBeDisabled()
  })

  it('calls onCancel when dialog close button is clicked', () => {
    const onCancel = vi.fn()
    render(<ConfirmDeleteDialog {...defaultProps} onCancel={onCancel} />)
    fireEvent.click(screen.getByLabelText('close'))
    expect(onCancel).toHaveBeenCalledTimes(1)
  })
})
