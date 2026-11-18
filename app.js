// AgentVouch front end. All on-chain text is rendered with textContent (never innerHTML).
(function () {
  "use strict";
  const C = window.APP_CONFIG;
  const E = window.ethers;
  const ABI = [
    "function vouch(address recipient, string note)",
    "function vouchHandle(string handle, string note)",
    "function unvouch(address recipient)",
    "function vouchCount(address) view returns (uint256)",
    "function givenCount(address) view returns (uint256)",
    "function hasVouched(address voucher, address recipient) view returns (bool)",
    "function vouchersOf(address recipient, uint256 offset, uint256 limit) view returns (address[])",
    "function vouchedBy(address voucher, uint256 offset, uint256 limit) view returns (address[])",
    "event Vouched(address indexed voucher, address indexed recipient, string note)",
    "event Unvouched(address indexed voucher, address indexed recipient)",
    "error NotAgentIdHolder()", "error RecipientNotAgentIdHolder()", "error UnknownHandle()",
    "error SelfVouch()", "error AlreadyVouched()", "error NotVouched()", "error NoteTooLong()",
  ];
  const iface = new E.Interface(ABI);
  const ERR_TEXT = {
    NotAgentIdHolder: "Your address does not hold an Agent ID, so it cannot vouch.",
    RecipientNotAgentIdHolder: "That address does not hold an Agent ID. You can only vouch for Agent ID holders.",
    UnknownHandle: "That name is not a registered Agent ID.",
    SelfVouch: "You cannot vouch for yourself.",
    AlreadyVouched: "You already vouch for this agent.",
    NotVouched: "You have not vouched for this agent.",
    NoteTooLong: "Note must be at most 140 bytes.",
  };
  const $ = (id) => document.getElementById(id);
  const deployed = E.isAddress(C.CONTRACT);
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  const friendly = (err) => { const n = W.errMsg(err, iface); return ERR_TEXT[n] || n; };
  let current = null; // address of the open profile
  let currentIsAgent = false;
  let meIsAgent = false;

  function status(msg, kind) {
    const s = $("status");
    s.textContent = msg || "";
    s.style.color = kind === "bad" ? "var(--bad)" : kind === "ok" ? "var(--accent2)" : "";
  }

  async function contract(withSigner) {
    return new E.Contract(C.CONTRACT, ABI, withSigner ? await W.signerOnChain() : await W.read());
  }

  // ---------- profile
  async function open(input, pushHash) {
    try {
      status("Resolving…");
      const addr = await W.resolveAgent(input);
      current = addr;
      const name = await W.label(addr);
      if (pushHash) history.replaceState(null, "", "#" + (name.endsWith(".ai") ? name : addr));
      $("target").value = name.endsWith(".ai") ? name : addr;
      $("profile").hidden = false;
      $("pName").textContent = name;
      $("pAddr").textContent = addr;
      currentIsAgent = await W.hasAgentId(addr);
      await refreshProfile();
      status("");
    } catch (err) { status(friendly(err), "bad"); }
  }

  async function refreshProfile() {
    if (!current) return;
    const me = W.state.address;
    const st = $("pState");
    const vb = $("vouchBtn"), ub = $("unvouchBtn");
    ub.hidden = true;
    vb.disabled = true;
    if (!currentIsAgent) {
      st.textContent = "This address holds no Agent ID, so it cannot receive vouches.";
      $("pIn").textContent = $("pOut").textContent = "–";
      $("graph").hidden = true;
      return;
    }
    if (!deployed) { st.textContent = "Vouching opens once the contract is deployed."; return; }
    const c = await contract(false);
    const [nIn, nOut, mine] = await Promise.all([
      c.vouchCount(current), c.givenCount(current),
      me ? c.hasVouched(me, current) : Promise.resolve(false),
    ]);
    $("pIn").textContent = nIn.toString();
    $("pOut").textContent = nOut.toString();
    if (!me) st.textContent = "Connect your wallet to vouch.";
    else if (me.toLowerCase() === current.toLowerCase()) st.textContent = "This is you. Share this page's link so others can vouch for you.";
    else if (!meIsAgent) st.textContent = ERR_TEXT.NotAgentIdHolder;
    else if (mine) { st.textContent = "You vouch for this agent."; ub.hidden = false; }
    else { st.textContent = ""; vb.disabled = false; }
    await renderGraph(c, Number(nIn), Number(nOut));
  }

  async function edgeList(box, addrs) {
    box.replaceChildren();
    if (!addrs.length) { box.appendChild(el("p", "muted", "None yet.")); return; }
    for (const a of addrs) {
      const row = el("div", "edge");
      const b = el("button", "linklike", W.short(a));
      b.onclick = () => open(a, true);
      W.label(a).then((l) => (b.textContent = l));
      row.appendChild(b);
      box.appendChild(row);
    }
  }

  async function renderGraph(c, nIn, nOut) {
    $("graph").hidden = false;
    $("gTitle").textContent = `Trust graph of ${$("pName").textContent}`;
    const [ins, outs] = await Promise.all([
      c.vouchersOf(current, 0, C.PAGE_SIZE), c.vouchedBy(current, 0, C.PAGE_SIZE),
    ]);
    await edgeList($("gIn"), [...ins]);
    await edgeList($("gOut"), [...outs]);
    if (nIn > ins.length) $("gIn").appendChild(el("p", "muted", `…and ${nIn - ins.length} more`));
    if (nOut > outs.length) $("gOut").appendChild(el("p", "muted", `…and ${nOut - outs.length} more`));
  }

  $("lookup").onclick = () => open($("target").value, true);
  $("target").addEventListener("keydown", (e) => { if (e.key === "Enter") open($("target").value, true); });

  // ---------- writes
  async function send(fn, args, okMsg) {
    try {
      const c = await contract(true);
      await c[fn].staticCall(...args); // surface revert reasons before the wallet prompt
      status("Confirm the transaction in your wallet…");
      const tx = await c[fn](...args);
      status("Waiting for confirmation…");
      await tx.wait();
      status(okMsg, "ok");
      await refreshProfile();
    } catch (err) { status(friendly(err), "bad"); }
  }
  const note = () => {
    const n = $("note").value.trim();
    if (new TextEncoder().encode(n).length > 140) throw new Error(ERR_TEXT.NoteTooLong);
    return n;
  };
  $("vouchBtn").onclick = () => { try { send("vouch", [current, note()], "Vouch recorded on chain."); } catch (err) { status(friendly(err), "bad"); } };
  $("unvouchBtn").onclick = () => send("unvouch", [current], "Vouch withdrawn.");

  function cli(fn, args) {
    if (!current) return;
    const out = $("cliOut");
    out.textContent = W.bawCommand(deployed ? C.CONTRACT : "<AgentVouch address>", iface.encodeFunctionData(fn, args), W.state.address);
    out.hidden = false;
  }
  $("cliVouch").onclick = () => { try { cli("vouch", [current, note()]); } catch (err) { status(friendly(err), "bad"); } };
  $("cliUnvouch").onclick = () => cli("unvouch", [current]);

  // ---------- connect
  $("connect").onclick = async () => {
    try { status("Connecting…"); await W.connect(); status(""); } catch (err) { status(friendly(err), "bad"); }
  };
  W.onConnect(async (addr) => {
    $("connect").textContent = "Connected";
    $("connect").disabled = true;
    $("who").textContent = W.short(addr);
    const banner = $("agentBanner");
    banner.hidden = false;
    try {
      meIsAgent = await W.hasAgentId(addr);
      const h = await W.handleOf(addr);
      $("who").textContent = h ? `${h}.ai` : W.short(addr);
      banner.className = "banner " + (meIsAgent ? "ok" : "bad");
      banner.textContent = meIsAgent
        ? `Agent ID verified${h ? `: ${h}.ai` : ""}. You can vouch for other Agent ID holders.`
        : "This address holds no Agent ID. You can browse vouches, but only Agent ID holders can vouch.";
    } catch (err) {
      banner.className = "banner warn";
      banner.textContent = "Could not check Agent ID status: " + friendly(err);
    }
    if (current) await refreshProfile();
    else open(addr, true); // show your own trust graph by default
  });

  // ---------- init
  if (!deployed) $("deployBanner").hidden = false;
  else {
    const a = el("a", null, "Verified contract on BscScan");
    a.href = `${C.EXPLORER}/address/${C.CONTRACT}#code`;
    a.target = "_blank"; a.rel = "noopener";
    $("links").appendChild(a);
  }
  const fromHash = decodeURIComponent(location.hash.slice(1));
  if (fromHash) open(fromHash, false);
})();
