import React, { useEffect, useState, useCallback } from 'react'
import { useCurrentUser, useClient, usePerspective } from 'sanity'
import { Button, Card, Flex, Spinner, Stack, Text } from '@sanity/ui'
import { defineQuery } from 'groq'
import type { BulkDeleteToolOptions } from '../types/BulkDeleteComponent.types'
import { PermissionNotice } from './PermissionNotice'
import { DocumentTypeSelect } from './DocumentTypeSelect'
import { DocumentList } from './DocumentList'
import { ConfirmDeleteDialog } from './ConfirmDeleteDialog'
import {getPerspectiveFilter} from '../utils/perspective'

type FeedbackMessage = {
  status: 'success' | 'error'
  title: string
  description?: string
}

type DocumentSelection = {
  scope: string
  docs: Set<{ _id: string; _type: string }>
}

/**
 * BulkDeleteComponent provides a UI for bulk deleting documents in Sanity Studio.
 * @param config - BulkDeleteToolOptions
 * @returns React.ReactElement
 * @public
 */
export const BulkDeleteComponent = (config: BulkDeleteToolOptions) => {
  const { schemaTypes } = config || {}
  const [docTypes, setDocTypes] = useState<{ name: string; title: string }[]>([])
  const [selectedType, setSelectedType] = useState<string>('')
  const [selection, setSelection] = useState<DocumentSelection>({scope: '', docs: new Set()})
  const [loading, setLoading] = useState(false)
  const [documentsResult, setDocumentsResult] = useState<{
    scope: string
    documents: any[]
    stronglyReferenced: any[]
  }>({scope: '', documents: [], stronglyReferenced: []})
  const [typesData, setTypesData] = useState<any[]>([])
  const [_, forceRender] = useState(0)
  const [confirmScope, setConfirmScope] = useState<string>()
  const [feedback, setFeedback] = useState<FeedbackMessage>()
  const [refreshWarning, setRefreshWarning] = useState<string>()
  const currentUser = useCurrentUser()
  const perspective = usePerspective()
  const sanityClient = useClient({ apiVersion: '2025-05-29' })

  // selectedPerspective can be an object for releases in newer Studio versions.
  // selectedPerspectiveName is the stable name field shared by Studio v3-v6.
  const perspectiveMatch = getPerspectiveFilter(perspective.selectedPerspectiveName)
  const selectionScope = JSON.stringify([selectedType, perspectiveMatch])
  const documentsData = documentsResult.scope === selectionScope ? documentsResult.documents : []
  const stronglyReferencedDocs =
    documentsResult.scope === selectionScope ? documentsResult.stronglyReferenced : []
  const selectedDocs =
    selection.scope === selectionScope ? selection.docs : new Set<{ _id: string; _type: string }>()
  const showConfirm = confirmScope === selectionScope

  // Drop stale state as well as hiding it, so returning to an earlier scope
  // cannot revive the old selection or confirmation.
  useEffect(() => {
    setSelection(current =>
      current.scope === selectionScope ? current : {scope: selectionScope, docs: new Set()},
    )
    setConfirmScope(current => (current === selectionScope ? current : undefined))
  }, [selectionScope])

  // Permission check
  const isAdmin = currentUser?.roles?.some(
    (role: any) => role.name === 'administrator' || config.roles?.includes(role.name)
  )

  // Helper to fetch documents by reference count
  const fetchDocuments = async ({
    type,
    hasStrongRefs,
  }: {
    type: string
    hasStrongRefs: boolean
  }) => {
    const refCountCondition = hasStrongRefs
      ? 'count(*[references(^._id) && (!defined(_weak) || _weak != true)]) > 0'
      : 'count(*[references(^._id) && (!defined(_weak) || _weak != true)]) == 0'
    const extraFields = hasStrongRefs
      ? ''
      : ', "hasWeakReferences": count(*[references(^._id) && defined(_weak) && _weak == true]) > 0'
    const query = defineQuery(
      `*[ ${perspectiveMatch} _type == "${type}" && ${refCountCondition}]{_id, _type, title, name${extraFields}}`
    )
    return sanityClient.fetch(query, {}, { perspective: 'raw' })
  }

  // Fetch all unique document types from the dataset
  useEffect(() => {
    if (!isAdmin) return
    const fetchTypes = async () => {
      const query = defineQuery(`array::unique(*[]._type)`)
      const data = await sanityClient.fetch(query, {}, { perspective: 'raw' })
      setTypesData(data)
    }
    fetchTypes()
  }, [isAdmin, sanityClient])

  // Fetch documents of the selected type
  useEffect(() => {
    if (!isAdmin) return
    if (!selectedType) {
      setDocumentsResult({scope: selectionScope, documents: [], stronglyReferenced: []})
      return
    }
    setLoading(true)
    Promise.all([
      fetchDocuments({ type: selectedType, hasStrongRefs: false }),
      fetchDocuments({ type: selectedType, hasStrongRefs: true }),
    ])
      .then(([docs, strongRefs]) => {
        setDocumentsResult({scope: selectionScope, documents: docs, stronglyReferenced: strongRefs})
      })
      .finally(() => setLoading(false))
  }, [isAdmin, selectedType, sanityClient, perspectiveMatch, _])

  // Compute the list of document types available for deletion
  useEffect(() => {
    const types =
      schemaTypes
        ?.filter((type: any) => type.type === 'document' && !type.hidden)
        .map((type: any) => ({
          name: type.name,
          title: type.title || type.name,
        }))
        .sort((a, b) => a.title.localeCompare(b.title)) || []
    const typesFromQuery = (typesData as string[]).map(name => ({
      name,
      title: `Not Found in Schema - ${name}`,
    }))
    const mergedTypes = [
      ...types,
      ...typesFromQuery.filter(tq => !types.some(t => t.name === tq.name)),
    ].filter(type => !type.name.includes('.'))
    setDocTypes(mergedTypes)
  }, [typesData, schemaTypes])

  // Checks if a document is currently selected
  const isDocSelected = useCallback(
    (doc: any) => Array.from(selectedDocs).some(h => h._id === doc._id && h._type === doc._type),
    [selectedDocs]
  )

  // Handles selecting or deselecting a single document
  const handleSelectDoc = useCallback(
    (id: string) => {
      setSelection(prev => {
        const doc = documentsData.find(d => d._id === id)
        if (!doc) return prev
        const currentDocs =
          prev.scope === selectionScope ? prev.docs : new Set<{ _id: string; _type: string }>()
        const exists = Array.from(currentDocs).some(h => h._id === doc._id && h._type === doc._type)
        const newSet = new Set(currentDocs)
        if (exists) {
          Array.from(newSet).forEach(h => {
            if (h._id === doc._id && h._type === doc._type) newSet.delete(h)
          })
        } else {
          newSet.add({ _id: doc._id, _type: doc._type })
        }
        return {scope: selectionScope, docs: newSet}
      })
    },
    [documentsData, selectionScope]
  )

  // Handles selecting or deselecting all documents in the current list
  const handleSelectAll = useCallback(() => {
    if (selectedDocs.size === documentsData.length) {
      setSelection({scope: selectionScope, docs: new Set()})
    } else {
      setSelection({
        scope: selectionScope,
        docs: new Set(documentsData.map(doc => ({ _id: doc._id, _type: doc._type }))),
      })
    }
  }, [selectedDocs, documentsData, selectionScope])

  // Handles deleting all selected documents
  const handleDelete = useCallback(async () => {
    setConfirmScope(undefined)
    // State from a previous type or perspective must never reach a transaction.
    if (selection.scope !== selectionScope) return
    if (selectedDocs.size === 0) return
    setLoading(true)
    setRefreshWarning(undefined)
    const deletedCount = selectedDocs.size
    try {
      const tx = sanityClient.transaction()
      Array.from(selectedDocs).forEach(doc => {
        tx.delete(doc._id)
      })
      await tx.commit()
    } catch (e) {
      setFeedback({
        status: 'error',
        title: 'Error Deleting Documents',
        description: e instanceof Error ? e.message : String(e),
      })
      console.error('Error deleting documents:', e)
      setLoading(false)
      return
    }

    setFeedback({status: 'success', title: `${deletedCount} Documents Deleted`})
    setSelection({scope: selectionScope, docs: new Set()})
    try {
      // Refresh documents after deletion
      const docs = await fetchDocuments({ type: selectedType, hasStrongRefs: false })
      setDocumentsResult(current =>
        current.scope === selectionScope ? {...current, documents: docs} : current,
      )
    } catch (e) {
      const description = e instanceof Error ? e.message : String(e)
      setRefreshWarning(`Documents were deleted, but the list couldn't be refreshed: ${description}`)
      console.warn('Documents deleted, but failed to refresh the document list:', e)
    } finally {
      setLoading(false)
    }
  }, [selection, selectionScope, selectedDocs, sanityClient, selectedType, documentsData, perspectiveMatch])

  if (!isAdmin) {
    const roles = config.roles ? Array.from(new Set([...config.roles, 'administrator'])) : ['administrator']
    return <PermissionNotice roles={roles} />
  }

  return (
    <Card padding={4} radius={3} shadow={1} style={{ maxWidth: 500, margin: '2rem auto' }}>
      <Stack style={{gap: 16}}>
        <Text size={2} weight="semibold">
          Bulk Delete Documents
        </Text>
        {feedback && (
          <Card
            padding={3}
            tone={feedback.status === 'error' ? 'critical' : 'positive'}
            role={feedback.status === 'error' ? 'alert' : 'status'}
          >
            <Text>
              {feedback.title}
              {feedback.description ? `: ${feedback.description}` : ''}
            </Text>
          </Card>
        )}
        {refreshWarning && (
          <Card padding={3} tone="caution" role="alert">
            <Text>{refreshWarning}</Text>
          </Card>
        )}
        <DocumentTypeSelect
          docTypes={docTypes}
          selectedType={selectedType}
          setSelectedType={setSelectedType}
          forceRender={() => forceRender(n => n + 1)}
        />
        {loading && (
          <Flex align="center" gap={2}>
            <Spinner muted />
            <Text>Loading...</Text>
          </Flex>
        )}
        {selectedType && !loading && (
          <>
            <Button
              mode="bleed"
              tone="primary"
              onClick={handleSelectAll}
              disabled={documentsData.length === 0}
              text={
                documentsData.length === 0
                  ? 'No Documents Found'
                  : selectedDocs.size === documentsData.length
                    ? 'Deselect All'
                    : 'Select All'
              }
            />
            <DocumentList
              documentsData={documentsData}
              stronglyReferencedDocs={stronglyReferencedDocs}
              isDocSelected={isDocSelected}
              handleSelectDoc={handleSelectDoc}
            />
            <Button
              tone="critical"
              disabled={selectedDocs.size === 0 || loading}
              onClick={() => setConfirmScope(selectionScope)}
              text={`Delete Selected (${selectedDocs.size})`}
            />
            <ConfirmDeleteDialog
              show={showConfirm}
              onCancel={() => setConfirmScope(undefined)}
              onDelete={handleDelete}
              loading={loading}
              count={selectedDocs.size}
            />
          </>
        )}
      </Stack>
    </Card>
  )
}
