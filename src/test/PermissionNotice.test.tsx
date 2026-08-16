import React from 'react'
import {render, screen} from '@testing-library/react'
import {describe, it, expect, vi} from 'vitest'
import {PermissionNotice} from '../components/PermissionNotice'

// Mock @sanity/ui components with simple HTML equivalents
vi.mock('@sanity/ui', () => ({
  Card: ({children, ...props}: any) => <div data-testid="card" {...props}>{children}</div>,
  Stack: ({children, ...props}: any) => <div {...props}>{children}</div>,
  Text: ({children, ...props}: any) => <span {...props}>{children}</span>,
}))

describe('PermissionNotice', () => {
  it('renders the permission notice message', () => {
    render(<PermissionNotice roles={['administrator']} />)
    expect(screen.getByText(/Tool can only be used by the following roles/i)).toBeInTheDocument()
  })

  it('displays a single role with proper capitalisation', () => {
    render(<PermissionNotice roles={['administrator']} />)
    expect(screen.getByText(/Administrator/)).toBeInTheDocument()
  })

  it('displays multiple roles separated by commas', () => {
    render(<PermissionNotice roles={['administrator', 'editor']} />)
    expect(screen.getByText(/Administrator, Editor/)).toBeInTheDocument()
  })

  it('capitalises each word in multi-word role names', () => {
    render(<PermissionNotice roles={['super admin']} />)
    expect(screen.getByText(/Super Admin/)).toBeInTheDocument()
  })

  it('renders inside a Card container', () => {
    render(<PermissionNotice roles={['administrator']} />)
    expect(screen.getByTestId('card')).toBeInTheDocument()
  })
})
