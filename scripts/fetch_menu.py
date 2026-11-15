#!/usr/bin/env python3
"""Fetch today's UMD and UConn dining hall menus (with nutrition labels) into menu/<hall>.json for the Plate app.
Runs once a day in GitHub Actions. Uses only the Python standard library."""
import html as htmllib
import json
import os
import re
import sys
import time
from datetime import datetime, timedelta
from html.parser import HTMLParser
from urllib.parse import quote, quote_plus, unquote_plus, urljoin
from urllib.request import Request, urlopen
from zoneinfo import ZoneInfo

OUT = 'menu'
UA = 'Mozilla/5.0 (compatible; PlateMenuBot/1.0; personal dining tracker, once a day)'
BUDGET = 3000  # seconds; if the first run runs out of time, the next run picks up where it stopped

# ---------------------------------------------------------------- UMD
UMD_BASE = 'https://nutrition.umd.edu/'
# locationNum values confirmed from real menu links: The Y = 19, South Campus = 16, 251 North = 51.
# discover() also tries to read them from the site's front page in case they ever change.
UMD_HALLS = {
    'the-y':        {'names': ['yahentamitsi'], 'default': 19},
    '251-north':    {'names': ['251 north', '251'], 'default': 51},
    'south-campus': {'names': ['south campus'], 'default': 16},
}
DEFAULT_PANES = {1: 'Breakfast', 2: 'Lunch', 3: 'Dinner'}

# ---------------------------------------------------------------- UConn
UC_BASE = 'https://nutritionanalysis.dds.uconn.edu/'
# (locationNum, locationName) taken from real menu links.
UC_HALLS = {
    'uconn-connecticut-hall': ('03', 'Connecticut Dining Hall'),
    'uconn-gelfenbien':       ('42', 'Gelfenbien Commons, Halal & Kosher'),
    'uconn-mcmahon':          ('05', 'McMahon Dining Hall'),
    'uconn-north':            ('07', 'North Campus Dining Hall'),
    'uconn-northwest':        ('15', 'Northwest Marketplace'),
    'uconn-south':            ('16', 'South Campus Marketplace'),
    'uconn-putnam':           ('06', 'Putnam Dining Hall'),
    'uconn-whitney':          ('01', 'Whitney Dining Hall'),
}


def clean(parts):
    return re.sub(r'\s+', ' ', ''.join(parts).replace('\xa0', ' ')).strip()


def meal_names(label):
    """Maps a meal or tab label to the app's meals. Brunch counts as breakfast and lunch."""
    label = (label or '').lower()
    if 'breakfast' in label:
        return ['Breakfast']
    if 'lunch' in label:
        return ['Lunch']
    if 'dinner' in label:
        return ['Dinner']
    if 'brunch' in label:
        return ['Breakfast', 'Lunch']
    return []


# ---------------------------------------------------------------- UMD menu pages
class Menu(HTMLParser):
    """Walks a UMD menu page in order, noting tab names, station headings and item links."""

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.pane = None
        self.station = ''
        self.seq = []    # (pane, station, key, name)
        self.tabs = {}   # pane number -> tab label
        self.locs = []   # (locationNum, link text)
        self._cap = None
        self._buf = []
        self._href = ''

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        m = re.fullmatch(r'pane-(\d+)', a.get('id') or '')
        if m:
            self.pane = int(m.group(1))
            self.station = ''
        if tag in ('h2', 'h3', 'h4', 'h5', 'h6'):
            self._cap, self._buf = 'h', []
        elif tag == 'a':
            href = a.get('href') or ''
            if 'label.aspx' in href and 'RecNumAndPort=' in href:
                self._cap, self._href, self._buf = 'item', href, []
            elif href.startswith('#pane-'):
                self._cap, self._href, self._buf = 'tab', href, []
            elif 'locationNum=' in href:
                self._cap, self._href, self._buf = 'loc', href, []

    def handle_data(self, data):
        if self._cap:
            self._buf.append(data)

    def handle_endtag(self, tag):
        if not self._cap:
            return
        if self._cap == 'h' and tag in ('h2', 'h3', 'h4', 'h5', 'h6'):
            self.station = clean(self._buf)
            self._cap = None
        elif tag == 'a' and self._cap in ('item', 'tab', 'loc'):
            text = clean(self._buf)
            if self._cap == 'item':
                m = re.search(r'RecNumAndPort=([^&#]+)', self._href)
                if m and text:
                    self.seq.append((self.pane, self.station, unquote_plus(m.group(1)).strip(), text))
            elif self._cap == 'tab':
                n = re.search(r'#pane-(\d+)', self._href)
                if n:
                    self.tabs[int(n.group(1))] = text
            else:
                n = re.search(r'locationNum=(\d+)', self._href)
                if n:
                    self.locs.append((int(n.group(1)), text))
            self._cap = None


