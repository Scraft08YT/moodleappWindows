# Moodle Desktop – Windows App

> Eine native Windows-Desktop-Anwendung für Moodle LMS, gebaut mit **Tauri v2** + **Angular 19** und **Windows 11 Fluent Design**.

![Windows 11](https://img.shields.io/badge/Windows%2011-0078D4?logo=windows11&logoColor=white)
![Tauri v2](https://img.shields.io/badge/Tauri%20v2-24C8D8?logo=tauri&logoColor=white)
![Angular 19](https://img.shields.io/badge/Angular%2019-DD0031?logo=angular&logoColor=white)

---

## Features

| Feature | Beschreibung |
|---------|-------------|
| **Login** | Anmeldung an beliebiger Moodle-Instanz per URL + Benutzername/Passwort |
| **Dashboard** | Übersicht mit Begrüßung, Statistik-Karten, neueste Kurse, kommende Termine |
| **Kurse** | Kursübersicht mit Suche, Favoriten-Filter, Kurs-Details mit Abschnitten & Modulen |
| **Nachrichten** | Split-View-Chat mit Konversationsliste und Nachrichtendetail |
| **Kalender** | Monatsansicht mit Terminen + Liste der nächsten Termine |
| **Benachrichtigungen** | Alle Moodle-Benachrichtigungen mit Gelesen/Ungelesen-Status |
| **Dateien** | Private Dateien durchsuchen & herunterladen mit Fortschrittsanzeige |
| **Einstellungen** | Theme-Auswahl (Hell/Dunkel/System), Kontoinformationen, Cache |

## Design

- **Windows 11 Fluent Design** mit Mica-Hintergrund-Effekt
- **Benutzerdefinierte Titelleiste** (frameless window) mit nativen Steuerelementen
- **NavigationView-Sidebar** mit Collapse-Funktion (Windows 11 Pattern)
- **Animationen** mit Fluent Design Motion Curves
- **Dark/Light Theme** mit automatischer System-Erkennung

## Architektur

```
windows-app/
├── src-tauri/               # Rust-Backend (Tauri v2)
│   ├── src/
│   │   ├── main.rs          # App-Einstiegspunkt, Plugin-Registrierung, Mica-Effekt
│   │   ├── commands.rs      # IPC-Kommandos (Version, Fenster-Effekte)
│   │   └── lib.rs           # Mobile-Target-Stub
│   ├── capabilities/        # Tauri-Berechtigungen
│   ├── icons/               # App-Icons
│   ├── Cargo.toml           # Rust-Abhängigkeiten
│   └── tauri.conf.json      # Tauri-Konfiguration
├── src/                     # Angular-Frontend
│   ├── app/
│   │   ├── core/
│   │   │   ├── models/      # TypeScript-Typdefinitionen
│   │   │   ├── services/    # Auth, API, Theme, Storage, etc.
│   │   │   ├── guards/      # Route Guards
│   │   │   └── interceptors/# HTTP Interceptors
│   │   ├── features/        # Feature-Seiten (Login, Dashboard, Kurse, ...)
│   │   └── shared/          # Wiederverwendbare Komponenten (Shell, Sidebar, Titlebar)
│   ├── styles/              # SCSS-Basis (Fluent Design Tokens, Mixins, Animationen)
│   ├── assets/              # Bilder, Icons
│   └── environments/        # Umgebungskonfiguration
├── angular.json
├── package.json
└── tsconfig.json
```

### Technologie-Stack

| Schicht | Technologie |
|---------|-------------|
| **Runtime** | Tauri v2 (Rust + WebView2) |
| **Frontend** | Angular 19 (Standalone Components, Signals) |
| **Styling** | SCSS mit Fluent Design Tokens |
| **State** | Angular Signals |
| **Backend-API** | Moodle Web Services (REST) |
| **Speicher** | Tauri Store Plugin + localStorage Fallback |
| **Downloads** | Tauri HTTP Plugin mit Fortschritt |
| **Notifications** | Tauri Notification Plugin (Windows Toast) |

## Voraussetzungen

- **Node.js** ≥ 18
- **Rust** (stable toolchain) – [rustup.rs](https://rustup.rs)
- **WebView2** (auf Windows 10/11 vorinstalliert)
- **Visual Studio Build Tools** (für Rust-Kompilierung auf Windows)

## Setup

```bash
cd windows-app

# Node-Abhängigkeiten installieren
npm install

# Entwicklungsserver starten (Angular + Tauri)
npm run tauri:dev

# Produktion-Build (erstellt .msi + .exe Installer)
npm run tauri:build
```

## Scripts

| Befehl | Beschreibung |
|--------|-------------|
| `npm start` | Angular Dev-Server (localhost:4200) |
| `npm run build:prod` | Angular Production-Build |
| `npm run tauri:dev` | Tauri + Angular Entwicklungsmodus mit Hot-Reload |
| `npm run tauri:build` | Produktion-Build mit Installer-Erstellung (.msi/.exe) |

## Moodle Web Services

Die App nutzt folgende Moodle-WS-Funktionen:

- `core_webservice_get_site_info` – Site- und Benutzerinformationen
- `core_enrol_get_users_courses` – Eingeschriebene Kurse
- `core_course_get_contents` – Kursinhalte (Abschnitte & Module)
- `core_message_get_conversations` – Konversationen
- `core_message_send_instant_messages` – Nachrichten senden
- `core_calendar_get_action_events_by_timesort` – Kommende Termine
- `core_calendar_get_calendar_monthly_view` – Monatskalender
- `message_popup_get_popup_notifications` – Benachrichtigungen
- `core_files_get_files` – Private Dateien

## Lizenz

Moodle Desktop ist lizenziert unter der **GNU General Public License v3.0** gemäß dem Moodle-Projekt.
