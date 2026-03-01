# ⚡ BEP20 / ERC20 Payment API

A lightweight Node.js REST API for sending ERC-20 / BEP-20 tokens on **BSC** and **Base** mainnet. Features multi-RPC failover, live gas pricing, token balance checks, and a safe `POST` endpoint that keeps private keys out of URLs and server logs.

---

## Features

- **Multi-network** — BSC Mainnet (chainId 56) and Base Mainnet (chainId 8453)
- **RPC failover** — automatically switches to the next RPC when one fails
- **Live gas pricing** — standard / fast / rapid tiers with configurable multiplier
- **Balance pre-check** — rejects transfers when token balance is insufficient
- **Token info** — fetch name, symbol, decimals, and holder balance in one call
- **Native balance** — check BNB / ETH balance for any address
- **Health endpoint** — monitor all networks at once
- **Rate limiting** — 80 requests / minute per IP
- **Safe POST endpoint** — private key goes in the JSON body, not the URL

---

## Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Copy and edit env
cp .env.example .env   # or just edit .env directly

# 3. Start (production)
npm start

# 4. Start (dev with auto-reload)
npm run dev
```

The server starts on port `7051` by default (override with `PORT` env var).

---

## Environment Variables

| Variable   | Default                              | Description            |
|------------|--------------------------------------|------------------------|
| `BSC_RPC`  | `https://bsc-dataseed.bnbchain.org`  | Primary BSC RPC URL    |
| `BASE_RPC` | `https://mainnet.base.org`           | Primary Base RPC URL   |
| `BSC_PORT` | `7051`                               | Server port            |
| `PORT`     | —                                    | Overrides all ports    |

---

## API Endpoints

### `GET /`
Returns API info and a list of all endpoints.

**Response:**
```json
{
  "status": "ok",
  "name": "BEP20/ERC20 Payment API",
  "version": "2.0.0",
  "networks": { "bsc": {...}, "base": {...} },
  "endpoints": {...}
}
```

---

### `GET /health`
Checks connectivity to all configured networks.

```
GET /health
```

**Response (200 all healthy, 503 degraded):**
```json
{
  "status": "ok",
  "networks": {
    "bsc":  { "status": "ok", "latestBlock": 39123456, "rpc": "https://..." },
    "base": { "status": "ok", "latestBlock": 14567890, "rpc": "https://..." }
  }
}
```

---

### `GET /fees`
Returns live gas prices in three tiers.

```
GET /fees?network=bsc
```

| Param     | Required | Default | Description            |
|-----------|----------|---------|------------------------|
| `network` | No       | `bsc`   | `bsc` or `base`        |

**Response:**
```json
{
  "status": "ok",
  "network": "bsc",
  "chainId": 56,
  "standard": { "wei": "3000000000", "gwei": "3" },
  "fast":     { "wei": "3600000000", "gwei": "3.6" },
  "rapid":    { "wei": "4500000000", "gwei": "4.5" }
}
```

---

### `GET /balance`
Returns the native coin balance (BNB or ETH) for any address.

```
GET /balance?address=0xABC...&network=bsc
```

| Param     | Required | Default | Description            |
|-----------|----------|---------|------------------------|
| `address` | Yes      | —       | Wallet address         |
| `network` | No       | `bsc`   | `bsc` or `base`        |

**Response:**
```json
{
  "status": "ok",
  "network": "bsc",
  "address": "0xABC...",
  "balance": { "wei": "1000000000000000000", "ether": "1.0", "symbol": "BNB" }
}
```

---

### `GET /token/info`
Returns token metadata and optionally the balance for a specific holder.

```
GET /token/info?token=0x55d3...&holder=0xABC...&network=bsc
```

| Param     | Required | Default | Description                    |
|-----------|----------|---------|--------------------------------|
| `token`   | Yes      | —       | Token contract address         |
| `holder`  | No       | —       | Address to check balance for   |
| `network` | No       | `bsc`   | `bsc` or `base`                |

**Response:**
```json
{
  "status": "ok",
  "network": "bsc",
  "token": "0x55d3...",
  "name": "Tether USD",
  "symbol": "USDT",
  "decimals": 18,
  "holder": {
    "address": "0xABC...",
    "balance": "25.5",
    "balanceRaw": "25500000000000000000"
  }
}
```

---

### `POST /transfer`
Sends ERC-20 / BEP-20 tokens. **Preferred over GET** because the private key stays in the request body and never appears in URLs or server access logs.

```
POST /transfer
Content-Type: application/json
```

**Request body:**

| Field             | Required | Default | Description                                 |
|-------------------|----------|---------|---------------------------------------------|
| `token`           | Yes      | —       | Token contract address                      |
| `receiver`        | Yes      | —       | Recipient wallet address                    |
| `amount`          | Yes      | —       | Human-readable amount (e.g. `"10.5"`)       |
| `privatekey`      | Yes      | —       | Sender's private key (`0x...` or bare hex)  |
| `network`         | No       | `bsc`   | `bsc` or `base`                             |
| `gasMultiplierPct`| No       | `120`   | Gas price multiplier % (100 = no boost)     |

**Example:**
```bash
curl -X POST http://localhost:7051/transfer \
  -H "Content-Type: application/json" \
  -d '{
    "token":      "0x55d398326f99059fF775485246999027B3197955",
    "receiver":   "0xRecipientAddress",
    "amount":     "10.5",
    "privatekey": "0xYourPrivateKey",
    "network":    "bsc"
  }'
```

**Response:**
```json
{
  "status": "pending",
  "txHash": "0xabc123...",
  "explorerUrl": "https://bscscan.com/tx/0xabc123...",
  "network": "bsc",
  "chainId": 56,
  "from": "0xSenderAddress",
  "to": "0xRecipientAddress",
  "token": "0x55d3...",
  "symbol": "USDT",
  "amount": "10.5",
  "decimals": 18,
  "gas": 65000,
  "gasPrice": { "wei": "3600000000", "gwei": "3.6" }
}
```

---

## Common Token Addresses

### BSC
| Token  | Address                                      |
|--------|----------------------------------------------|
| USDT   | `0x55d398326f99059fF775485246999027B3197955` |
| USDC   | `0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d` |
| BUSD   | `0xe9e7CEA3DedcA5984780Bafc599bD69ADd087D56` |

### Base
| Token  | Address                                      |
|--------|----------------------------------------------|
| USDC   | `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913` |
| USDbC  | `0xd9aAEc86B65D86f6A7B5B1b0c42FFA531710b6CA` |

---

## Security Notes

- **Never** pass private keys in GET query parameters in production — they appear in server access logs, browser history, and server-side analytics.
- Use `POST /transfer` exclusively in production environments.
- Consider running this API behind an authenticated reverse proxy (nginx + API key header) rather than exposing it directly to the internet.
- Store private keys in a secrets manager (e.g. AWS Secrets Manager, HashiCorp Vault) rather than in `.env` files on production servers.

---

## Requirements

- Node.js >= 16.20.0
- npm >= 8

---

## License

MIT
