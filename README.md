# Pause Card

Pause Card shows movie or TV details when you pause a video in IINA, _Netflix-style_.

## Features

- Recognizes movies and TV episodes from filenames
- Shows titles, episode details, and synopses from TMDB
- Displays a pause overlay, with an option to show it only in fullscreen
- Includes TMDB access; no personal API key is needed

## Install

Install Pause Card from its GitHub repository in IINA, or open a packaged `*.iinaplgz` release. An optional TMDB Read Access Token override is available in `Plugins -> Pause Card -> Preferences`.

How it looks in paused state


<img width="500" height="305" alt="Screenshot 2026-09-29 at 11 26 49 PM" src="https://github.com/user-attachments/assets/05ec08c4-fc8d-452d-9662-3b2410c9322e" />
<img width="500" height="304" alt="Screenshot 2026-09-29 at 11 24 06 PM" src="https://github.com/user-attachments/assets/2cd7045f-cbac-4462-b691-73c9f8f8a5b0" />


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
