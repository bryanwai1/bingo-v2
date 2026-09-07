"""Import the 19 Mall Hunt cards into Supabase.

Writes each card twice:
  - into the `mall-hunt` compartment (the event board)
  - into the `Default` compartment as an owned row, which is what the
    admin Card Library shows under "Complete Library"

Each card gets a bingo_tasks row (category "Mall Hunt", Act name + hex as its
colour) and a bingo_task_pages row carrying the hero image and the 6 pointers.

Idempotent: a card already present in a target section+category is skipped.
"""
import io, json, os, re, urllib.parse, urllib.request

URL = os.environ["VITE_SUPABASE_URL"]
KEY = os.environ["VITE_SUPABASE_ANON_KEY"]
H = {"apikey": KEY, "Authorization": f"Bearer {KEY}", "Content-Type": "application/json"}

MALL_HUNT = "5a41c57c-efbf-4dcc-9521-f05df140b86c"   # event board, house-owned
DEFAULT = "3689b763-baee-4123-81b1-2c9b982d9a61"     # Complete Library
OWNER = "c3029bc4-9a65-4d73-8d02-dc7aa4381d90"
CATEGORY = "Mall Hunt"

ACTS = {
    "Act 1 · Setup":       "#FF7F5C",
    "Act 2 · The Hunt":    "#14A79A",
    "Act 3 · The Mission": "#6C63D9",
    "Act 4 · Action":      "#E4536B",
    "Act 5 · The Cut":     "#2E9E63",
}
ACT_ORDER = list(ACTS)

SLUGS = {
    1: "01-colour-hunt", 2: "02-ai-virtual-fitting", 3: "03-book-of-clues",
    4: "04-product-props", 5: "05-escape-the-mall", 6: "06-shop-hero-poster",
    7: "07-team-poster", 8: "08-ai-establishing-world", 9: "09-menu-remix",
    10: "10-box-office-forecast", 11: "11-ai-action-scene", 12: "12-caption-card",
    13: "13-match-cut", 14: "14-hyperlapse", 15: "15-b-roll",
    16: "16-ai-ops-manager", 17: "17-route-master",
    18: "18-mission-control-budget", 19: "19-craft-services",
    20: "20-stunt-double", 21: "21-hero-walk", 22: "22-ai-villain-reveal",
}


def req(method, path, body=None, headers=None):
    data = json.dumps(body).encode() if body is not None else None
    r = urllib.request.Request(f"{URL}/rest/v1/{path}", data=data, method=method,
                               headers={**H, **(headers or {})})
    with urllib.request.urlopen(r, timeout=60) as f:
        raw = f.read()
        return json.loads(raw) if raw else None


def parse_cards():
    md = io.open("mall-hunt-cards.md", encoding="utf-8").read()
    pat = re.compile(r"### (\d+)\. (.+?) — (.+?) `(#\w{6})`\n((?:\d\. .+\n?){6})")
    cards = []
    for m in pat.finditer(md):
        steps = [re.sub(r"^\d\. ", "", s) for s in m.group(5).strip().split("\n")]
        assert len(steps) == 6, f"card {m.group(1)} has {len(steps)} steps"
        cards.append({
            "n": int(m.group(1)), "title": m.group(2).strip(),
            "act": m.group(3).strip(), "hex": m.group(4), "steps": steps,
        })
    assert len(cards) == 22, f"expected 22 cards, parsed {len(cards)}"
    for c in cards:
        assert ACTS[c["act"]] == c["hex"], f"{c['title']}: hex does not match act"
    # sort by act, then by original number within the act
    cards.sort(key=lambda c: (ACT_ORDER.index(c["act"]), c["n"]))
    return cards


def ensure_category(section_id):
    found = req("GET", f"bingo_categories?select=id&section_id=eq.{section_id}"
                       f"&name=eq.{urllib.parse.quote(CATEGORY)}")
    if found:
        return found[0]["id"]
    existing = req("GET", f"bingo_categories?select=sort_order&section_id=eq.{section_id}")
    nxt = max([c["sort_order"] for c in existing] or [-1]) + 1
    made = req("POST", "bingo_categories",
               [{"section_id": section_id, "name": CATEGORY, "sort_order": nxt}],
               {"Prefer": "return=representation"})
    return made[0]["id"]


def import_into(section_id, owner_id, label):
    ensure_category(section_id)
    have = {t["title"] for t in req(
        "GET", f"bingo_tasks?select=title&section_id=eq.{section_id}"
               f"&category=eq.{urllib.parse.quote(CATEGORY)}")}
    created = skipped = 0
    for i, c in enumerate(parse_cards()):
        if c["title"] in have:
            skipped += 1
            continue
        task = req("POST", "bingo_tasks", [{
            "section_id": section_id, "owner_id": owner_id,
            "title": c["title"], "category": CATEGORY,
            "color": c["act"], "hex_code": c["hex"],
            "points": 100, "sort_order": 25 + i,
            "in_grid": False, "task_type": "standard",
            "require_marshal": False, "is_contest": False,
        }], {"Prefer": "return=representation"})[0]
        page = {
            "task_id": task["id"], "page_order": 0,
            "media_url": f"/mall-hunt/{SLUGS[c['n']]}.webp", "media_type": "image",
        }
        for j, step in enumerate(c["steps"], start=1):
            page[f"pointer_{j}"] = step
        req("POST", "bingo_task_pages", [page])
        created += 1
        print(f"  [{label}] {c['act']:<20} {c['title']}")
    print(f"{label}: created {created}, skipped {skipped}")
    return created, skipped


def resort(section_id, label):
    """Re-apply sort_order so cards run Act 1 -> Act 5 after any insertion."""
    rows = req("GET", f"bingo_tasks?select=id,title&section_id=eq.{section_id}"
                      f"&category=eq.{urllib.parse.quote(CATEGORY)}")
    by_title = {r["title"]: r["id"] for r in rows}
    fixed = 0
    for i, c in enumerate(parse_cards()):
        tid = by_title.get(c["title"])
        if tid:
            req("PATCH", f"bingo_tasks?id=eq.{tid}", {"sort_order": 25 + i})
            fixed += 1
    print(f"{label}: re-sorted {fixed} cards by act")


if __name__ == "__main__":
    print(f"Importing {len(parse_cards())} cards")
    print()
    import_into(MALL_HUNT, None, "mall-hunt")
    resort(MALL_HUNT, "mall-hunt")
    print()
    import_into(DEFAULT, OWNER, "Complete Library")
    resort(DEFAULT, "Complete Library")
