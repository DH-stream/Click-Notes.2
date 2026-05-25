# Install Click Notes locally

Click Notes is currently intended to be tested as an unpacked browser extension.

This is the easiest way to use it privately while developing and reviewing your own projects.

## What you need

- A Chromium-based browser, such as:
  - Google Chrome
  - Microsoft Edge
  - Opera
- A local copy of this repository
- Developer mode enabled in your browser extensions page

No backend, account, API key, database, or build step is required.

## 1. Get the project on your computer

Clone the repo:

```bash
git clone https://github.com/DH-stream/click-notes.git
cd click-notes
```

If you already cloned the repo earlier, update it:

```bash
git pull
```

## 2. Load the extension in Chrome

1. Open Chrome.
2. Go to:

```txt
chrome://extensions
```

3. Enable **Developer mode** in the top-right corner.
4. Click **Load unpacked**.
5. Select the `click-notes` repo folder.
6. Click Notes should now appear as an installed extension.

## 3. Load the extension in Microsoft Edge

1. Open Edge.
2. Go to:

```txt
edge://extensions
```

3. Enable **Developer mode**.
4. Click **Load unpacked**.
5. Select the `click-notes` repo folder.
6. Click Notes should now appear as an installed extension.

## 4. Load the extension in Opera

Opera is Chromium-based, so this extension should work there as well.

1. Open Opera.
2. Go to:

```txt
opera://extensions
```

3. Enable **Developer mode**.
4. Click **Load unpacked**.
5. Select the `click-notes` repo folder.
6. Click Notes should now appear as an installed extension.

If Opera does not show **Load unpacked**, check Opera's extension developer settings or test first in Chrome/Edge.

## 5. Pin the extension

For easier testing, pin Click Notes to the browser toolbar.

This makes the test flow quicker:

```txt
Open page → click Click Notes → Record → click UI → write note → Copy
```

## 6. Test on a page

Open a page you want to review, for example:

```txt
http://localhost:3000
http://localhost:5173
https://your-vercel-preview.vercel.app
```

Then:

1. Click the Click Notes extension icon.
2. Click **Record**.
3. Hover over the page.
4. Click a UI element.
5. Write a note.
6. Click **Save note**.
7. Repeat for more UI elements.
8. Click the extension icon again.
9. Click **Copy**.
10. Paste the copied notes into ChatGPT, Codex, GitHub, or a document.

## Expected behavior

When working correctly:

- The extension popup only shows simple controls:
  - Record
  - Stop
  - Copy
  - Clear
- Hovered elements get highlighted while recording.
- Clicking an element opens a small note box.
- Saving a note adds a numbered pin to the page.
- `Copy` includes the number of saved notes, for example `Copy 3`.
- Copied output is Markdown.
- `Clear` removes saved notes and visible pins.

## Important notes

Click Notes is user-initiated.

It should not run passively on every page. It only starts capture after you click the extension and press **Record**.

Captured notes are stored locally in the browser extension storage. They are not sent anywhere automatically.

## Troubleshooting

### The extension does not show up

Make sure you selected the actual repo folder that contains `manifest.json`.

The selected folder should contain files like:

```txt
manifest.json
popup.html
popup.js
contentScript.js
contentStyle.css
```

### Record does nothing

Try refreshing the page and clicking **Record** again.

Some browser pages cannot run extensions, such as:

```txt
chrome://extensions
edge://extensions
opera://extensions
chrome://settings
```

Test on a normal web page, localhost page, or Vercel page.

### Copy does nothing

Make sure you have saved at least one note first.

The button should change from:

```txt
Copy
```

to something like:

```txt
Copy 1
Copy 2
Copy 3
```

### Pins look wrong after scrolling

Refresh the page, start recording again, and check if pins render in the correct place.

If pins still drift, report it as a bug with:

- browser name
- page URL type, for example localhost or Vercel
- whether the page was scrolled before saving the note

## Current status

This is an MVP.

The goal is to validate the core flow:

```txt
Record → click element → write note → save → repeat → copy notes
```

Do not expect store-style polish yet. The first priority is that the flow is fast, reliable, and useful for developer handoff.
