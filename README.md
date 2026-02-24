# MNCdrumclone

A browser-based TR-808 drum machine clone built with vanilla JavaScript and the Web Audio API. No frameworks, no dependencies — just open and play.

## Features

### Instruments (11 voices)
Kick, Snare, Hi-Hat, Open Hat, Clap, Cowbell, Tom Lo, Tom Mid, Tom Hi, Rimshot, Maracas

### Sequencer
- **1–32 step** variable-length pattern grid
- **3 velocity levels** per step (low / med / high)
- **Swing** control (0–75%)
- **8 built-in presets**: Rock, Pop, Disco, Funk, Hip Hop, Reggae, Samba, Bossa Nova
- **Euclidean rhythm** generator per row
- **Randomize** — global dice or per-row with density weighting
- Per-instrument **Volume**, **Pitch** (±12 semitones), and **Decay** knobs

### Effects Chain
- **Compressor** — threshold, ratio, knee controls on master bus
- **Distortion** — waveshaper with quadratic drive curve
- **Filter** — LP / HP / BP with logarithmic cutoff and resonance
- **Reverb** — convolution reverb with sqrt mix curve
- **Delay** — tempo-synced stereo ping-pong (1/4, 1/8, 1/8T, 1/16, 1/16T) with feedback and mix

### Controls
- **Mute / Solo** per instrument
- **Save / Load / Delete** patterns to localStorage
- **Keyboard shortcuts**:
  - `Space` — play / stop
  - `1`–`9`, `0`, `-` — trigger drums
  - `Shift` + number — toggle mute
  - `Arrow Up / Down` — nudge tempo
- **Master volume** knob
- **Color wheel** — customizable accent color (persisted across sessions)
- **Waveform visualiser** — real-time oscilloscope display
- **PWA / offline support** — installable, works without internet
- **Mobile-optimised layout** — responsive design with touch-friendly controls

## Getting Started

### Run Locally
No build step required. Serve the files with any static server:

```bash
# Python
python -m http.server 8000

# PHP
php -S localhost:8000
```

Then open `http://localhost:8000` in your browser.

### Deploy to GitHub Pages
1. Go to your repo **Settings → Pages**
2. Under **Source**, select **Deploy from a branch**
3. Choose **main** branch, **/ (root)** folder
4. Click **Save**
5. Your site will be live at `https://lockedown.github.io/MNCdrumclone/`

## Project Structure

```
├── index.html          # Main HTML
├── style.css           # All styles
├── manifest.json       # PWA manifest
├── sw.js               # Service worker (offline caching)
├── icons/              # PWA icons (192×192, 512×512)
├── js/
│   ├── constants.js    # Global constants, drum definitions
│   ├── presets.js      # Built-in drum patterns
│   ├── euclidean.js    # Bjorklund algorithm
│   ├── rotary-knob.js  # Custom rotary knob UI
│   ├── audio-engine.js # Web Audio synthesis & FX chain
│   ├── color-wheel.js  # Accent color picker
│   ├── visualiser.js   # Waveform oscilloscope
│   ├── sequencer.js    # Pattern grid, scheduling, state
│   ├── keyboard.js     # Keyboard shortcuts
│   └── app.js          # Entry point
└── README.md
```

## Tech Stack
- **Vanilla JavaScript** — no frameworks
- **Web Audio API** — all sounds synthesized in real-time
- **CSS Variables** — dynamic theming
- **Service Worker** — offline-capable PWA

## License
© MNCWare 2026
