from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

import duckdb


@dataclass(frozen=True)
class DatasetTarget:
    name: str
    source: str
    kind: str
    file_count: int


def list_datasets(folder: Path) -> list[dict[str, str | int]]:
    results: list[dict[str, str | int]] = []
    con = duckdb.connect()

    for file in sorted(folder.glob("*.parquet")):
        row_count = con.execute(
            "SELECT COUNT(*)::BIGINT FROM read_parquet(?)",
            [str(file)],
        ).fetchone()[0]
        results.append(
            {
                "name": file.name,
                "kind": "file",
                "file_count": 1,
                "row_count": int(row_count),
            }
        )

    for child in sorted(folder.iterdir()):
        if not child.is_dir() or child.name.startswith("."):
            continue
        files = list(child.rglob("*.parquet"))
        if not files:
            continue
        results.append(
            {
                "name": child.name,
                "kind": "stream",
                "file_count": len(files),
                "row_count": 0,
            }
        )

    con.close()
    return results


def dataset_registry(folder: Path, sample_limit: int = 5) -> list[dict[str, object]]:
    registry: list[dict[str, object]] = []
    for item in list_datasets(folder):
        target = resolve_dataset(folder, str(item["name"]))
        schema = dataset_schema(target)
        preview = dataset_preview(target, sample_limit)
        chart_columns = guess_chart_columns(target)
        registry.append(
            {
                **item,
                "schema": schema,
                "preview": preview,
                "suggested": {
                    "x_column": chart_columns[0] if chart_columns else "",
                    "y_column": chart_columns[1] if chart_columns else "",
                    "symbol_column": _guess_column(schema, {"symbol", "pair"}),
                    "time_column": _guess_column(schema, {"timestamp", "time", "datetime", "date"}),
                    "price_column": _guess_column(schema, {"price", "close", "value", "best_bid"}),
                },
            }
        )
    return registry


def resolve_dataset(folder: Path, name: str) -> DatasetTarget:
    if ".." in name or name.startswith("/"):
        raise ValueError("Invalid dataset name")

    root = folder.resolve()

    if name.endswith(".parquet") and "/" not in name:
        path = (folder / name).resolve()
        if not str(path).startswith(str(root)) or not path.is_file():
            raise FileNotFoundError(name)
        return DatasetTarget(name=name, source=str(path), kind="file", file_count=1)

    if "/" in name:
        raise ValueError("Invalid dataset name")

    stream_dir = (folder / name).resolve()
    if not str(stream_dir).startswith(str(root)) or not stream_dir.is_dir():
        raise FileNotFoundError(name)

    files = list(stream_dir.rglob("*.parquet"))
    if not files:
        raise FileNotFoundError(name)

    glob_source = str(stream_dir / "**" / "*.parquet")
    return DatasetTarget(name=name, source=glob_source, kind="stream", file_count=len(files))


def dataset_schema(target: DatasetTarget) -> list[dict[str, str]]:
    con = duckdb.connect()
    rows = con.execute(
        "DESCRIBE SELECT * FROM read_parquet(?)",
        [target.source],
    ).fetchall()
    con.close()
    return [{"name": row[0], "type": row[1]} for row in rows]


def _guess_time_column(schema: list[dict[str, str]]) -> str | None:
    return next(
        (
            col["name"]
            for col in schema
            if col["name"].lower() in {"timestamp", "time", "datetime", "date", "ts"}
        ),
        None,
    )


TIME_RANGE_MS: dict[str, int] = {
    "15m": 15 * 60 * 1000,
    "1h": 60 * 60 * 1000,
    "6h": 6 * 60 * 60 * 1000,
    "24h": 24 * 60 * 60 * 1000,
    "7d": 7 * 24 * 60 * 60 * 1000,
}

VALID_TIME_RANGES = set(TIME_RANGE_MS.keys()) | {"all"}

VALID_AGGREGATIONS = {"last", "avg", "sum", "min", "max", "count", "change"}

