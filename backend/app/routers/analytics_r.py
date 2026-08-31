from fastapi import APIRouter, Depends
from fastapi.responses import Response
from sqlalchemy.orm import Session

from ..core.db import get_db
from ..core.deps import TenantContext, tenant
from ..core.envelope import ok
from ..ai.evidence import overview_line
from ..services import analytics
from ..services.watch import compute_watch, filter_by_prefs

router = APIRouter(prefix="/businesses/{bid}", tags=["analytics"])

PERIODS = ("today", "week", "month")
REPORT_PERIODS = ("today", "week", "month", "last_month")


@router.get("/analytics/dashboard")
def dashboard(period: str = "today", ctx: TenantContext = Depends(tenant), db: Session = Depends(get_db)):
    p = period if period in PERIODS else "today"
    payload = analytics.dashboard(db, ctx.business, p)
    # Partner summary line (AI CONTEXT layer): upgrades the insight slot when
    # there is enough history; otherwise the deterministic insight stands.
    line = overview_line(db, ctx.business)
    if line is not None:
        payload["insight"] = line
    return ok(payload)


@router.get("/analytics/performance")
def performance(range: str = "30d", ctx: TenantContext = Depends(tenant), db: Session = Depends(get_db)):
    r = range if range in analytics.PERF_RANGES else "30d"
    return ok(analytics.performance(db, ctx.business.id, r))


@router.get("/analytics/trends")
def trends(range: str = "30d", ctx: TenantContext = Depends(tenant), db: Session = Depends(get_db)):
    r = range if range in analytics.TREND_RANGES else "30d"
    return ok(analytics.trends(db, ctx.business.id, r))


@router.get("/watch")
def watch(ctx: TenantContext = Depends(tenant), db: Session = Depends(get_db)):
    return ok({"alerts": filter_by_prefs(compute_watch(db, ctx.business.id), ctx.business)})


@router.get("/reports")
def report(period: str = "month", ctx: TenantContext = Depends(tenant), db: Session = Depends(get_db)):
    p = period if period in REPORT_PERIODS else "month"
    data = analytics.report(db, ctx.business.id, p)
    data.pop("_window", None)
    return ok(data)


@router.get("/reports/export")
def report_export(period: str = "month", ctx: TenantContext = Depends(tenant), db: Session = Depends(get_db)):
    p = period if period in REPORT_PERIODS else "month"
    csv = analytics.report_csv(db, ctx.business, p)
    return Response(
        csv,
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="mi-yone-report-{p}.csv"'},
    )
