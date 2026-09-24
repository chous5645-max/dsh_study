"""THROWAWAY PROTOTYPE: synthetic normalized records, SQLite transaction probe."""

import hashlib
import json
import os
import sqlite3
import time
from datetime import date


def encode(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def digest(value):
    return hashlib.sha256(encode(value).encode("utf-8")).hexdigest()


def source_key(row):
    return "|".join((row["book"], row["channel"], row["scope"], row["transaction_id"]))


def order_key(row):
    if row.get("order_verified") and row.get("order_namespace") and row.get("order_id"):
        return "|".join((row["book"], row["order_namespace"], row["order_id"]))
    return None


def unit_key(row):
    return order_key(row) or source_key(row)


def valid(row):
    try:
        date.fromisoformat(row["date"])
        return (
            row["book"] and row["scope"] and row["transaction_id"]
            and type(row["amount_minor"]) is int and row["amount_minor"] > 0
            and row["currency"] == "CNY" and row["status"] == "completed"
            and (
                (row["channel"] == "wechat" and row["kind"] == "purchase" and row["funding_account"])
                or (row["channel"] == "bank" and row["kind"] == "debit" and row["account"])
            )
        )
    except (KeyError, TypeError, ValueError):
        return False


def compatible(rows):
    if len(rows) == 1:
        return True
    if len(rows) != 2 or {row["channel"] for row in rows} != {"wechat", "bank"}:
        return False
    wechat = next(row for row in rows if row["channel"] == "wechat")
    bank = next(row for row in rows if row["channel"] == "bank")
    return (
        wechat["amount_minor"] == bank["amount_minor"]
        and wechat["currency"] == bank["currency"]
        and wechat["date"] == bank["date"]
        and wechat["funding_account"] == bank["account"]
    )


def connect(path):
    db = sqlite3.connect(path, timeout=30, isolation_level=None)
    db.row_factory = sqlite3.Row
    db.execute("PRAGMA foreign_keys = ON")
    db.execute("PRAGMA busy_timeout = 30000")
    db.execute("PRAGMA journal_mode = WAL")
    return db


def initialize(path):
    db = connect(path)
    db.executescript("""
        CREATE TABLE IF NOT EXISTS batches (
            batch_id TEXT PRIMARY KEY, request_hash TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS events (
            id INTEGER PRIMARY KEY, book TEXT NOT NULL, order_key TEXT UNIQUE,
            expense_minor INTEGER NOT NULL DEFAULT 0,
            bank_delta_minor INTEGER NOT NULL DEFAULT 0,
            bank_account TEXT
        );
        CREATE TABLE IF NOT EXISTS sources (
            source_key TEXT PRIMARY KEY, event_id INTEGER NOT NULL REFERENCES events(id),
            fact_hash TEXT NOT NULL, row_json TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS batch_units (
            batch_id TEXT NOT NULL REFERENCES batches(batch_id),
            unit_key TEXT NOT NULL, request_hash TEXT NOT NULL,
            result_json TEXT NOT NULL, PRIMARY KEY(batch_id, unit_key)
        );
        CREATE TABLE IF NOT EXISTS notices (
            id INTEGER PRIMARY KEY, batch_id TEXT NOT NULL,
            source_key TEXT NOT NULL, code TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS issues (
            id INTEGER PRIMARY KEY, batch_id TEXT NOT NULL,
            unit_key TEXT NOT NULL, code TEXT NOT NULL, row_json TEXT NOT NULL
        );
    """)
    db.close()


def register_batch(db, batch_id, rows):
    request_hash = digest(rows)
    db.execute("BEGIN IMMEDIATE")
    try:
        old = db.execute("SELECT request_hash FROM batches WHERE batch_id = ?", (batch_id,)).fetchone()
        if old and old["request_hash"] != request_hash:
            raise ValueError("IDEMPOTENCY_CONFLICT")
        if not old:
            db.execute("INSERT INTO batches VALUES (?, ?)", (batch_id, request_hash))
        db.commit()
    except BaseException:
        db.rollback()
        raise


def apply_unit(db, batch_id, key, incoming, crash_after_effect=False, delay=0):
    request_hash = digest(incoming)
    db.execute("BEGIN IMMEDIATE")
    try:
        if delay:
            time.sleep(delay)
        old = db.execute(
            "SELECT request_hash, result_json FROM batch_units WHERE batch_id = ? AND unit_key = ?",
            (batch_id, key),
        ).fetchone()
        if old:
            if old["request_hash"] != request_hash:
                raise ValueError("UNIT_IDEMPOTENCY_CONFLICT")
            result = json.loads(old["result_json"])
            db.commit()
            return result

        unique = {}
        repeated_in_batch = []
        conflict = False
        for row in incoming:
            identity = source_key(row)
            if identity in unique:
                if digest(unique[identity]) == digest(row):
                    repeated_in_batch.append(identity)
                else:
                    conflict = True
            else:
                unique[identity] = row
        incoming_unique = list(unique.values())
        uncertain = not all(valid(row) for row in incoming_unique)
        old_sources = {}
        for identity in unique:
            found = db.execute("SELECT fact_hash, row_json FROM sources WHERE source_key = ?", (identity,)).fetchone()
            if found:
                old_sources[identity] = found
                if found["fact_hash"] != digest(unique[identity]):
                    conflict = True

        event = db.execute("SELECT * FROM events WHERE order_key = ?", (key,)).fetchone()
        existing_rows = []
        if event:
            existing_rows = [json.loads(item["row_json"]) for item in db.execute(
                "SELECT row_json FROM sources WHERE event_id = ?", (event["id"],)
            )]
        fresh = [row for row in incoming_unique if source_key(row) not in old_sources]
        combined = existing_rows + fresh
        if key != unit_key(incoming_unique[0]):
            raise AssertionError("UNIT_KEY_CHANGED")
        if key == source_key(incoming_unique[0]) and len(combined) > 1:
            conflict = True
        if not compatible(combined):
            conflict = True

        if uncertain or conflict:
            code = "UNCERTAIN_FACT" if uncertain else "FACT_CONFLICT"
            db.execute("INSERT INTO issues(batch_id, unit_key, code, row_json) VALUES (?, ?, ?, ?)",
                       (batch_id, key, code, encode(incoming)))
            result = {"status": "review", "code": code, "posted": 0, "linked": 0, "skipped": 0}
        else:
            skipped = list(old_sources) + repeated_in_batch
            for identity in skipped:
                db.execute(
                    "INSERT INTO notices(batch_id, source_key, code) VALUES (?, ?, 'SAME_SOURCE')",
                    (batch_id, identity),
                )
            if fresh:
                if event is None:
                    cursor = db.execute(
                        "INSERT INTO events(book, order_key) VALUES (?, ?)",
                        (fresh[0]["book"], order_key(fresh[0])),
                    )
                    event_id = cursor.lastrowid
                else:
                    event_id = event["id"]
                for row in fresh:
                    db.execute(
                        "INSERT INTO sources(source_key, event_id, fact_hash, row_json) VALUES (?, ?, ?, ?)",
                        (source_key(row), event_id, digest(row), encode(row)),
                    )
                wechat = next((row for row in combined if row["channel"] == "wechat"), None)
                bank = next((row for row in combined if row["channel"] == "bank"), None)
                db.execute(
                    "UPDATE events SET expense_minor = ?, bank_delta_minor = ?, bank_account = ? WHERE id = ?",
                    (wechat["amount_minor"] if wechat else 0,
                     -bank["amount_minor"] if bank else 0,
                     bank["account"] if bank else None, event_id),
                )
                if crash_after_effect:
                    os._exit(77)
            result = {
                "status": "applied" if fresh else "skipped",
                "posted": int(bool(fresh and event is None)),
                "linked": int(bool(fresh and len(combined) == 2)),
                "skipped": len(skipped),
            }

        db.execute(
            "INSERT INTO batch_units VALUES (?, ?, ?, ?)",
            (batch_id, key, request_hash, encode(result)),
        )
        db.commit()
        return result
    except BaseException:
        db.rollback()
        raise


def apply_batch(path, batch_id, rows, crash_unit=None, delay=0):
    db = connect(path)
    try:
        register_batch(db, batch_id, rows)
        groups = {}
        for row in rows:
            groups.setdefault(unit_key(row), []).append(row)
        results = {}
        for key, group in groups.items():
            results[key] = apply_unit(db, batch_id, key, group,
                                      crash_after_effect=(key == crash_unit), delay=delay)
        return results
    finally:
        db.close()


def snapshot(path):
    db = connect(path)
    try:
        events = [dict(row) for row in db.execute("SELECT * FROM events ORDER BY id")]
        return {
            "events": events,
            "sources": db.execute("SELECT COUNT(*) FROM sources").fetchone()[0],
            "expense_minor": sum(row["expense_minor"] for row in events),
            "bank_delta_minor": sum(row["bank_delta_minor"] for row in events),
            "notices": db.execute("SELECT COUNT(*) FROM notices").fetchone()[0],
            "issues": db.execute("SELECT COUNT(*) FROM issues").fetchone()[0],
            "units": db.execute("SELECT COUNT(*) FROM batch_units").fetchone()[0],
        }
    finally:
        db.close()
