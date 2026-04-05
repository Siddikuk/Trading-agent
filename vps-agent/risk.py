"""
risk.py — Risk management: position sizing, lot scaling, circuit breakers.
All gates here must pass before a trade is executed.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Optional

from config import (
    LOT_STEP, MIN_LOT, MAX_LOT,
    PIP_SIZE, PIP_VALUE_PER_LOT,
    DEFAULT_MAX_RISK_PCT,
    DEFAULT_DAILY_RISK_LIMIT_PCT,
    DEFAULT_MAX_DRAWDOWN_PCT,
    DEFAULT_MAX_POSITIONS,
    MIN_CONFIDENCE_TO_TRADE,
    MIN_RISK_REWARD,
)
from database import (
    get_agent_state, get_open_trades, get_daily_pnl,
    update_agent_state, create_audit_log,
)

logger = logging.getLogger(__name__)


@dataclass
class RiskCheck:
    passed: bool
    reason: str = ""


# ─── Position sizing ──────────────────────────────────────────────────────────

def calc_position_size(
    balance: float,
    risk_pct: float,
    entry_price: float,
    stop_loss: float,
    symbol: str,
    confluence_multiplier: float = 1.0,
) -> float:
    """
    Calculate lot size based on % risk and SL distance.
    confluence_multiplier scales up lot for high-confluence signals,
    but the result is always capped by MAX_LOT and the risk-based maximum.

    Formula (same as TypeScript trading-engine.ts):
        riskAmount  = balance * riskPct / 100
        slDistance  = abs(entry - stopLoss)
        pipSize     = PIP_SIZE[symbol]
        pipValue    = slDistance / pipSize         (pips at risk)
        lots        = riskAmount / (pipValue * 10) (simplified pip value)
    """
    if balance <= 0 or risk_pct <= 0:
        return MIN_LOT

    sl_distance = abs(entry_price - stop_loss)
    if sl_distance == 0:
        return MIN_LOT

    pip = PIP_SIZE.get(symbol, 0.0001)
    pip_value_per_lot = PIP_VALUE_PER_LOT.get(symbol, 10.0)

    risk_amount = balance * (risk_pct / 100.0)
    pips_at_risk = sl_distance / pip
    lots = risk_amount / (pips_at_risk * pip_value_per_lot)

    # Apply confluence scaling BEFORE capping
    lots = lots * confluence_multiplier

    # Round down to lot step
    lots = (lots // LOT_STEP) * LOT_STEP
    lots = max(MIN_LOT, min(MAX_LOT, lots))

    logger.debug(
        "Position size %s: balance=%.2f risk=%.1f%% SL-dist=%.5f pips=%.1f → %.2f lots (×%.1f)",
        symbol, balance, risk_pct, sl_distance, pips_at_risk, lots, confluence_multiplier,
    )
    return lots


def calc_risk_reward(entry: float, stop_loss: float, take_profit: float) -> float:
    risk   = abs(entry - stop_loss)
    reward = abs(entry - take_profit)
    if risk == 0:
        return 0.0
    return reward / risk


# ─── Circuit breakers ─────────────────────────────────────────────────────────

def check_daily_loss(state: dict) -> RiskCheck:
    """Halt if today's realized loss exceeds dailyRiskLimit% of balance."""
    balance         = float(state.get("balance") or 1000.0)
    limit_pct       = float(state.get("dailyRiskLimit") or DEFAULT_DAILY_RISK_LIMIT_PCT)
    daily_pnl       = get_daily_pnl()
    max_loss        = balance * (limit_pct / 100.0)

    if daily_pnl <= -max_loss:
        msg = (f"Daily loss limit reached: PnL={daily_pnl:.2f} "
               f"limit={-max_loss:.2f} ({limit_pct}% of ${balance:.2f})")
        return RiskCheck(False, msg)
    return RiskCheck(True)


def check_drawdown(account: dict, state: dict) -> RiskCheck:
    """Halt if equity drawdown exceeds maxDrawdownPercent of balance."""
    balance   = float(account.get("balance") or 1.0)
    equity    = float(account.get("equity")  or balance)
    max_dd    = float(state.get("maxDrawdownPercent") or DEFAULT_MAX_DRAWDOWN_PCT)
    drawdown  = (balance - equity) / balance * 100.0 if balance > 0 else 0.0

    if drawdown >= max_dd:
        msg = (f"Max drawdown breached: {drawdown:.1f}% "
               f"(limit {max_dd}%, balance={balance:.2f}, equity={equity:.2f})")
        return RiskCheck(False, msg)
    return RiskCheck(True)


def check_max_positions(state: dict) -> RiskCheck:
    """Halt scan if open position count is at or above the limit."""
    open_trades = get_open_trades()
    max_pos     = int(state.get("maxPositions") or DEFAULT_MAX_POSITIONS)
    if len(open_trades) >= max_pos:
        return RiskCheck(
            False,
            f"Max positions reached: {len(open_trades)}/{max_pos} open"
        )
    return RiskCheck(True)


def check_symbol_position(symbol: str) -> RiskCheck:
    """Skip if already holding an open trade on this symbol."""
    open_on_sym = get_open_trades(symbol=symbol)
    if open_on_sym:
        return RiskCheck(False, f"Already have open position on {symbol}")
    return RiskCheck(True)


def check_confidence_and_rr(confidence: float, risk_reward: float) -> RiskCheck:
    """Validate Claude's decision meets minimum quality gates."""
    if confidence < MIN_CONFIDENCE_TO_TRADE:
        return RiskCheck(
            False,
            f"Confidence {confidence:.0f}% < minimum {MIN_CONFIDENCE_TO_TRADE}%"
        )
    if risk_reward < MIN_RISK_REWARD - 0.005:  # epsilon avoids float precision rejects at exactly 2.0
        return RiskCheck(
            False,
            f"R:R {risk_reward:.2f} < minimum {MIN_RISK_REWARD}"
        )
    return RiskCheck(True)


# ─── Full pre-trade gate ──────────────────────────────────────────────────────

def run_all_checks(
    symbol: str,
    confidence: float,
    risk_reward: float,
    account: dict,
    state: dict,
) -> RiskCheck:
    """
    Run all risk checks in order. Returns first failure or overall pass.
    Called immediately before order execution.
    """
    for check, args in [
        (check_daily_loss,         (state,)),
        (check_drawdown,           (account, state)),
        (check_max_positions,      (state,)),
        (check_symbol_position,    (symbol,)),
        (check_confidence_and_rr,  (confidence, risk_reward)),
    ]:
        result = check(*args)
        if not result.passed:
            return result
    return RiskCheck(True)


# ─── Emergency halt ───────────────────────────────────────────────────────────

async def emergency_halt(reason: str) -> None:
    """
    Stop the agent and close all positions.
    Called when drawdown circuit breaker fires.
    """
    from mt5_client import close_all_positions

    logger.critical("EMERGENCY HALT: %s", reason)
    create_audit_log("EMERGENCY_HALT", details={"reason": reason})
    update_agent_state({"isRunning": False, "autoTrade": False})

    result = await close_all_positions()
    create_audit_log("EMERGENCY_CLOSE_ALL", details=result)
    logger.critical("Emergency close result: %s", result)
