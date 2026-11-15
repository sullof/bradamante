# Bradamante

Bradamante is the woman knight of Matteo Maria Boiardo's *Orlando Innamorato* and Ludovico Ariosto's *Orlando Furioso*. She crosses the poem with her lance, looking for Ruggiero, and does not stay home. The program takes her name for that: a knight out of a romance, on watch.

Local watchdog. It checks one or more URLs on a timer, skips those checks when your laptop is offline, and plays a sound only when a target goes down or the internet drops. After sleep, it runs a check immediately instead of waiting out the rest of the interval.

## Install

```bash
npm install -g bradamante
```

## Configure

The first run creates `~/.bradamante-config.js`. Pass the sites, separated by commas or spaces. The other settings are the defaults.

```bash
bradamante https://example.com/,https://example.org/
```

The program writes the file and starts watching. After that, change the list by editing `~/.bradamante-config.js`. Passing sites again does not overwrite it.

```js
module.exports = {
  urls: [
    "https://example.com/",
    "https://example.org/",
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

Once the file exists:

```bash
bradamante
```

Each cycle checks connectivity first. If that fails, the alert sounds once, target checks are skipped, and they resume when connectivity returns.

## Copyright

Copyright © 2026 Francesco Sullo <francesco@sullo.co>.

Released under the [GNU General Public License v3.0](LICENSE.md).

