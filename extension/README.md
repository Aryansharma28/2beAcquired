# poof Connector

A small Chrome (and Firefox) extension that lets poof sell on **your** Marktplaats
account. Marktplaats has no "Log in with…" for apps and blocks robot logins, so you
log in normally in your own browser and this extension, with your OK, hands that
session to poof and keeps it fresh. poof never sees your password.

## Install (unpacked)

1. Get the folder: this `extension/` directory, or unzip `poof-connector.zip`.
2. Chrome: open `chrome://extensions`, turn on **Developer mode** (top right),
   click **Load unpacked**, pick the `extension/` folder.
   Firefox: `about:debugging#/runtime/this-firefox` → **Load Temporary Add-on** →
   pick `manifest.json`.
3. Pin it (puzzle icon → pin **poof Connector**).

## Connect

1. Log in to [marktplaats.nl](https://www.marktplaats.nl/account/login.html) as usual.
2. In the poof app tap **Connect Marktplaats** to get a 6-digit code (valid 15 min).
3. Open the extension, type or paste the code, read what you're agreeing to, tap
   **Allow poof to sell for me**.

The popup then shows *Connected as {name} · session last synced …*. If the toolbar
icon shows a red **!**, Marktplaats logged you out: log in again and poof carries on.

## Pointing it at a poof deployment

- Default: `POOF_URL` in `config.js` (`https://poof-app.vercel.app`). If you change
  the host there, also change the matching entry in `host_permissions` in
  `manifest.json` (`npm run check` will complain if they differ).
- Per browser, no rebuild: popup → **Advanced** → *poof address* → Save. Chrome asks
  for permission to talk to that address. `https://` only, except `http://localhost`
  / `http://127.0.0.1` for local dev. **Reset to default** undoes it.

## What it sends, and when

Only marktplaats.nl cookies, only to your poof address, only over https (or localhost).

| When | Request | Body |
|---|---|---|
| You tap **Allow** | `POST {POOF_URL}/api/connect/claim` | `{ code, cookies, userAgent, mpUser: {id, name}, extVersion }` |
| Every 6 h, and ~60 s after marktplaats.nl cookies change (right away-ish if `MpSession` changed, otherwise at most every 10 min), and on **Sync now** | `POST {POOF_URL}/api/connect/refresh` | `{ deviceToken, cookies, userAgent }` |
| You tap **Disconnect** | `POST {POOF_URL}/api/connect/disconnect` | `{ deviceToken }` |

`cookies` are in Playwright `storageState` format:
`{ name, value, domain, path, expires (-1 = session), httpOnly, secure, sameSite: "Strict"|"Lax"|"None" }`.
Before every claim/refresh the extension calls
`https://www.marktplaats.nl/identity/v2/api/user` to confirm you're logged in. It
won't sync if you're logged out, or if a *different* Marktplaats account is logged
in than the one you connected. Cookie values are never logged.

Stored locally (`chrome.storage.local`): the device token poof issued, your
Marktplaats name and id, last sync time, and the optional custom poof address.

## Disconnect

Popup → **Disconnect** (tap twice). That tells poof to delete the stored session and
clears everything in the extension. You can also disconnect from the poof app's
settings; the extension notices on its next sync and resets itself. Removing the
extension stops syncing but doesn't delete the session on poof's side, so
disconnect first.

## Heads-up

Automated selling may go against Marktplaats's terms, and your account could be
restricted. poof posts ads, reads and answers buyer messages, changes prices and
removes ads for you.

## Development

```sh
npm run check   # manifest fields, permissions, referenced files, icons, no remote code
npm test        # unit tests for lib.js (cookie mapping, code/URL validation, throttle)
npm run icons   # regenerate icons/*.png (pure node, no deps)
npm run zip     # check + build dist/poof-connector.zip to share
```

Preview the popup without installing: serve this folder over http and open
`popup.html?mock=loggedout|connect|connecting|error|success|connected|relogin`.
Screenshots are in `screenshots/`.
