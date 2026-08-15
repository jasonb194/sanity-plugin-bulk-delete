import React from 'react'
import {render, screen, fireEvent} from '@testing-library/react'
import {describe, it, expect, vi} from 'vitest'
import {DocumentTypeSelect} from '../components/DocumentTypeSelect'

vi.mock('@sanity/ui', () => ({
  Flex: ({children, ...props}: any) => <div {...props}>{children}</div>,
  Text: ({children, ...props}: any) => <span {...props}>{children}</span>,
  Box: ({children, ...props}: any) => <div {...props}>{children}</div>,
  Select: ({children, value, onChange}: any) => (
    <select value={value} onChange={onChange}>
      {children}
    </select>
  ),
  Button: ({children, onClick, disabled, title}: any) => (
    <button onClick={onClick} disabled={disabled} title={title}>
      {children}
    </button>
  ),
}))

const sampleDocTypes = [
  {name: 'post', title: 'Post'},
  {name: 'author', title: 'Author'},
]

describe('DocumentTypeSelect', () => {
  const defaultProps = {
    docTypes: sampleDocTypes,
    selectedType: '',
    setSelectedType: vi.fn(),
    forceRender: vi.fn(),
  }

  it('renders the "Document Type:" label', () => {
    render(<DocumentTypeSelect {...defaultProps} />)
    expect(screen.getByText('Document Type:')).toBeInTheDocument()
  })

  it('renders a "Select type" default option', () => {
    render(<DocumentTypeSelect {...defaultProps} />)
    expect(screen.getByRole('option', {name: 'Select type'})).toBeInTheDocument()
  })

  it('renders an option for each document type', () => {
    render(<DocumentTypeSelect {...defaultProps} />)
    expect(screen.getByRole('option', {name: 'Post'})).toBeInTheDocument()
    expect(screen.getByRole('option', {name: 'Author'})).toBeInTheDocument()
  })

  it('calls setSelectedType when the user selects a type', () => {
    const setSelectedType = vi.fn()
    render(<DocumentTypeSelect {...defaultProps} setSelectedType={setSelectedType} />)
    fireEvent.change(screen.getByRole('combobox'), {target: {value: 'post'}})
    expect(setSelectedType).toHaveBeenCalledWith('post')
  })

  it('reflects the selected type as the current select value', () => {
    render(<DocumentTypeSelect {...defaultProps} selectedType="author" />)
    expect(screen.getByRole('combobox')).toHaveValue('author')
  })

  it('disables the refresh button when no type is selected', () => {
    render(<DocumentTypeSelect {...defaultProps} selectedType="" />)
    expect(screen.getByTitle('Force re-render')).toBeDisabled()
  })

  it('enables the refresh button when a type is selected', () => {
    render(<DocumentTypeSelect {...defaultProps} selectedType="post" />)
    expect(screen.getByTitle('Force re-render')).not.toBeDisabled()
  })

  it('calls forceRender when the refresh button is clicked', () => {
    const forceRender = vi.fn()
    render(
      <DocumentTypeSelect {...defaultProps} selectedType="post" forceRender={forceRender} />,
    )
    fireEvent.click(screen.getByTitle('Force re-render'))
    expect(forceRender).toHaveBeenCalledTimes(1)
  })

  it('renders with an empty docTypes list without errors', () => {
    render(<DocumentTypeSelect {...defaultProps} docTypes={[]} />)
    expect(screen.getByRole('combobox')).toBeInTheDocument()
    expect(screen.getAllByRole('option')).toHaveLength(1) // only "Select type"
  })
})
