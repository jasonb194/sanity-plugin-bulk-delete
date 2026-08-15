import {Button, Card, Flex, Spinner, Stack, Text, useToast} from '@sanity/ui'
import {defineQuery} from 'groq'
import {useCallback, useEffect, useState} from 'react'
import * as Sanity from 'sanity'

import type {BulkDeleteToolOptions} from '../types/BulkDeleteComponent.types'
import {ConfirmDeleteDialog} from './ConfirmDeleteDialog'
import {DocumentList} from './DocumentList'
import {DocumentTypeSelect} from './DocumentTypeSelect'
import {PermissionNotice} from './PermissionNotice'

const API_VERSION = '2024-01-01'

type BulkDeleteDocument = {
  _id: string
  _type: string
  hasWeakReferences?: boolean
  name?: string
  title?: string
}

type DocumentTypeOption = {
  name: string
  title: string
}

type PerspectiveState = {
  selectedPerspective?: unknown
  selectedPerspectiveName?: string
}

function getPerspectiveName(perspective: PerspectiveState | undefined) {
  if (typeof perspective?.selectedPerspectiveName === 'string') {
    return perspective.selectedPerspectiveName
  }

  if (typeof perspective?.selectedPerspective === 'string') {
    return perspective.selectedPerspective
  }

  return 'published'
}

function getPerspectiveMatch(perspectiveName: string) {
  if (perspectiveName === 'published') {
    return '!(_id in path("drafts.**") || _id in path("versions.**")) &&'
  }

  if (perspectiveName === 'drafts') {
    return '(_id in path("drafts.**")) &&'
  }

  return `(_id in path("versions.${perspectiveName}.**")) &&`
}

/**
 * BulkDeleteComponent provides a UI for bulk deleting documents in Sanity Studio.
 * @param config - BulkDeleteToolOptions
 * @returns React.ReactElement
 * @public
 */
