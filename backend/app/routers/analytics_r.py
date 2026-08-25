from fastapi import APIRouter, Depends
from fastapi.responses import Response
from sqlalchemy.orm import Session

from ..core.db import get_db
from ..core.deps import TenantContext, tenant
from ..core.envelope import ok
from ..services import analytics

router = APIRouter(prefix="/businesses/{bid}", tags=["analytics"])

PERIODS = ("today", "week", "month")
REPORT_PERIODS = ("today", "week", "month", "last_month")


@router.get("/analytics/dashboard")
def dashboard(period: str = "today", ctx: TenantContext = Depends(tenant), db: Session = Depends(get_db)):
    p = period if period in PERIODS else "today"
    return ok(analytics.dashboard(db, ctx.business, p))


@router.get("/analytics/performance")
def performance(range: str = "30d", ctx: TenantContext = Depends(tenant), db: Session = Depends(get_db)):
    r = range if range in analytics.PERF_RANGES else "30d"
    return ok(analytics.performance(db, ctx.business.id, r))


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
