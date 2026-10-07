# BulkDelete

BulkDelete is a Sanity Studio tool plugin for Sanity v3.76+, v4, v5, and v6. It allows administrators (and optionally other roles) to bulk delete documents of a selected type from your dataset. It prevents deletion of documents that are strongly referenced elsewhere, and provides a clear UI for selecting, reviewing, and confirming deletions.

## Compatibility

The plugin supports Sanity `^3.76.0 || ^4 || ^5 || ^6`. Sanity's host requirements vary by Studio version:

| Sanity Studio | Host requirements |
|---------------|-------------------|
| v3.76+        | React and React DOM `^18.2` or `^19`; `@sanity/ui` v2 |
| v4            | Node.js `>=20.19`; React and React DOM `^18.2` or `^19`; `@sanity/ui` v3 |
| v5            | Node.js `>=20.19 <22` or `>=22.12`; React and React DOM `^19.2.2`; `@sanity/ui` v3 |
| v6            | Node.js `>=22.12`; React and React DOM `^19.2.2`; `@sanity/ui` v4 |

These are Sanity Studio host requirements, not a claim that every supported version has been individually tested with this plugin. See Sanity's [known package compatibility](https://www.sanity.io/docs/help/upgrade-packages), [v3 to v4 upgrade guide](https://www.sanity.io/docs/help/v3-to-v4), and [React 19 requirements](https://www.sanity.io/docs/help/react-19).

## Features

- Select a document type and view all documents of that type
- Bulk select/deselect documents for deletion
- Prevents deletion of documents with strong references
- Indicates documents with weak references
- Role-based access (default: administrators, configurable)
- Confirmation dialog before deletion

## Installation

1. Install the plugin in your Sanity Studio project:

   ```sh
   npm install sanity-plugin-bulk-delete
   ```

2. Add the plugin to your `sanity.config.ts`:

   ```ts
   import {defineConfig} from 'sanity'
   import {BulkDelete} from 'sanity-plugin-bulk-delete'

   export default defineConfig({
     // ...other config
     plugins: [
       BulkDelete({
         schemaTypes: schemaTypes, // Pass your schema types here
         // roles: ['administrator', 'editor'], // Optionally restrict to specific roles
       }),
     ],
   })
   ```

## Usage

- Open Sanity Studio.
- Click on **Bulk Delete** in the Studio navigation.
- Select a document type from the dropdown.
- Select individual documents or use "Select All".
- Click **Delete Selected** and confirm in the dialog.

## Configuration

| Option      | Type     | Description                                                                 |
|-------------|----------|-----------------------------------------------------------------------------|
| schemaTypes | array    | Required. List of schema types (usually from your schema export).           |
| roles       | string[] | Optional. Array of role names allowed to use the tool. Defaults to admin.   |

## Security

- Only users with the specified roles (default: `administrator`) can access the tool.
- Documents with strong references cannot be deleted to prevent breaking references.

## Development

Use Node.js 22.12 or newer for development; the development dependencies target Studio v6.

```sh
npm install
npm run typecheck
npm test
npm run build
```

GitHub Actions runs these checks on pushes and pull requests against Studio 3.76.0 and the latest v3, v4, v5, and v6 releases, with matching React and Sanity UI versions. It also installs the packed plugin in a separate consumer project and checks its CommonJS and ESM exports.

- Components are modular and typed with TypeScript.
- See `src/types/BulkDeleteComponent.types.ts` for prop and config interfaces.

## License

MIT

---
**Note:** Use with caution. Deleted documents cannot be recovered unless you have backups or use Sanity's history/versioning features.
