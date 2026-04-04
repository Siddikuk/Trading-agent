# MT5 Bridge Server

> **Deploy this on your VPS where MetaTrader 5 terminal is running.**

This Python server bridges your MetaTrader 5 terminal with the Trading Agent dashboard. It provides live market data, account info, and trade execution via HTTP API.

## Prerequisites

1. **MetaTrader 5 terminal** installed and running on your VPS
2. **Logged into a trading account** in MT5
3. **Python 3.8+** installed

## Quick Setup

```bash
# 1. Navigate to the bridge directory
cd vps-bridge

# 2. Create a virtual environment (recommended)
python -m venv venv
source venv/bin/activate  # Linux/Mac
# venv\Scripts\activate   # Windows

# 3. Install dependencies
pip install -r requirements.txt

# 4. Start the server
python server.py --port 8080 --host 0.0.0.0
```

## Configuration Options

```bash
python server.py --help

# Examples:
python server.py --port 8080 --host 0.0.0.0                    # Basic
python server.py --port 9090 --host 0.0.0.0 --cors-origin "*"  # Custom port + CORS
python server.py --port 8080 --log-level DEBUG                  # Debug logging
```

| Option | Default | Description |
|--------|---------|-------------|
| `--port` | 8080 | HTTP server port |
| `--host` | 0.0.0.0 | Bind address (0.0.0.0 = all interfaces) |
| `--cors-origin` | * | CORS allowed origin |
| `--timeout` | 30 | Request timeout (seconds) |
| `--log-level` | INFO | Logging level (DEBUG, INFO, WARNING, ERROR) |

## Firewall Setup

Make sure port 8080 (or your chosen port) is open:

```bash
# Ubuntu/Debian with UFW
sudo ufw allow 8080/tcp

# CentOS/RHEL with firewalld
sudo firewall-cmd --permanent --add-port=8080/tcp
sudo firewall-cmd --reload

# Or with iptables
sudo iptables -A INPUT -p tcp --dport 8080 -j ACCEPT
```

## API Endpoints

### Health Check
```
GET /api/mt5/health
Response: { status, connected, mt5_version, account, server, ping_ms }
```

### Account Info
```
GET /api/mt5/account
Response: { balance, equity, margin, freeMargin, leverage, currency, profit }
```

### Live Quotes
```
GET /api/mt5/quotes?symbols=EURUSD,GBPUSD,USDJPY
Response: { data: [{ symbol, bid, ask, change, changePercent, spread }], count }
```

### Historical Candles
```
GET /api/mt5/candles?symbol=EURUSD&timeframe=H1&count=200
Response: { candles: [{ time, open, high, low, close, volume }], count }
```

### Open Positions
```
GET /api/mt5/positions
Response: { positions: [{ ticket, symbol, type, lots, price_open, price_current, sl, tp, profit }] }
```

### Trade History
```
GET /api/mt5/history?from=1700000000&to=1701000000
GET /api/mt5/history?days=7
Response: { deals: [{ ticket, symbol, type, lots, price, profit, commission }] }
```

### Place Order
```
POST /api/mt5/order
Body: { symbol: "EURUSD", type: 0, lots: 0.01, sl: 0, tp: 0, comment: "Trading Agent" }
  type: 0 = BUY, 1 = SELL
Response: { success: true, ticket: 123456, price: 1.08550 }
```

### Close Position
```
POST /api/mt5/close
Body (close by ticket): { ticket: 123456 }
Body (close all for symbol): { symbol: "EURUSD", type: "ALL" }
Body (close all positions): { type: "ALL" }
Response: { success: true, ticket: 123456, profit: 15.50 }
```

### Available Symbols
```
GET /api/mt5/symbols
Response: { symbols: [{ symbol, name, digits, lot_min, lot_max, spread_raw }], count }
```

## Connecting to Trading Agent Dashboard

1. Start this bridge server on your VPS
2. Open the Trading Agent dashboard
3. Go to **Settings → MT5 Bridge**
4. Enter your bridge URL: `http://YOUR_VPS_IP:8080`
5. Click **Connect**
6. The dashboard will show live MT5 data instead of delayed Yahoo data

## Running as a Service (systemd)

Create `/etc/systemd/system/mt5-bridge.service`:

```ini
[Unit]
Description=MT5 Bridge Server
After=network.target

[Service]
Type=simple
User=your-user
WorkingDirectory=/path/to/vps-bridge
ExecStart=/path/to/vps-bridge/venv/bin/python server.py --port 8080 --host 0.0.0.0
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable mt5-bridge
sudo systemctl start mt5-bridge
sudo systemctl status mt5-bridge
```

## Troubleshooting

| Issue | Solution |
|-------|----------|
| "MT5 terminal is not connected" | Open MT5 terminal and log into your account |
| "Symbol EURUSD not found" | Check that the symbol is available in your broker's MT5 |
| "Order failed: 10009" | Invalid price — MT5 fills at market price automatically |
| "Order failed: 10030" | Invalid order — check lot size limits in MT5 |
| Connection refused | Check firewall and that the server is running on the correct port |
| CORS errors | Set `--cors-origin` to your dashboard URL |

## Security Notes

- For production, set `--cors-origin` to your specific dashboard URL instead of `*`
- Consider adding authentication (API key or token) for public VPS
- Keep your VPS firewall tight — only allow the dashboard server's IP
- Never expose this server to the public internet without authentication
