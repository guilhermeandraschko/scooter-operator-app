# Architecture (public)

This repo is the **operator client**. The fleet backend is private and is not published here.

```
Operator phone
  ├─ HTTPS ─► fleet API (auth: API key)     list vehicles, fetch BLE creds, audit log
  └─ BLE   ─► scooter                       lock / unlock / locate when LTE is down
```

## Online

1. Sign in with an API key.
2. Load the fleet (list + map).
3. Prefetch per-vehicle BLE credentials and cache them on device.
4. After a BLE action, POST an audit record when the network is up.

## Offline

1. Scan BLE, match a nearby scooter (advertised identity).
2. Use the cached credential for that vehicle.
3. Queue audit logs; flush when Devices is opened online again.

## Code map

| Area | Role |
|------|------|
| `src/screens/` | Login, fleet list, map, BLE control |
| `src/ble/` | Scan, connect, session, IMEI parse, permissions |
| `src/protocol/` | Command builders and ACK parsing |
| `src/services/` | REST client, password cache, offline queue |
| `src/config/api.ts` | Base URL from `EXPO_PUBLIC_API_BASE_URL` only |

Production hosts, OTA/TCP details, and credential schemes for the backend are intentionally omitted.
