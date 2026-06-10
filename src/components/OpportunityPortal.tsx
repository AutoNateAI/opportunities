'use client';

import dynamic from 'next/dynamic';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { onAuthStateChanged, signOut, User } from 'firebase/auth';
import { Activity, BriefcaseBusiness, Building2, CalendarDays, CheckCircle2, Database, GraduationCap, Handshake, Landmark, Layers, Loader2, LogOut, MapPin, Plane, Route, School, Search, ShieldCheck, Sparkles, Target, Users, X } from 'lucide-react';
import { CLOUD_API_BASE_URL, authenticatedFetch } from '@/lib/apiClient';
import { auth } from '@/lib/firebase';
import { buildMapEntities, buildOpportunities, fallbackOpportunities, IntelData, LAYER_META, Opportunity, OpportunityLayer, REGIONS, RegionId, TOUCHPOINTS } from '@/lib/opportunities';

const OpportunityMap = dynamic(() => import('@/components/OpportunityMap'), { ssr: false });

const DEFAULT_LAYERS: Record<OpportunityLayer, boolean> = {
  chamber: true,
  events: true,
  grants: true,
  housing: true,
  workforce: true,
  education: true,
  university: true,
  health: false,
  faith: true,
  power: true,
  airport: true,
};

const cloudEndpoint = (path: string) => `${CLOUD_API_BASE_URL}${path.startsWith('/') ? path : `/${path}`}`;

type EndpointConfig = [keyof IntelData, string, (data: any) => any[], string];

const CHAMBER_ENDPOINTS: EndpointConfig[] = [
  ['sikeston_businesses', cloudEndpoint('/api/sikeston-businesses'), (data) => data.businesses, 'Sikeston businesses'],
  ['sikeston_events', cloudEndpoint('/api/sikeston-events'), (data) => data.events, 'Sikeston events'],
  ['hopewell_businesses', cloudEndpoint('/api/hopewell-businesses'), (data) => data.businesses, 'Hopewell businesses'],
  ['hopewell_events', cloudEndpoint('/api/hopewell-events'), (data) => data.events, 'Hopewell events'],
];

const ENRICHMENT_ENDPOINTS: EndpointConfig[] = [
  ['sbir_recipients', cloudEndpoint('/api/sbir-recipients?state=MO&start_year=2021&end_year=2030&limit=1500'), (data) => data.recipients, 'Missouri SBIR recipients'],
  ['sbir_recipients', cloudEndpoint('/api/sbir-recipients?state=VA&start_year=2021&end_year=2030&limit=1500'), (data) => data.recipients, 'Virginia SBIR recipients'],
  ['hud_phas', cloudEndpoint('/api/hud-pha-flows?state=MO'), (data) => data.phas, 'Missouri HUD housing'],
  ['hud_phas', cloudEndpoint('/api/hud-pha-flows?state=VA'), (data) => data.phas, 'Virginia HUD housing'],
  ['education_orgs', cloudEndpoint('/api/education-orgs?state=MO&limit=1200'), (data) => data.orgs, 'Missouri schools'],
  ['education_orgs', cloudEndpoint('/api/education-orgs?state=VA&limit=1200'), (data) => data.orgs, 'Virginia schools'],
  ['workforce_orgs', cloudEndpoint('/api/workforce-orgs?state=MO&limit=1200'), (data) => data.orgs, 'Missouri workforce centers'],
  ['workforce_orgs', cloudEndpoint('/api/workforce-orgs?state=VA&limit=1200'), (data) => data.orgs, 'Virginia workforce centers'],
  ['health_orgs', cloudEndpoint('/api/health-orgs?state=MO&limit=1200'), (data) => data.orgs, 'Missouri health orgs'],
  ['health_orgs', cloudEndpoint('/api/health-orgs?state=VA&limit=1200'), (data) => data.orgs, 'Virginia health orgs'],
  ['funded_faith_orgs', cloudEndpoint('/api/funded-faith-orgs?state=MO&limit=1200'), (data) => data.orgs, 'Missouri faith orgs'],
  ['funded_faith_orgs', cloudEndpoint('/api/funded-faith-orgs?state=VA&limit=1200'), (data) => data.orgs, 'Virginia faith orgs'],
  ['university_research', cloudEndpoint('/api/university-research'), (data) => data.universities, 'Universities'],
  ['federal_power', cloudEndpoint('/api/federal-power'), (data) => data.people, 'Federal power'],
];

