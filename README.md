# Click Notes

A lightweight browser extension for collecting visual UI feedback directly on your own web projects, then copying all notes as clean, structured Markdown ready for ChatGPT, Claude, Codex, or a GitHub issue.

```
Record → click element → write note → save → repeat → copy
```

---

## What it does

When reviewing UI work it is hard to describe exactly which element needs attention. Instead of writing vague feedback like *"the thing at the top feels off"*, Click Notes lets you point directly at an element in the browser, write your comment in plain language, and export everything as a structured developer handoff.

Your words are the source of truth. Element metadata is only there to help locate and implement the change.

---

## Install

Click Notes runs as an unpacked extension — no build step, no backend, no account required.

**Requirements:** Chrome, Edge, or any Chromium-based browser with Developer mode enabled.

1. Clone the repo:

```bash
git clone https://github.com/DH-stream/click-notes.git
```

2. Open `chrome://extensions` (or `edge://extensions`)
3. Enable **Developer mode**
4. Click **Load unpacked** and select the `click-notes` folder
5. Pin the extension to your toolbar for quick access

For full install instructions see [INSTALL.md](INSTALL.md).

---

## Usage

1. Open a page you want to review (localhost, Vercel preview, etc.)
2. Click the Click Notes icon in your toolbar
3. Click **Record**
4. Hover over elements — they highlight as you move
5. Click an element to open the note box
6. Write your comment and click **Save note**
7. Repeat for other elements
8. Click **Copy** to copy all notes as Markdown
9. Paste into ChatGPT, Claude, Codex, or a GitHub issue

Numbered pins appear on the page for each saved note. Click any pin to edit or delete it.

**Keyboard shortcuts in the note box:**
- `Cmd/Ctrl + Enter` — save note
- `Escape` — cancel

---

## Exported output

Each note includes the element's tag, selector, text, position, visual styles, and nearby context — everything an AI coding assistant or developer needs to locate and implement the change.

```md
# Visual build notes

Generated: 2026-05-25T20:30:00.000Z

## Page: http://localhost:3000/dashboard

Title: My App
Viewport: 1440x900

### Note 1

Target:
- Tag: button
- Selector: [data-testid="save-btn"]
- Text: Save
- Position: x=1024 y=720 w=120 h=44

Comment:
This button should feel more prominent. It gets lost next to the cancel action.
```

---

## Tips for better selectors

Click Notes prefers stable identifiers when available. Adding a `data-note` attribute to key elements gives you a reliable, human-readable selector in the export:

```html
<button data-note="save-button">Save</button>
```

Supported attributes in priority order: `data-note`, `data-component`, `data-testid`, `data-cy`, `id`, stable class names.

If none are present the extension falls back to a structural path and shows a hint in the note box.

---

## File structure

```
click-notes/
  manifest.json       Extension config
  popup.html          Toolbar popup UI
  popup.js            Popup logic and Markdown export
  contentScript.js    Page capture, modal, pins
  contentStyle.css    Highlight, modal, pin styles
  icons/              Extension icons (16, 48, 128px)
```

---

## Privacy

Click Notes is user-initiated. It does not run passively or track browsing. Notes are stored locally in browser extension storage and never sent anywhere. Capture only starts when you click **Record**.

---

## Roadmap

- [ ] Screenshot thumbnail per note
- [ ] JSON export
- [ ] Copy as ChatGPT / Claude prompt
- [ ] Export as GitHub issue body
- [ ] Edit notes in the popup before copying
- [ ] Session history

---

## License

MIT