NUMERIC_TYPES = {"BIGINT", "DOUBLE", "FLOAT", "INTEGER", "HUGEINT", "DECIMAL", "NUMERIC"}


def normalize_time_range(range_key: str | None) -> str:
    if range_key and range_key in VALID_TIME_RANGES:
        return range_key
    return "all"


def normalize_aggregation(agg: str | None) -> str:
    if agg and agg in VALID_AGGREGATIONS:
        return agg
    return "last"


def _schema_column_type(schema: list[dict[str, str]], column_name: str) -> str:
    for column in schema:
        if column["name"] == column_name:
            return column["type"]
    return "VARCHAR"


TIME_RANGE_INTERVAL: dict[str, str] = {
    "15m": "15 minutes",
    "1h": "1 hour",
    "6h": "6 hours",
    "24h": "24 hours",
    "7d": "7 days",
}


def _column_base_type(schema: list[dict[str, str]], column_name: str) -> str:
    return _schema_column_type(schema, column_name).split("(")[0].upper()


def _is_epoch_like_number(value: float) -> bool:
    return value > 1e9


def _resolve_time_value_kind(
    con: duckdb.DuckDBPyConnection,
    target: DatasetTarget,
    time_column: str,
    schema: list[dict[str, str]],
) -> str:
    base = _column_base_type(schema, time_column)
    if base in NUMERIC_TYPES:
        return "numeric"
    if base in {"TIMESTAMP", "TIMESTAMP WITH TIME ZONE", "DATE"}:
        return "timestamp"
    max_val = _fetch_max_timestamp(con, target, time_column)
    if isinstance(max_val, str):
        try:
            numeric = float(max_val.strip())
        except ValueError:
            return "datetime_text"
        if _is_epoch_like_number(numeric):
            return "epoch_text"
    return "datetime_text"


def _numeric_cutoff_expression(max_column: str, range_key: str) -> str:
    delta_ms = TIME_RANGE_MS[range_key]
    return f"""CASE
        WHEN {max_column} > 1e15 THEN {max_column} - {delta_ms * 1000}::DOUBLE
        WHEN {max_column} > 1e12 THEN {max_column} - {delta_ms}::DOUBLE
        WHEN {max_column} > 1e9 THEN {max_column} - {delta_ms // 1000}::DOUBLE
        ELSE {max_column} - {delta_ms}::DOUBLE
    END"""


def _time_sort_expression(time_column: str, kind: str) -> str:
    col = _quote_identifier(time_column)
    if kind == "datetime_text":
        return f"try_cast({col} AS TIMESTAMP)"
    if kind == "epoch_text":
        return f"try_cast({col} AS DOUBLE)"
    return col


def _time_range_predicate_sql(time_column: str, kind: str, range_key: str) -> str:
    col = _quote_identifier(time_column)
    interval = TIME_RANGE_INTERVAL[range_key]
    if kind == "numeric":
        return f"""{col} >= (
            SELECT {_numeric_cutoff_expression("max_val", range_key)}
            FROM (SELECT MAX({col})::DOUBLE AS max_val FROM read_parquet(?)) AS bounds
        )"""
    if kind == "epoch_text":
        value_expr = f"try_cast({col} AS DOUBLE)"
        return f"""{value_expr} >= (
            SELECT {_numeric_cutoff_expression("max_val", range_key)}
            FROM (SELECT MAX({value_expr}) AS max_val FROM read_parquet(?)) AS bounds
        )"""
    if kind == "timestamp":
        return f"""{col} >= (
            SELECT MAX({col}) - INTERVAL '{interval}'
            FROM read_parquet(?)
        )"""
    ts_expr = f"try_cast({col} AS TIMESTAMP)"
    return f"""{ts_expr} >= (
        SELECT MAX({ts_expr}) - INTERVAL '{interval}'
        FROM read_parquet(?)
    )"""


