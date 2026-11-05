"""Convert the legacy 'Agency Works' Excel joblist into seed JSON.

Usage: python3 scripts/import_xlsx.py <workbook.xlsx> <out.json> <first-monday YYYY-MM-DD>
Each sheet is one week; sheets are assumed to be consecutive Mondays.
Each sheet has three side-by-side department blocks (Copy | Art | Production):
  No | Job | Servicing | Monday Status | Friday Status
Grey-filled rows are team/person headers; rows under them are that team's jobs.
"""
import datetime, json, sys
import openpyxl

DEPTS = [("Copy", 0), ("Art", 5), ("Production", 10)]


def is_header_fill(rgb):
    """Team header rows are filled with a shade of grey (R == G == B, not white)."""
    if not isinstance(rgb, str) or len(rgb) != 8:
        return False
    r, g, b = rgb[2:4], rgb[4:6], rgb[6:8]
    return r == g == b and int(r, 16) < 0xF0


def clean(v):
    if v is None:
        return None
    s = " ".join(str(v).split())
    return s or None


def main(src, out, first_monday):
    wb = openpyxl.load_workbook(src)
    start = datetime.date.fromisoformat(first_monday)
    weeks = []
    for i, ws in enumerate(wb.worksheets):
        week = {"label": ws.title, "week_start": str(start + datetime.timedelta(weeks=i)), "departments": {}}
        for dept, off in DEPTS:
            teams, current = [], None
            for row in ws.iter_rows(min_row=4, max_row=ws.max_row):
                name_cell = row[off + 1]
                name = clean(name_cell.value)
                fill = name_cell.fill.fgColor.rgb if name_cell.fill.fill_type else None
                if is_header_fill(fill):
                    if not name:
                        current = None
                        continue
                    current = {"name": name, "jobs": []}
                    teams.append(current)
                elif name and current is not None:
                    current["jobs"].append({
                        "title": name,
                        "servicing": clean(row[off + 2].value),
                        "monday": clean(row[off + 3].value),
                        "friday": clean(row[off + 4].value),
                    })
            week["departments"][dept] = teams
        weeks.append(week)
    with open(out, "w") as f:
        json.dump({"weeks": weeks}, f, indent=1)


if __name__ == "__main__":
    main(*sys.argv[1:4])
