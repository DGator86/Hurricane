#!/usr/bin/env python3
"""Generate Unusual Whales predictions for backtesting."""

import json
from datetime import datetime, timedelta
from pathlib import Path

from unusual_whales_client import UnusualWhalesClient

PREDICTIONS_DIR = Path("predictions_unusual_whales")
PREDICTIONS_DIR.mkdir(exist_ok=True)


def generate_predictions_for_dates(days_back: int = 7, symbol: str = "SPY") -> None:
    """Generate baseline predictions for the past ``days_back`` trading days."""

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

    while current_date <= end_date:
        date_str = current_date.strftime("%Y-%m-%d")

        try:
            print(f"Fetching prediction for {symbol} on {date_str}...")
            payload = client.fetch_prediction(symbol, date_str)

            output_file = PREDICTIONS_DIR / f"{date_str}.json"
            with open(output_file, "w", encoding="utf-8") as f:
                json.dump(payload, f, indent=2)

            print(f"  ✅ Saved to {output_file}")
            generated.append(date_str)
        except Exception as exc:  # noqa: BLE001
            print(f"  ❌ Error fetching {date_str}: {exc}")
            failed.append(date_str)

        current_date += timedelta(days=1)

    print("\n=== Generation Summary ===")
    print(f"Generated: {len(generated)} predictions")
    print(f"Failed: {len(failed)} predictions")

    if generated:
        print(f"\nSuccessful dates: {', '.join(generated)}")
    if failed:
        print(f"Failed dates: {', '.join(failed)}")


if __name__ == "__main__":
    import sys

    days = 7
    if len(sys.argv) > 1:
        days = int(sys.argv[1])

    print(f"Generating Unusual Whales predictions for the past {days} days...")
    generate_predictions_for_dates(days)