# Click Notes Goal

## Product vision

Click Notes should become a small, fast browser extension that makes visual UI feedback easy to capture and easy to hand off.

The final product should let a developer or reviewer open one of their own web projects, activate capture mode, click specific UI elements, write comments in their own words, and then copy all collected comments as structured build notes.

The core purpose is not automation or AI interpretation. The core purpose is pointing.

The user knows what they mean visually. Click Notes should help preserve that context.

## Core problem

When working with AI coding assistants, Codex, ChatGPT, or another developer, visual feedback often loses precision.

A comment like:

> Make that card feel lighter.

is hard to act on unless the assistant knows which card the user means.

Click Notes solves this by connecting a user-written comment to browser-level context:

- The page where the comment was made
- The clicked element
- Its visible text
- Its selector or identifying attributes
- Its position on screen
- Any useful development metadata

This turns vague visual feedback into actionable implementation notes.

## Target user

The primary user is a developer reviewing their own projects.

Initial target environments:

- Localhost web apps
- Vercel preview deployments
- Vercel production deployments
- Internal/personal web tools

The tool is especially useful for design-heavy projects where small visual changes are difficult to describe in text alone.

## Desired final workflow

1. Open a web project in the browser.
2. Click the Click Notes extension.
3. Press “Start capture”.
4. Hovering elements highlights them.
5. Click an element.
6. A comment box appears.
7. Write a note in plain language.
8. Save the note.
9. Repeat for more elements.
10. Press “Copy notes”.
11. Paste the exported notes into ChatGPT, Codex, a GitHub issue, or a pull request.

## Product principles

### 1. The user comment is the source of truth

Click Notes should never rewrite, reinterpret, or “improve” the user’s comment by default.

The user’s words should be preserved exactly.

Metadata exists only to help locate and implement the comment.

### 2. Keep the MVP simple

The first version should work without:

- Backend
- Authentication
- Database
- Build pipeline
- AI processing
- Screenshot processing
- Cloud sync

The MVP should be a local browser extension using browser storage and clipboard export.

### 3. Make the export useful

The exported notes should be useful for both humans and coding assistants.

A good exported note should answer:

- Where was the note made?
- What element was clicked?
- What did the user say about it?
- What useful clues can help find the relevant code?

### 4. Avoid tracking behavior

Click Notes is not an analytics product.

It should not track general user behavior, record browsing history, or send captured data anywhere automatically.

Captured notes should stay local unless the user explicitly copies or exports them.

### 5. Work well with developer metadata

Because this tool is intended for the user’s own projects, it should take advantage of developer-friendly attributes when available.

Preferred identifiers:

- `data-note`
- `data-component`
- `data-testid`
- `data-cy`
- `id`
- stable class names

Fallback selectors are acceptable, but the tool should prefer explicit metadata when present.

## MVP feature definition

The MVP is complete when the extension can:

- Load in Chrome or Edge as an unpacked Manifest V3 extension
- Start and stop capture mode
- Highlight hovered elements
- Prevent accidental page clicks while capture mode is active
- Open a comment modal when an element is clicked
- Save the user’s comment with element metadata
- Store notes locally
- Copy all saved notes as Markdown
- Clear saved notes
- Work on localhost and Vercel URLs

## Recommended first implementation

Use a simple file structure:

```txt
click-notes/
  manifest.json
  popup.html
  popup.js
  contentScript.js
  contentStyle.css
  README.md
  GOAL.md
```

Avoid React, TypeScript, bundlers, and frameworks until the base extension is working.

A boring first version is preferred over a polished but fragile one.

## Example exported output

```md
# Visual build notes

Generated: 2026-05-25T20:30:00.000Z

## Page: http://localhost:3000/wall

Title: Homeboard Wall
Viewport: 1440x900

### Note 1

Element:
- Tag: button
- Selector: [data-note="complete-day-button"]
- Text: Complete day
- Position: x=1040 y=720 w=148 h=48

Comment:
This button needs to feel more important. It should stand out more from the surrounding actions.
```

## Future direction

After the MVP works, Click Notes can grow into a more complete visual review tool.

Potential future features:

- Numbered visual pins on the page
- Editable note list before export
- Screenshot capture per note
- Session history
- JSON export
- Markdown export profiles
- ChatGPT-friendly export
- Codex-friendly export
- GitHub issue export
- Better selector scoring
- Project-specific metadata adapters
- Optional local endpoint integration
- Optional integration with a local AI/dev assistant workflow

These should only be added after the core click, comment, save, and copy loop feels reliable.

## Non-goals for the MVP

The MVP should not attempt to:

- Automatically understand what the user means
- Rewrite the user’s comments
- Send notes to a server
- Support external customer feedback collection
- Track user behavior
- Capture every click on a page
- Replace Figma, GitHub issues, or project management tools

Click Notes should remain a focused personal review utility.