export const BulkDeleteComponent = (config: BulkDeleteToolOptions) => {
  const {schemaTypes} = config || {}
  const [docTypes, setDocTypes] = useState<DocumentTypeOption[]>([])
  const [selectedType, setSelectedType] = useState<string>('')
  const [selectedDocs, setSelectedDocs] = useState<Set<{_id: string; _type: string}>>(new Set())
  const [loading, setLoading] = useState(false)
  const [documentsData, setDocumentsData] = useState<BulkDeleteDocument[]>([])
  const [typesData, setTypesData] = useState<string[]>([])
  const [_, forceRender] = useState(0)
  const [stronglyReferencedDocs, setStronglyReferencedDocs] = useState<BulkDeleteDocument[]>([])
  const [showConfirm, setShowConfirm] = useState(false)
  const currentUser = Sanity.useCurrentUser()
  const perspective = Sanity.usePerspective?.() as PerspectiveState | undefined
  const perspectiveName = getPerspectiveName(perspective)
  const sanityClient = Sanity.useClient({apiVersion: API_VERSION})
  const toast = useToast()
  const allowedRoles = config.roles
    ? Array.from(new Set([...config.roles, 'administrator']))
    : ['administrator']
  const isAdmin = currentUser?.roles?.some(
    (role) => role.name === 'administrator' || config.roles?.includes(role.name),
  )

  // Compute GROQ filter for the current perspective
  const perspectiveMatch = getPerspectiveMatch(perspectiveName)

  // Helper to fetch documents by reference count
  const fetchDocuments = useCallback(
    async ({
      type,
      hasStrongRefs,
    }: {
      type: string
      hasStrongRefs: boolean
    }): Promise<BulkDeleteDocument[]> => {
      const refCountCondition = hasStrongRefs
        ? 'count(*[references(^._id) && (!defined(_weak) || _weak != true)]) > 0'
        : 'count(*[references(^._id) && (!defined(_weak) || _weak != true)]) == 0'
      const extraFields = hasStrongRefs
        ? ''
        : ', "hasWeakReferences": count(*[references(^._id) && defined(_weak) && _weak == true]) > 0'
      const query = defineQuery(
        `*[ ${perspectiveMatch} _type == "${type}" && ${refCountCondition}]{_id, _type, title, name${extraFields}}`,
      )
      return sanityClient.fetch(query, {}, {perspective: 'raw'})
    },
    [perspectiveMatch, sanityClient],
  )

  // Fetch all unique document types from the dataset
  useEffect(() => {
    if (!isAdmin) return

    const fetchTypes = async () => {
      const query = defineQuery(`array::unique(*[]._type)`)
      const data = await sanityClient.fetch(query, {}, {perspective: 'raw'})
      setTypesData(data)
    }
    fetchTypes()
  }, [isAdmin, sanityClient])

  // Fetch documents of the selected type
  useEffect(() => {
    if (!isAdmin) return

    if (!selectedType) {
      setDocumentsData([])
      setStronglyReferencedDocs([])
      return
    }
    setLoading(true)
    Promise.all([
      fetchDocuments({type: selectedType, hasStrongRefs: false}),
      fetchDocuments({type: selectedType, hasStrongRefs: true}),
    ])
      .then(([docs, strongRefs]) => {
        setDocumentsData(docs)
        setStronglyReferencedDocs(strongRefs)
      })
      .finally(() => setLoading(false))
  }, [_, fetchDocuments, isAdmin, selectedType])

  // Compute the list of document types available for deletion
  useEffect(() => {
    if (!isAdmin) return

    const types =
      schemaTypes
        ?.filter((type) => type.type === 'document' && !type.hidden)
        .map((type) => ({
          name: type.name,
          title: type.title || type.name,
        }))
        .sort((a, b) => a.title.localeCompare(b.title)) || []
    const typesFromQuery = typesData.map((name) => ({
      name,
      title: `Not Found in Schema - ${name}`,
    }))
    const mergedTypes = [
      ...types,
      ...typesFromQuery.filter((tq) => !types.some((t) => t.name === tq.name)),
    ].filter((type) => !type.name.includes('.'))
    setDocTypes(mergedTypes)
  }, [isAdmin, typesData, schemaTypes])

  // Checks if a document is currently selected
  const isDocSelected = useCallback(
    (doc: BulkDeleteDocument) =>
      Array.from(selectedDocs).some((h) => h._id === doc._id && h._type === doc._type),
    [selectedDocs],
  )

  // Handles selecting or deselecting a single document
  const handleSelectDoc = useCallback(
    (id: string) => {
      setSelectedDocs((prev) => {
        const doc = documentsData.find((d) => d._id === id)
        if (!doc) return prev
        const exists = Array.from(prev).some((h) => h._id === doc._id && h._type === doc._type)
        const newSet = new Set(prev)
        if (exists) {
          Array.from(newSet).forEach((h) => {
            if (h._id === doc._id && h._type === doc._type) newSet.delete(h)
          })
        } else {
          newSet.add({_id: doc._id, _type: doc._type})
        }
        return newSet
      })
    },
    [documentsData],
  )

  // Handles selecting or deselecting all documents in the current list
  const handleSelectAll = useCallback(() => {
    if (selectedDocs.size === documentsData.length) {
      setSelectedDocs(new Set())
    } else {
      setSelectedDocs(new Set(documentsData.map((doc) => ({_id: doc._id, _type: doc._type}))))
    }
  }, [selectedDocs, documentsData])

  // Handles deleting all selected documents
  const handleDelete = useCallback(async () => {
    setShowConfirm(false)
    if (selectedDocs.size === 0) return
    setLoading(true)
    try {
      const tx = sanityClient.transaction()
      Array.from(selectedDocs).forEach((doc) => {
        tx.delete(doc._id)
      })
      await tx.commit()
      toast.push({
        status: 'success',
        title: `${selectedDocs.size} Documents Deleted`,
      })
      setSelectedDocs(new Set())
      // Refresh documents after deletion
      const docs = await fetchDocuments({type: selectedType, hasStrongRefs: false})
      setDocumentsData(docs)
    } catch (e) {
      toast.push({
        status: 'error',
        title: 'Error Deleting Documents',
        description: e instanceof Error ? e.message : String(e),
      })
      console.error('Error deleting documents:', e)
    } finally {
      setLoading(false)
    }
  }, [fetchDocuments, selectedDocs, sanityClient, selectedType, toast])

  if (!isAdmin) {
    return <PermissionNotice roles={allowedRoles} />
  }

  let selectAllButtonText = 'Select All'
  if (documentsData.length === 0) {
    selectAllButtonText = 'No Documents Found'
  } else if (selectedDocs.size === documentsData.length) {
    selectAllButtonText = 'Deselect All'
  }

  return (
    <Card padding={4} radius={3} shadow={1} style={{maxWidth: 500, margin: '2rem auto'}}>
      <Stack space={4}>
        <Text size={2} weight="semibold">
          Bulk Delete Documents
        </Text>
        <DocumentTypeSelect
          docTypes={docTypes}
          selectedType={selectedType}
          setSelectedType={setSelectedType}
          forceRender={() => forceRender((n) => n + 1)}
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
              text={selectAllButtonText}
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
              onClick={() => setShowConfirm(true)}
              text={`Delete Selected (${selectedDocs.size})`}
            />
            <ConfirmDeleteDialog
              show={showConfirm}
              onCancel={() => setShowConfirm(false)}
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
