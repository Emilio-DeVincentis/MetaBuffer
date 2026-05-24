# MetaBuffer State Engine — Deployment & Development Guide (DEPLOY.md)

This document provides instructions for setting up the development environment, building the application, and deploying the MetaBuffer State Engine.

## 1. Prerequisites
To work on this project, you need:
- **Node.js**: Version 18.0 or higher.
- **Neutralino CLI**: Install globally via npm:
  ```bash
  npm install -g @neutralinojs/neu
  ```

## 2. Local Development

### Neutralino Mode (Desktop)
1. Install dependencies:
   ```bash
   npm install
   ```
2. Run the application in development mode:
   ```bash
   npm run dev
   ```
   This will open the desktop window with hot-reload (if configured in `neutralino.config.json`).

### Web Fallback Mode (Browser)
If you don't have Neutralino installed or want to test browser behavior:
1. Run a local static server:
   ```bash
   npm run dev:web
   ```
2. Open `http://localhost:8000` (or the port provided by the server).
   - In this mode, the system will fallback to **IndexedDB** for persistence and mock the process execution.

## 3. Build for Production

### Desktop Executable
To generate the production binaries for Windows, Linux, and macOS:
1. Run the build script:
   ```bash
   npm run build:neutralino
   ```
2. The output will be located in the `dist/` directory.

### Web Bundle
The project is built as a zero-dependency ESM application. To deploy to the web, simply serve the root directory containing `ui/` and `src/` using any static web server (Nginx, Vercel, etc.).

## 4. Configuration

The MetaBuffer System is configured via code and JSON files.

### `neutralino.config.json`
- `resourcesPath`: Path to application resources.
- `clientLibrary`: Location of the `neutralino.js` client library.

### Kernel Parameters (in `src/core/MetaBufferRuntime.js`)
- `snapshotInterval`: Frequency of structural snapshots (default: 50). Decreasing this improves state reconstruction speed but increases memory usage.

### Shell Storage Mode (in `src/app/Shell.js`)
- The Shell automatically detects the environment:
  - **Neutralino detected**: Uses FileSystem (`session.json`).
  - **Browser only**: Uses IndexedDB (`MetaBufferDB`).

## 5. Troubleshooting

### "Neutralino not detected"
- **Cause**: Running the app via a regular browser instead of `neu run`.
- **Fix**: This is expected behavior for web fallback. If you intended to run the desktop app, ensure you use the CLI.

### "CRITICAL: session.tmp detected"
- **Cause**: A previous write operation was interrupted, leaving a temporary file.
- **Fix**: Delete `./session.tmp` manually and restart the app. The system blocks boot to prevent data corruption.

### "TypeError: MetaBufferRuntime is not a constructor"
- **Cause**: Attempting to use the old class-based API.
- **Fix**: Use the functional API: `import * as Runtime from '../core/MetaBufferRuntime.js'` and `Runtime.createInitialState()`.

### Common Command Failures
- Ensure you have correctly registered all required buffers (Root, Editor, etc.) before dispatching events.
