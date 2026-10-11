import React from 'react'
import {Text} from '@sanity/ui'
import type {DocumentTypeSelectProps} from '../types/BulkDeleteComponent.types'
import {CompatibleBox, CompatibleButton, CompatibleFlex, CompatibleSelect} from './uiCompat'

/**
 * Dropdown for selecting a document type.
 * @param props - DocumentTypeSelectProps
 * @public
 */
export function DocumentTypeSelect({
  docTypes,
  selectedType,
  setSelectedType,
  forceRender,
}: DocumentTypeSelectProps) {
  return (
    <CompatibleFlex align="center" gap={2}>
      <Text>Document Type:</Text>
      <CompatibleBox flex={1}>
        <CompatibleSelect
          value={selectedType}
          onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setSelectedType(e.currentTarget.value)}
          style={{minWidth: 180}}
          fontSize={2}
        >
          <option value="">Select type</option>
          {docTypes.map(type => (
            <option key={type.name} value={type.name}>
              {type.title}
            </option>
          ))}
        </CompatibleSelect>
      </CompatibleBox>
      <CompatibleButton
        text="↻"
        mode="ghost"
        tone="primary"
        padding={2}
        onClick={forceRender}
        disabled={!selectedType}
        title="Force re-render"
        style={{minWidth: 0}}
      />
    </CompatibleFlex>
  )
}
