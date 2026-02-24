import sys, os
from datetime import datetime, timezone, timedelta

sys.path.insert(0, r"c:/Users/wj941/Downloads/chamgab/ml-api")
from app.core.database import get_supabase_client

THRESHOLDS = dict(
    previewDistrictCountMin=220,
    officialCoveragePctMin=95,
    inferredRatioPctMax=20,
    mockFallbackRatePctMax=0,
    schoolFreshnessDaysMax=45,
    academyFreshnessDaysMax=14,
)

results = []
now = datetime.now(timezone.utc)
sb = get_supabase_client()

def pf(ok):
    return "PASS" if ok else "FAIL"

sep = "=" * 72
print(sep)
print("SCHOOL LAUNCH GATE CHECK")
print("Run at:", now.strftime("%Y-%m-%d %H:%M:%S UTC"))
print(sep)

# 1
try:
    resp = sb.table("vw_school_analysis_preview").select("district_code", count="exact").execute()
    district_count = resp.count if resp.count is not None else len(resp.data)
    ok = district_count >= THRESHOLDS["previewDistrictCountMin"]
    results.append(ok)
    print()
    print("[1] Preview District Count")
    print("    Value     :", district_count)
    print("    Threshold : >=", THRESHOLDS["previewDistrictCountMin"])
    print("    Result    :", pf(ok))
except Exception as e:
    print("\n[1] Preview District Count")
    print("    ERROR:", e)
    results.append(False)

# 2
try:
    total_resp = sb.table("schools").select("school_id", count="exact").eq("is_active", True).execute()
    total_schools = total_resp.count if total_resp.count is not None else len(total_resp.data)
    official_ids = set()
    off = 0
    while True:
        pg = sb.table("school_metrics_official").select("school_id").range(off, off+999).execute()
        if not pg.data: break
        for r in pg.data: official_ids.add(r["school_id"])
        if len(pg.data) < 1000: break
        off += 1000
    swoff = len(official_ids)
    cov = (swoff / total_schools * 100) if total_schools > 0 else 0
    ok = cov >= THRESHOLDS["officialCoveragePctMin"]
    results.append(ok)
    print()
    print("[2] Official School Coverage")
    print("    Schools with official metrics :", swoff)
    print("    Total active schools          :", total_schools)
    print("    Coverage                      : {:.2f}%".format(cov))
    print("    Threshold                     : >= {}%".format(THRESHOLDS["officialCoveragePctMin"]))
    print("    Result                        :", pf(ok))
except Exception as e:
    print("\n[2] Official School Coverage")
    print("    ERROR:", e)
    results.append(False)

# 3
try:
    rows = []
    off = 0
    while True:
        pg = sb.table("vw_school_analysis_preview").select("official_confidence").range(off, off+999).execute()
        if not pg.data: break
        rows.extend(pg.data)
        if len(pg.data) < 1000: break
        off += 1000
    if rows:
        vals = [100.0 - float(r.get("official_confidence") or 0) for r in rows]
        avg_inf = sum(vals) / len(vals)
    else:
        avg_inf = 100.0
    ok = avg_inf <= THRESHOLDS["inferredRatioPctMax"]
    results.append(ok)
    print()
    print("[3] Average Inferred Ratio")
    print("    Districts checked  :", len(rows))
    print("    Avg inferred ratio : {:.2f}%".format(avg_inf))
    print("    Threshold          : <= {}%".format(THRESHOLDS["inferredRatioPctMax"]))
    print("    Result             :", pf(ok))
except Exception as e:
    print("\n[3] Average Inferred Ratio")
    print("    ERROR:", e)
    results.append(False)

# 4
try:
    fr = sb.table("school_metrics_official").select("source_updated_at,updated_at").order("updated_at", desc=True).limit(1).execute()
    ls = "N/A"
    age = 9999
    if fr.data:
        ts = fr.data[0].get("source_updated_at") or fr.data[0].get("updated_at")
        if ts:
            ld = datetime.fromisoformat(ts.replace("Z", "+00:00"))
            age = (now - ld).days
            ls = ts
    ok = age <= THRESHOLDS["schoolFreshnessDaysMax"]
    results.append(ok)
    print()
    print("[4] School Data Freshness")
    print("    Latest timestamp :", ls)
    print("    Age              :", age, "days")
    print("    Threshold        : <=", THRESHOLDS["schoolFreshnessDaysMax"], "days")
    print("    Result           :", pf(ok))
except Exception as e:
    print("\n[4] School Data Freshness")
    print("    ERROR:", e)
    results.append(False)

# 5
try:
    ar = sb.table("academies").select("source_updated_at,updated_at").order("updated_at", desc=True).limit(1).execute()
    al = None
    if ar.data:
        ts = ar.data[0].get("source_updated_at") or ar.data[0].get("updated_at")
        if ts: al = datetime.fromisoformat(ts.replace("Z", "+00:00"))
    fer = sb.table("academy_fees").select("source_updated_at,updated_at").order("updated_at", desc=True).limit(1).execute()
    fl = None
    if fer.data:
        ts = fer.data[0].get("source_updated_at") or fer.data[0].get("updated_at")
        if ts: fl = datetime.fromisoformat(ts.replace("Z", "+00:00"))
    cands = [d for d in [al, fl] if d]
    if cands:
        lad = max(cands)
        aage = (now - lad).days
        las = lad.isoformat()
    else:
        aage = 9999
        las = "N/A (no rows)"
    acr = sb.table("academies").select("academy_id", count="exact").execute()
    ac = acr.count if acr.count is not None else len(acr.data or [])
    fcr = sb.table("academy_fees").select("id", count="exact").execute()
    fc = fcr.count if fcr.count is not None else len(fcr.data or [])
    ok = aage <= THRESHOLDS["academyFreshnessDaysMax"]
    results.append(ok)
    print()
    print("[5] Academy Data Freshness")
    print("    Academies rows         :", ac)
    print("    Academy fees rows      :", fc)
    print("    Latest academy updated :", al.isoformat() if al else "N/A")
    print("    Latest fees updated    :", fl.isoformat() if fl else "N/A")
    print("    Most recent            :", las)
    print("    Age                    :", aage, "days")
    print("    Threshold              : <=", THRESHOLDS["academyFreshnessDaysMax"], "days")
    print("    Result                 :", pf(ok))
except Exception as e:
    print("\n[5] Academy Data Freshness")
    print("    ERROR:", e)
    results.append(False)

# OVERALL
pc = sum(1 for r in results if r)
tot = len(results)
ov = all(results)
print()
print(sep)
print("OVERALL SCHOOL GATE VERDICT:", "PASS" if ov else "FAIL")
print("  Checks passed: {}/{}".format(pc, tot))
if not ov:
    labs = ["Preview District Count", "Official School Coverage", "Average Inferred Ratio", "School Data Freshness", "Academy Data Freshness"]
    fail = [labs[i] for i, r in enumerate(results) if not r]
    print("  Failing checks:", ", ".join(fail))
print(sep)