class LayoutError(Exception):
    """The page does not look the way this script expects."""


def menu_from_html(page):
    """UMD: returns ({meal: [(station, key, name), ...]}, location links) for Breakfast / Lunch / Dinner."""
    p = Menu()
    p.feed(page)
    panes = {}
    for pane, station, key, name in p.seq:
        if pane is not None:
            panes.setdefault(pane, []).append((station, key, name))
    if p.seq and not panes:
        # Do not guess which meal an item belongs to. Show what the page looks like so the script can be fixed.
        i = page.find('label.aspx')
        j = page.find('#pane-')
        raise LayoutError(
            f'found {len(p.seq)} item links but no element with id="pane-N" to tell the meals apart.\n'
            f'  tabs seen: {p.tabs}\n'
            f'  html before the first item link: {page[max(0, i - 700):i + 120]!r}\n'
            f'  html around the first tab link: {page[max(0, j - 200):j + 300]!r}')
    meals = {}
    for n, items in panes.items():
        label = p.tabs.get(n) or ''
        names = meal_names(label) if label else ([DEFAULT_PANES[n]] if n in DEFAULT_PANES else [])
        for m in names:
            meals.setdefault(m, []).extend(items)
    return meals, p.locs


# ---------------------------------------------------------------- UConn menu pages
def uc_short_url(num, name, date_q):
    return (f'{UC_BASE}shortmenu.aspx?sName=UCONN+Dining+Services&locationNum={num}&locationName={quote_plus(name)}'
            f'&naFlag=1&WeeksMenus=This+Week%27s+Menus&myaction=read&dtdate={quote(date_q, safe="")}')


def uc_meal_links(page):
    """The short menu links each meal to a longer page. Returns {mealName: url}."""
    links = {}
    for href in re.findall(r'href\s*=\s*["\']([^"\']*longmenu\.aspx[^"\']*)["\']', page, re.I):
        href = htmllib.unescape(href)
        m = re.search(r'mealName=([^&#]+)', href)
        if m:
            links[unquote_plus(m.group(1)).strip()] = urljoin(UC_BASE, href)
    return links


class UMeal(HTMLParser):
    """Reads one UConn meal page: '-- STATION --' rows and item links to nutrition labels."""

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.station = ''
        self.items = []   # (station, key, name, label_url)
        self._cap = False
        self._buf = []
        self._href = ''

    def handle_starttag(self, tag, attrs):
        if tag == 'a':
            href = dict(attrs).get('href') or ''
            if 'label.aspx' in href and 'RecNumAndPort=' in href:
                self._cap, self._href, self._buf = True, href, []

    def handle_data(self, data):
        if self._cap:
            self._buf.append(data)
        else:
            m = re.fullmatch(r'--\s*(.+?)\s*--', clean([data]))
            if m:
                self.station = m.group(1)

    def handle_endtag(self, tag):
        if tag == 'a' and self._cap:
            text = clean(self._buf)
            m = re.search(r'RecNumAndPort=([^&#]+)', self._href)
            if m and text:
                self.items.append((self.station, unquote_plus(m.group(1)).strip(), text, urljoin(UC_BASE, self._href)))
            self._cap = False


def uc_menu(num, name, date_q):
    """UConn: returns ({meal: [(station, key, name)]}, {key: label url}, meal links found)."""
    links = uc_meal_links(get(uc_short_url(num, name, date_q)))
    meals, urls = {}, {}
    for meal_name, url in links.items():
        names = meal_names(meal_name)
        if not names:
            continue
        p = UMeal()
        p.feed(get(url))
        for station, key, item, href in p.items:
            urls.setdefault(key, href)
            for m in names:
                meals.setdefault(m, []).append((station, key, item))
    return meals, urls, sorted(links)


