import csv, json, datetime, hashlib
rows=list(csv.reader(open('tools/uno-sheet-export.csv')))
P=['Nathan','Louna','Andy','Julia','Justin','Tom','Nicolas']
pid={p:p.lower() for p in P}
def num(s):
    s=s.strip()
    if s=='' or s.startswith('#'): return None
    return int(float(s))

# Walk every row, including the manual -200 adjustment row, so that the
# standings carried into each game are the sheet's own numbers.
G=[]; standing={p:None for p in P}
for r in rows[1:]:
    r=r+['']*30
    raw={P[i]:num(r[2+i]) for i in range(7)}
    cum={P[i]:num(r[13+i]) for i in range(7)}
    if r[0].strip() and not all(v is None for v in raw.values()):
        G.append(dict(no=int(r[0]), ts=r[1].strip(), raw=raw, cum=cum,
            before=dict(standing),
            order={P[i]:num(r[22+i]) for i in range(7)}))
    for p in P:
        if cum[p] is not None: standing[p]=cum[p]

# CEST (UTC+2) in August; the sheet's clock is local French time
def epoch(ts):
    if not ts: return None
    d,t = ts.split(' ')
    D,M,Y = map(int,d.split('/'))
    parts=[int(x) for x in t.split(':')]
    while len(parts)<3: parts.append(0)
    dt=datetime.datetime(Y,M,D,*parts,tzinfo=datetime.timezone(datetime.timedelta(hours=2)))
    return int(dt.timestamp()*1000)

def seat(g): return [pid[p] for p in sorted(
    [p for p in P if g['order'][p] is not None and g['raw'][p] is not None],
    key=lambda p:g['order'][p])]

# opening balances: a player's first cumulative minus the score they got that game
opening={}
seen=set()
for g in G:
    for p in P:
        if g['cum'][p] is None or p in seen: continue
        seen.add(p)
        if g['raw'][p] is None:            # appeared in the table before playing
            opening[pid[p]] = g['cum'][p]
        else:
            base = g['cum'][p] - g['raw'][p]
            if base: opening[pid[p]] = base
# players who joined the table on a row where they had no score yet still need it applied
for g in G:
    for p in P:
        if g['raw'][p] is None and g['cum'][p] is not None and pid[p] not in opening:
            opening[pid[p]] = g['cum'][p]

# split into sessions: same seating, and no gap longer than 3 hours
GAP = 3*3600*1000
sessions=[]
for g in G:
    s = seat(g); t = epoch(g['ts'])
    cur = sessions[-1] if sessions else None
    same = cur and cur['seat']==s
    if same and t is not None and cur['last'] is not None and t-cur['last'] > GAP: same=False
    if not same:
        sessions.append(dict(seat=s, games=[], last=t, start=t))
        cur = sessions[-1]
    cur['games'].append(g)
    if t is not None: cur['last']=t

out={"version":1,"opening":opening,"sessions":[]}
for i,s in enumerate(sessions):
    games=[]
    for g in s['games']:
        entries={}
        for p in P:
            v=g['raw'][p]
            if v is None: continue
            if v==-10:   entries[pid[p]]={"kind":"win","points":None}
            elif v==-20: entries[pid[p]]={"kind":"cut","points":None}
            else:        entries[pid[p]]={"kind":"points","points":v}
        # The house rule: whoever is last (highest total) starts the next game.
        # Ties break by seat order, matching the app.
        at_table = [p for p in P if g['raw'][p] is not None]
        seats = seat(g)
        def tot(p):
            v = g['before'][p]
            return v if v is not None else opening.get(pid[p], 0)
        starter = max(seats, key=lambda q: (tot({v:k for k,v in pid.items()}[q]),
                                            -seats.index(q)))
        games.append({"id":"h%03d"%g['no'],"startedAt":epoch(g['ts']),"endedAt":None,
                      "starter":starter,"imported":True,"entries":entries})
    out["sessions"].append({"id":"hs%02d"%(i+1),"startedAt":s['start'],
        "endedAt":s['last'] or s['start'],"seating":s['seat'],"games":games,"live":False,
        "imported":True})

open('history.js','w').write("window.UNO_HISTORY = "+json.dumps(out,separators=(',',':'))+";\n")
print("opening balances:",opening)
print("sessions:",len(out['sessions']),"games:",sum(len(s['games']) for s in out['sessions']))
for s in out['sessions']:
    d=datetime.datetime.fromtimestamp(s['startedAt']/1000,datetime.timezone(datetime.timedelta(hours=2))).strftime('%d/%m %H:%M') if s['startedAt'] else 'no date'
    print(f"  {len(s['games']):>3} games  {d:<12} {len(s['seating'])}p  {' > '.join(s['seating'])}")