def _fetch_max_timestamp(con: duckdb.DuckDBPyConnection, target: DatasetTarget, time_column: str) -> object | None:
    row = con.execute(
        f"""
        SELECT {_quote_identifier(time_column)}
        FROM read_parquet(?)
        ORDER BY 1 DESC
        LIMIT 1
        """,
        [target.source],
    ).fetchone()
    return row[0] if row else None


def dataset_preview(target: DatasetTarget, limit: int = 50, range_key: str = "all") -> dict[str, object]:
    schema = dataset_schema(target)
    order_column = _guess_time_column(schema)
    range_key = normalize_time_range(range_key)

    con = duckdb.connect()
    kind = _resolve_time_value_kind(con, target, order_column, schema) if order_column else None
    sort_expr = _time_sort_expression(order_column, kind) if order_column and kind else None
    if order_column and range_key != "all" and kind:
        predicate = _time_range_predicate_sql(order_column, kind, range_key)
        relation = con.execute(
            f"""
                SELECT * FROM read_parquet(?)
                WHERE {predicate}
                ORDER BY {sort_expr} DESC
                LIMIT ?
                """,
            [target.source, target.source, limit],
        )
    elif order_column:
        relation = con.execute(
            f"""
            SELECT * FROM read_parquet(?)
            ORDER BY {sort_expr} DESC
            LIMIT ?
            """,
            [target.source, limit],
        )
    else:
        relation = con.execute("SELECT * FROM read_parquet(?) LIMIT ?", [target.source, limit])

    columns = [col[0] for col in relation.description]
    rows = relation.fetchall()
    con.close()
    return {
        "columns": columns,
        "rows": [list(row) for row in rows],
    }


def dataset_series(
    target: DatasetTarget,
    x_column: str,
    y_column: str,
    limit: int = 120,
    range_key: str = "all",
) -> list[dict[str, object]]:
    schema_rows = dataset_schema(target)
    schema = {col["name"] for col in schema_rows}
    if x_column not in schema or y_column not in schema:
        raise ValueError("Column not found in dataset")

    range_key = normalize_time_range(range_key)
    con = duckdb.connect()
    kind = _resolve_time_value_kind(con, target, x_column, schema_rows)
    x_sort = _time_sort_expression(x_column, kind)
    if range_key != "all":
        predicate = _time_range_predicate_sql(x_column, kind, range_key)
        query = f"""
                SELECT {_quote_identifier(x_column)} AS x, {_quote_identifier(y_column)} AS y
                FROM read_parquet(?)
                WHERE {predicate}
                ORDER BY {x_sort} ASC
                LIMIT ?
            """
        rows = con.execute(query, [target.source, target.source, limit]).fetchall()
        con.close()
        return [{"x": row[0], "y": row[1]} for row in rows]

    query = f"""
        SELECT {_quote_identifier(x_column)} AS x, {_quote_identifier(y_column)} AS y
        FROM read_parquet(?)
        ORDER BY {x_sort} DESC
        LIMIT ?
    """
    rows = con.execute(query, [target.source, limit]).fetchall()
    con.close()
    rows.reverse()
    return [{"x": row[0], "y": row[1]} for row in rows]


def _is_numeric_column(schema: list[dict[str, str]], column_name: str) -> bool:
    for column in schema:
        if column["name"] == column_name:
            return column["type"].split("(")[0].upper() in NUMERIC_TYPES
    return False


