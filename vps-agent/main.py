"""
main.py — Entry point for the AI Trading Agent service.

Startup sequence:
  1. Configure logging
  2. Run DB migrations (ensure AuditLog table exists)
  3. Ensure AgentState singleton exists
  4. Register SIGTERM/SIGINT handlers for clean shutdown
  5. Start the scheduler loop (runs cycle every SCAN_INTERVAL_MINUTES)

The agent respects AgentState.isRunning from the DB — the Next.js dashboard
can start/stop it by patching that flag. No restart needed.
"""

from __future__ import annotations

import asyncio
import logging
import signal
import sys
import time

from config import SCAN_INTERVAL_MINUTES, IDLE_POLL_SECONDS
from database import run_migrations, ensure_agent_state, get_agent_state, close_pool
from agent import run_cycle

# ─── Logging ──────────────────────────────────────────────────────────────────

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(name)s  %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
    handlers=[
        logging.StreamHandler(sys.stdout),
    ],
)
logger = logging.getLogger("main")

# ─── Graceful shutdown ────────────────────────────────────────────────────────

_shutdown = False


def _handle_signal(signum, _frame):
    global _shutdown
    logger.info("Signal %s received — shutting down after current cycle", signum)
    _shutdown = True


signal.signal(signal.SIGTERM, _handle_signal)
signal.signal(signal.SIGINT,  _handle_signal)


# ─── Scheduler ────────────────────────────────────────────────────────────────

async def _scheduler():
    """
    Main loop.
    - When agent is running: execute full scan cycle every SCAN_INTERVAL_MINUTES.
    - When agent is stopped: poll DB every IDLE_POLL_SECONDS waiting to be started.
    """
    logger.info("=" * 60)
    logger.info("AI Trading Agent starting up")
    logger.info("Scan interval: %d minutes", SCAN_INTERVAL_MINUTES)
    logger.info("=" * 60)

    scan_interval_s = SCAN_INTERVAL_MINUTES * 60

    while not _shutdown:
        try:
            state = get_agent_state()
        except Exception as e:
            logger.error("DB error reading agent state — retrying in 30s: %s", e)
            await asyncio.sleep(30)
            continue

        if state and state.get("isRunning"):
            cycle_start = time.time()
            try:
                await run_cycle()
            except Exception as e:
                logger.exception("Unhandled exception in cycle: %s", e)

            # Sleep until next interval mark
            elapsed = time.time() - cycle_start
            sleep_for = max(0.0, scan_interval_s - elapsed)
            logger.info("Next cycle in %.0fs", sleep_for)

            # Sleep in 1-second chunks so shutdown signal is responsive
            for _ in range(int(sleep_for)):
                if _shutdown:
                    break
                await asyncio.sleep(1)
        else:
            # Agent stopped — idle poll
            await asyncio.sleep(IDLE_POLL_SECONDS)

    logger.info("Agent shut down cleanly")


# ─── Entry point ──────────────────────────────────────────────────────────────

def main():
    logger.info("Running DB migrations…")
    try:
        run_migrations()
        ensure_agent_state()
    except Exception as e:
        logger.critical("DB setup failed: %s", e)
        sys.exit(1)

    logger.info("DB ready. Starting scheduler.")
    try:
        asyncio.run(_scheduler())
    finally:
        close_pool()


if __name__ == "__main__":
    main()
