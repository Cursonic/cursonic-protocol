# Cursonic

Your personal squad of autonomous agents. Open source, local-first, built on Solana.

[![Live site](https://img.shields.io/badge/live-cursonic.xyz-0fc476?style=flat-square)](https://cursonic.xyz)
![Chain](https://img.shields.io/badge/chain-Solana-0fc476?style=flat-square)
![License](https://img.shields.io/badge/license-MIT-lightgrey?style=flat-square)

| | |
|---|---|
| Chain | Solana |
| Contract address | `pending` |

## Overview

Cursonic is a landing site and live market board for a squad of autonomous agents that run on your own hardware. The site pulls public Solana pair data and ranks the ten busiest pairs by daily volume.

## Features

- Pinned contract-address bar with click-to-copy, inert until an address is confirmed
- Live Solana board: price, daily move, volume, liquidity, per-token copy button
- Ticker and table share one data source, refresh every minute, rest while the tab is hidden
- Exponential backoff with last-good data kept on failure
- Register-driven external facts: unstated links render inert
- Scroll-reveal springs, hero parallax, spotlight hover, reduced-motion fallback

## Links

- Site: https://cursonic.xyz
- X: pending
- GitHub: pending

## Develop

```bash
npm run build   # writes dist/
npm run gates   # runs every check against dist/
npm run serve   # serves dist/ on http://localhost:4173
```

Deploy by uploading `dist/` to Cloudflare Pages.

## License

MIT, see [LICENSE](LICENSE).
