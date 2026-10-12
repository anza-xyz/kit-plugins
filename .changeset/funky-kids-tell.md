---
'@solana/kit-plugin-wallet': patch
---

Don't silently reconnect to a saved wallet when more than one registered wallet has its name. The saved connection only records the wallet's name, and any script on the page can register a wallet with an existing wallet's name, so auto-connect could otherwise reconnect to an impostor. The store now stays disconnected instead, including when a wallet with the same name registers while the silent reconnect is in flight. The saved connection is kept, so auto-connect resumes on a later load if the duplicate is gone.