# ---------------------------------------------------------------- labels
def strip_html(page):
    page = re.sub(r'(?is)<(script|style).*?</\1>', ' ', page)
    page = re.sub(r'(?s)<[^>]+>', ' ', page)
    return re.sub(r'\s+', ' ', htmllib.unescape(page)).strip()


def _num(rx, text):
    m = re.search(rx, text, re.I)
    return float(m.group(1)) if m else None


def _r1(v):
    return round(v, 1) if v is not None else 0


def parse_label(page):
    t = strip_html(page)
    cal = _num(r'Calories per serving\s*([\d.]+)', t)
    if cal is None:
        cal = _num(r'Calories\s*([\d.]+)\s*kcal', t)
    if cal is None:
        return None
    sm = re.search(r'Serving size\s*(.+?)\s*(?:Calories per serving|Calories|Amount)', t, re.I)
    sodium = _num(r'Sodium\s*([\d.]+)\s*mg', t)
    return {
        'serving': (sm.group(1).strip() if sm else '1 serving')[:40],
        'cal': round(cal),
        'p': _r1(_num(r'Protein\s*([\d.]+)\s*g', t)),
        'c': _r1(_num(r'Total Carbohydrate\.?\s*([\d.]+)\s*g', t)),
        'f': _r1(_num(r'Total Fat\s*([\d.]+)\s*g', t)),
        'fiber': _r1(_num(r'Dietary Fiber\s*([\d.]+)\s*g', t)),
        'sugar': _r1(_num(r'Total Sugars?\s*([\d.]+)\s*g', t)),
        'sodium': round(sodium) if sodium is not None else 0,
    }


def get(url, tries=3):
    last = None
    for i in range(tries):
        try:
            with urlopen(Request(url, headers={'User-Agent': UA}), timeout=30) as r:
                return r.read().decode('utf-8', 'replace')
        except Exception as e:  # noqa: BLE001
            last = e
            time.sleep(1.5 * (i + 1))
    raise RuntimeError(f'{url}: {last}')


def label_url(key):
    return UMD_BASE + 'label.aspx?RecNumAndPort=' + quote(key, safe='')


def menu_url(num, date_q):
    return f'{UMD_BASE}?locationNum={num}&dtdate={quote(date_q, safe="")}'


def load_json(path, default):
    try:
        with open(path, encoding='utf-8') as f:
            return json.load(f)
    except Exception:  # noqa: BLE001
        return default


def save_cache(path, cache, now):
    cutoff = (now - timedelta(days=60)).strftime('%Y-%m-%d')
    cache = {k: v for k, v in cache.items() if v.get('seen', '9999') >= cutoff}
    with open(path, 'w', encoding='utf-8') as f:
        json.dump(cache, f, separators=(',', ':'), ensure_ascii=False)
    return len(cache)


def fetch_labels(urls, cache, now, started):
    """Looks up each label we have not seen yet. Items with no nutrition data are retried once a week."""
    today = now.strftime('%Y-%m-%d')
    retry_before = (now - timedelta(days=7)).strftime('%Y-%m-%d')
    fetched = missing = 0
    for k in sorted(urls):
        c = cache.get(k)
        if c and c.get('cal') is not None:
            c['seen'] = today
            continue
        if c and c.get('tried', '') > retry_before:
            continue
        if time.time() - started > BUDGET:
            print('  time budget reached; the rest will be fetched on the next run')
            break
        try:
            label = parse_label(get(urls[k]))
        except Exception as e:  # noqa: BLE001
            print(f'  label {k}: {e}')
            time.sleep(0.25)
            continue
        if label:
            label['seen'] = today
            cache[k] = label
            fetched += 1
        else:
            cache[k] = {'cal': None, 'tried': today, 'seen': today}
            missing += 1
        time.sleep(0.25)
    return fetched, missing


