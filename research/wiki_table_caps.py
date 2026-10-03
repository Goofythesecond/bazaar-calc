# Combine caps for enchants whose wiki page has no explicit "combined ... up to" sentence.
# Rule (wiki "Enchanted Book" page): books whose level cannot be obtained from an Enchantment Table cannot be combined
# to increase their level. So the cap is the highest level the page's "Obtaining" table lists with an Enchantment Table
# source. Pages that list no Enchantment Table source get no cap (not combinable as far as the wiki says).
import requests, re, json, sys
W = "https://hypixelskyblock.minecraft.wiki/api.php"
ROM = {'I':1,'II':2,'III':3,'IV':4,'V':5,'VI':6,'VII':7,'VIII':8,'IX':9,'X':10}
s = requests.Session(); s.headers['User-Agent'] = 'bazaar-calc research (personal project; 1 req/s)'
pages = sys.argv[1:]
out = {}
for i in range(0, len(pages), 25):
    r = s.get(W, params=dict(action='query', prop='revisions', titles='|'.join(pages[i:i+25]), rvprop='content', rvslots='main', format='json', redirects=1), timeout=60).json()
    for p in r['query']['pages'].values():
        txt = p.get('revisions', [{}])[0].get('slots', {}).get('main', {}).get('*', '')
        ob = txt.split('== Obtaining ==', 1)[1].split('\n== ', 1)[0] if '== Obtaining ==' in txt else ''
        rows = re.split(r'\n\|-', ob)
        table, last = [], None
        for row in rows:
            m = re.search(r'\{\{Ench\|[^}|]*?\s([IVX]+)(?:-([IVX]+))?\}\}', row)
            if m: last = (ROM[m.group(1)], ROM[m.group(2) or m.group(1)])
            if last and re.search(r'Enchant(?:ment|ing) Table', row): table.append(last)
        # tabber layout: "{{Ench|Gravity III}} can be applied from an [[Enchantment Table]]"
        for m in re.finditer(r'\{\{Ench\|[^}|]*?\s([IVX]+)\}\} can be applied from an \[\[Enchant(?:ment|ing) Table', ob):
            table.append((ROM[m.group(1)], ROM[m.group(1)]))
        # stats table layout: "Combining Prosperity I books" as the source of higher levels
        comb = [ROM[m.group(1)] for m in re.finditer(r'\|\s*\{\{red\|\d+\}\}.*?\n.*?Combining [^|\n]*? ([IVX]+) books', txt)]
        if 'Combining ' in txt and re.search(r'rowspan="(\d+)" \|Combining [^|\n]+? I books', txt):
            n = int(re.search(r'rowspan="(\d+)" \|Combining [^|\n]+? I books', txt).group(1))
            table.append((2, 1 + n))
        out[p['title']] = dict(table_levels=table, cap=max(hi for lo, hi in table) if table else None)
print(json.dumps(out, indent=1))
