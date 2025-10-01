#!/usr/bin/env python3
"""Generate Unusual Whales predictions for backtesting."""

from __future__ import annotations

import argparse
import json
from datetime import datetime, timedelta
from pathlib import Path
from typing import Iterable

from unusual_whales_client import UnusualWhalesClient

PREDICTIONS_DIR = Path("predictions_unusual_whales")
PREDICTIONS_DIR.mkdir(exist_ok=True)


def daterange(start: datetime, end: datetime) -> Iterable[datetime]:
    """Yield each day between ``start`` and ``end`` inclusive."""

    current = start
    while current <= end:
        yield current
        current += timedelta(days=1)


def normalise_date(value: str) -> datetime:
    """Parse a YYYY-MM-DD string into a ``datetime`` value."""

    try:
        return datetime.strptime(value, "%Y-%m-%d")
    except ValueError as exc:  # pragma: no cover - defensive
        raise argparse.ArgumentTypeError(str(exc)) from exc


def generate_predictions_for_range(
    start_date: datetime,
    end_date: datetime,
    symbol: str = "SPY",
) -> None:
    """Generate baseline predictions for ``symbol`` between two dates."""

    client = UnusualWhalesClient()
    if not client.is_configured:
        raise RuntimeError(
            "Unusual Whales API token missing. Set UNUSUAL_WHALES_API_TOKEN before running."
        )

    generated: list[str] = []
    failed: list[str] = []

    for current in daterange(start_date, end_date):
        date_str = current.strftime("%Y-%m-%d")

        try:
            print(f"Fetching prediction for {symbol} on {date_str}...")
            payload = client.fetch_prediction(symbol, date_str)

            output_file = PREDICTIONS_DIR / f"{date_str}.json"
            with open(output_file, "w", encoding="utf-8") as handle:
                json.dump(payload, handle, indent=2)

            print(f"  ✅ Saved to {output_file}")
            generated.append(date_str)
        except Exception as exc:  # noqa: BLE001
            print(f"  ❌ Error fetching {date_str}: {exc}")
            failed.append(date_str)

    print("\n=== Generation Summary ===")
    print(f"Generated: {len(generated)} predictions")
    print(f"Failed: {len(failed)} predictions")

    if generated:
        print(f"\nSuccessful dates: {', '.join(generated)}")
    if failed:
        print(f"Failed dates: {', '.join(failed)}")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--symbol",
        default="SPY",
        help="Ticker symbol to request (default: SPY)",
    )
    parser.add_argument(
        "--start",
        type=normalise_date,
        help="Start date in YYYY-MM-DD format (defaults to today - days)",
    )
    parser.add_argument(
        "--end",
        type=normalise_date,
        help="End date in YYYY-MM-DD format (defaults to today)",
    )
    parser.add_argument(
        "--days",
        type=int,
        default=7,
        help="Number of trailing days to fetch when --start/--end are omitted",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()

    today = datetime.now().replace(hour=0, minute=0, second=0, microsecond=0)
    end_date = args.end or today
    start_date = args.start or end_date - timedelta(days=args.days - 1)

    if start_date > end_date:
        raise SystemExit("Start date must be on or before end date")

    print(
        "Generating Unusual Whales predictions for "
        f"{args.symbol} from {start_date.date()} to {end_date.date()}..."
    )
    generate_predictions_for_range(start_date, end_date, args.symbol)


if __name__ == "__main__":
    main()
