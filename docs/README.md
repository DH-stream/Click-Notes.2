# Temporary Click Guide preview

This folder is used only for temporary GitHub Pages review of the mocked Click Guide playback and finish animation. It is not loaded by the Chrome extension runtime and should not be treated as production extension code.

## GitHub Pages setup

1. Go to repository **Settings → Pages**.
2. Set **Source** to **Deploy from a branch**.
3. Select the current preview branch.
4. Select folder: `/docs`.
5. Save.
6. Open the generated GitHub Pages URL.

Expected preview URL shapes:

```text
https://dh-stream.github.io/Click-Notes.2/
https://dh-stream.github.io/Click-Notes.2/finish-animation-preview.html
```

The preview is a static, clickable 3-step mock guide: Step 1 → Step 2 → Step 3 → Finish → completion animation.


## Syncing production styling and icons

The GitHub Pages preview uses synced copies of production extension assets so it does not drift from the real content-script UI.

After changing `contentStyle.css`, run:

```bash
node scripts/sync-preview-assets.mjs
```

The generated/synced preview CSS asset is:

- `docs/contentStyle.css`

Codex PRs should not include `docs/icons/*.png` binary files. Production icons live under the root `icons/` directory, and the user manages preview icon files manually.

If you want to refresh preview icons locally for manual GitHub Pages testing, run:

```bash
node scripts/sync-preview-assets.mjs --with-icons
```

That optional local command copies root production icons into `docs/icons/`, where `docs/index.html` expects them for the static Pages preview.

GitHub Pages still serves the static preview from `/docs`.
