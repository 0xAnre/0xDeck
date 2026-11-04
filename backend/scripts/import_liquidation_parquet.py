#!/usr/bin/env python3
"""Import historical Binance USD-M BTCUSDT liquidation parquet.

One-off / repeatable backfill for ``backend/.liquidations.sqlite3``. The source
files are only ever read; the database is backed up first (``--backup`` is on by
default) and the import is idempotent, so running it twice is safe.

Examples
--------
    cd backend
    python scripts/import_liquidation_parquet.py \
        --path /root/Pargali-Ibrahim-Library/data/liquidations \
        --path /root/mac-liq/data/liquidations --dry-run

    python scripts/import_liquidation_parquet.py \
        --path "/root/mac-liq/.../BTCUSDT/*/*.parquet"

``--path`` is repeatable and accepts a directory (searched recursively for
``*.parquet``), a glob, or a single parquet file. See
``app/market/liquidation_import.py`` for the column mapping and dedupe rules.
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

REPO_BACKEND = Path(__file__).resolve().parents[1]
if str(REPO_BACKEND) not in sys.path:
    sys.path.insert(0, str(REPO_BACKEND))

from app.market.liquidation_import import (  # noqa: E402
    DEFAULT_BATCH_SIZE,
    LiquidationImportError,
    format_report,
    run_import,
)
from app.market.liquidation_store import (  # noqa: E402
    resolve_liquidation_db_path,
)


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description=(
            "Import historical Binance USD-M BTCUSDT liquidation parquet into "
            "the 0xDeck liquidation store."
        ),
    )
    parser.add_argument(
        "--path",
        action="append",
        dest="paths",
        required=True,
        metavar="PATH",
        help=(
            "Directory, glob or parquet file to import. Repeat for multiple "
            "sources (e.g. the VPS archive and the Mac archive)."
        ),
    )
    parser.add_argument(
        "--db",
        default=None,
        metavar="FILE",
        help=(
            "Target SQLite file. Defaults to OXDECK_LIQUIDATIONS_DB or "
            f"{resolve_liquidation_db_path()}."
        ),
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Read and report everything, write nothing (no backup either).",
    )
    parser.add_argument(
        "--backup",
        dest="backup",
        action="store_true",
        default=True,
        help="Copy the database before writing (default).",
    )
    parser.add_argument(
        "--no-backup",
        dest="backup",
        action="store_false",
        help="Skip the pre-write database copy.",
    )
    parser.add_argument(
        "--batch-size",
        type=int,
        default=DEFAULT_BATCH_SIZE,
        metavar="N",
        help=f"Rows per INSERT batch (default {DEFAULT_BATCH_SIZE}).",
    )
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    if args.batch_size < 1:
        print("--batch-size must be >= 1", file=sys.stderr)
        return 2

    try:
        report = run_import(
            path_patterns=args.paths,
            db_path=args.db,
            dry_run=args.dry_run,
            backup=args.backup,
            batch_size=args.batch_size,
        )
    except LiquidationImportError as error:
        print(f"import failed: {error}", file=sys.stderr)
        return 1

    print(format_report(report))
    if not report.balanced:
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
