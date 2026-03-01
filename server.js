/* ===========================================================
   ⚡ BEP20 / ERC20 Payment API — BSC + Base Mainnet
   Version 2.0.0
   Author: @ChauhanDev07
   =========================================================== */

require("dotenv").config();
const express = require("express");
const Web3 = require("web3");
const cors = require("cors");
const rateLimit = require("express-rate-limit");

const app = express();
app.use(cors());
app.use(express.json());

/* ----------------------------- Rate Limiting ----------------------------- */
app.use(
  rateLimit({
    windowMs: 60_000,
    max: 80,
    standardHeaders: true,
    legacyHeaders: false,
    message: { status: "error", message: "Too many requests — try again in a minute." }
  })
);

/* ----------------------------- Network Configs ----------------------------- */
const NETWORKS = {
  bsc: {
    name: "BSC Mainnet",
    chainId: 56,
    rpcList: [
      process.env.BSC_RPC || "https://bsc-dataseed.bnbchain.org",
      "https://bsc-dataseed.binance.org",
      "https://bsc.publicnode.com",
      "https://bsc-dataseed1.defibit.io"
    ],
    symbol: "BNB",
    explorer: "https://bscscan.com/tx/"
  },
  base: {
    name: "Base Mainnet",
    chainId: 8453,
    rpcList: [
      process.env.BASE_RPC || "https://mainnet.base.org",
      "https://base.publicnode.com",
      "https://base.llamarpc.com"
    ],
    symbol: "ETH",
    explorer: "https://basescan.org/tx/"
  }
};

/* ----------------------------- Web3 Instances ----------------------------- */
const state = {};
for (const [net, cfg] of Object.entries(NETWORKS)) {
  state[net] = { currentRPC: 0, web3: null };
  state[net].web3 = buildWeb3(net, 0);
}

function buildWeb3(net, idx) {
  return new Web3(
    new Web3.providers.HttpProvider(NETWORKS[net].rpcList[idx], {
      keepAlive: true,
      timeout: 20000
    })
  );
}

function getWeb3(net = "bsc") {
  return state[net].web3;
}

function switchRPC(net = "bsc") {
  const cfg = NETWORKS[net];
  state[net].currentRPC = (state[net].currentRPC + 1) % cfg.rpcList.length;
  state[net].web3 = buildWeb3(net, state[net].currentRPC);
  console.log(`⚠ [${net}] Switched RPC → ${cfg.rpcList[state[net].currentRPC]}`);
}

function activeRPC(net = "bsc") {
  return NETWORKS[net].rpcList[state[net].currentRPC];
}

/* ----------------------------- Standard ERC20 ABI ----------------------------- */
const ERC20_ABI = [
  {
    inputs: [
      { internalType: "address", name: "to", type: "address" },
      { internalType: "uint256", name: "amount", type: "uint256" }
    ],
    name: "transfer",
    outputs: [{ internalType: "bool", name: "", type: "bool" }],
    stateMutability: "nonpayable",
    type: "function"
  },
  {
    inputs: [],
    name: "decimals",
    outputs: [{ internalType: "uint8", name: "", type: "uint8" }],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [{ internalType: "address", name: "account", type: "address" }],
    name: "balanceOf",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [],
    name: "symbol",
    outputs: [{ internalType: "string", name: "", type: "string" }],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [],
    name: "name",
    outputs: [{ internalType: "string", name: "", type: "string" }],
    stateMutability: "view",
    type: "function"
  }
];

/* ----------------------------- Helpers ----------------------------- */
async function getGasPrice(web3, multiplierPct = 120) {
  try {
    const base = await web3.eth.getGasPrice();
    const bn = web3.utils.toBN(base);
    return bn.mul(web3.utils.toBN(multiplierPct)).div(web3.utils.toBN(100));
  } catch {
    return web3.utils.toBN(web3.utils.toWei("5", "gwei"));
  }
}

function toTokenUnits(web3, amount, decimals) {
  const s = String(amount);
  if (!/^\d+(\.\d+)?$/.test(s)) throw new Error("Invalid amount format — use a positive decimal number.");
  const [whole, fraction = ""] = s.split(".");
  const fracPadded = fraction.padEnd(decimals, "0").slice(0, decimals);
  const full = (whole + fracPadded).replace(/^0+/, "") || "0";
  return web3.utils.toBN(full);
}

function fromTokenUnits(web3, units, decimals) {
  const s = units.toString().padStart(decimals + 1, "0");
  const whole = s.slice(0, s.length - decimals) || "0";
  const frac = s.slice(s.length - decimals).replace(/0+$/, "");
  return frac ? `${whole}.${frac}` : whole;
}

function validateNetwork(net) {
  if (!NETWORKS[net]) {
    return { valid: false, error: `Unknown network "${net}". Supported: ${Object.keys(NETWORKS).join(", ")}` };
  }
  return { valid: true };
}

