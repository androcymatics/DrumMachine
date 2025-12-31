# 🥁 Drum One-Shot Generator

A local web application for music producers to generate new drum one-shots by layering and processing existing samples.

![Drum One-Shot Generator](https://img.shields.io/badge/status-MVP-green) ![License](https://img.shields.io/badge/license-MIT-blue)

## Features

- **Library Management**: Scan folders for .wav/.aiff samples, auto-categorize by filename
- **Sample Browser**: Search, filter by category (kick/snare/hat/clap/perc/other), audition samples
- **Layer Generator**: Combine Body + Transient + optional Texture samples
- **Processing Controls**:
  - Body pitch shift (±12 semitones)
  - Transient gain adjustment
  - Texture high-pass filter
  - Saturation/drive
  - Silence trimming
  - Peak normalization
- **Output Management**: Browse and preview generated files

## Requirements

- **Node.js** v18+ 
- **FFmpeg** installed and available in PATH
- **npm** or **pnpm**

### Installing FFmpeg

**macOS (Homebrew):**
```bash
brew install ffmpeg
```

**Windows (Chocolatey):**
```bash
choco install ffmpeg
```

**Ubuntu/Debian:**
```bash
sudo apt update && sudo apt install ffmpeg
```

Verify installation:
```bash
ffmpeg -version
```

## Project Structure

```
Drum machine/
├── backend/                 # Node.js + Fastify + TypeScript server
│   ├── src/
│   │   ├── index.ts        # Server entry point & routes
│   │   ├── library.ts      # Sample scanning & indexing
│   │   ├── generator.ts    # FFmpeg audio processing
│   │   └── types.ts        # TypeScript interfaces
│   ├── package.json
│   └── tsconfig.json
├── frontend/               # Vite + React + TypeScript UI
│   ├── src/
│   │   ├── components/
│   │   │   ├── Library.tsx
│   │   │   ├── Generator.tsx
│   │   │   └── Output.tsx
│   │   ├── api.ts          # Backend API client
│   │   ├── types.ts
│   │   ├── App.tsx
│   │   └── main.tsx
│   ├── package.json
│   └── vite.config.ts
└── README.md
```

## Quick Start

### 1. Install Dependencies

Open two terminal windows/tabs:

**Terminal 1 - Backend:**
```bash
cd backend
npm install
```

**Terminal 2 - Frontend:**
```bash
cd frontend
npm install
```

### 2. Start the Servers

**Terminal 1 - Backend (port 3001):**
```bash
cd backend
npm run dev
```

**Terminal 2 - Frontend (port 5173):**
```bash
cd frontend
npm run dev
```

### 3. Open the App

Navigate to **http://localhost:5173** in your browser.

## Usage Guide

### 1. Add Your Sample Library

1. Go to the **Library** tab
2. Paste a folder path containing your drum samples (e.g., `/Users/you/Samples/Drums`)
3. Click **Add Folder** - the app will recursively scan for .wav and .aiff files
4. Samples are auto-categorized based on filename keywords:
   - `kick`, `bd`, `bass drum` → Kick
   - `snare`, `snr`, `sd`, `rim` → Snare
   - `hat`, `hh`, `hihat`, `cymbal` → Hat
   - `clap`, `clp` → Clap
   - `perc`, `tom`, `conga` → Perc
   - Everything else → Other

### 2. Select Samples for Layering

In the Library tab, use the **Body**, **Trans**, and **Texture** buttons next to each sample to assign them to generator slots:

- **Body**: Main low-end/body of the sound (e.g., a processed 808 kick)
- **Transient**: Attack/click layer (e.g., acoustic kick beater click)
- **Texture**: Optional noise/character layer (e.g., vinyl crackle, room tone)

### 3. Configure Processing

Switch to the **Generator** tab and adjust:

| Parameter | Range | Description |
|-----------|-------|-------------|
| Body Pitch | ±12 st | Pitch shift body sample up/down |
| Trans Gain | ±12 dB | Boost/cut transient layer |
| Texture HP | 20-2000 Hz | High-pass filter on texture |
| Saturation | 0-100% | Soft clipping/drive amount |
| Trim Thresh | -80 to -20 dB | Silence detection threshold |
| Norm Peak | -6 to 0 dB | Output peak normalization |

### 4. Generate

1. Set your **Output Folder** path
2. Optionally add a **Descriptor** (e.g., "Punchy", "Dark")
3. Click **Generate One-Shot**

Output naming: `ANDRO_<CATEGORY>_<Descriptor>_<###>.wav`

### 5. Manage Outputs

The **Output** tab shows all generated files with:
- Play/preview buttons
- File size and creation date
- Delete option

## API Reference

### Library Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/library/add-folder` | Add folder to library |
| GET | `/library/folders` | List indexed folders |
| DELETE | `/library/folder?path=` | Remove folder |
| GET | `/library/search?q=&category=` | Search samples |
| GET | `/library/stats` | Library statistics |

### Audio Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/audio/preview?path=` | Stream audio file |

### Generator Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/generate/layer` | Generate layered sample |
| GET | `/generate/next-number?outputDir=&prefix=` | Get next file number |

### Output Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/output/list?outputDir=` | List output files |
| DELETE | `/output/file?path=` | Delete output file |

## Technical Notes

### FFmpeg Processing Chain

The generator uses this FFmpeg filter chain:

1. **Body**: Pitch shift via `asetrate` + `aresample`
2. **Transient**: Gain via `volume` filter
3. **Texture**: High-pass via `highpass` filter
4. **Mix**: `amix` to combine layers
5. **Saturation**: `volume` + `alimiter` for soft clipping
6. **Trim**: `silenceremove` from start/end
7. **Normalize**: `alimiter` for peak limiting
8. **Output**: 24-bit WAV (`pcm_s24le`)

### Library Storage

Sample metadata is stored in `backend/library.json`:

```json
{
  "folders": ["/path/to/samples"],
  "samples": [
    {
      "id": "uuid",
      "path": "/path/to/sample.wav",
      "name": "kick_punchy",
      "duration": 0.5,
      "sampleRate": 44100,
      "channels": 2,
      "peakDb": -3.2,
      "category": "kick"
    }
  ],
  "lastUpdated": "2024-01-01T00:00:00.000Z"
}
```

## Troubleshooting

### "Backend Offline" Error
- Ensure backend is running on port 3001
- Check terminal for errors

### "FFmpeg not found"
- Verify FFmpeg is installed: `ffmpeg -version`
- Ensure it's in your system PATH

### Samples Not Found
- Use absolute paths when adding folders
- Check file permissions
- Supported formats: .wav, .aiff, .aif

### Audio Won't Play
- Check browser console for CORS errors
- Ensure backend is running
- Verify file path exists

## Future Enhancements (Post-MVP)

- [ ] SQLite database for larger libraries
- [ ] Waveform visualization
- [ ] Drag-and-drop sample selection
- [ ] Preset saving/loading
- [ ] Batch generation
- [ ] More processing options (compression, EQ)
- [ ] Sample pack export
- [ ] Dark/light theme toggle

## License

MIT © ANDRO

---

Made with 🥁 for music producers

