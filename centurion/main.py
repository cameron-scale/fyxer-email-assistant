"""Centurion entry point / CLI.

Commands:
  python main.py --init                 seed the ledger + create the database
  python main.py run [--cycles N] [--interval S] [--live]
  python main.py cycle                  run a single cycle and print the summary
  python main.py status                 print current status
  python main.py report                 write + print the daily report
  python main.py pause [--reason R]     kill switch: pause all spending
  python main.py resume                 lift the pause
  python main.py set-autonomy LEVEL     full | guarded | review
  python main.py approvals              list / approve / reject queued actions
"""
from __future__ import annotations

import argparse
import sys

from config import load_config
from orchestrator import Orchestrator
from reporter import Reporter
from supervisor import Supervisor


def _orch(args) -> Orchestrator:
    cfg = load_config(getattr(args, "config", None))
    return Orchestrator(cfg)


def cmd_init(args):
    cfg = load_config(getattr(args, "config", None))
    o = Orchestrator(cfg)
    if o.ledger.is_seeded():
        print(f"Ledger already seeded. Balance ${o.ledger.balance():,.2f}")
        return
    bal = o.ledger.seed(cfg.funded_capital)
    o.ledger.set_state("autonomy_level", cfg.get("autonomy_level", "full"))
    print(f"Initialized. Seeded ${bal:,.2f} as seed capital.")
    print(f"Autonomy: {o.autonomy.level.value} | Language provider: {o.language.name}")
    print(f"Database: {cfg.database_path}")


def cmd_run(args):
    o = _orch(args)
    if not o.ledger.is_seeded():
        print("Not initialized. Run: python main.py --init")
        sys.exit(1)
    o.sim = not args.live
    sup = Supervisor(o.ledger, o.cfg)
    reporter = Reporter(o.ledger, o.cfg, memory=o.memory, risk=o.risk)
    print(f"Starting Centurion daemon (sim={o.sim}, autonomy={o.autonomy.level.value}). "
          f"Ctrl-C to stop.")

    def hb():
        sup.heartbeat(f"cycle {o.cycle_count}")
    try:
        o.run_forever(max_cycles=args.cycles, sleep_seconds=args.interval, heartbeat=hb)
    except KeyboardInterrupt:
        print("\nStopped by operator.")
    print(reporter.cli_summary())


def cmd_cycle(args):
    o = _orch(args)
    if not o.ledger.is_seeded():
        print("Not initialized. Run: python main.py --init")
        sys.exit(1)
    o.sim = not args.live
    rep = o.run_cycle()
    print(f"Cycle {rep.cycle}: ${rep.balance_before:,.2f} -> ${rep.balance_after:,.2f} "
          f"(net ${rep.net:,.2f}) | executed={rep.actions_executed} "
          f"queued={rep.actions_queued} rejected={rep.actions_rejected}")
    for n in rep.notes:
        print(f"   - {n}")


def cmd_status(args):
    o = _orch(args)
    reporter = Reporter(o.ledger, o.cfg, memory=o.memory, risk=o.risk)
    print(reporter.cli_summary())
    print(f"Autonomy: {o.autonomy.level.value} | Paused: {o.risk.is_paused()} "
          f"| Provider: {o.language.name} | Cycles: {o.cycle_count}")
    print(f"Learning: {o.memory.summary()}")


def cmd_report(args):
    o = _orch(args)
    reporter = Reporter(o.ledger, o.cfg, memory=o.memory, risk=o.risk)
    path = reporter.write_daily()
    print(reporter.build())
    print(f"\n(written to {path})")


def cmd_pause(args):
    o = _orch(args)
    o.risk.pause(args.reason or "manual kill switch")
    print(f"PAUSED: {o.risk.pause_reason()}")


def cmd_resume(args):
    o = _orch(args)
    o.risk.resume()
    print("Resumed. Spending re-enabled.")


def cmd_set_autonomy(args):
    o = _orch(args)
    o.autonomy.set_level(args.level)
    o.ledger.set_state("autonomy_level", args.level)
    print(f"Autonomy level set to: {args.level}")


def cmd_approvals(args):
    o = _orch(args)
    if args.approve is not None:
        o.approvals.approve(args.approve)
        print(f"Approved action #{args.approve}")
        return
    if args.reject is not None:
        o.approvals.reject(args.reject)
        print(f"Rejected action #{args.reject}")
        return
    pending = o.approvals.pending()
    if not pending:
        print("No pending approvals.")
        return
    for req in pending:
        print(o.approvals.render(req))


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(description="Centurion autonomous capital growth agent")
    p.add_argument("--config", help="path to config.yaml", default=None)
    p.add_argument("--init", action="store_true", help="seed ledger + create DB")
    sub = p.add_subparsers(dest="command")

    pr = sub.add_parser("run", help="run the daemon loop")
    pr.add_argument("--cycles", type=int, default=None)
    pr.add_argument("--interval", type=float, default=None, help="seconds between cycles")
    pr.add_argument("--live", action="store_true", help="use real integrations (default sim)")
    pr.set_defaults(func=cmd_run)

    pc = sub.add_parser("cycle", help="run a single cycle")
    pc.add_argument("--live", action="store_true")
    pc.set_defaults(func=cmd_cycle)

    sub.add_parser("status", help="print status").set_defaults(func=cmd_status)
    sub.add_parser("report", help="write + print daily report").set_defaults(func=cmd_report)

    pp = sub.add_parser("pause", help="kill switch")
    pp.add_argument("--reason", default=None)
    pp.set_defaults(func=cmd_pause)

    sub.add_parser("resume", help="lift pause").set_defaults(func=cmd_resume)

    psa = sub.add_parser("set-autonomy", help="full | guarded | review")
    psa.add_argument("level", choices=["full", "guarded", "review"])
    psa.set_defaults(func=cmd_set_autonomy)

    pa = sub.add_parser("approvals", help="manage approval queue")
    pa.add_argument("--approve", type=int, default=None)
    pa.add_argument("--reject", type=int, default=None)
    pa.set_defaults(func=cmd_approvals)

    return p


def main(argv=None):
    parser = build_parser()
    args = parser.parse_args(argv)
    if args.init:
        cmd_init(args)
        return
    if not getattr(args, "command", None):
        parser.print_help()
        return
    args.func(args)


if __name__ == "__main__":
    main()