function resolveNet(req) {
  return (req.query.network || req.body?.network || "bsc").toLowerCase();
}

/* ===================================================================
   Root — API info
=================================================================== */
app.get("/", (req, res) => {
  res.json({
    status: "ok",
    name: "BEP20/ERC20 Payment API",
    version: "2.0.0",
    author: "@ChauhanDev07",
    networks: Object.fromEntries(
      Object.entries(NETWORKS).map(([k, v]) => [
        k,
        { name: v.name, chainId: v.chainId, activeRpc: activeRPC(k) }
      ])
    ),
    endpoints: {
      "GET  /": "API info",
      "GET  /health": "Health check for all networks",
      "GET  /fees?network=bsc": "Live gas fees",
      "GET  /token/info?token=&network=bsc": "Token metadata + optional holder balance",
      "GET  /balance?address=&network=bsc": "Native coin balance",
      "POST /transfer": "Send tokens (body: { token, receiver, amount, privatekey, network?, gasMultiplierPct? })"
    }
  });
});

/* ===================================================================
   Health Check
=================================================================== */
app.get("/health", async (req, res) => {
  const results = {};
  for (const net of Object.keys(NETWORKS)) {
    try {
      const w3 = getWeb3(net);
      const block = await w3.eth.getBlockNumber();
      results[net] = { status: "ok", latestBlock: block, rpc: activeRPC(net) };
    } catch (e) {
      results[net] = { status: "error", message: e.message, rpc: activeRPC(net) };
    }
  }
  const allOk = Object.values(results).every((r) => r.status === "ok");
  res.status(allOk ? 200 : 503).json({ status: allOk ? "ok" : "degraded", networks: results });
});

/* ===================================================================
   Gas Fees
=================================================================== */
app.get("/fees", async (req, res) => {
  const net = resolveNet(req);
  const { valid, error } = validateNetwork(net);
  if (!valid) return res.status(400).json({ status: "error", message: error });

  try {
    const w3 = getWeb3(net);
    const base = await w3.eth.getGasPrice();
    const fast = await getGasPrice(w3, 120);
    const rapid = await getGasPrice(w3, 150);
    res.json({
      status: "ok",
      network: net,
      chainId: NETWORKS[net].chainId,
      standard: {
        wei: base,
        gwei: w3.utils.fromWei(base, "gwei")
      },
      fast: {
        wei: fast.toString(),
        gwei: w3.utils.fromWei(fast.toString(), "gwei")
      },
      rapid: {
        wei: rapid.toString(),
        gwei: w3.utils.fromWei(rapid.toString(), "gwei")
      },
      rpc: activeRPC(net)
    });
  } catch (e) {
    switchRPC(net);
    res.status(500).json({ status: "error", message: e.message });
  }
});

/* ===================================================================
   Native Coin Balance
=================================================================== */
app.get("/balance", async (req, res) => {
  const net = resolveNet(req);
  const { valid, error } = validateNetwork(net);
  if (!valid) return res.status(400).json({ status: "error", message: error });

  const { address } = req.query;
  if (!address) return res.status(400).json({ status: "error", message: "Required: address" });

  const w3 = getWeb3(net);
  if (!w3.utils.isAddress(address)) {
    return res.status(400).json({ status: "error", message: "Invalid address" });
  }

  try {
    const balWei = await w3.eth.getBalance(address);
    res.json({
      status: "ok",
      network: net,
      address,
      balance: {
        wei: balWei,
        ether: w3.utils.fromWei(balWei, "ether"),
        symbol: NETWORKS[net].symbol
      }
    });
  } catch (e) {
    res.status(500).json({ status: "error", message: e.message });
  }
});

/* ===================================================================
   Token Info + Optional Holder Balance
=================================================================== */
app.get("/token/info", async (req, res) => {
  const net = resolveNet(req);
  const { valid, error } = validateNetwork(net);
  if (!valid) return res.status(400).json({ status: "error", message: error });

  const { token, holder } = req.query;
  if (!token) return res.status(400).json({ status: "error", message: "Required: token" });

  const w3 = getWeb3(net);
  if (!w3.utils.isAddress(token)) {
    return res.status(400).json({ status: "error", message: "Invalid token address" });
  }

  try {
    const contract = new w3.eth.Contract(ERC20_ABI, token);
    const [name, symbol, decimals] = await Promise.all([
      contract.methods.name().call(),
      contract.methods.symbol().call(),
      contract.methods.decimals().call()
    ]);

    const result = {
      status: "ok",
      network: net,
      token,
      name,
      symbol,
      decimals: Number(decimals)
    };

    if (holder) {
      if (!w3.utils.isAddress(holder)) {
        return res.status(400).json({ status: "error", message: "Invalid holder address" });
      }
      const raw = await contract.methods.balanceOf(holder).call();
      result.holder = {
        address: holder,
        balance: fromTokenUnits(w3, raw, Number(decimals)),
        balanceRaw: raw
      };
    }

    res.json(result);
  } catch (e) {
    res.status(500).json({ status: "error", message: e.message });
  }
});

