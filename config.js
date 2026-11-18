// Contract address (CREATE2 address is also in ../build/deploy-info.json).
window.APP_CONFIG = {
  CONTRACT: "0x1f1d809aAA58F8478540731F57F572112C1B6aE8", // live on BSC mainnet (CREATE2, bytecode = ../build); confirm BscScan verification
  REGISTRY: "0x60B9262456dE011F7d15a54CdD8c48bAaa8B022F", // SPACE ID Agent ID (read-only use)
  CHAIN_ID: 56,
  RPCS: [
    "https://bsc-dataseed.bnbchain.org",
    "https://bsc-dataseed1.binance.org",
    "https://bsc-rpc.publicnode.com",
  ],
  EXPLORER: "https://bscscan.com",
  PAGE_SIZE: 50,
};
