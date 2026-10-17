import {Box, Button, Card, Checkbox, Flex, Spinner, Stack, Text} from '@sanity/ui'
import {defineQuery} from 'groq'
import React, {useCallback, useId, useRef, useState} from 'react'
import {useClient, usePerspective} from 'sanity'
import {IntentLink} from 'sanity/router'

import type {DocumentListProps} from '../types/BulkDeleteComponent.types'

const REFERENCES_PER_PAGE = 10
const MAX_REFERENCE_PAGES = 10

type ReferringDocument = {
  _id: string
  _type: string
  title?: unknown
  name?: unknown
}

type ReferencePageResult = {
  total: number
  documents: ReferringDocument[]
}

function getDocumentLabel(document: ReferringDocument): string {
  if (typeof document.title === 'string' && document.title.trim()) return document.title
  if (typeof document.name === 'string' && document.name.trim()) return document.name
  return document._id
}

function StrongReferenceDetails({targetId, label}: {targetId: string; label: string}) {
  const client = useClient({apiVersion: '2025-05-29'})
  const referencesId = useId()
  const [expanded, setExpanded] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string>()
  const [total, setTotal] = useState<number>()
  const [documents, setDocuments] = useState<ReferringDocument[]>([])
  const [page, setPage] = useState(1)
  const requestId = useRef(0)

  const loadPage = useCallback(
    async (nextPage: number) => {
      const id = ++requestId.current
      setLoading(true)
      setError(undefined)
      try {
        const pageQuery = defineQuery(
          '{"total": count(*[references($targetId)]), "documents": *[references($targetId)] | order(_id asc) [$start...$end]{_id, _type, title, name}}',
        )
        const fetchResult = (requestedPage: number) =>
          client.fetch<ReferencePageResult>(
            pageQuery,
            {
              targetId,
              start: (requestedPage - 1) * REFERENCES_PER_PAGE,
              end: requestedPage * REFERENCES_PER_PAGE,
            },
            {perspective: 'raw'},
          )
        let boundedPage = nextPage
        let result: ReferencePageResult | undefined
        let pageWasLoaded = false
        for (let attempt = 0; attempt < 3; attempt += 1) {
          result = await fetchResult(boundedPage)
          if (id !== requestId.current) return
          const pageCount = Math.min(
            Math.ceil(result.total / REFERENCES_PER_PAGE),
            MAX_REFERENCE_PAGES,
          )
          const pageAfterRefresh = Math.max(1, Math.min(nextPage, pageCount || 1))
          if (pageCount === 0) {
            boundedPage = 1
            pageWasLoaded = true
            break
          }
          if (pageAfterRefresh === boundedPage) {
            pageWasLoaded = true
            break
          }
          boundedPage = pageAfterRefresh
        }
        if (!result) return
        if (!pageWasLoaded) {
          throw new Error('The reference count changed while loading. Please try again.')
        }
        setPage(boundedPage)
        setTotal(result.total)
        const pageCount = Math.min(
          Math.ceil(result.total / REFERENCES_PER_PAGE),
          MAX_REFERENCE_PAGES,
        )
        if (pageCount === 0) {
          setDocuments([])
          return
        }
        setDocuments(result.documents)
      } catch (cause) {
        if (id === requestId.current) {
          setError(cause instanceof Error ? cause.message : String(cause))
        }
      } finally {
        if (id === requestId.current) setLoading(false)
      }
    },
    [client, targetId],
  )

  const handleLoadPage = useCallback(
    (requestedPage: number) => {
      const pendingRequest = loadPage(requestedPage)
      const activeRequestId = requestId.current
      pendingRequest.catch((cause) => {
        if (activeRequestId !== requestId.current) return
        setError(cause instanceof Error ? cause.message : String(cause))
        setLoading(false)
      })
    },
    [loadPage],
  )

  const toggleExpanded = useCallback(() => {
    const nextExpanded = !expanded
    setExpanded(nextExpanded)
    if (nextExpanded && total === undefined && !loading) handleLoadPage(1)
  }, [expanded, handleLoadPage, loading, total])
  const retryLoadPage = useCallback(() => handleLoadPage(page), [handleLoadPage, page])
  const loadPreviousPage = useCallback(() => handleLoadPage(page - 1), [handleLoadPage, page])
  const loadNextPage = useCallback(() => handleLoadPage(page + 1), [handleLoadPage, page])

  const pageCount =
    total === undefined ? 0 : Math.min(Math.ceil(total / REFERENCES_PER_PAGE), MAX_REFERENCE_PAGES)
  const listedCount =
    total === undefined ? 0 : Math.min(total, REFERENCES_PER_PAGE * MAX_REFERENCE_PAGES)

  return (
    <Box>
      <Flex align="center" gap={1}>
        <Checkbox checked={false} disabled />
        <Text>{label}</Text>
        <Button
          mode="bleed"
          aria-label={`${expanded ? 'Hide' : 'Show'} references for ${label}`}
          aria-expanded={expanded}
          aria-controls={referencesId}
          onClick={toggleExpanded}
        >
          <Text as="span" aria-hidden="true">
            {expanded ? '▾' : '▸'}
          </Text>
        </Button>
      </Flex>
      <Box id={referencesId} hidden={!expanded}>
        {expanded && (
          <Card padding={3} radius={2} tone="transparent">
            <Stack gap={3}>
              {loading && (
                <Flex align="center" gap={2}>
                  <Spinner muted />
                  <Text size={1}>Loading references…</Text>
                </Flex>
              )}
              {error && (
                <Flex align="center" gap={2}>
                  <Card padding={2} tone="critical" role="alert">
                    <Text size={1}>Couldn’t load references: {error}</Text>
                  </Card>
                  <Button mode="bleed" text="Retry" onClick={retryLoadPage} />
                </Flex>
              )}
              {total !== undefined && !error && (
                <>
                  <Text size={1} muted>
                    {total} document{total === 1 ? '' : 's'} reference this document.
                    {total > listedCount ? ` Showing the first ${listedCount} in ID order.` : ''}
                  </Text>
                  {documents.length > 0 ? (
                    <Stack gap={2}>
                      {documents.map((referrer) => (
                        <Text key={`${referrer._type}:${referrer._id}`} size={1}>
                          <IntentLink
                            intent="edit"
                            params={{id: referrer._id, type: referrer._type}}
                          >
                            {getDocumentLabel(referrer)}
                          </IntentLink>
                        </Text>
                      ))}
                    </Stack>
                  ) : (
                    <Text size={1} muted>
                      No referencing documents found.
                    </Text>
                  )}
                  {pageCount > 1 && (
                    <Flex align="center" gap={2}>
                      <Button
                        mode="bleed"
                        text="Previous"
                        disabled={page <= 1 || loading}
                        onClick={loadPreviousPage}
                      />
                      <Text size={1}>
                        Page {page} of {pageCount}
                      </Text>
                      <Button
                        mode="bleed"
                        text="Next"
                        disabled={page >= pageCount || loading}
                        onClick={loadNextPage}
                      />
                    </Flex>
                  )}
                </>
              )}
            </Stack>
          </Card>
        )}
      </Box>
    </Box>
  )
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
  const perspective = usePerspective()
  const showReferenceDetails = perspective.selectedPerspectiveName === 'published'
  return (
    <Box style={{maxHeight: 300, overflowY: 'auto'}}>
      <Stack style={{gap: 8}}>
        {documentsData.map(doc => (
          <Flex key={doc._id} align="center" gap={2}>
            <Checkbox checked={isDocSelected(doc)} onChange={() => handleSelectDoc(doc._id)} />
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
          </Flex>
        ))}
        {stronglyReferencedDocs.length > 0 && (
          <>
            <Box marginTop={3} marginBottom={1}>
              <Text size={1} weight="semibold" muted>
                Documents with strong references (cannot delete):
              </Text>
            </Box>
            {stronglyReferencedDocs.map(doc =>
              showReferenceDetails ? (
                <StrongReferenceDetails
                  key={doc._id}
                  targetId={doc._id}
                  label={String(doc.title || doc.name || doc._id)}
                />
              ) : (
                <Box key={doc._id}>
                  <Flex align="center" gap={2}>
                    <Checkbox checked={false} disabled />
                    <Text>{doc.title || doc.name || doc._id}</Text>
                  </Flex>
                </Box>
              ),
            )}
          </>
        )}
      </Stack>
    </Box>
  )
}
