---
'@solana/kit-plugin-wallet': patch
---

Only pass through wallet and account icons that are `data:image/` URIs, as the Wallet Standard requires. An account icon that isn't one is omitted, and a wallet icon that isn't one is replaced with a blank placeholder image, so apps never render an icon from a URL chosen by the wallet.
