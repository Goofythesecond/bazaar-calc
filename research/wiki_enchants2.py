import requests, re, json, time
W="https://hypixelskyblock.minecraft.wiki/api.php"
s=requests.Session(); s.headers['User-Agent']='bazaar-calc research (personal project; 1 req/s)'
ROM={'I':1,'II':2,'III':3,'IV':4,'V':5,'VI':6,'VII':7,'VIII':8,'IX':9,'X':10}
def rom(x):
    x=x.strip()
    return ROM.get(x) or (int(x) if x.isdigit() else None)
members=[]; cont={}
while True:
    r=s.get(W,params=dict(action='query',list='categorymembers',cmtitle='Category:Enchantments',cmlimit=500,format='json',**cont),timeout=30).json()
    members+=[m['title'] for m in r['query']['categorymembers'] if m['ns']==0]
    if 'continue' not in r: break
    cont=r['continue']
data=open('wiki_enchant_data.lua').read()
nocombine=set(re.findall(r"\['([^']+)'\]\s*=\s*\{[^{}]*?noCombine\s*=\s*true",data,re.S))
highmark={k:int(v) for k,v in re.findall(r"\['([^']+)'\]\s*=\s*\{\s*max\s*=\s*\d+,[^{}]*?highLevelMark\s*=\s*(\d+)",data,re.S)}
out={}
for i in range(0,len(members),40):
    batch=members[i:i+40]
    r=s.get(W,params=dict(action='query',prop='revisions',titles='|'.join(batch),rvprop='content',rvslots='main',format='json'),timeout=60).json()
    for p in r['query']['pages'].values():
        t=p['title']; txt=p.get('revisions',[{}])[0].get('slots',{}).get('main',{}).get('*','')
        caps=[rom(m.group(2)) for m in re.finditer(r'combined (?:on|in) an? (?:\{\{Item\|Anvil\}\}|\[\[Anvil\]\]),? up to \{\{(?:Ench|EnchantmentsLink)\|(?:book=\w+\|)?([^}]*?) ([IVX]+)\}\}',txt)]
        caps+=[rom(m.group(1)) for m in re.finditer(r'and \{\{(?:Ench|EnchantmentsLink)\|[^}]*? ([IVX]+)\}\} can be obtained by combining',txt)]
        cc={}
        ci=txt.find('Cost to Combine')
        if ci>0:
            for m in re.finditer(r'\|\s*([IVX]+)\s*\n\|\s*([0-9,]+)',txt[ci:ci+1500]): cc[rom(m.group(1))]=int(m.group(2).replace(',',''))
        anv=[]
        for a in re.finditer(r'\{\{AnvilSB(.*?)\}\}',txt,re.S):
            b=a.group(1)
            i1=re.search(r'Input1\s*=\s*Enchanted Book \(([^)]*?) ([IVX]+)\)',b); i2=re.search(r'Input2\s*=\s*Enchanted Book \(([^)]*?) ([IVX]+)\)',b); o=re.search(r'Output\s*=\s*Enchanted Book \(([^)]*?) ([IVX]+)\)',b)
            if i1 and i2 and o and i1.group(1)==i2.group(1)==o.group(1) and i1.group(2)==i2.group(2): anv.append(rom(o.group(2)))
        bz=[dict(id=m.group(1),name=m.group(2),min=int(m.group(3)),max=int(m.group(4))) for m in re.finditer(r'EnchantmentBazaarStats\|id=([A-Z0-9_]+)\|name=([^|]+)\|minimum=(\d+)\|maximum=(\d+)',txt)]
        m=re.search(r'\|max_level\s*=\s*([IVX]+)',txt); mx=rom(m.group(1)) if m else None
        m=re.search(r'req_enchanting_level\s*=\s*\{\{Skill\|Enchanting\|([0-9IVXL]+)',txt); req=m.group(1) if m else None
        m=re.search(r'\|id\s*=\s*(\S+)',txt); pid=m.group(1) if m else None
        base=t.replace(' (Enchantment)','')
        cap=max(caps+anv) if (caps or anv) else None
        status='combinable' if cap else ('no_combine' if base in nocombine else 'unknown')
        out[t]=dict(page=t,id=pid,max=mx,req=req,combine_cap=cap,cap_sources=dict(sentence=caps,anvil=anv),status=status,
                    no_combine_flag=base in nocombine, high_level_mark=highmark.get(base), bazaar=bz, combine_xp_cost=cc)
    time.sleep(1)
json.dump(out,open('wiki_enchants2.json','w'),indent=1)
import collections
print(collections.Counter(v['status'] for v in out.values()))
for k,v in sorted(out.items()):
    if v['status']=='unknown': print('UNKNOWN', k, 'max',v['max'],'hlm',v['high_level_mark'],'bz',[b['id']+f"[{b['min']}-{b['max']}]" for b in v['bazaar']])
# conflicts: cap >= high level mark
for k,v in out.items():
    if v['combine_cap'] and v['high_level_mark'] and v['combine_cap']>=v['high_level_mark']: print('CONFLICT',k,v['combine_cap'],v['high_level_mark'])
