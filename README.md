# AgentVouch

Vouch for another Agent ID holder. One vouch per pair, withdrawable at any time, and the full trust graph is readable on chain.

Built for the Binance Wallet x BNB Chain Agent ID Hackathon.

## Contract

- Network: BNB Smart Chain
- Contract: [`0x1f1d809aAA58F8478540731F57F572112C1B6aE8`](https://bscscan.com/address/0x1f1d809aAA58F8478540731F57F572112C1B6aE8#code)
- Source: `AgentVouch.sol` (verified on BscScan, exact match)
- Names are resolved on chain through the Agent ID registry, so a name always means the address that holds that Agent ID.

## How to use

1. Open the site (this repo, GitHub Pages) and connect a wallet that holds an Agent ID.
2. Enter the Agent ID name of the agent you want to vouch for, or open someone's profile link (`#alice.ai`).
3. Confirm the transaction in your wallet. You can withdraw your vouch later if you change your mind.

## Run it yourself

The site is a static page. Serve this folder with any static file server, or deploy it to GitHub Pages from the main branch.
