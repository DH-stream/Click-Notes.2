# Click Guide

Click Guide is a lightweight Chrome extension for creating interactive, step-by-step tutorials directly on top of real websites.

It helps an experienced colleague turn a web workflow into a calm visual guide: each step highlights the exact DOM element to look at and shows an instruction popup nearby.

## MVP

- Create local guides from the current tab.
- Add steps by manually selecting DOM elements.
- Write each step title and instruction yourself.
- Play guides with highlight, dimming, autoscroll, Previous, Next, and Close.
- Export guides as readable `.clickguide` JSON files.
- Import `.clickguide` files by drag-and-drop and start playback immediately.

## Privacy

Click Guide guides visually. It does not automate actions, submit forms, save passwords, save form values, read cookies, or send data to a backend.

Guides are stored locally with `chrome.storage.local`.