def write_hall(hall, meals, cache, now):
    out = {'date': now.strftime('%Y-%m-%d'), 'updated': now.isoformat(timespec='minutes'), 'hall': hall, 'meals': {}}
    for meal, items in meals.items():
        seen, lst = set(), []
        for station, k, name in items:
            c = cache.get(k)
            if k in seen or not c or c.get('cal') is None:
                continue
            seen.add(k)
            lst.append({'name': name, 'station': station, 'serving': c['serving'], 'cal': c['cal'], 'p': c['p'],
                        'c': c['c'], 'f': c['f'], 'fiber': c['fiber'], 'sugar': c['sugar'], 'sodium': c['sodium']})
        if lst:
            out['meals'][meal] = lst
    if not out['meals']:
        print('  no usable items, so the existing file was left alone')
        return 0
    with open(os.path.join(OUT, f'{hall}.json'), 'w', encoding='utf-8') as f:
        json.dump(out, f, separators=(',', ':'), ensure_ascii=False)
    print('  wrote', f'{hall}.json', {m: len(i) for m, i in out['meals'].items()})
    return 1


# ---------------------------------------------------------------- runners
def discover():
    ids = {h: v['default'] for h, v in UMD_HALLS.items()}
    try:
        p = Menu()
        p.feed(get(UMD_BASE))
        for num, text in p.locs:
            t = text.lower()
            for hall, v in UMD_HALLS.items():
                if any(n in t for n in v['names']):
                    ids[hall] = num
                    print(f'  found {hall} on the site: locationNum={num}')
    except Exception as e:  # noqa: BLE001
        print(f'  could not read the front page ({e}); using default numbers')
    print('  using:', ids)
    return ids


def run_umd(now, cache, started):
    date_q, wrote = now.strftime('%m/%d/%Y'), 0
    print('\n=== UMD ===')
    for hall, num in discover().items():
        print(f'\n{hall} (locationNum={num})')
        try:
            meals, _ = menu_from_html(get(menu_url(num, date_q)))
        except LayoutError as e:
            print(f'  PAGE LAYOUT PROBLEM: {e}')
            continue
        except Exception as e:  # noqa: BLE001
            print(f'  could not load the menu page: {e}')
            continue
        urls = {k: label_url(k) for items in meals.values() for _, k, _ in items}
        print('  meals found:', {m: len(i) for m, i in meals.items()}, '| unique items:', len(urls))
        fetched, missing = fetch_labels(urls, cache, now, started)
        print(f'  labels fetched: {fetched} | without nutrition data: {missing}')
        wrote += write_hall(hall, meals, cache, now)
    return wrote


def run_uconn(now, cache, started):
    date_q, wrote = now.strftime('%m/%d/%Y'), 0
    print('\n=== UConn ===')
    for hall, (num, name) in UC_HALLS.items():
        print(f'\n{hall} (locationNum={num}, {name})')
        try:
            meals, urls, links = uc_menu(num, name, date_q)
        except Exception as e:  # noqa: BLE001
            print(f'  could not load the menu: {e}')
            continue
        print('  meal pages found:', links, '| meals:', {m: len(i) for m, i in meals.items()}, '| unique items:', len(urls))
        if not links:
            print('  no meal links on the page (hall closed today, or the page layout changed)')
            continue
        fetched, missing = fetch_labels(urls, cache, now, started)
        print(f'  labels fetched: {fetched} | without nutrition data: {missing}')
        wrote += write_hall(hall, meals, cache, now)
    return wrote


def main():
    now = datetime.now(ZoneInfo('America/New_York'))
    os.makedirs(OUT, exist_ok=True)
    umd_path, uc_path = os.path.join(OUT, 'labels-cache.json'), os.path.join(OUT, 'labels-cache-uconn.json')
    umd_cache, uc_cache = load_json(umd_path, {}), load_json(uc_path, {})
    print(f'Menus for {now.strftime("%Y-%m-%d")}')
    started = time.time()
    wrote = run_umd(now, umd_cache, started)
    n1 = save_cache(umd_path, umd_cache, now)
    wrote += run_uconn(now, uc_cache, started)
    n2 = save_cache(uc_path, uc_cache, now)
    print(f'\nDone. Wrote {wrote} menu file(s). Label caches: UMD {n1}, UConn {n2}.')
    if not wrote:
        sys.exit(1)


if __name__ == '__main__':
    main()
