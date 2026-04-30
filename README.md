# Pause Card

A Netflix-style pause overlay for IINA.

Pause Card identifies the current movie or episode from the filename, fetches metadata from TMDB, caches the result, and shows a clean pause screen with title, episode context, and synopsis.

## Features

- Automatic filename parsing for movies and TV episodes
- TMDB lookup for titles, episode names, and synopses
- Cache-first behavior to avoid repeated API calls
- Text-only pause overlay inspired by Netflix
- GitHub-installable IINA plugin layout

## Install

You can install Pause Card either by:

1. entering the GitHub repository URL in IINA
2. opening a packaged `*.iinaplgz` release with IINA

After installation, open `Plugins -> Pause Card -> Preferences` and paste a TMDB API key or Read Access Token.

## Development

The repo root is the plugin source. `.build/` is generated output used for local linking and release packaging.

Stage a clean plugin folder:

```bash
./scripts/stage-plugin.sh
```

That creates:

```bash
.build/pause-card.iinaplugin
```

Link the staged plugin into IINA:

```bash
/Applications/IINA.app/Contents/MacOS/iina-plugin link "$(pwd)/.build/pause-card.iinaplugin"
```

Typical local dev loop:

1. Make code changes in the repo root.
2. Run `./scripts/stage-plugin.sh` to refresh the staged plugin.
3. Restart IINA when needed to pick up the updated build.
4. Test with local media in IINA.
5. Configure TMDB auth in `Plugins -> Pause Card -> Preferences` if you want live metadata during testing.

Useful checks before opening a PR:

```bash
node --check main.js
node tests/parser-smoke.js
./scripts/pack-release.sh
```

Refresh the vendored `guessit-js` runtime from the local reference copy:

```bash
./scripts/vendor-guessit.sh
```

Run the reference `guessit-js` JavaScript test suite from `resourses/guessit-js-main`:

```bash
./scripts/test-guessit-reference.sh
```

These two scripts expect a local reference checkout under `resourses/`, which is intentionally gitignored and not part of the published repo.

## Release

Build a release archive with:

```bash
./scripts/pack-release.sh
```

This writes the staged plugin and the packaged `*.iinaplgz` archive into `.build/`.

## Project Layout

- `Info.json`: plugin manifest
- `main.js`: runtime, parsing, TMDB lookup, caching, and overlay flow
- `parser.js`: `guessit-js` backed parser with heuristic fallback
- `overlay.html`: pause overlay UI
- `preferences.html`: plugin settings UI
- `vendor/`: vendored third-party runtime files used by the plugin
- `scripts/stage-plugin.sh`: creates the staged `.iinaplugin` directory
- `scripts/pack-release.sh`: builds the release archive from the staged plugin
- `scripts/vendor-guessit.sh`: refreshes the vendored `guessit-js` runtime from the local reference copy
- `scripts/test-guessit-reference.sh`: runs the upstream `guessit-js` JS test suite
- `tests/parser-smoke.js`: parser smoke tests

## Notes

- Successful TMDB results are cached as the stable metadata source.
- If TMDB auth is missing, the plugin falls back to parsed filename data and can upgrade that cache later once auth is added.
- Error and no-match fallbacks use retry cooldowns to avoid repeated failed lookups.

## Known Gaps

- The parser now uses vendored `guessit-js` by default and falls back to the older heuristic parser when needed, but it still needs more project-specific regression coverage before we treat it as fully production-hardened.
- There is no manual correction UI yet if a filename parses badly or TMDB picks the wrong match.
- The overlay is text-only by design for now.
