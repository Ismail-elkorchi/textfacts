# Migration Map (Entrypoints)

This document lists exported entrypoints. Import paths not listed in this map are not exported.

## Non-Exported Entrypoints
- `textfacts/hash64`
- `textfacts/hash128`
- `textfacts/diff`
- `textfacts/fingerprint`
- `textfacts/corpus`
- `textfacts/profile`

## Current Exported Entrypoints
- `textfacts`
- `textfacts/all`
- `textfacts/bidi`
- `textfacts/casefold`
- `textfacts/collation`
- `textfacts/compare`
- `textfacts/core`
- `textfacts/facts`
- `textfacts/hash`
- `textfacts/idna`
- `textfacts/integrity`
- `textfacts/jcs`
- `textfacts/linebreak`
- `textfacts/normalize`
- `textfacts/pack`
- `textfacts/protocol`
- `textfacts/schema`
- `textfacts/security`
- `textfacts/segment`
- `textfacts/toolspec`
- `textfacts/unicode`
- `textfacts/variants`

## Root Import Note
The root entrypoint does not provide dedicated exports for diff/fingerprint/corpus/profile modules. Import from the supported subpaths listed above.
