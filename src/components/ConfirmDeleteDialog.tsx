import React from 'react'
import {Box, Text} from '@sanity/ui'
import type {ConfirmDeleteDialogProps} from '../types/BulkDeleteComponent.types'
import {CompatibleButton, CompatibleDialog, CompatibleFlex} from './uiCompat'

/**
 * Confirmation dialog for deleting documents.
 * @param props - ConfirmDeleteDialogProps
 * @public
 */
export function ConfirmDeleteDialog({
  show,
  onCancel,
  onDelete,
  loading,
  count,
}: ConfirmDeleteDialogProps) {
  if (!show) return null
  return (
    <CompatibleDialog
      onClose={onCancel}
      footer={
        <CompatibleFlex justify="flex-end" gap={2}>
          <CompatibleButton text="Cancel" mode="bleed" onClick={onCancel} />
          <CompatibleButton text="Delete" tone="critical" loading={loading} onClick={onDelete} />
        </CompatibleFlex>
      }
    >
      <Box padding={4}>
        <Text>
          Are you sure you want to delete {count} document{count > 1 ? 's' : ''}? This action cannot be undone.
        </Text>
      </Box>
    </CompatibleDialog>
  )
}
