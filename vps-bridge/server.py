#!/usr/bin/env python3
"""
MT5 Bridge Server — Runs on your VPS alongside MetaTrader 5 terminal.

This server exposes MT5 data via HTTP API + WebSocket for the Trading Agent dashboard.

INSTALLATION:
  pip install -r requirements.txt

RUN:
  python server.py --port 8080 --host 0.0.0.0

  Or with custom settings:
  python server.py --port 8080 --host 0.0.0.0 --cors-origin "*" --timeout 30

SECURITY:
  - By default, CORS allows all origins. For production, set --cors-origin to your dashboard URL.
  - Consider adding API key authentication for production use.
  - Ensure your VPS firewall only allows the dashboard server to reach this port.

MT5 REQUIREMENTS:
  - MetaTrader 5 terminal must be installed and running on the VPS
  - The terminal must be logged into a trading account
  - Python 3.8+ with the MetaTrader5 package installed
"""

import argparse
import json
import logging
import sys
import time
from datetime import datetime, timezone
from typing import Optional

try:
    import MetaTrader5 as mt5
except ImportError:
    print("ERROR: MetaTrader5 package not installed. Run: pip install MetaTrader5")
    print("Also ensure MT5 terminal is installed on this machine.")
    sys.exit(1)

try:
    from fastapi import FastAPI, HTTPException, Query
    from fastapi.middleware.cors import CORSMiddleware
    from fastapi.responses import JSONResponse
    import uvicorn
except ImportError:
    print("ERROR: FastAPI not installed. Run: pip install fastapi uvicorn")
    sys.exit(1)

try:
    import pytz
except ImportError:
    pytz = None

# ==================== CONFIGURATION ====================

parser = argparse.ArgumentParser(description="MT5 Bridge Server for Trading Agent")
parser.add_argument("--port", type=int, default=8080, help="Server port (default: 8080)")
parser.add_argument("--host", type=str, default="0.0.0.0", help="Bind host (default: 0.0.0.0)")
parser.add_argument("--cors-origin", type=str, default="*", help="CORS allowed origin (default: *)")
parser.add_argument("--timeout", type=int, default=30, help="Request timeout in seconds (default: 30)")
parser.add_argument("--log-level", type=str, default="INFO", choices=["DEBUG", "INFO", "WARNING", "ERROR"])
args = parser.parse_args()

# ==================== LOGGING ====================