const REGIONAL_AIRPORTS = [
  { id: 'airport-cgi', type: 'airport', name: 'Cape Girardeau Regional Airport', code: 'CGI', lat: 37.2253, lng: -89.5708, city: 'Cape Girardeau', state: 'MO', category: 'Commercial service airport' },
  { id: 'airport-sik', type: 'airport', name: 'Sikeston Memorial Municipal Airport', code: 'SIK', lat: 36.8989, lng: -89.5618, city: 'Sikeston', state: 'MO', category: 'General aviation airport' },
  { id: 'airport-pah', type: 'airport', name: 'Barkley Regional Airport', code: 'PAH', lat: 37.0603, lng: -88.7738, city: 'Paducah', state: 'KY', category: 'Regional commercial airport' },
  { id: 'airport-pop', type: 'airport', name: 'Poplar Bluff Municipal Airport', code: 'POF', lat: 36.7739, lng: -90.3249, city: 'Poplar Bluff', state: 'MO', category: 'General aviation airport' },
  { id: 'airport-ric', type: 'airport', name: 'Richmond International Airport', code: 'RIC', lat: 37.5052, lng: -77.3197, city: 'Richmond', state: 'VA', category: 'Commercial service airport' },
  { id: 'airport-ptb', type: 'airport', name: 'Dinwiddie County Airport', code: 'PTB', lat: 37.1838, lng: -77.5074, city: 'Petersburg', state: 'VA', category: 'General aviation airport' },
  { id: 'airport-cpk', type: 'airport', name: 'Chesapeake Regional Airport', code: 'CPK', lat: 36.6656, lng: -76.3207, city: 'Chesapeake', state: 'VA', category: 'Regional general aviation airport' },
  { id: 'airport-phf', type: 'airport', name: 'Newport News/Williamsburg International Airport', code: 'PHF', lat: 37.1319, lng: -76.4930, city: 'Newport News', state: 'VA', category: 'Commercial service airport' },
];

const LAYER_ICONS: Record<OpportunityLayer, typeof BriefcaseBusiness> = {
  chamber: BriefcaseBusiness,
  events: CalendarDays,
  grants: Sparkles,
  housing: Landmark,
  workforce: Users,
  education: School,
  university: GraduationCap,
  health: ShieldCheck,
  faith: Handshake,
  power: Building2,
  airport: Plane,
};

