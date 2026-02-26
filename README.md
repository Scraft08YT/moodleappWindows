<!-- omit in toc -->
# Moodle Desktop for Windows

A modern Windows desktop client for [Moodle LMS](https://moodle.org), built with **Tauri v2** and **Angular 19**.
Featuring Windows 11 Fluent Design with Mica backdrop, offline support, and in-app auto-updates.

![Windows](https://img.shields.io/badge/platform-Windows%2010%2F11-blue?logo=windows)
![Tauri](https://img.shields.io/badge/Tauri-v2-orange?logo=tauri)
![Angular](https://img.shields.io/badge/Angular-19-red?logo=angular)
![License](https://img.shields.io/badge/license-Apache%202.0-green)

---

## Features

- **Fluent Design** — Mica backdrop, custom titlebar, acrylic sidebar, dark/light mode
- **Course Management** — Browse courses, view modules, download files
- **Dashboard** — Overview of enrolled courses, upcoming events, recent activity
- **Offline Mode** — Cached API responses with automatic fallback when offline
- **File Downloads** — Download course files, track & re-open them without re-downloading
- **In-App Updates** — Automatic updates via GitHub Releases with signature verification
- **Calendar** — View and track upcoming events and deadlines
- **Grades** — View course grades at a glance
- **Messages & Notifications** — Stay connected with course messages and alerts
- **Private Files** — Access your Moodle private file area
- **Profile** — View and manage your Moodle profile
- **Settings** — Theme selection, cache management, update control

## Screenshots

> *Coming soon*

## Installation

### Download

Download the latest installer from [**Releases**](https://github.com/Scraft08YT/moodleappWindows/releases):

- `Moodle Desktop_x.x.x_x64-setup.exe` — NSIS Installer (recommended)
- `Moodle Desktop_x.x.x_x64_en-US.msi` — MSI Installer

### Requirements

- Windows 10 (1803+) or Windows 11
- [WebView2 Runtime](https://developer.microsoft.com/en-us/microsoft-edge/webview2/) (pre-installed on Windows 10/11)

## Development

### Prerequisites

- [Node.js](https://nodejs.org) ≥ 20
- [Rust](https://rustup.rs) (stable)
- [Git](https://git-scm.com)

### Setup

```bash
git clone https://github.com/Scraft08YT/moodleappWindows.git
cd moodleappWindows/windows-app
npm install
```

### Run

```bash
# Angular dev server (browser only, no native features)
npm start

# Tauri dev mode (native app with hot-reload)
npm run tauri:dev
```

### Build

```bash
npm run tauri:build
# → Installer output: src-tauri/target/release/bundle/
```

## Tech Stack

| Layer     | Technology                          |
|-----------|-------------------------------------|
| Frontend  | Angular 19, TypeScript, SCSS        |
| Backend   | Tauri v2 (Rust)                     |
| Design    | Windows 11 Fluent Design System     |
| API       | Moodle Web Services (REST)          |
| Offline   | Local response cache with TTL       |
| Updates   | Tauri Updater + GitHub Releases     |

## Project Structure

```
windows-app/
├── src/                    # Angular source code
│   └── app/
│       ├── core/           # Services, guards, models
│       ├── features/       # Feature modules (login, dashboard, courses, …)
│       └── shared/         # Shared layouts & components
├── src-tauri/              # Tauri / Rust backend
│   ├── src/main.rs         # Rust entry point
│   ├── tauri.conf.json     # App configuration
│   └── Cargo.toml          # Rust dependencies
├── package.json            # npm scripts & dependencies
└── angular.json            # Angular CLI configuration
```

## Release Process

Releases are automated via GitHub Actions. To create a new release:

```bash
# 1. Update version in tauri.conf.json and package.json
# 2. Commit and push
git add -A && git commit -m "release: v1.x.x"
git push

# 3. Tag and push
git tag desktop-v1.x.x
git push origin desktop-v1.x.x
```

The workflow builds the app, creates a GitHub Release with installer files, and publishes `latest.json` for the in-app updater.

## License

[Apache 2.0](http://www.apache.org/licenses/LICENSE-2.0)
