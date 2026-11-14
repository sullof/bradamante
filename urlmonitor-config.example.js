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