export default function OpportunityPortal() {
  const [regionId, setRegionId] = useState<RegionId>('sikeston-mo');
  const [intent, setIntent] = useState('I sell AI software and workflow automation to chambers, local government, workforce boards, schools, and regional partners.');
  const [data, setData] = useState<IntelData>({});
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState('Connecting to shared Intel data');
  const [chamberStatus, setChamberStatus] = useState('Chamber data pending');
  const [activeLayers, setActiveLayers] = useState(DEFAULT_LAYERS);
  const [powerPerson, setPowerPerson] = useState<any | null>(null);
  const [user, setUser] = useState<User | null>(auth.currentUser);
  const region = REGIONS.find((item) => item.id === regionId) || REGIONS[0];

  const opportunities = useMemo(() => {
    const live = buildOpportunities(data, region, intent, activeLayers);
    return live.length ? live : fallbackOpportunities(region).filter((item) => activeLayers[item.layer]);
  }, [activeLayers, data, intent, region]);
  const mapEntities = useMemo(() => {
    const live = buildMapEntities(data, region, intent, activeLayers);
    return live.length ? live : fallbackOpportunities(region).filter((item) => activeLayers[item.layer]);
  }, [activeLayers, data, intent, region]);
  const [selectedId, setSelectedId] = useState<string>('');
  const selected = mapEntities.find((item) => item.id === selectedId) || opportunities.find((item) => item.id === selectedId) || opportunities[0] || mapEntities[0];
  const powerPeople = useMemo(() => powerForRegion(data.federal_power || [], region.state), [data.federal_power, region.state]);
  const chamberCounts = useMemo(() => ({
    'sikeston-mo': {
      businesses: data.sikeston_businesses?.length || 0,
      events: data.sikeston_events?.length || 0,
    },
    'hopewell-va': {
      businesses: data.hopewell_businesses?.length || 0,
      events: data.hopewell_events?.length || 0,
    },
  }), [data]);

  useEffect(() => {
    if (!selectedId && opportunities[0]) setSelectedId(opportunities[0].id);
  }, [opportunities, selectedId]);

  useEffect(() => onAuthStateChanged(auth, setUser), []);

  const loadData = useCallback(async () => {
    setLoading(true);
    setStatus('Firing all cloud intel layers concurrently');
    setChamberStatus('Loading Sikeston and Hopewell chamber records from Osiris intelApi');
    const endpoints = [...CHAMBER_ENDPOINTS, ...ENRICHMENT_ENDPOINTS];
    const failures: string[] = [];
    const next: IntelData = { airports: REGIONAL_AIRPORTS };
    let completed = 0;
    let firstPaint = false;
    setData({ airports: REGIONAL_AIRPORTS });
    await Promise.allSettled(endpoints.map(async ([key, endpoint, pick, label]) => {
      try {
        const json = await fetchJsonWithRetry(endpoint);
        const rows = pick(json) || [];
        next[key] = mergeById([...(next[key] || []), ...rows]);
        setData((current) => {
          const existing = current[key] || [];
          return {
            ...current,
            airports: REGIONAL_AIRPORTS,
            [key]: mergeById([...existing, ...rows]),
          };
        });
        if (label.includes('Sikeston') || label.includes('Hopewell')) {
          setChamberStatus((current) => current.includes('Loaded') ? current : 'Chamber records are streaming from Osiris intelApi');
        }
        if (!firstPaint) {
          firstPaint = true;
          setLoading(false);
        }
      } catch (error) {
        failures.push(label);
        console.warn('[Opportunities] Failed to load endpoint', endpoint, error);
      } finally {
        completed += 1;
        setStatus(`Loaded ${completed}/${endpoints.length} cloud intel layers`);
      }
    }));
    const chamberFailures = failures.filter((label) => label.includes('Sikeston') || label.includes('Hopewell'));
    const chamberCount = countChamberRecords(next);
    setChamberStatus(chamberFailures.length ? `Loaded ${chamberCount.toLocaleString()} chamber records; failed: ${chamberFailures.join(', ')}` : `Loaded ${chamberCount.toLocaleString()} chamber records for Sikeston and Hopewell`);
    setStatus(failures.length ? `Live data loaded; unavailable: ${failures.join(', ')}` : 'Live shared Intel data loaded');
    setLoading(false);
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const totals = useMemo(() => {
    const expectedValue = opportunities.reduce((sum, item) => sum + item.value * (item.probability / 100), 0);
    return {
      count: opportunities.length,
      avgScore: Math.round(opportunities.reduce((sum, item) => sum + item.score, 0) / Math.max(1, opportunities.length)),
      expectedValue,
      loadedRecords: Object.values(data).reduce((sum, rows) => sum + (Array.isArray(rows) ? rows.length : 0), 0),
    };
  }, [data, opportunities]);

  return (
    <main className="h-screen overflow-hidden bg-[#030712] text-slate-100">
      <div className="fixed inset-0 opacity-70">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_35%_18%,rgba(14,165,233,0.2),transparent_32%),radial-gradient(circle_at_75%_10%,rgba(250,204,21,0.13),transparent_24%),linear-gradient(180deg,#030712_0%,#07111f_52%,#020617_100%)]" />
        <div className="absolute inset-0 bg-[linear-gradient(rgba(148,163,184,0.045)_1px,transparent_1px),linear-gradient(90deg,rgba(148,163,184,0.045)_1px,transparent_1px)] bg-[size:44px_44px]" />
      </div>

      <div className="relative grid h-screen grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden">
        <header className="z-20 border-b border-white/10 bg-slate-950/80 px-4 py-3 backdrop-blur-xl lg:px-5">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-center gap-3">
              <div className="grid h-10 w-10 place-items-center rounded border border-cyan-300/40 bg-cyan-300/10 text-cyan-200">
                <Target className="h-5 w-5" />
              </div>
              <div>
                <h1 className="text-lg font-black tracking-wide text-white">AutoNateAI Opportunities</h1>
                <p className="text-xs text-slate-400">Discover. Prioritize. Connect. Execute.</p>
              </div>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
                <Metric label="Nodes" value={totals.loadedRecords.toLocaleString()} />
                <Metric label="Opportunities" value={totals.count.toLocaleString()} />
                <Metric label="Avg Score" value={String(totals.avgScore || 0)} />
                <Metric label="Weighted Pipeline" value={money(totals.expectedValue)} />
              </div>
              <button onClick={() => signOut(auth)} className="inline-flex h-full items-center justify-center gap-2 rounded border border-white/10 bg-white/[0.04] px-3 py-2 text-xs font-semibold text-slate-200 transition hover:border-red-300/40 hover:bg-red-400/10 hover:text-red-100" title="Sign out">
                <span className="hidden max-w-[130px] truncate xl:inline">{user?.displayName || user?.email || 'Account'}</span>
                <LogOut className="h-4 w-4" />
              </button>
            </div>
          </div>
        </header>

        <section className="relative z-10 grid min-h-0 grid-cols-1 overflow-hidden lg:grid-cols-[340px_minmax(0,1fr)_390px]">
          <aside className="order-2 min-h-0 overflow-y-auto border-t border-white/10 bg-slate-950/85 p-4 backdrop-blur-xl lg:order-1 lg:border-r lg:border-t-0">
            <div className="flex items-center justify-between">
              <div className="text-xs font-bold uppercase tracking-[0.18em] text-cyan-200">Region</div>
              <button onClick={loadData} className="inline-flex items-center gap-2 rounded border border-white/10 bg-white/5 px-2.5 py-1.5 text-xs text-slate-200 transition hover:bg-white/10">
                {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Database className="h-3.5 w-3.5" />}
                Sync
              </button>
            </div>
            <div className="mt-3 grid gap-2">
              {REGIONS.map((item) => (
                <button key={item.id} onClick={() => { setRegionId(item.id); setSelectedId(''); }} className={`rounded border p-3 text-left transition ${item.id === region.id ? 'border-cyan-300/60 bg-cyan-300/10' : 'border-white/10 bg-white/[0.03] hover:bg-white/[0.06]'}`}>
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-semibold">{item.label}</span>
                  <MapPin className="h-4 w-4 text-cyan-200" />
                </div>
                <p className="mt-1 text-xs leading-5 text-slate-400">{item.summary}</p>
                <div className="mt-3 grid grid-cols-2 gap-2 text-[10px] uppercase tracking-wide text-slate-500">
                  <span>{chamberCounts[item.id].businesses.toLocaleString()} businesses</span>
                  <span>{chamberCounts[item.id].events.toLocaleString()} events</span>
                </div>
              </button>
            ))}
            </div>

            <div className="mt-5">
              <label className="text-xs font-bold uppercase tracking-[0.18em] text-amber-200" htmlFor="intent">Intent</label>
              <div className="mt-2 flex items-start gap-2 rounded border border-white/10 bg-black/20 p-3">
                <Search className="mt-0.5 h-4 w-4 shrink-0 text-amber-200" />
                <textarea id="intent" value={intent} onChange={(event) => setIntent(event.target.value)} rows={5} className="w-full resize-none bg-transparent text-sm leading-5 text-slate-100 outline-none placeholder:text-slate-500" />
              </div>
            </div>

            <div className="mt-5">
              <div className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.18em] text-slate-300">
                <Layers className="h-3.5 w-3.5" />
                Layers
              </div>
              <div className="grid grid-cols-2 gap-2">
                {(Object.keys(LAYER_META) as OpportunityLayer[]).map((layer) => {
                  const Icon = LAYER_ICONS[layer];
                  return (
                    <button key={layer} onClick={() => setActiveLayers((current) => ({ ...current, [layer]: !current[layer] }))} className={`flex items-center gap-2 rounded border px-2.5 py-2 text-left text-xs transition ${activeLayers[layer] ? 'border-white/20 bg-white/10 text-white' : 'border-white/10 bg-white/[0.025] text-slate-500'}`}>
                      <Icon className="h-3.5 w-3.5" style={{ color: activeLayers[layer] ? LAYER_META[layer].color : undefined }} />
                      {LAYER_META[layer].label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="mt-5 rounded border border-white/10 bg-white/[0.03] p-3">
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.18em] text-emerald-200">
                <Activity className="h-3.5 w-3.5" />
                Status
              </div>
              <p className="mt-2 text-xs leading-5 text-slate-400">{status}</p>
              <p className="mt-1 text-xs leading-5 text-emerald-100">{chamberStatus}</p>
            </div>
          </aside>

          <div className="order-1 min-h-0 overflow-hidden lg:order-2">
            <OpportunityMap region={region} opportunities={mapEntities} selectedId={selected?.id} onSelect={(item) => setSelectedId(item.id)} />
          </div>

          <aside className="order-3 min-h-0 overflow-y-auto border-t border-white/10 bg-slate-950/85 p-4 backdrop-blur-xl lg:border-l lg:border-t-0">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-xs font-bold uppercase tracking-[0.18em] text-amber-200">Opportunity Queue</div>
                <p className="mt-1 text-xs text-slate-500">{region.label} ranked against current intent.</p>
              </div>
              <Route className="h-5 w-5 text-amber-200" />
            </div>

            {selected && <SelectedOpportunity opportunity={selected} />}

            <PowerPanel people={powerPeople} regionLabel={region.label} onSelect={setPowerPerson} />

            <div className="mt-4 space-y-2">
              {opportunities.slice(0, 16).map((opportunity, index) => (
                <button key={opportunity.id} onClick={() => setSelectedId(opportunity.id)} className={`block w-full rounded border p-3 text-left transition ${selected?.id === opportunity.id ? 'border-cyan-300/60 bg-cyan-300/10' : 'border-white/10 bg-white/[0.035] hover:bg-white/[0.07]'}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] text-slate-500">#{index + 1}</span>
                        <span className="rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide" style={{ backgroundColor: `${LAYER_META[opportunity.layer].color}1f`, color: LAYER_META[opportunity.layer].color }}>
                          {LAYER_META[opportunity.layer].label}
                        </span>
                      </div>
                      <div className="mt-1 truncate text-sm font-semibold text-white">{opportunity.title}</div>
                      <div className="mt-1 line-clamp-2 text-xs leading-5 text-slate-400">{opportunity.summary}</div>
                    </div>
                    <div className="shrink-0 text-right">
                      <div className="text-lg font-black text-amber-200">{opportunity.score}</div>
                      <div className="text-[10px] text-slate-500">{money(opportunity.value)}</div>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </aside>
        </section>

        <footer className="relative z-20 grid grid-cols-2 gap-px border-t border-white/10 bg-white/10 text-[10px] uppercase tracking-[0.14em] text-slate-400 md:grid-cols-4">
          <FooterCell label="Portal" value="opportunities.autonateai.com" />
          <FooterCell label="Data" value="shared Osiris intelApi" />
          <FooterCell label="Map" value="MapLibre globe/local view" />
          <FooterCell label="Mode" value={loading ? 'syncing' : 'operational'} />
        </footer>
      </div>
      {powerPerson && <PowerPersonModal person={powerPerson} regionLabel={region.label} onClose={() => setPowerPerson(null)} />}
    </main>
  );
}

function SelectedOpportunity({ opportunity }: { opportunity: Opportunity }) {
  return (
    <section className="mt-4 rounded border border-cyan-300/35 bg-slate-950 p-4 shadow-[0_18px_60px_rgba(8,47,73,0.28)]">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="inline-flex rounded bg-white/[0.06] px-2 py-1 text-[10px] font-bold uppercase tracking-[0.18em]" style={{ color: LAYER_META[opportunity.layer].color }}>{LAYER_META[opportunity.layer].label}</div>
          <h2 className="mt-1 text-lg font-black leading-tight text-white">{opportunity.title}</h2>
        </div>
        <div className="rounded border border-amber-200/50 bg-amber-200/15 px-3 py-2 text-center">
          <div className="text-2xl font-black text-amber-100">{opportunity.score}</div>
          <div className="text-[9px] uppercase tracking-wide text-amber-100/70">score</div>
        </div>
      </div>
      <p className="mt-3 text-sm leading-6 text-slate-300">{opportunity.summary}</p>
      <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs">
        <MiniMetric label="Value" value={money(opportunity.value)} />
        <MiniMetric label="Prob." value={`${opportunity.probability}%`} />
        <MiniMetric label="Stage" value={`${opportunity.stage + 1}/${TOUCHPOINTS.length}`} />
      </div>
      <div className="mt-4">
        <div className="mb-2 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">Touchpoints</div>
        <div className="grid grid-cols-4 gap-1.5">
          {TOUCHPOINTS.map((touchpoint, index) => (
            <div key={touchpoint} className={`rounded border px-2 py-2 text-center text-[10px] ${index <= opportunity.stage ? 'border-emerald-300/30 bg-emerald-300/10 text-emerald-100' : 'border-white/10 bg-white/[0.03] text-slate-500'}`}>
              {index <= opportunity.stage && <CheckCircle2 className="mx-auto mb-1 h-3 w-3" />}
              {touchpoint}
            </div>
          ))}
        </div>
      </div>
      <div className="mt-4 rounded border border-white/10 bg-black/20 p-3">
        <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-cyan-200">Next Step</div>
        <p className="mt-1 text-sm leading-6 text-slate-200">{opportunity.nextStep}</p>
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {opportunity.evidence.map((item) => (
          <span key={item} className="rounded border border-white/10 bg-white/[0.04] px-2 py-1 text-[10px] text-slate-300">{item}</span>
        ))}
      </div>
      {opportunity.sourceUrl && (
        <a href={opportunity.sourceUrl} target="_blank" rel="noreferrer" className="mt-3 inline-flex text-xs font-semibold text-cyan-200 hover:text-cyan-100">Open source</a>
      )}
    </section>
  );
}

function PowerPanel({ people, regionLabel, onSelect }: { people: any[]; regionLabel: string; onSelect: (person: any) => void }) {
  const senators = people.filter((person) => powerChamber(person) === 'Senate');
  const representatives = people.filter((person) => powerChamber(person) === 'House');
  const others = people.filter((person) => !['Senate', 'House'].includes(powerChamber(person)));
  return (
    <section className="mt-4 rounded border border-white/10 bg-white/[0.035] p-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-cyan-200">Power Heads</div>
          <p className="mt-1 text-xs text-slate-500">{regionLabel} senators and representatives.</p>
        </div>
        <Building2 className="h-4 w-4 text-cyan-200" />
      </div>
      <div className="mt-3 max-h-[360px] space-y-3 overflow-y-auto pr-1">
        <PowerGroup title="Senate" people={senators} onSelect={onSelect} />
        <PowerGroup title="House" people={representatives} onSelect={onSelect} />
        {!!others.length && <PowerGroup title="Other" people={others} onSelect={onSelect} />}
        {!people.length && (
          <div className="rounded border border-white/10 bg-slate-950/70 p-3 text-xs leading-5 text-slate-400">
            No linked power records loaded for this state yet.
          </div>
        )}
      </div>
    </section>
  );
}

function PowerGroup({ title, people, onSelect }: { title: string; people: any[]; onSelect: (person: any) => void }) {
  if (!people.length) return null;
  return (
    <div>
      <div className="mb-1.5 text-[9px] font-bold uppercase tracking-[0.16em] text-slate-500">{title}</div>
      <div className="space-y-2">
        {people.map((person, index) => (
          <button key={personKey(person, index)} onClick={() => onSelect(person)} className="block w-full rounded border border-white/10 bg-slate-950/70 p-2.5 text-left transition hover:border-cyan-300/40 hover:bg-cyan-300/10">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold text-white">{personName(person)}</div>
                <div className="mt-1 truncate text-[11px] text-slate-400">{personRole(person)}</div>
              </div>
              <span className="shrink-0 rounded border border-white/10 bg-white/[0.05] px-1.5 py-0.5 text-[10px] uppercase text-slate-300">{powerDistrict(person)}</span>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

function PowerPersonModal({ person, regionLabel, onClose }: { person: any; regionLabel: string; onClose: () => void }) {
  const policies = policyList(person);
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4 backdrop-blur-sm" onClick={onClose}>
      <section className="w-full max-w-2xl rounded border border-cyan-300/30 bg-slate-950 p-5 shadow-[0_24px_90px_rgba(0,0,0,0.65)]" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-cyan-200">{regionLabel} Power Record</div>
            <h2 className="mt-2 text-2xl font-black leading-tight text-white">{personName(person)}</h2>
            <p className="mt-1 text-sm text-slate-300">{personRole(person)}</p>
          </div>
          <button onClick={onClose} className="grid h-9 w-9 place-items-center rounded border border-white/10 bg-white/[0.04] text-slate-200 transition hover:bg-white/10" aria-label="Close power record">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-4 grid gap-2 text-xs sm:grid-cols-4">
          <MiniMetric label="State" value={personState(person)} />
          <MiniMetric label="Party" value={String(person?.party || person?.party_name || 'N/A')} />
          <MiniMetric label="District" value={String(person?.district || person?.represented_district || 'Statewide')} />
          <MiniMetric label="Source" value={String(person?.source || person?.office || person?.chamber || 'Intel')} />
        </div>

        <div className="mt-4 rounded border border-white/10 bg-black/25 p-3">
          <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-amber-200">Policy Links</div>
          <div className="mt-3 flex flex-wrap gap-2">
            {policies.map((policy) => (
              <span key={policy} className="rounded border border-cyan-300/20 bg-cyan-300/10 px-2 py-1 text-xs text-cyan-100">{policy}</span>
            ))}
          </div>
        </div>

        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          <div className="rounded border border-white/10 bg-white/[0.035] p-3">
            <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">Office Signal</div>
            <p className="mt-2 text-sm leading-6 text-slate-200">{String(person?.description || person?.summary || person?.bio || `${personName(person)} is loaded as a policy actor connected to ${regionLabel}.`)}</p>
          </div>
          <div className="rounded border border-white/10 bg-white/[0.035] p-3">
            <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">Next Move</div>
            <p className="mt-2 text-sm leading-6 text-slate-200">Tie the top opportunity layer to committee interest, public funding, district priorities, or a local government agenda item.</p>
          </div>
        </div>
      </section>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border border-white/10 bg-white/[0.04] px-3 py-2">
      <div className="text-[9px] uppercase tracking-[0.16em] text-slate-500">{label}</div>
      <div className="mt-0.5 font-mono text-sm font-bold text-slate-100">{value}</div>
    </div>
  );
}

function MiniMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border border-white/10 bg-white/[0.04] p-2">
      <div className="font-mono text-sm font-bold text-white">{value}</div>
      <div className="text-[9px] uppercase tracking-wide text-slate-500">{label}</div>
    </div>
  );
}

function FooterCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-slate-950/90 px-4 py-2">
      <span className="text-slate-600">{label}: </span>
      <span className="text-slate-300">{value}</span>
    </div>
  );
}

function money(value: number) {
  return value.toLocaleString(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
}

async function fetchJsonWithRetry(endpoint: string) {
  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const response = await authenticatedFetch(endpoint);
      if (!response.ok) throw new Error(`${endpoint} returned ${response.status}`);
      return response.json();
    } catch (error) {
      lastError = error;
      if (attempt < 1) await wait(350);
    }
  }
  throw lastError instanceof Error ? lastError : new Error(`${endpoint} failed`);
}

function wait(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function mergeById(rows: any[]) {
  const seen = new Set<string>();
  return rows.filter((row, index) => {
    const key = String(row?.id || row?.source_url || row?.website || row?.name || row?.title || index);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function countChamberRecords(data: IntelData) {
  return (data.sikeston_businesses?.length || 0)
    + (data.sikeston_events?.length || 0)
    + (data.hopewell_businesses?.length || 0)
    + (data.hopewell_events?.length || 0);
}

function powerForRegion(people: any[], state: string) {
  const normalizedState = state.toUpperCase();
  return people
    .filter((person) => personState(person) === normalizedState || String(person?.state || '').toUpperCase() === normalizedState)
    .sort((a, b) => {
      const aRank = roleRank(personRole(a));
      const bRank = roleRank(personRole(b));
      return aRank - bRank || districtRank(a) - districtRank(b) || personName(a).localeCompare(personName(b));
    });
}

function roleRank(role: string) {
  const text = role.toLowerCase();
  if (text.includes('senate') || text.includes('senator')) return 1;
  if (text.includes('house') || text.includes('representative')) return 2;
  if (text.includes('governor')) return 3;
  if (text.includes('mayor') || text.includes('county')) return 4;
  return 5;
}

function districtRank(person: any) {
  const district = Number(person?.district || person?.represented_district || 0);
  return Number.isFinite(district) ? district : 999;
}

function personKey(person: any, index: number) {
  return String(person?.id || person?.bioguide_id || person?.source_url || person?.name || person?.full_name || index);
}

function personName(person: any) {
  return String(person?.name || person?.full_name || [person?.first_name, person?.last_name].filter(Boolean).join(' ') || person?.office_name || 'Power actor');
}

function personRole(person: any) {
  return String(person?.role || person?.title || person?.office || person?.chamber || person?.position || 'Public official');
}

function powerChamber(person: any) {
  const chamber = String(person?.chamber || '').toLowerCase();
  const role = personRole(person).toLowerCase();
  if (chamber.includes('senate') || role.includes('senator')) return 'Senate';
  if (chamber.includes('house') || role.includes('representative')) return 'House';
  return '';
}

function powerDistrict(person: any) {
  const chamber = powerChamber(person);
  if (chamber === 'Senate') return personState(person);
  const district = person?.district || person?.represented_district;
  return district ? `${personState(person)}-${district}` : personState(person);
}

function personState(person: any) {
  return String(person?.represented_state || person?.state || person?.state_code || person?.jurisdiction_state || 'US').toUpperCase();
}

function policyList(person: any) {
  const raw = [
    person?.policies,
    person?.policy_areas,
    person?.policyAreas,
    person?.committees,
    person?.issues,
  ].flatMap((value) => Array.isArray(value) ? value : String(value || '').split(/[;,|]/));
  const policies = raw.map((item) => String(item || '').trim()).filter(Boolean);
  if (policies.length) return Array.from(new Set(policies)).slice(0, 12);
  return ['Workforce', 'Housing', 'Education', 'Federal funding', 'Transportation', 'Local government'];
}
