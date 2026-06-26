# ROADMAP.md

## Click Guide roadmap

This roadmap tracks focused product improvements for Click Guide.

The current priority is reliability and smooth guide creation, not new visual design.

## Current product principles

- Keep normal usage simple and non-technical.
- Do not expose DOM, selector, href, aria, role, anchorMode, fallbackPath, or similar implementation details in the UI.
- Keep technical target metadata internally for reliability.
- Do not automate clicks, submits, or form filling.
- Do not save form values, passwords, cookies, tokens, query params, hashes, or page storage.
- Preserve saved-position fallback and URL-match completion behavior.
- Prefer small, focused PRs.

## P0 – Continuous guide builder session

Problem:

After every saved step, the creator currently has to reopen the extension popup, open the guide, click Edit, and add another step. This makes guide creation feel interrupted.

Desired behavior:

- Starting guide editing should enter a continuous builder session.
- The creator should stay in builder mode until they explicitly click `Done` or `Exit editing`.
- After saving a normal step, Click Guide should immediately ask for the next target.
- After saving a URL-match step, Click Guide should keep the builder session alive, wait for the expected navigation, then resume target selection on the next page.

Suggested flow:

```txt
Open guide editor
→ Add step
→ select target
→ write step
→ Save step
→ Select next target or click Done
→ Save step
→ Select next target or click Done
→ Done
```

For URL-match steps:

```txt
Save step with URL change
→ Step saved. Continue to the next page.
→ creator manually navigates/clicks
→ URL matches
→ URL matched. Select the next target or click Done.
```

Acceptance:

- Creator can add several steps without reopening the extension popup.
- Creator only exits editing when clicking Done/Exit or cancelling.
- Done removes overlays/editor state and leaves saved guide intact.
- Existing manual, URL-match, and rect fallback flows still work.

## P0 – Post-navigation placement reliability

Problem:

After a URL-match step, the next step can appear on the correct page but in the wrong visual position if playback resolves a generic live selector such as `div.hide-sm`.

Desired behavior:

- If `target.anchorMode === "rect"`, continue using saved position as the primary target.
- If `target.anchorMode === "element"`, try the live element first, but validate it before trusting it.
- If the live match is suspicious, too generic, huge, zero-size, duplicated, or far from the saved position, use saved position fallback instead.

Suspicious selectors/classes include examples like:

- `hide-sm`
- `show-sm`
- `container`
- `wrapper`
- `layout`
- `clearfix`
- `sr-only`
- `visually-hidden`
- `d-flex`
- `flex`
- `grid`
- `row`
- `col`

Acceptance:

- A step with a generic selector and saved rect appears near the creator’s saved visual area.
- URL-match still advances correctly.
- Strong selectors still use live DOM targets.
- No technical fallback wording is shown to users.

## P1 – Invisible semantic target fallback metadata

Goal:

Make target resolution more robust without changing the visual UI.

When capturing a selected target, save extra internal semantic metadata so Click Guide can find the same button/link if the page layout changes.

Capture internally:

- visible text
- accessible name
- aria label
- title
- role
- safe href when available
- normalized href path / URL-match path when available
- target kind, such as button, link, input, textarea, select, checkbox, visual area

Do not show this metadata in normal UI.

Do not save:

- input values
- textarea values
- passwords
- cookies
- tokens
- query params
- hashes
- page localStorage/sessionStorage

Suggested playback target resolution order:

1. Strong/stable selector.
2. Same safe href or URL destination for links.
3. Same accessible name plus role.
4. Same visible text plus role.
5. Same form label / placeholder / name for fields.
6. Saved position fallback.

For links:

- If target href or normalized href path exists, find links with the same safe destination.
- If multiple links match, prefer matching visible text / accessible name.
- If still multiple, prefer closest to saved rect/anchor.

For buttons:

- Prefer same accessible name / visible text / role.
- If the step has URL-match completion, use that expected URL only as context/confidence.
- If no reliable match exists, use saved position fallback.

Acceptance:

- Existing guides still work.
- New guides store semantic fallback metadata internally.
- A moved link can still be found by destination/text.
- A moved button can still be found by accessible text/role.
- There are no user-facing UI changes.

## P1 – Hide technical wording from normal UX

Goal:

Click Guide should feel like a simple onboarding tool, not a developer tool.

Avoid user-facing words like:

- DOM
- selector
- CSS selector
- fallback path
- rect
- anchor
- anchorMode
- href
- aria
- role
- technical class names

