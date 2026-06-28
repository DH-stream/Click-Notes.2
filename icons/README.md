# Click Guide icon assets

Place the production PNG icon files for the Chrome extension in this folder.

Required by `manifest.json`:

- `icons/icon16.png`
- `icons/icon48.png`
- `icons/icon128.png`

Recommended source/extra assets:

- `icons/icon32.png` — optional helper size for docs/testing
- `icons/click-guide-icon-master.png` — source/master PNG from the generated icon pack

The manifest currently points to:

```json
"icons": {
  "16": "icons/icon16.png",
  "48": "icons/icon48.png",
  "128": "icons/icon128.png"
},
"action": {
  "default_icon": {
    "16": "icons/icon16.png",
    "48": "icons/icon48.png"
  }
}
```

When replacing placeholders, keep the required filenames exactly as listed above.
