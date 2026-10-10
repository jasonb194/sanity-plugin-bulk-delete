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

## Releasing

Pushes to `main` trigger release calculation from commits since the last release baseline. Use Conventional Commit messages to select the SemVer bump:

- `fix:` and `perf:` publish a patch release.
- `feat:` publishes a minor release.
- Add `!` before the colon, or include a `BREAKING CHANGE:` footer, to publish a major release.
- Other commit types, such as `docs:`, `ci:`, `test:`, and `chore:`, do not publish by themselves.

The highest reachable stable `vX.Y.Z` tag is the baseline after the first automated release. On the first run, CI uses the currently published npm version and its `gitHead` as the baseline, so older commits are not included in the calculation. CI stages a package only when the range contains a release-worthy commit. It updates `package.json` only in the temporary build checkout; no package version edit or version commit is needed. Before submitting to npm, CI creates the `npm-stage/vX.Y.Z` marker at the release commit. That marker reserves the version and blocks subsequent automatic releases until the stage is finalized or explicitly cleared.

If npm already contains the stable version at the exact `main` commit but its `vX.Y.Z` tag is missing, CI can recover the tag after verifying the registry metadata. It will not do this while a pending stage marker exists.

After CI reports a successful stage, review and approve it in npm. Then go to **Actions → Publish to npm → Run workflow**, select the `main` branch, choose `finalize`, and enter the exact version without the `v` prefix. The workflow verifies the published version and its `gitHead` against the pending marker, creates the matching `vX.Y.Z` tag, then removes the marker. Re-running finalization is safe after it succeeds. Before clearing a stage, inspect the exact `sanity-plugin-bulk-delete` version in npm's staged versions and confirm npm shows it as rejected or that no staged entry exists for that exact package version (`missing`) and the version is not already published. Then run the workflow with action `clear`, enter that exact version, select the observed `stage_status` (`rejected` or `missing`), and check `confirm_clear`. The workflow relies on the selected status as an operator attestation because npm's stage inspection commands require interactive authentication and cannot be checked by the OIDC workflow. It also checks the public registry and refuses to clear an already-published version; registry errors other than a definite version-not-found response stop the job. Clearing only removes the Git marker; it does not publish or create a release tag. Do not clear a stage that npm still shows as pending or approved.

Before the first release, configure npm trusted publishing for `sanity-plugin-bulk-delete` in the package's npm settings:

- Publisher: GitHub Actions
- Owner or user: `jasonb194`
- Repository: `sanity-plugin-bulk-delete`
- Workflow filename: `publish.yml`
- Leave Environment blank.
- Leave direct publishing (`npm publish`) disabled. npm allows `npm stage publish` for trusted publishers by default.

No npm token secret is required. The staging job uses GitHub's OIDC identity and npm provenance. Staged publishing requires npm 11.15.0 or later; the workflow installs that CLI version under Node 24. Configure repository rules so only release maintainers and the GitHub Actions workflow can create or delete `npm-stage/v*` reservation tags; protect finalized `v*` release tags from updates and deletion. The workflow uses GitHub's built-in token, so pushing these tags does not start another workflow.

Stable versions use npm's default `latest` dist-tag. npm versions are immutable, and CI checks the registry before publishing so it will not try to reuse a version that already exists.

## License

MIT

---
**Note:** Use with caution. Deleted documents cannot be recovered unless you have backups or use Sanity's history/versioning features.