Use plain-language labels instead:

- Button
- Link
- Field
- Text field
- Dropdown
- Visual area
- Saved spot
- Target

Suggested copy changes:

- Replace `Original element not found. Showing saved position.` with `The page changed, so this step is shown near the saved spot.`
- Replace `Element not found` with `Target not found`.
- Replace technical reliability wording with plain copy such as `This target may move if the page changes.`

Acceptance:

- A non-technical user can create and play guides without seeing developer terminology.
- Internal metadata remains available for reliability.
- Import/export can remain technical internally, but user-facing errors should be simple.

## P2 – Capture next URL for non-link navigation buttons

Goal:

Support buttons without href that navigate through JavaScript.

Desired flow:

```txt
Creator selects button without href
→ Creator chooses URL-change completion
→ Save step
→ Click Guide says: Step saved. Click the control and go to the next page.
→ Creator manually clicks/navigates
→ Click Guide captures the next normalized URL
→ Step advance value is saved
→ Builder resumes on the next page
```

Important:

- Do not click for the user.
- Do not submit forms.
- Do not save query params or hashes.
- Add timeout/escape hatch if the URL never changes.
- Keep manual Continue fallback visible during playback.

Acceptance:

- JS navigation buttons can become URL-match steps.
- The expected URL is captured only after the creator manually navigates.
- No sensitive URL data is saved.
- Builder does not get stuck if navigation does not happen.

## Future – Desktop application for internal software

Long-term, Click Guide should be able to guide users outside the browser.

The desktop version would allow companies to create guides for internal programs, legacy tools, ERP systems, TMS systems, finance tools, and other native desktop applications.

The product principle stays the same:

- Expert selects a target.
- Expert writes the instruction.
- Learner sees a step-by-step overlay.
- Click Guide highlights the right area/control.
- User performs the action manually.
- Click Guide detects progress when possible.

This should not become automation or remote control. It should remain visual guidance.

Possible desktop target metadata:

- app/process name
- window title
- accessibility role/control type
- accessible name
- visible text
- screen position/rect
- monitor/display info
- OCR fallback
- image/template fallback
- previous/next window state
- optional URL/path/state if the desktop app exposes it

Potential technologies to evaluate later:

- Electron or Tauri for the desktop shell
- Windows UI Automation / Accessibility APIs
- macOS Accessibility APIs
- screen overlay window
- OCR for legacy apps
- signed installer and enterprise deployment

Important constraints:

- Do not build this until the browser MVP is reliable.
- Keep desktop as a separate product surface.
- Preserve privacy/safety principles.
- Do not capture passwords or sensitive field values.
- Do not automate actions unless explicitly designed and reviewed much later.

## Future – Licensing and plan limits

Click Guide may later support plan-based licensing.

Potential tiers:

### Click Guide Solo

Buy once. Create local guides.

- 1 user
- local guides
- no account required
- export/import
- limited guide count

### Click Guide Team

Subscription. Share and manage guides.

- small team workspace
- limited number of users/seats
- shared guide library
- more guides
- basic roles
- simple team management

### Click Guide Business

Subscription. Scale guides across company.

- company workspace
- per-seat or user-based licensing
- admin controls
- advanced roles
- higher or unlimited guide limits
- company-bound guides
- license/workspace validation before playback
- domain restrictions
- signed guide files or server-verified guide access
- future desktop support

Business guides may later require the correct license, company, or workspace to play.

Example future guide metadata:

```js
license: {
  requiredPlan: "business",
  workspaceId: "company_123",
  companyName: "Example Logistics",
  allowedDomains: ["example.com", "internal.example.com"],
  signature: "..."
}
```

Important:

- Client-side checks alone are not strong licensing.
- Business licensing should eventually use server-side verification and/or signed guide metadata.
- Do not build licensing yet.
- For now, preserve the ability to add plan, workspaceId, license state, guide ownership, guide limits, and user/seat limits later without rewriting the core guide model.

## Manual smoke scenarios

Before considering the roadmap items done, smoke test these flows:

1. Create a guide with multiple steps without reopening the extension popup.
2. Save a normal step and confirm builder asks for the next target.
3. Save a URL-match step and confirm builder resumes on the next page.
4. Play a URL-match guide and confirm the next step appears in the correct saved area.
5. Test a moved link and verify it can be found by destination/text.
6. Test a moved button and verify it can be found by text/role.
7. Confirm no user-facing UI exposes technical metadata.