logging.basicConfig(
    level=getattr(logging, args.log_level),
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger("MT5-Bridge")

# ==================== FASTAPI APP ====================

app = FastAPI(
    title="MT5 Bridge Server",
    description="HTTP API bridge between Trading Agent dashboard and MetaTrader 5",
    version="2.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[args.cors_origin] if args.cors_origin != "*" else ["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ==================== MT5 TIMEFRAME MAPPING ====================

TIMEFRAME_MAP = {
    "M1": mt5.TIMEFRAME_M1,
    "M5": mt5.TIMEFRAME_M5,
    "M15": mt5.TIMEFRAME_M15,
    "M30": mt5.TIMEFRAME_M30,
    "H1": mt5.TIMEFRAME_H1,
    "H4": mt5.TIMEFRAME_H4,
    "D1": mt5.TIMEFRAME_D1,
    "W1": mt5.TIMEFRAME_W1,
    "MN1": mt5.TIMEFRAME_MN1,
}

# App timeframe → MT5 timeframe mapping
APP_TIMEFRAME_MAP = {
    "5m": "M5",
    "15m": "M15",
    "1h": "H1",
    "4h": "H4",
    "1d": "D1",
}

# ==================== STATE ====================

mt5_connected = False
mt5_initialised = False
account_info_cache = {}
connection_time = None
last_tick_cache = {}  # symbol → last tick data


def init_mt5() -> bool:
    """Initialize MT5 connection. Returns True if successful."""
    global mt5_connected, mt5_initialised, connection_time

    if mt5_initialised:
        # Check if still connected
        terminal_info = mt5.terminal_info()
        if terminal_info and terminal_info.connected:
            return True
        else:
            logger.warning("MT5 connection lost, attempting reconnection...")
            mt5_connected = False

    # Initialize MT5
    if not mt5.initialize():
        error = mt5.last_error()
        logger.error(f"MT5 initialization failed: {error}")
        return False

    mt5_initialised = True

    # Check if terminal is connected
    terminal_info = mt5.terminal_info()
    if not terminal_info or not terminal_info.connected:
        logger.error("MT5 terminal is not connected. Please open MT5 and log into an account.")
        # Don't deinitialize — the terminal might connect later
        return False

    mt5_connected = True
    connection_time = datetime.now(timezone.utc)
    account = mt5.account_info()
    if account:
        logger.info(
            f"MT5 connected: Account {account.login}@{account.server}, "
            f"Balance: ${account.balance:.2f}, Equity: ${account.equity:.2f}, "
            f"Leverage: 1:{account.leverage}"
        )

    return True


def ensure_mt5() -> bool:
    """Ensure MT5 is connected, attempt reconnection if needed."""
    if not init_mt5():
        raise HTTPException(status_code=503, detail="MT5 not connected or terminal not running")


def mt5_symbol(symbol: str) -> str:
    """Convert app symbol format (EUR/USD) to MT5 format (EURUSD)."""
    return symbol.replace("/", "").replace("-", "").upper()


# ==================== API ROUTES ====================

@app.get("/api/mt5/health")
async def health_check():
    """Check MT5 connection health."""
    start = time.time()
    connected = init_mt5()

    info = {}
    if connected:
        terminal = mt5.terminal_info()
        account = mt5.account_info()
        info = {
            "mt5_version": str(getattr(terminal, 'version_build', getattr(terminal, 'build', 'unknown'))) if terminal else "unknown",
            "account": str(account.login) if account else "unknown",
            "server": str(account.server) if account else "unknown",
            "connected": True,
            "uptime_seconds": int((datetime.now(timezone.utc) - connection_time).total_seconds()) if connection_time else 0,
        }
    else:
        info = {
            "mt5_version": "not connected",
            "account": "N/A",
            "server": "N/A",
            "connected": False,
        }

    info["ping_ms"] = int((time.time() - start) * 1000)
    info["status"] = "connected" if connected else "disconnected"
    info["timestamp"] = datetime.now(timezone.utc).isoformat()

    return info


@app.get("/api/mt5/account")
async def get_account():
    """Get MT5 account information."""
    ensure_mt5()

    account = mt5.account_info()
    if not account:
        raise HTTPException(status_code=503, detail="Failed to get account info")

    positions = mt5.positions_get()
    total_profit = sum(p.profit for p in positions) if positions else 0

    return {
        "balance": account.balance,
        "equity": account.equity,
        "margin": account.margin,
        "freeMargin": account.margin_free,
        "marginLevel": account.margin_level if account.margin > 0 else 0,
        "leverage": account.leverage,
        "currency": account.currency,
        "profit": round(total_profit, 2),
        "marginCall": account.margin_so_call,
        "marginStopOut": account.margin_so_so,
        "login": account.login,
        "server": account.server,
        "name": account.name,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


@app.get("/api/mt5/quotes")
async def get_quotes(
    symbols: str = Query("EURUSD,GBPUSD,USDJPY,AUDUSD,XAUUSD,BTCUSD"),
):
    """Get live quotes for specified symbols."""
    ensure_mt5()

    symbol_list = [mt5_symbol(s.strip()) for s in symbols.split(",")]
    results = []

    for symbol in symbol_list:
        try:
            # Verify symbol is available
            symbol_info = mt5.symbol_info(symbol)
            if not symbol_info or not symbol_info.visible:
                logger.warning(f"Symbol {symbol} not found or not visible in MT5")
                continue

            tick = mt5.symbol_info_tick(symbol)
            if not tick:
                continue

            # Calculate change from previous close
            # Get last candle close for change calculation
            rates = mt5.copy_rates_from_pos(symbol, mt5.TIMEFRAME_D1, 0, 2)
            prev_close = rates[0]["close"] if rates and len(rates) >= 2 else tick.ask

            change = tick.ask - prev_close
            change_pct = (change / prev_close) * 100 if prev_close > 0 else 0

            spread_points = (tick.ask - tick.bid) / symbol_info.point

            results.append({
                "symbol": symbol,
                "bid": round(tick.bid, symbol_info.digits),
                "ask": round(tick.ask, symbol_info.digits),
                "last": round((tick.bid + tick.ask) / 2, symbol_info.digits),
                "change": round(change, symbol_info.digits),
                "changePercent": round(change_pct, 3),
                "spread": round(spread_points, 1),
                "digits": symbol_info.digits,
                "timestamp": tick.time,
                "volume": tick.volume,
            })

            last_tick_cache[symbol] = results[-1]

        except Exception as e:
            logger.error(f"Error fetching quote for {symbol}: {e}")

    return {"data": results, "count": len(results), "timestamp": datetime.now(timezone.utc).isoformat()}


@app.get("/api/mt5/candles")
async def get_candles(
    symbol: str = Query("EURUSD"),
    timeframe: str = Query("H1"),
    count: int = Query(200, ge=1, le=5000),
):
    """Get historical candle data from MT5."""
    ensure_mt5()

    # Map app timeframe to MT5 timeframe
    mt5_tf = APP_TIMEFRAME_MAP.get(timeframe, timeframe.upper())
    if mt5_tf not in TIMEFRAME_MAP:
        raise HTTPException(status_code=400, detail=f"Invalid timeframe: {timeframe}. Use: {list(APP_TIMEFRAME_MAP.keys())}")

    mt5_symbol_name = mt5_symbol(symbol)

    try:
        rates = mt5.copy_rates_from_pos(mt5_symbol_name, TIMEFRAME_MAP[mt5_tf], 0, count)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"MT5 error: {e}")

    if not rates:
        raise HTTPException(status_code=404, detail=f"No candle data for {symbol} {timeframe}")

    candles = []
    for r in rates:
        candles.append({
            "time": int(r["time"]),
            "open": round(r["open"], 8),
            "high": round(r["high"], 8),
            "low": round(r["low"], 8),
            "close": round(r["close"], 8),
            "volume": int(r["real_volume"]) if r["real_volume"] else int(r["tick_volume"]),
            "tick_volume": int(r["tick_volume"]),
            "spread": int(r["spread"]) if "spread" in r.dtype.names else 0,
        })

    return {
        "symbol": mt5_symbol_name,
        "timeframe": mt5_tf,
        "count": len(candles),
        "candles": candles,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


@app.get("/api/mt5/positions")
async def get_positions():
    """Get all open positions from MT5."""
    ensure_mt5()

    positions = mt5.positions_get()
    if not positions:
        return {"positions": [], "count": 0, "timestamp": datetime.now(timezone.utc).isoformat()}

    results = []
    for p in positions:
        symbol_info = mt5.symbol_info(p.symbol)
        digits = symbol_info.digits if symbol_info else 5

        results.append({
            "ticket": p.ticket,
            "symbol": p.symbol,
            "type": p.type,  # 0 = BUY, 1 = SELL
            "type_str": "BUY" if p.type == 0 else "SELL",
            "lots": p.volume,
            "price_open": round(p.price_open, digits),
            "price_current": round(p.price_current, digits),
            "sl": round(p.sl, digits) if p.sl > 0 else 0,
            "tp": round(p.tp, digits) if p.tp > 0 else 0,
            "profit": round(p.profit, 2),
            "swap": round(p.swap, 2),
            "comment": p.comment or "",
            "magic": p.magic,
            "time_open": int(p.time),
            "time_update": int(p.time_update),
            "time_open_str": datetime.fromtimestamp(p.time, tz=timezone.utc).isoformat(),
        })

    total_profit = sum(p["profit"] for p in results)
    return {
        "positions": results,
        "count": len(results),
        "totalProfit": round(total_profit, 2),
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


@app.get("/api/mt5/history")
async def get_history(
    from_time: Optional[int] = Query(None, description="Unix timestamp (seconds)"),
    to_time: Optional[int] = Query(None, description="Unix timestamp (seconds)"),
    days: int = Query(7, description="Number of days to look back if from/to not specified"),
):
    """Get closed trade history from MT5."""
    ensure_mt5()

    now = datetime.now(timezone.utc)
    if not to_time:
        to_time = int(now.timestamp())
    if not from_time:
        from_time = int(now.timestamp()) - (days * 86400)

    deals = mt5.history_deals_get(from_time, to_time, group="*")
    if not deals:
        return {"deals": [], "count": 0, "from": from_time, "to": to_time}

    results = []
    for d in deals:
        # Only include actual trade deals (entry/exit), not balance operations
        if d.type not in (mt5.DEAL_TYPE_BUY, mt5.DEAL_TYPE_SELL):
            continue

        symbol_info = mt5.symbol_info(d.symbol) if d.symbol else None
        digits = symbol_info.digits if symbol_info else 5

        results.append({
            "ticket": d.ticket,
            "order": d.order,
            "symbol": d.symbol,
            "type": d.type,
            "type_str": "BUY" if d.type == mt5.DEAL_TYPE_BUY else "SELL",
            "lots": d.volume,
            "price": round(d.price, digits),
            "profit": round(d.profit, 2),
            "swap": round(d.swap, 2),
            "commission": round(d.commission, 2),
            "fee": round(d.fee, 2) if hasattr(d, "fee") else 0,
            "comment": d.comment or "",
            "magic": d.magic if hasattr(d, "magic") else 0,
            "time": int(d.time),
            "time_str": datetime.fromtimestamp(d.time, tz=timezone.utc).isoformat(),
        })

    total_profit = sum(d["profit"] for d in results)
    return {
        "deals": results,
        "count": len(results),
        "totalProfit": round(total_profit, 2),
        "from": from_time,
        "to": to_time,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


@app.post("/api/mt5/order")
async def place_order(request: dict):
    """Place a trade order on MT5."""
    ensure_mt5()

    symbol = request.get("symbol", "")
    order_type = request.get("type", 0)  # 0 = BUY, 1 = SELL
    lots = float(request.get("lots", 0.01))
    price = float(request.get("price", 0))
    sl = float(request.get("sl", 0))
    tp = float(request.get("tp", 0))
    comment = request.get("comment", "Trading Agent")
    magic = int(request.get("magic", 0))
    deviation = int(request.get("deviation", 20))

    if not symbol:
        raise HTTPException(status_code=400, detail="Symbol is required")

    mt5_sym = mt5_symbol(symbol)
    symbol_info = mt5.symbol_info(mt5_sym)
    if not symbol_info:
        raise HTTPException(status_code=404, detail=f"Symbol {mt5_sym} not found in MT5")

    # Validate lot size
    lots = max(symbol_info.volume_min, min(symbol_info.volume_max, lots))
    # Round to lot step
    lot_step = symbol_info.volume_step or 0.01
    lots = round(lots / lot_step) * lot_step

    # Get current price if not specified (market order)
    tick = mt5.symbol_info_tick(mt5_sym)
    if not tick:
        raise HTTPException(status_code=503, detail=f"Failed to get tick for {mt5_sym}")

    if price <= 0:
        price = tick.ask if order_type == 0 else tick.bid

    point = symbol_info.point

    request_dict = {
        "action": mt5.TRADE_ACTION_DEAL,
        "symbol": mt5_sym,
        "volume": lots,
        "type": mt5.ORDER_TYPE_BUY if order_type == 0 else mt5.ORDER_TYPE_SELL,
        "price": price,
        "sl": sl if sl > 0 else 0,
        "tp": tp if tp > 0 else 0,
        "deviation": deviation,
        "magic": magic,
        "comment": comment,
        "type_time": mt5.ORDER_TIME_GTC,
        "type_filling": mt5.ORDER_FILLING_IOC,
    }

    # Try different filling modes
    filling_type = mt5.symbol_info(mt5_sym).filling_mode
    if filling_type == mt5.SYMBOL_FILLING_FOK:
        request_dict["type_filling"] = mt5.ORDER_FILLING_FOK
    elif filling_type == mt5.SYMBOL_FILLING_IOC:
        request_dict["type_filling"] = mt5.ORDER_FILLING_IOC
    else:
        # Try RETURN mode as fallback
        request_dict["type_filling"] = mt5.ORDER_FILLING_RETURN

    result = mt5.order_send(request_dict)

    if result is None:
        error = mt5.last_error()
        return {
            "success": False,
            "error": f"MT5 order_send returned None: {error}",
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }

    if result.retcode != mt5.TRADE_RETCODE_DONE:
        return {
            "success": False,
            "ticket": result.order,
            "error": f"Order failed: {result.retcode} - {result.comment}",
            "retcode": result.retcode,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }

    logger.info(
        f"Order executed: {order_type} {lots} {mt5_sym} @ {price} "
        f"SL={sl} TP={tp} → Ticket #{result.order}"
    )

    return {
        "success": True,
        "ticket": result.order,
        "price": round(result.price, symbol_info.digits),
        "volume": result.volume,
        "comment": result.comment,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


@app.post("/api/mt5/close")
async def close_position(request: dict):
    """Close a position or all positions on MT5."""
    ensure_mt5()

    ticket = request.get("ticket")
    symbol = request.get("symbol")
    close_type = request.get("type", "TICKET")  # TICKET or ALL

    if close_type == "ALL" and symbol:
        # Close all positions for a symbol
        positions = mt5.positions_get(symbol=mt5_symbol(symbol))
        if not positions:
            return {"success": True, "message": f"No open positions for {symbol}", "closed": 0}

        results = []
        for pos in positions:
            result = _close_single_position(pos)
            results.append(result)

        closed = sum(1 for r in results if r["success"])
        return {
            "success": closed == len(positions),
            "closed": closed,
            "total": len(positions),
            "results": results,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }

    elif close_type == "ALL":
        # Close ALL open positions
        positions = mt5.positions_get()
        if not positions:
            return {"success": True, "message": "No open positions", "closed": 0}

        results = []
        for pos in positions:
            result = _close_single_position(pos)
            results.append(result)

        closed = sum(1 for r in results if r["success"])
        return {
            "success": closed == len(positions),
            "closed": closed,
            "total": len(positions),
            "results": results,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }

    elif ticket:
        # Close specific position by ticket
        positions = mt5.positions_get(ticket=ticket)
        if not positions:
            return {"success": False, "error": f"Position #{ticket} not found"}

        result = _close_single_position(positions[0])
        return result

    else:
        raise HTTPException(status_code=400, detail="Must provide ticket, or symbol+type=ALL, or type=ALL")


def _close_single_position(position) -> dict:
    """Close a single MT5 position."""
    symbol_info = mt5.symbol_info(position.symbol)
    if not symbol_info:
        return {"success": False, "ticket": position.ticket, "error": f"Symbol {position.symbol} not found"}

    tick = mt5.symbol_info_tick(position.symbol)
    if not tick:
        return {"success": False, "ticket": position.ticket, "error": "Failed to get current price"}

    # Close with opposite type
    close_type = mt5.ORDER_TYPE_SELL if position.type == 0 else mt5.ORDER_TYPE_BUY
    close_price = tick.bid if position.type == 0 else tick.ask

    filling_type = symbol_info.filling_mode
    if filling_type == mt5.SYMBOL_FILLING_FOK:
        type_filling = mt5.ORDER_FILLING_FOK
    elif filling_type == mt5.SYMBOL_FILLING_IOC:
        type_filling = mt5.ORDER_FILLING_IOC
    else:
        type_filling = mt5.ORDER_FILLING_RETURN

    request_dict = {
        "action": mt5.TRADE_ACTION_DEAL,
        "symbol": position.symbol,
        "volume": position.volume,
        "type": close_type,
        "position": position.ticket,
        "price": close_price,
        "deviation": 20,
        "magic": position.magic,
        "comment": "Close by Trading Agent",
        "type_time": mt5.ORDER_TIME_GTC,
        "type_filling": type_filling,
    }

    result = mt5.order_send(request_dict)

    if result and result.retcode == mt5.TRADE_RETCODE_DONE:
        logger.info(
            f"Position closed: #{position.ticket} {position.symbol} "
            f"{position.type_str} {position.volume} lots @ {close_price} "
            f"P/L: ${position.profit:.2f}"
        )
        return {
            "success": True,
            "ticket": position.ticket,
            "symbol": position.symbol,
            "price": round(close_price, symbol_info.digits),
            "profit": round(position.profit, 2),
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }
    else:
        error_msg = f"retcode={result.retcode} - {result.comment}" if result else "MT5 returned None"
        logger.error(f"Failed to close position #{position.ticket}: {error_msg}")
        return {
            "success": False,
            "ticket": position.ticket,
            "error": error_msg,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }


@app.get("/api/mt5/symbols")
async def get_symbols():
    """Get all available symbols from MT5."""
    ensure_mt5()

    symbols = mt5.symbols_get()
    if not symbols:
        return {"symbols": [], "count": 0}

    results = []
    for s in symbols:
        results.append({
            "symbol": s.name,
            "name": s.description or s.name,
            "digits": s.digits,
            "point": s.point,
            "lot_min": s.volume_min,
            "lot_max": s.volume_max,
            "lot_step": s.volume_step,
            "spread_raw": s.spread,
            "trade_mode": s.trade_mode,
            "visible": s.visible,
        })

    return {
        "symbols": results,
        "count": len(results),
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


# ==================== SHUTDOWN ====================

@app.on_event("shutdown")
async def shutdown():
    """Clean up MT5 connection on shutdown."""
    logger.info("Shutting down MT5 bridge...")
    mt5.shutdown()
    logger.info("MT5 connection closed.")


# ==================== MAIN ====================

if __name__ == "__main__":
    print("""
    ╔══════════════════════════════════════════════════╗
    ║          MT5 BRIDGE SERVER v2.0                  ║
    ║   Trading Agent ←→ MetaTrader 5 Bridge          ║
    ╠══════════════════════════════════════════════════╣
    ║  Host: %-39s ║
    ║  Port: %-39s ║
    ║  CORS: %-39s ║
    ╚══════════════════════════════════════════════════╝
    """ % (args.host, str(args.port), args.cors_origin))

    # Test MT5 connection
    logger.info("Testing MT5 connection...")
    if init_mt5():
        logger.info("MT5 connection: OK")
    else:
        logger.warning("MT5 connection: FAILED — MT5 terminal may not be running")
        logger.warning("The server will start anyway. MT5 endpoints will return 503 until MT5 connects.")

    uvicorn.run(
        app,
        host=args.host,
        port=args.port,
        log_level=args.log_level.lower(),
        timeout_keep_alive=args.timeout,
    )