def dataset_kpi(
    target: DatasetTarget,
    metric_column: str,
    agg: str = "last",
    range_key: str = "all",
) -> dict[str, object]:
    schema = dataset_schema(target)
    column_names = {col["name"] for col in schema}
    if metric_column not in column_names:
        raise ValueError("Column not found in dataset")

    agg = normalize_aggregation(agg)
    range_key = normalize_time_range(range_key)
    time_column = _guess_time_column(schema)

    if agg != "count" and not _is_numeric_column(schema, metric_column):
        raise ValueError("Metric column must be numeric for this aggregation")

    metric_col = _quote_identifier(metric_column)
    con = duckdb.connect()

    where_sql = ""
    params: list[object] = [target.source]
    time_sort = None
    if time_column and range_key != "all":
        kind = _resolve_time_value_kind(con, target, time_column, schema)
        time_sort = _time_sort_expression(time_column, kind)
        predicate = _time_range_predicate_sql(time_column, kind, range_key)
        where_sql = f" WHERE {predicate}"
        params = [target.source, target.source]

    filtered = f"SELECT * FROM read_parquet(?){where_sql}"
    row_count = con.execute(f"SELECT COUNT(*)::BIGINT FROM ({filtered}) src", params).fetchone()[0]

    value: object = None
    as_of: object = None

    if row_count == 0:
        con.close()
        return {
            "name": target.name,
            "metric_column": metric_column,
            "aggregation": agg,
            "range": range_key,
            "value": None,
            "row_count": 0,
            "as_of": None,
        }

    if agg == "count":
        value = row_count
    elif agg == "last":
        if time_column:
            time_col = time_sort or _quote_identifier(time_column)
            row = con.execute(
                f"""
                SELECT {metric_col}, {_quote_identifier(time_column)}
                FROM ({filtered}) src
                ORDER BY {time_col} DESC
                LIMIT 1
                """,
                params,
            ).fetchone()
            value, as_of = row[0], row[1]
        else:
            value = con.execute(
                f"SELECT {metric_col} FROM ({filtered}) src LIMIT 1",
                params,
            ).fetchone()[0]
    elif agg == "change":
        if not time_column:
            con.close()
            raise ValueError("Change aggregation requires a timestamp column")
        time_col = time_sort or _quote_identifier(time_column)
        row = con.execute(
            f"""
            WITH src AS ({filtered}),
            first_row AS (
                SELECT {metric_col} AS metric_value
                FROM src
                ORDER BY {time_col} ASC
                LIMIT 1
            ),
            last_row AS (
                SELECT {metric_col} AS metric_value, {_quote_identifier(time_column)} AS ts
                FROM src
                ORDER BY {time_col} DESC
                LIMIT 1
            )
            SELECT
                CASE
                    WHEN first_row.metric_value IS NULL
                      OR first_row.metric_value = 0 THEN NULL
                    ELSE ((last_row.metric_value - first_row.metric_value)
                      / ABS(first_row.metric_value)) * 100
                END,
                last_row.ts
            FROM first_row, last_row
            """,
            params,
        ).fetchone()
        value, as_of = row[0], row[1]
    else:
        sql_agg = agg.upper()
        value = con.execute(
            f"SELECT {sql_agg}({metric_col})::DOUBLE FROM ({filtered}) src",
            params,
        ).fetchone()[0]

    con.close()
    return {
        "name": target.name,
        "metric_column": metric_column,
        "aggregation": agg,
        "range": range_key,
        "value": value,
        "row_count": int(row_count),
        "as_of": as_of,
    }


def guess_chart_columns(target: DatasetTarget) -> tuple[str, str] | None:
    schema = dataset_schema(target)
    if not schema:
        return None

    x_candidates = {"timestamp", "time", "date", "datetime", "ts"}
    y_candidates = {"price", "close", "value", "amount", "best_bid", "quantity"}

    x_col = next((col["name"] for col in schema if col["name"].lower() in x_candidates), None)
    y_col = next((col["name"] for col in schema if col["name"].lower() in y_candidates), None)

    if x_col and y_col:
        return x_col, y_col

    numeric_types = {"BIGINT", "DOUBLE", "FLOAT", "INTEGER", "HUGEINT", "DECIMAL"}
    numeric_cols = [col["name"] for col in schema if col["type"].split("(")[0] in numeric_types]
    if len(schema) >= 2:
        return schema[0]["name"], numeric_cols[0] if numeric_cols else schema[1]["name"]
    return None


def _quote_identifier(name: str) -> str:
    return '"' + name.replace('"', '""') + '"'


def _guess_column(schema: list[dict[str, str]], candidates: set[str]) -> str:
    return next((col["name"] for col in schema if col["name"].lower() in candidates), "")
