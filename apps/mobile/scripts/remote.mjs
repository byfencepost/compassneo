#!/usr/bin/env node
/**
 * The dev server, reachable from anywhere: `bun run remote` (or `bun run dev:mobile` at the repo root).
 *
 * The cloudflared tunnel on this machine sends every *.fent.cloud name to the dev router on :8099
 * (~/.cloudflared/dev-router.js), which reads the port off the first label and proxies to localhost:<port>,
 * WebSockets included. So Metro on 8081 is https://8081.fent.cloud with nothing to configure, and
 * EXPO_PACKAGER_PROXY_URL makes the manifest point Expo Go's bundle, assets and hot reload there too.
 *
 * Expo Go opens it as exps://8081.fent.cloud (exps is Expo Go's https). Expo's own banner prints
 * exp://8081.fent.cloud:443, plain http to an https port, so the QR printed here is the one to scan.
 *
 *   PORT=8082 bun run remote           another port (8082.fent.cloud)
 *   REMOTE_HOST=phone.example.com ...  another name that reaches localhost:<port>
 *   bun run remote -- --clear          anything after -- goes to `expo start`
 */
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import qrcode from "qrcode-terminal";

const require = createRequire(import.meta.url);
const port = Number(process.env.PORT ?? 8081);
const host = process.env.REMOTE_HOST ?? `${port}.fent.cloud`;
const https = `https://${host}`;
const expoGo = `exps://${host}`;

qrcode.generate(expoGo, { small: true }, code => {
  console.log(`\n  Compass Neo, remote\n\n${code}\n  Expo Go:  ${expoGo}   (scan this, or type it into Expo Go)`);
  console.log(`  Manifest: ${https}\n  Ignore the exp://${host}:443 in Expo's banner below; it means the same server over plain http.\n`);
});

const expo = spawn(process.execPath, [require.resolve("expo/bin/cli"), "start", "--port", String(port), ...process.argv.slice(2)], {
  stdio: "inherit",
  env: { ...process.env, EXPO_PACKAGER_PROXY_URL: https },
});
for (const sig of ["SIGINT", "SIGTERM"]) process.on(sig, () => expo.kill(sig));
expo.on("exit", code => process.exit(code ?? 0));
