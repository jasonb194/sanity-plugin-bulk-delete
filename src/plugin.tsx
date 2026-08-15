import {definePlugin} from 'sanity'

import {BulkDeleteComponent} from './components/BulkDeleteComponent'
import type {BulkDeleteToolOptions} from './types/BulkDeleteComponent.types'

/**
 * Sanity plugin definition for the Bulk Delete tool.
 * @public
 */
export const BulkDelete = definePlugin<BulkDeleteToolOptions>((config) => ({
  name: 'sanity-plugin-bulk-delete',
  tools: [
    {
      name: 'bulk-delete',
      title: 'Bulk Delete',
      component: function component() {
        return <BulkDeleteComponent {...config} />
      },
    },
  ],
}))
