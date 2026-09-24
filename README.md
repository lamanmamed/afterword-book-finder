# Afterword — book finder

A small editorial book recommendation experience built as a static site.

## Run locally

Open `dist/index.html` in a browser. No build step or dependencies are required. To serve it over HTTP, run `python3 -m http.server 8000 --directory dist` and visit `http://localhost:8000`.

## Files

- `dist/index.html` — page structure, styles, sample book data, selection/search flow, and mock recommendation logic.
- `dist/path-cover.webp` — illustrated cover artwork used in the landing-page book stack.
- `.openai/hosting.json` — Sites deployment configuration for this site.

The book covers load from Open Library and the typefaces load from Google Fonts, so those images and fonts require an internet connection. The recommendations use sample data and local client-side scoring; no real ratings dataset or backend is connected yet.

[View the site](https://afterword-book-finder.lemanmamedova10.chatgpt.site)
