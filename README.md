# Pause Card

Pause Card shows movie or TV details when you pause a video in IINA, _Netflix-style_.

## Features

- Recognizes movies and TV episodes from filenames
- Shows titles, episode details, and synopses from TMDB
- Displays a pause overlay, with an option to show it only in fullscreen
- Includes TMDB access; no personal API key is needed

## Install

Install Pause Card from its GitHub repository in IINA, or open a packaged `*.iinaplgz` release. An optional TMDB Read Access Token override is available in `Plugins -> Pause Card -> Preferences`.

## Development

The repository root contains the plugin source. `.build/` contains generated files for local testing and release packaging.

Stage and link a local build:

```bash
./scripts/stage-plugin.sh
/Applications/IINA.app/Contents/MacOS/iina-plugin link "$(pwd)/.build/pause-card.iinaplugin"
```

Restart IINA to load changes, then test with local media.

Pause Card stores its data and logs in:

```text
$HOME/Library/Application Support/com.colliderli.iina/plugins/.data/io.github.fahim.pausecard/
```

The debug log is `debug.log` in that directory.

Build a release archive with:

```bash
./scripts/pack-release.sh
```

The archive is written to `.build/`.
