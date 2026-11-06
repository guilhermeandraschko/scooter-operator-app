# Scooter Operator

Android-first field app for a shared-scooter fleet. Operators find a vehicle on the map, talk to it over **Bluetooth** when cellular is down, and log lock/unlock work against a private fleet API.

Built with **Expo 54** (development build — BLE does not run in Expo Go).

The fleet API, TCP/OTA server, and production hosts live in **private** repos. This app is the public client: React Native, BLE session handling, offline command queue, and a map.

## What it demonstrates

- BLE scan → IMEI match → connect → chunked command/ACK protocol
- Online path: authenticated REST (API key) for fleet list, passwords, and audit logs
- Offline path: cached credentials + queued logs flushed when the network returns
- Map of last-known positions (OpenStreetMap)

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for a high-level picture. No production URLs or server secrets are in this repository.

## Prerequisites

- **Node.js 20+** (Metro; Node 18 fails with `configs.toReversed is not a function`)
- npm
- Android Studio / SDK (`expo run:android`)
- Physical Android device for real BLE (emulator cannot scan)

## Configuration

Copy `.env.example` to `.env` and set **`EXPO_PUBLIC_API_BASE_URL`** to *your* fleet API (no trailing slash). There is no hardcoded production host.

- **Emulator → host machine:** `http://10.0.2.2:3000`
- **Physical phone, same Wi‑Fi:** `http://<your-LAN-IP>:3000` (not `localhost`)

Restart Metro after changing `.env`.

## Run

```bash
npm install
npx expo prebuild --platform android   # if you do not commit the generated android/ folder
npx expo run:android
```

Sign in with an operator API key issued by the private fleet server. Viewer can list devices; operator/admin can fetch BLE credentials and post command logs.

## Android SDK not found / `spawn adb ENOENT`

Install [Android Studio](https://developer.android.com/studio), then SDK Platform + Platform-Tools. Typical macOS setup:

```bash
export ANDROID_HOME=$HOME/Library/Android/sdk
export PATH=$PATH:$ANDROID_HOME/platform-tools:$ANDROID_HOME/emulator
```

Verify with `which adb` and `adb devices` (phone: USB debugging on).

## QA checklist

- [ ] Health/devices load with `EXPO_PUBLIC_API_BASE_URL` set
- [ ] BLE: grant Bluetooth + location on Android 12+
- [ ] Scan finds a scooter; lock/unlock returns `+ACK:` lines
- [ ] Offline: commands queue; reconnect and open **Devices** to flush