/* ===================================================================
   POST Transfer — private key in request body, NOT in URL
   Body: { token, receiver, amount, privatekey, network?, gasMultiplierPct? }
=================================================================== */
app.post("/transfer", async (req, res) => {
  const net = resolveNet(req);
  const { valid, error } = validateNetwork(net);
  if (!valid) return res.status(400).json({ status: "error", message: error });

  try {
    const { token, receiver, amount, privatekey, gasMultiplierPct } = req.body;

    if (!token || !receiver || !amount || !privatekey) {
      return res.status(400).json({
        status: "error",
        message: "Required body fields: token, receiver, amount, privatekey"
      });
    }

    const w3 = getWeb3(net);

    if (!w3.utils.isAddress(token)) {
      return res.status(400).json({ status: "error", message: "Invalid token address" });
    }
    if (!w3.utils.isAddress(receiver)) {
      return res.status(400).json({ status: "error", message: "Invalid receiver address" });
    }

    const pk = privatekey.startsWith("0x") ? privatekey : `0x${privatekey}`;
    const sender = w3.eth.accounts.privateKeyToAccount(pk);
    const contract = new w3.eth.Contract(ERC20_ABI, token);

    const [decimalsRaw, symbol, senderBalRaw] = await Promise.all([
      contract.methods.decimals().call(),
      contract.methods.symbol().call(),
      contract.methods.balanceOf(sender.address).call()
    ]);

    const decimals = Number(decimalsRaw);
    const amountUnits = toTokenUnits(w3, amount, decimals);
    const senderBal = w3.utils.toBN(senderBalRaw);

    // Check token balance
    if (senderBal.lt(amountUnits)) {
      const humanBal = fromTokenUnits(w3, senderBalRaw, decimals);
      return res.status(400).json({
        status: "error",
        message: `Insufficient token balance. Have: ${humanBal} ${symbol}, need: ${amount} ${symbol}`
      });
    }

    const data = contract.methods.transfer(receiver, amountUnits).encodeABI();

    let gas;
    try {
      gas = await contract.methods
        .transfer(receiver, amountUnits)
        .estimateGas({ from: sender.address });
      gas = Math.ceil(gas * 1.1); // add 10% safety buffer
    } catch {
      gas = 120000;
    }

    const multiplier = Number(gasMultiplierPct) || 120;
    const gasPrice = await getGasPrice(w3, multiplier);
    const nonce = await w3.eth.getTransactionCount(sender.address, "pending");

    const tx = {
      from: sender.address,
      to: token,
      data,
      gas,
      gasPrice: gasPrice.toString(),
      nonce,
      chainId: NETWORKS[net].chainId
    };

    const signed = await sender.signTransaction(tx);

    w3.eth
      .sendSignedTransaction(signed.rawTransaction)
      .once("transactionHash", (hash) => {
        res.json({
          status: "pending",
          txHash: hash,
          explorerUrl: `${NETWORKS[net].explorer}${hash}`,
          network: net,
          chainId: NETWORKS[net].chainId,
          from: sender.address,
          to: receiver,
          token,
          symbol,
          amount: String(amount),
          decimals,
          gas,
          gasPrice: {
            wei: tx.gasPrice,
            gwei: w3.utils.fromWei(tx.gasPrice, "gwei")
          },
          rpc: activeRPC(net)
        });
      })
      .on("error", (err) => {
        console.error(`❌ [${net}] TX error:`, err.message);
        switchRPC(net);
        if (!res.headersSent) {
          res.status(500).json({ status: "error", message: err.message });
        }
      });
  } catch (e) {
    res.status(500).json({ status: "error", message: e.message });
  }
});

/* ===================================================================
   Legacy GET Transfer (backward compatibility)
   ⚠️  Private key in URL is NOT safe for production — use POST /transfer
=================================================================== */
app.get("/bep20/transfer", (req, res) => {
  res.status(400).json({
    status: "error",
    message: "GET /bep20/transfer is deprecated. Use POST /transfer with JSON body to keep your private key out of URLs and server logs.",
    docs: "See README.md for usage."
  });
});

/* ===================================================================
   404 handler
=================================================================== */
app.use((req, res) => {
  res.status(404).json({
    status: "error",
    message: `Route not found: ${req.method} ${req.path}`,
    hint: "GET / for available endpoints"
  });
});

/* ===================================================================
   Start
=================================================================== */
const PORT = process.env.PORT || process.env.BSC_PORT || process.env.BASE_PORT || 7051;
app.listen(PORT, () => {
  console.log(`🚀 BEP20/ERC20 Payment API v2.0.0 running on :${PORT}`);
  console.log(`📡 Networks: ${Object.keys(NETWORKS).join(", ")}`);
  console.log(`🔗 Try: http://localhost:${PORT}/`);
});
