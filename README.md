# Pause Card

Automatic pause-state metadata overlay for IINA.

This repo contains the `Pause Card` IINA plugin. It starts from the part of `iina-episode-info` that matters for your goal, then removes the manual search flow. The plugin:

- parses the current file name automatically
- classifies the media as a movie or TV episode
- queries TMDB in the background
- caches the resolved metadata in the plugin data directory
- shows a Netflix-style pause overlay with title, season/episode line, episode title, and synopsis

## Source vs release

The GitHub repo root is now the plugin source root.

That layout is intentional for IINA's GitHub install flow: keep `Info.json` and the runtime files at the repo root so the repository itself maps cleanly to a single plugin package.

The packaged install files are just release artifacts:

- `*.iinaplgz`

They are not the source of truth. For GitHub releases, the usual pattern is:

1. commit the source files in the repo root
2. tag a version
3. upload the `.iinaplgz` as a GitHub Release asset

If you want IINA to auto-check for updates after users install from GitHub, add `ghRepo` and `ghVersion` to `Info.json` once the final GitHub repository URL exists.

## Project layout

- `Info.json`: plugin manifest
- `main.js`: runtime event flow, filename parsing, TMDB lookup, caching
- `parser.js`: standalone parser module for smoke tests and local development
- `overlay.html`: Netflix-inspired overlay
- `preferences.html`: plugin settings
- `scripts/stage-plugin.sh`: creates a clean `.iinaplugin` staging directory for packaging
- `scripts/pack-release.sh`: builds a release archive from the staged plugin directory
- `tests/parser-smoke.js`: parser smoke tests
- `netflix_pause.png`: design reference

## Current MVP behavior

1. Open a file in IINA.
2. The plugin reads `core.status.url`, parses the filename, and builds a lookup key.
3. If metadata is cached, it reuses it immediately.
4. Otherwise it calls TMDB and stores the resolved result under both the file URL and the normalized media identity.
5. When playback pauses, the overlay appears after a configurable delay.

## Cache behavior

- Successful TMDB metadata is treated as the stable cache.
- If no TMDB auth is configured, the plugin caches the parse-only fallback and reuses it until auth is added later.
- If TMDB errors, the plugin caches the fallback plus a retry cooldown so it does not hammer the API on every file open.
- If TMDB has no match, the plugin caches that fallback with a longer retry cooldown.

## Development

For development, stage a clean plugin folder first:

```bash
./scripts/stage-plugin.sh
```

That creates:

```bash
.build/pause-card.iinaplugin
```

Link that staged folder into IINA:

```bash
/Applications/IINA.app/Contents/MacOS/iina-plugin link "$(pwd)/.build/pause-card.iinaplugin"
```

Then open IINA settings, go to `Plugins -> Pause Card -> Preferences`, and paste a TMDB API key or Read Access Token.

To build a release archive from the repo root:

```bash
./scripts/pack-release.sh
```

That writes the staged plugin folder and the packaged `.iinaplgz` into `.build/`.

## Contributing

Typical local dev loop:

1. Clone the repo and open it locally.
2. Run `./scripts/stage-plugin.sh` after any code change to refresh `.build/pause-card.iinaplugin`.
3. Link the staged plugin into IINA once with:

```bash
/Applications/IINA.app/Contents/MacOS/iina-plugin link "$(pwd)/.build/pause-card.iinaplugin"
```

4. Restart IINA when you need it to pick up staged changes cleanly.
5. Open `Plugins -> Pause Card -> Preferences` and configure TMDB auth if you want live metadata lookups during testing.

Useful checks before opening a PR:

```bash
node --check main.js
node tests/parser-smoke.js
./scripts/pack-release.sh
```

Notes:

- The repo root is the source of truth.
- `.build/` is generated output and should not be committed.
- The staged `.iinaplugin` folder exists only to support IINA's development link and release packaging flow.

## Known gaps

- The parser is intentionally local and dependency-free for the bootstrap. It has a clean seam where `guessit-js` can replace or augment it later.
- There is no manual correction UI yet. If a filename parses badly or TMDB picks the wrong match, the next step is a lightweight "Override Match" panel rather than a full search workflow.
- The overlay is text-only for now, matching your requested direction: no poster, no blurred synopsis.
