# urlmonitor

Local watchdog. It checks one or more URLs on a timer, skips those checks when your laptop is offline, and plays a sound only when a target goes down or the internet drops. After sleep, it runs a check immediately instead of waiting out the rest of the interval.

## Install

```bash
npm install -g urlmonitor
```

Or from this folder:

```bash
npm link
```

## Configure

The config lives in your home directory, not in the project:

```bash
urlmonitor init
```

That writes `~/.urlmonitor-config.js` from the example, if the file is not already there. Edit `urls` and leave the rest alone unless you need to.

```js
module.exports = {
  urls: [
    "https://example.com/",
  ],
  pollMs: 60 * 60 * 1000,
  timeoutMs: 8000,
  failureThreshold: 2,
  resumeGapFactor: 1.5,
  connectivityUrls: [
    "https://www.google.com/generate_204",
    "https://cloudflare.com/cdn-cgi/trace",
  ],
  alertSoundFile: "",
  alertSoundCmd: "",
};
```

- `urls` — endpoints to watch
- `pollMs` — interval between cycles (default one hour)
- `timeoutMs` — request timeout
- `failureThreshold` — consecutive failures before the down alert
- `resumeGapFactor` — how large an idle gap must be before it counts as a wake from sleep
- `connectivityUrls` — probes used to tell “the internet is down” from “this site is down”
- `alertSoundFile` — audio file for macOS `afplay`
- `alertSoundCmd` — command to play a sound on other systems

## Run

```bash
urlmonitor
```

Pass URLs to watch something else for this run only. The home file stays as it is.

```bash
urlmonitor https://site-a.example/health https://site-b.example/
```

```bash
urlmonitor --poll-ms 20000 --timeout-ms 5000 --threshold 1
```

Each cycle checks connectivity first. If that fails, the alert sounds once, target checks are skipped, and they resume when connectivity returns.
