"""One-command synthetic SQLite verification. State is under ignored root .runtime/."""

import json
import sqlite3
import subprocess
import sys
from pathlib import Path
from uuid import uuid4

from store import apply_batch, initialize, order_key, snapshot


BASE = {
    "book": "personal", "amount_minor": 3500, "date": "2026-01-08",
    "currency": "CNY", "status": "completed", "order_namespace": "merchant-order",
    "order_verified": True,
}


def wechat(transaction_id, order_id, **changes):
    return {
        **BASE, "channel": "wechat", "kind": "purchase", "scope": "wechat-user",
        "transaction_id": transaction_id, "order_id": order_id,
        "funding_account": "bank-A", **changes,
    }


def bank(transaction_id, order_id, **changes):
    return {
        **BASE, "channel": "bank", "kind": "debit", "scope": "bank-A",
        "transaction_id": transaction_id, "order_id": order_id,
        "account": "bank-A", **changes,
    }


def check(label, db_path, result):
    state = snapshot(db_path)
    print(label, json.dumps({"result": result, "state": state}, ensure_ascii=False, sort_keys=True))
    return state


def new_db(root, name):
    path = root / f"{name}.sqlite"
    initialize(path)
    return path


def worker():
    _, _, db_path, batch_id, rows_json, crash_key, delay = sys.argv
    apply_batch(db_path, batch_id, json.loads(rows_json),
                crash_unit=crash_key or None, delay=float(delay))


def main():
    root = Path(__file__).resolve().parents[2] / ".runtime" / "finance-sqlite-probe" / str(uuid4())
    root.mkdir(parents=True)

    # Atomic same-order effect, durable re-open, request retry, new-batch duplicate notice.
    first_db = new_db(root, "basic")
    pair = [wechat("W-1", "ORDER-1"), bank("B-1", "ORDER-1")]
    first = apply_batch(first_db, "initial", pair)
    state = check("shared-order", first_db, first)
    assert len(state["events"]) == 1 and state["sources"] == 2
    assert (state["expense_minor"], state["bank_delta_minor"]) == (3500, -3500)
    assert next(iter(first.values()))["linked"] == 1

    again = apply_batch(first_db, "initial", pair)
    state = check("same-request-retry", first_db, again)
    assert again == first and state["notices"] == 0
    repeated = apply_batch(first_db, "new-import", pair)
    state = check("same-source-new-import", first_db, repeated)
    assert next(iter(repeated.values()))["skipped"] == 2
    assert state["notices"] == 2 and len(state["events"]) == 1
    try:
        apply_batch(first_db, "initial", [wechat("W-X", "ORDER-X")])
        raise AssertionError("Reusing a batch id for different contents should fail")
    except ValueError as error:
        assert str(error) == "IDEMPOTENCY_CONFLICT"

    # Two actual processes attempt the same order from separate batches.
    concurrent_db = new_db(root, "concurrent")
    child_args = [sys.executable, str(Path(__file__).resolve()), "--worker",
                  str(concurrent_db), "", json.dumps(pair), "", "0.2"]
    left_args = child_args.copy()
    right_args = child_args.copy()
    left_args[4], right_args[4] = "parallel-left", "parallel-right"
    left = subprocess.Popen(left_args, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    right = subprocess.Popen(right_args, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    left_out, left_err = left.communicate(timeout=30)
    right_out, right_err = right.communicate(timeout=30)
    assert left.returncode == 0, (left_out, left_err)
    assert right.returncode == 0, (right_out, right_err)
    state = check("two-process-race", concurrent_db, {"left": left.returncode, "right": right.returncode})
    assert len(state["events"]) == 1 and state["sources"] == 2
    assert (state["expense_minor"], state["bank_delta_minor"]) == (3500, -3500)
    assert state["notices"] == 2

    # Crash after event/source writes, before transaction commit: no half-posted unit remains.
    crash_db = new_db(root, "crash")
    crash_pair = [wechat("W-2", "ORDER-2"), bank("B-2", "ORDER-2")]
    crash_key = order_key(crash_pair[0])
    crashed = subprocess.run(
        [sys.executable, str(Path(__file__).resolve()), "--worker", str(crash_db),
         "crashing-batch", json.dumps(crash_pair), crash_key, "0"],
        capture_output=True, text=True, timeout=30,
    )
    assert crashed.returncode == 77, (crashed.stdout, crashed.stderr)
    state = check("crash-before-commit", crash_db, {"exit": crashed.returncode})
    assert not state["events"] and state["sources"] == 0 and state["units"] == 0
    recovered = apply_batch(crash_db, "crashing-batch", crash_pair)
    state = check("retry-after-crash", crash_db, recovered)
    assert len(state["events"]) == 1
    assert (state["expense_minor"], state["bank_delta_minor"]) == (3500, -3500)

    # A related uncertain pair waits; a separate clear unit commits.
    partial_db = new_db(root, "partial")
    partial_rows = [wechat("W-3", "ORDER-3"), bank("B-3", "ORDER-3", date=""),
                    wechat("W-4", "ORDER-4", amount_minor=2000)]
    partial = apply_batch(partial_db, "partial-batch", partial_rows)
    state = check("partial-batch", partial_db, partial)
    assert partial[order_key(partial_rows[0])]["status"] == "review"
    assert partial[order_key(partial_rows[2])]["status"] == "applied"
    assert len(state["events"]) == 1 and state["expense_minor"] == 2000
    assert state["bank_delta_minor"] == 0 and state["issues"] == 1
    with sqlite3.connect(partial_db) as db:
        reviewed_rows = json.loads(db.execute("SELECT row_json FROM issues").fetchone()[0])
    assert len(reviewed_rows) == 2 and reviewed_rows[1]["date"] == ""

    # A crash in a later unit preserves an earlier committed unit and does not replay it.
    partial_crash_db = new_db(root, "partial-crash")
    first_clear = wechat("W-6", "ORDER-6", amount_minor=2000)
    later_pair = [wechat("W-7", "ORDER-7"), bank("B-7", "ORDER-7")]
    mixed = [first_clear, *later_pair]
    crashed = subprocess.run(
        [sys.executable, str(Path(__file__).resolve()), "--worker", str(partial_crash_db),
         "multi-unit-crash", json.dumps(mixed), order_key(later_pair[0]), "0"],
        capture_output=True, text=True, timeout=30,
    )
    assert crashed.returncode == 77, (crashed.stdout, crashed.stderr)
    state = check("later-unit-crash", partial_crash_db, {"exit": crashed.returncode})
    assert len(state["events"]) == 1 and state["expense_minor"] == 2000
    assert state["bank_delta_minor"] == 0 and state["units"] == 1
    recovered = apply_batch(partial_crash_db, "multi-unit-crash", mixed)
    state = check("later-unit-retry", partial_crash_db, recovered)
    assert len(state["events"]) == 2 and state["sources"] == 3
    assert (state["expense_minor"], state["bank_delta_minor"]) == (5500, -3500)
    assert state["units"] == 2 and state["notices"] == 0

    # Equal text in a different identifier namespace cannot share one event.
    scope_db = new_db(root, "namespace")
    scope_rows = [wechat("W-5", "12345"),
                  bank("B-5", "12345", order_namespace="bank-transaction")]
    apply_batch(scope_db, "different-namespace", scope_rows)
    state = check("different-namespace", scope_db, None)
    assert len(state["events"]) == 2

    print("PASS: SQLite synthetic idempotency, two-process serialization, crash rollback and partial units")


if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] == "--worker":
        worker()
    else:
        main()
