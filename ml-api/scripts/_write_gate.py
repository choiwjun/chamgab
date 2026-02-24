import pathlib

code = []
def a(s): code.append(s)

a("import sys, os")
a("from datetime import datetime, timezone, timedelta")
a("")
a("sys.path.insert(0, r\"c:/Users/wj941/Downloads/chamgab/ml-api\")")
a("from app.core.database import get_supabase_client")