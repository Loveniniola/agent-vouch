// Shared wallet + read helpers. Plain EIP-1193: works with any injected EVM wallet.
// Never handles seed phrases, private keys, or pairing codes. All writes go through the
// user's own wallet, which shows its own confirmation prompt.
(function () {
  "use strict";
  const C = window.APP_CONFIG;
  const E = window.ethers;
  const REGISTRY_ABI = [
    "function balanceOf(address) view returns (uint256)",
    "function handleOf(address) view returns (string)",
    "function ownerOfHandle(string) view returns (address)",
  ];

  // EIP-6963 wallet discovery (multiple injected wallets), with window.ethereum fallback.
  const announced = new Map();
  window.addEventListener("eip6963:announceProvider", (e) => {
    if (e.detail && e.detail.info && e.detail.provider) announced.set(e.detail.info.uuid, e.detail);
  });
  window.dispatchEvent(new Event("eip6963:requestProvider"));

  let readProvider = null;
  async function read() {
    if (readProvider) return readProvider;
    const net = E.Network.from(C.CHAIN_ID);
    for (const url of C.RPCS) {
      try {
        const p = new E.JsonRpcProvider(url, net, { staticNetwork: net });
        await p.getBlockNumber();
        readProvider = p;
        return p;
      } catch (_) { /* try next */ }
    }
    throw new Error("No BNB Chain RPC reachable. Check your connection and retry.");
  }

  const state = { eip1193: null, signer: null, address: null };
  const listeners = [];

  function pickWallet() {
    const list = [...announced.values()];
    if (list.length <= 1) return Promise.resolve(list[0] ? list[0].provider : window.ethereum || null);
    // Several wallets installed: let the user choose.
    return new Promise((resolve) => {
      const box = document.createElement("div");
      box.className = "banner ok";
      const t = document.createElement("div");
      t.textContent = "Choose a wallet:";
      box.appendChild(t);
      for (const d of list) {
        const b = document.createElement("button");
        b.className = "secondary";
        b.textContent = d.info.name;
        b.onclick = () => { box.remove(); resolve(d.provider); };
        box.appendChild(b);
      }
      document.querySelector("main").prepend(box);
    });
  }

  async function ensureChain(eip1193) {
    const hex = "0x" + C.CHAIN_ID.toString(16);
    const cur = await eip1193.request({ method: "eth_chainId" });
    if (cur === hex) return;
    try {
      await eip1193.request({ method: "wallet_switchEthereumChain", params: [{ chainId: hex }] });
    } catch (err) {
      if (err && err.code === 4902) {
        await eip1193.request({
          method: "wallet_addEthereumChain",
          params: [{ chainId: hex, chainName: "BNB Smart Chain", nativeCurrency: { name: "BNB", symbol: "BNB", decimals: 18 }, rpcUrls: [C.RPCS[0]], blockExplorerUrls: [C.EXPLORER] }],
        });
      } else throw err;
    }
  }

  async function connect() {
    const eip1193 = await pickWallet();
    if (!eip1193) throw new Error("No browser wallet found. Install a wallet extension, or use the Agentic Wallet CLI commands on this page.");
    await eip1193.request({ method: "eth_requestAccounts" });
    await ensureChain(eip1193);
    const bp = new E.BrowserProvider(eip1193, C.CHAIN_ID);
    state.eip1193 = eip1193;
    state.signer = await bp.getSigner();
    state.address = await state.signer.getAddress();
    if (eip1193.on) {
      eip1193.on("accountsChanged", () => location.reload());
      eip1193.on("chainChanged", () => location.reload());
    }
    listeners.forEach((f) => f(state.address));
    return state.address;
  }

  async function signerOnChain() {
    if (!state.signer) throw new Error("Connect your wallet first.");
    await ensureChain(state.eip1193);
    return state.signer;
  }

  const handleCache = new Map();
  async function handleOf(addr) {
    const k = addr.toLowerCase();
    if (handleCache.has(k)) return handleCache.get(k);
    let h = "";
    try {
      const reg = new E.Contract(C.REGISTRY, REGISTRY_ABI, await read());
      h = await reg.handleOf(addr);
    } catch (_) { h = ""; }
    handleCache.set(k, h);
    return h;
  }

  async function hasAgentId(addr) {
    const reg = new E.Contract(C.REGISTRY, REGISTRY_ABI, await read());
    return (await reg.balanceOf(addr)) > 0n;
  }

  /** Resolve "name", "name.ai" or "0x…" to an address via the Agent ID registry. */
  async function resolveAgent(input) {
    const s = String(input || "").trim();
    if (E.isAddress(s)) return E.getAddress(s);
    const handle = s.replace(/\.ai$/i, "");
    if (!/^\S{1,64}$/.test(handle)) throw new Error("Enter an Agent ID name like alice.ai, or a 0x address.");
    const reg = new E.Contract(C.REGISTRY, REGISTRY_ABI, await read());
    let a = await reg.ownerOfHandle(handle);
    if (a === E.ZeroAddress && handle !== handle.toLowerCase()) a = await reg.ownerOfHandle(handle.toLowerCase());
    if (a === E.ZeroAddress) throw new Error(`${handle}.ai is not a registered Agent ID.`);
    return E.getAddress(a);
  }

  const short = (a) => a.slice(0, 6) + "…" + a.slice(-4);
  async function label(addr) {
    const h = await handleOf(addr);
    return h ? `${h}.ai` : short(addr);
  }

  function bawCommand(to, data, from) {
    return [
      "# 1) Preview (review the simulation output before continuing)",
      `baw contract-call preview --binanceChainId ${C.CHAIN_ID} --from ${from || "<your-agentic-wallet-address>"} --to ${to} --value 0 --inputData ${data} --json`,
      "# 2) If the preview looks right, execute it with the requestId it returned",
      "baw contract-call execute --requestId <requestId> --json",
    ].join("\n");
  }

  /** Human-readable error from a wallet / contract revert. */
  function errMsg(err, iface) {
    if (err && (err.code === "ACTION_REJECTED" || err.code === 4001)) return "You rejected the request in your wallet.";
    const data = err && (err.data || (err.info && err.info.error && err.info.error.data) || (err.error && err.error.data));
    if (iface && typeof data === "string") {
      try { const d = iface.parseError(data); if (d) return d.name; } catch (_) {}
    }
    if (err && err.revert && err.revert.name) return err.revert.name;
    return (err && (err.shortMessage || err.reason || err.message)) || String(err);
  }

  window.W = { read, connect, signerOnChain, state, onConnect: (f) => listeners.push(f), handleOf, hasAgentId, resolveAgent, label, short, bawCommand, errMsg };
})();
