# VPS Agent Setup Guide

## Prerequisites
- Python 3.11+ on VPS
- MT5 bridge already running (`vps-bridge/server.py`)
- Neon PostgreSQL DATABASE_URL (same as Next.js app)
- Anthropic API key

## Install

```bash
cd /home/user/Trading-agent/vps-agent
pip3 install -r requirements.txt
```

## Configure

```bash
cp .env.example .env
nano .env    # Fill in ANTHROPIC_API_KEY and DATABASE_URL
```

## Test (dry run — no real trades)

```bash
python3 main.py
```

Then open your dashboard and click **Start Agent** (keeps autoTrade OFF).
Check the Signal tab — signals should appear within 15 minutes.
Review the reasoning in AuditLog via your DB tool.

## Enable live trading

In the dashboard → Agent tab → turn on **Auto Trade**.
The agent reads this flag from DB every cycle.

## Install as systemd service (runs 24/7)

```bash
cp agent.service /etc/systemd/system/trading-agent.service
systemctl daemon-reload
systemctl enable trading-agent
systemctl start trading-agent
systemctl status trading-agent
```

## Logs

```bash
journalctl -u trading-agent -f        # live logs
journalctl -u trading-agent --since "1 hour ago"
```

## Stop / Start

```bash
# From dashboard: toggle Start/Stop Agent button
# From VPS:
systemctl stop trading-agent
systemctl start trading-agent
```

## Circuit breakers

The agent will automatically stop (`isRunning=false`) if:
- Daily loss > `dailyRiskLimit`% of balance
- Equity drawdown > `maxDrawdownPercent`% (also closes all positions)
- MT5 bridge unreachable 3× in a row

After a circuit breaker fires, restart manually from the dashboard.

## Timeframe behaviour

| Confluence | What happens |
|---|---|
| 1/4 TFs agree | No Claude call — skipped |
| 2/4 TFs agree | Claude called, base lot size |
| 3/4 TFs agree | Claude called, 1.5× lot size |
| 4/4 TFs agree | Claude called, 2.0× lot size |

Lot scaling is always capped by max risk % per trade.
