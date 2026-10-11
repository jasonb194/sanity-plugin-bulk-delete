import React from 'react'
import {Text} from '@sanity/ui'
import type {DocumentListProps} from '../types/BulkDeleteComponent.types'
import {CompatibleBox, CompatibleCheckbox, CompatibleFlex, CompatibleStack} from './uiCompat'

const visuallyHiddenLabel: React.CSSProperties = {
  position: 'absolute',
  width: 1,
  height: 1,
  padding: 0,
  margin: -1,
  overflow: 'hidden',
  clip: 'rect(0, 0, 0, 0)',
  whiteSpace: 'nowrap',
  border: 0,
}

/**
 * List of documents with checkboxes for selection.
 * @param props - DocumentListProps
 * @public
 */
export function DocumentList({
  documentsData,
  stronglyReferencedDocs,
  isDocSelected,
  handleSelectDoc,
}: DocumentListProps) {
  return (
    <CompatibleBox style={{maxHeight: 300, overflowY: 'auto'}}>
      <CompatibleStack style={{gap: 8}}>
        {documentsData.map(doc => (
          <CompatibleFlex key={doc._id} align="center" gap={2}>
            <CompatibleCheckbox
              label={<span style={visuallyHiddenLabel}>{doc.title || doc.name || doc._id}</span>}
              aria-label={`Select ${doc.title || doc.name || doc._id}`}
              checked={isDocSelected(doc)}
              onChange={() => handleSelectDoc(doc._id)}
            />
            <Text
              style={{
                color: doc._id.includes('draft')
                  ? '#b26b00'
                  : doc._id.includes('versions')
                  ? '#0074d9'
                  : '#007a1c',
                cursor: 'pointer',
                userSelect: 'none',
              }}
              onClick={() => handleSelectDoc(doc._id)}
              tabIndex={0}
              role="button"
              aria-pressed={isDocSelected(doc)}
              onKeyUp={e => {
                if (e.key === 'Enter' || e.key === ' ') handleSelectDoc(doc._id)
              }}
            >
              {doc.title || doc.name || doc._id}
              {doc.hasWeakReferences && (
                <Text as="span" size={1} style={{marginLeft: 8, color: '#b26b00'}}>
                  (Has weak reference)
                </Text>
              )}
            </Text>
          </CompatibleFlex>
        ))}
        {stronglyReferencedDocs.length > 0 && (
          <>
            <CompatibleBox marginTop={3} marginBottom={1}>
              <Text size={1} weight="semibold" muted>
                Documents with strong references (cannot delete):
              </Text>
            </CompatibleBox>
            {stronglyReferencedDocs.map(doc => (
              <CompatibleFlex key={doc._id} align="center" gap={2} style={{opacity: 0.5}}>
                <CompatibleCheckbox
                  label={
                    <span style={visuallyHiddenLabel}>
                      Cannot select {doc.title || doc.name || doc._id}
                    </span>
                  }
                  aria-label={`Cannot select ${doc.title || doc.name || doc._id}`}
                  checked={false}
                  disabled
                />
                <Text>{doc.title || doc.name || doc._id}</Text>
              </CompatibleFlex>
            ))}
          </>
        )}
      </CompatibleStack>
    </CompatibleBox>
  )
}
