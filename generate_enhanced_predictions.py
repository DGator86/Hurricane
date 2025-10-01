#!/usr/bin/env python3
"""Generate enhanced Unusual Whales predictions for backtesting."""

import json
from datetime import datetime, timedelta
from pathlib import Path

from unusual_whales_client import UnusualWhalesClient

PREDICTIONS_DIR = Path("predictions_unusual_whales")
PREDICTIONS_DIR.mkdir(exist_ok=True)


def generate_predictions_for_dates(days_back: int = 10, symbol: str = "SPY") -> None:
    """Generate enhanced predictions for ``symbol`` covering ``days_back`` days."""

    client = UnusualWhalesClient()
    if not client.is_configured:
        raise RuntimeError(
            "Unusual Whales API token missing. Set UNUSUAL_WHALES_API_TOKEN before running."
        )

    end_date = datetime.now()
    start_date = end_date - timedelta(days=days_back)

    current_date = start_date
    generated: list[str] = []
    failed: list[str] = []

    print("=" * 60)
    print("ENHANCED HURRICANE PREDICTION SYSTEM (UNUSUAL WHALES)")
    print("Target: 75%+ Accuracy with ALL Features")
    print("=" * 60)

    while current_date <= end_date:
        date_str = current_date.strftime("%Y-%m-%d")

        try:
            print(f"\n📊 Fetching enhanced prediction for {symbol} on {date_str}...")
            payload = client.fetch_enhanced_prediction(symbol, date_str)

            output_file = PREDICTIONS_DIR / f"{date_str}.json"
            with open(output_file, "w", encoding="utf-8") as f:
                json.dump(payload, f, indent=2)

            print(f"  💾 Saved to {output_file}")
            generated.append(date_str)
        except Exception as exc:  # noqa: BLE001
            print(f"  ❌ Error fetching {date_str}: {exc}")
            failed.append(date_str)

        current_date += timedelta(days=1)

    print(f"\n{'=' * 60}")
    print("GENERATION SUMMARY")
    print(f"{'=' * 60}")
    print(f"✅ Generated: {len(generated)} enhanced predictions")
    print(f"❌ Failed: {len(failed)} predictions")

    if generated:
        preview = ', '.join(generated[:5])
        print(f"\n📅 Successful dates: {preview}")
        if len(generated) > 5:
            print(f"    ... and {len(generated) - 5} more")
    if failed:
        print(f"⚠️ Failed dates: {', '.join(failed)}")

    print("\n💡 Next Step: Run backtest with enhanced predictions:")
    print("   python3 backtest_hurricane.py offline --months 1")


if __name__ == "__main__":
    import sys

    days = 10
    if len(sys.argv) > 1:
        days = int(sys.argv[1])

    print(f"Generating enhanced Unusual Whales predictions for the past {days} days...")
    generate_predictions_for_dates(days)