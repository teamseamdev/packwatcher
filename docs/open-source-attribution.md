# Open Source Attribution

PackWatcher may use open-source projects as architectural references for monitoring,
state reduction, notification queues, and diagnostics. No source code from the
projects below is copied into PackWatcher in the current implementation.

## Reviewed References

| Project | License | Current PackWatcher Use | Notes |
| --- | --- | --- | --- |
| `jef/streetmerchant` | MIT | Architectural reference only | Useful reference for retailer-specific monitor isolation, retry behavior, and notification-provider separation. No code copied. |
| `dgtlmoon/changedetection.io` | Apache-2.0 | Architectural reference only | Useful reference for durable observation history and change detection. No code copied. |
| `clucraft/PriceGhost` | Not imported | Architectural reference only | No code copied. License and exact files must be reviewed before any future reuse. |
| OpenCV.js documentation/examples | Apache-2.0/BSD-style project licensing depending on distribution | Runtime library loaded from official OpenCV docs CDN; no source copied | Centering Check uses OpenCV.js in the browser for contour detection and perspective correction when available. PackWatcher-owned fallback code handles detection when OpenCV cannot load. |
| `react-easy-crop` | MIT | Reviewed as UI reference only | PackWatcher did not copy code. Current corner/frame adjustment UI is custom. |
| Browser `HTMLVideoElement` / Canvas APIs | Web platform APIs | Used directly | Video Rip Analysis extracts local video frames with browser video seeking and canvas drawing. No third-party code copied. |
| `ffmpeg.wasm` | MIT wrapper; bundled FFmpeg core may include LGPL/GPL components depending build | Reviewed, not imported | Not added to the client bundle for this version because native browser decoding keeps uploaded video local without a heavy WASM payload. |

## Current Policy

- Do not copy retailer-specific bypass logic, credentials, session cookies, or anti-bot evasion techniques.
- Do not copy UI assets, branding, or proprietary retailer configurations.
- Do not copy proprietary grading-app algorithms, measurement datasets, or grading-company branding.
- If PackWatcher imports code from an open-source project later, record:
  - repository URL
  - exact file path and commit SHA
  - license
  - compatibility review
  - attribution requirements
  - local PackWatcher files using the code
