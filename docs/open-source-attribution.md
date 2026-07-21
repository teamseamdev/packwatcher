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

## Current Policy

- Do not copy retailer-specific bypass logic, credentials, session cookies, or anti-bot evasion techniques.
- Do not copy UI assets, branding, or proprietary retailer configurations.
- If PackWatcher imports code from an open-source project later, record:
  - repository URL
  - exact file path and commit SHA
  - license
  - compatibility review
  - attribution requirements
  - local PackWatcher files using the code
