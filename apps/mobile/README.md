# Compass Neo for phones

Expo SDK 58 (React Native 0.88, expo-router), on the same Convex backend as the web app. It runs in **Expo Go**, so it
uses only the native modules Expo Go ships with: no development build needed.

## Run it from anywhere

```sh
bun run dev:mobile          # at the repo root (or `bun run remote` here)
```

That starts Metro on 8081 and serves it at **https://8081.fent.cloud**. In Expo Go, scan the QR code it prints or type
`exps://8081.fent.cloud` (exps is Expo Go's https). Edits hot reload over the same tunnel.

How it reaches the phone: the cloudflared tunnel on the dev machine sends every `*.fent.cloud` name to the dev router on
`127.0.0.1:8099` (`~/.cloudflared/dev-router.js`, started by `run-router.cmd`). The router reads the port from the first
label of the hostname and proxies to `localhost:<port>`, WebSockets included. `scripts/remote.mjs` sets
`EXPO_PACKAGER_PROXY_URL=https://8081.fent.cloud`, so the manifest Expo Go downloads points its bundle, assets and hot
reload back through the tunnel instead of at a LAN address. Both the tunnel and the router have to be running.

`PORT=8082 bun run remote` serves on 8082.fent.cloud. `REMOTE_HOST=...` uses another name that reaches
localhost. Anything after `--` goes to `expo start` (for example `bun run remote -- --clear`).

Anyone with the address can load the development bundle. It holds no secrets (the Convex URL is public, and every
query needs the student's own token), but stop the server when you're done.

On the same Wi-Fi, a plain `bun run start` and the LAN QR code work too.

## Env

`apps/mobile/.env.local` needs `EXPO_PUBLIC_CONVEX_URL`: the `CONVEX_URL` from `packages/backend/.env.local`, the same
deployment as the web's `VITE_CONVEX_URL`.

## Builds

EAS builds in the cloud (`eas.json`), each profile with its own Convex URL (`.env.local` is not uploaded):

```sh
bunx eas-cli build -p android --profile preview      # an installable APK, on prod
bunx eas-cli build -p ios --profile production       # the App Store build, on prod; first run signs in to Apple
bunx eas-cli submit -p ios --latest                  # to TestFlight
```

Android's signing key lives on Expo's servers. Push on Android needs FCM credentials uploaded to EAS
(`eas credentials`); until then turning notifications on reports it failed.

## Layout

```
src/app/            routes (expo-router): login, (tabs)/{index,todo,grades,me}, class/[code]
src/features/       each screen's parts
src/lib/            the data layer, ported from apps/web/app/lib/neo: session, sync, timetable, days, schools
src/theme/          Glaze's tokens for React Native: the palettes, class colours, spacing, type
src/components/     the UI kit (Card, Button, Field, Row, Chip, ...) and the Neo mark
```

The device token lives in the keychain (expo-secure-store). The rest the phone keeps (the profile, the days it last saw,
recent schools, the theme) lives in AsyncStorage. All of it is read before the splash screen goes, so the app opens on
yesterday's data while Convex catches up.

`bun run typecheck` here, as with the other packages.
