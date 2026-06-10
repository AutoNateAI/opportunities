export type RegionId = 'sikeston-mo' | 'hopewell-va';

export type Region = {
  id: RegionId;
  name: string;
  label: string;
  state: string;
  lat: number;
  lng: number;
  zoom: number;
  radiusMiles: number;
  summary: string;
};

export type OpportunityLayer = 'chamber' | 'events' | 'grants' | 'housing' | 'workforce' | 'education' | 'university' | 'health' | 'faith' | 'power' | 'airport';

export type Opportunity = {
  id: string;
  title: string;
  target: string;
  layer: OpportunityLayer;
  lat: number;
  lng: number;
  score: number;
  value: number;
  probability: number;
  stage: number;
  regionId: RegionId;
  summary: string;
  nextStep: string;
  evidence: string[];
  sourceUrl?: string;
};

export type IntelData = {
  sikeston_businesses?: any[];
  sikeston_events?: any[];
  hopewell_businesses?: any[];
  hopewell_events?: any[];
  sbir_recipients?: any[];
  hud_phas?: any[];
  education_orgs?: any[];
  workforce_orgs?: any[];
  airports?: any[];
  university_research?: any[];
  health_orgs?: any[];
  funded_faith_orgs?: any[];
  federal_power?: any[];
};

export const REGIONS: Region[] = [
  {
    id: 'sikeston-mo',
    name: 'Sikeston',
    label: 'Sikeston, MO',
    state: 'MO',
    lat: 36.8767,
    lng: -89.5879,
    zoom: 11,
    radiusMiles: 55,
    summary: 'Chamber, school, workforce, housing, grant, and civic relationship graph for southeast Missouri.',
  },
  {
    id: 'hopewell-va',
    name: 'Hopewell',
    label: 'Hopewell, VA',
    state: 'VA',
    lat: 37.3043,
    lng: -77.2872,
    zoom: 11,
    radiusMiles: 55,
    summary: 'Regional opportunity graph for Hopewell, Petersburg, Richmond, workforce assets, and public sector partners.',
  },
];

export const LAYER_META: Record<OpportunityLayer, { label: string; color: string }> = {
  chamber: { label: 'Chamber', color: '#34d399' },
  events: { label: 'Events', color: '#f59e0b' },
  grants: { label: 'Grants', color: '#facc15' },
  housing: { label: 'Housing', color: '#38bdf8' },
  workforce: { label: 'Workforce', color: '#a78bfa' },
  education: { label: 'Schools', color: '#60a5fa' },
  university: { label: 'Universities', color: '#818cf8' },
  health: { label: 'Health', color: '#fb7185' },
  faith: { label: 'Faith', color: '#f472b6' },
  power: { label: 'Policy', color: '#e5e7eb' },
  airport: { label: 'Airports', color: '#ff4fd8' },
};

export const TOUCHPOINTS = ['Research', 'Warm intro', 'Event', 'Follow-up', 'Demo', 'Discovery', 'Proposal', 'Agreement'];

function point(item: any) {
  const lat = Number(item?.lat ?? item?.latitude);
  const lng = Number(item?.lng ?? item?.lon ?? item?.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng };
}

function distanceMiles(aLat: number, aLng: number, bLat: number, bLng: number) {
  const toRad = (value: number) => value * Math.PI / 180;
  const earthMiles = 3958.8;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const s1 = Math.sin(dLat / 2);
  const s2 = Math.sin(dLng / 2);
  const h = s1 * s1 + Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * s2 * s2;
  return 2 * earthMiles * Math.asin(Math.sqrt(h));
}

function inRegion(region: Region, item: any) {
  const p = point(item);
  if (!p) return String(item?.state ?? item?.state_code ?? item?.represented_state ?? '').toUpperCase() === region.state;
  return distanceMiles(region.lat, region.lng, p.lat, p.lng) <= region.radiusMiles;
}

function inState(region: Region, item: any) {
  const state = region.state.toUpperCase();
  return [
    item?.state,
    item?.state_code,
    item?.recipient_state,
    item?.represented_state,
    item?.physical_state,
    item?.mailing_state,
  ].map((value) => String(value || '').trim().toUpperCase()).includes(state);
}

function inRegionOrState(region: Region, item: any, stateWide: boolean) {
  return stateWide ? inState(region, item) || inRegion(region, item) : inRegion(region, item);
}

function title(item: any) {
  return String(item?.name || item?.title || item?.recipient_name || item?.organization || item?.agency_name || item?.full_name || 'Regional node');
}

function stableStage(seed: string) {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (Math.imul(31, hash) + seed.charCodeAt(i)) | 0;
  return Math.abs(hash) % 5;
}

function intentBoost(intent: string, text: string) {
  const terms = intent.toLowerCase().split(/[^a-z0-9]+/).filter((term) => term.length > 2);
  if (!terms.length) return 0;
  const haystack = text.toLowerCase();
  return Math.min(12, terms.reduce((sum, term) => sum + (haystack.includes(term) ? 3 : 0), 0));
}

function cleanList(values: any[]) {
  return values.map((value) => String(value || '').trim()).filter(Boolean);
}

function makeOpportunity(region: Region, item: any, layer: OpportunityLayer, base: number, intent: string, suffix: string): Opportunity | null {
  const p = point(item) || { lat: region.lat, lng: region.lng };
  const name = title(item);
  const categories = Array.isArray(item?.categories) ? item.categories.join(', ') : String(item?.category || item?.subtype || item?.role || '');
  const amount = Number(item?.total_awarded || item?.total_amount || item?.annual_hud_funding || item?.total_obligations || item?.award_amount || 0);
  const evidence = cleanList([
    categories,
    item?.city && item?.state ? `${item.city}, ${item.state}` : item?.location,
    amount ? `$${Math.round(amount).toLocaleString()} funding signal` : '',
    item?.date_label || item?.latest_award_date || item?.startDate,
  ]).slice(0, 4);
  const score = Math.max(35, Math.min(99, Math.round(base + Math.min(18, Math.log10(amount + 1) * 3) + intentBoost(intent, `${name} ${categories} ${item?.description || ''}`))));
  const value = Math.round((2500 + score * 165 + Math.min(amount * 0.018, 65000)) / 500) * 500;
  return {
    id: `${layer}-${region.id}-${item?.id || item?.source_url || name}-${suffix}`.replace(/\s+/g, '-').toLowerCase(),
    title: layer === 'events' ? `Show up at ${name}` : `${name} opportunity`,
    target: name,
    layer,
    lat: p.lat,
    lng: p.lng,
    score,
    value,
    probability: Math.min(91, Math.max(38, Math.round(score * 0.74 + stableStage(name) * 4))),
    stage: stableStage(`${name}-${layer}`),
    regionId: region.id,
    summary: summaryFor(layer, name, item),
    nextStep: nextStepFor(layer, name),
    evidence,
    sourceUrl: item?.source_url || item?.website || item?.company_website,
  };
}

function summaryFor(layer: OpportunityLayer, name: string, item: any) {
  if (layer === 'events') return `${name} can become a warm-introduction moment for chamber, civic, and employer relationships.`;
  if (layer === 'grants') return `${name} shows funding activity that can anchor grant support, reporting, AI workflow, or partner development offers.`;
  if (layer === 'housing') return `${name} links housing, public funding, compliance, and local service partners in one high-need node.`;
  if (layer === 'workforce') return `${name} is a workforce execution partner for employer pipelines, training dashboards, and program reporting.`;
  if (layer === 'education') return `${name} can support student pipelines, grant evidence, AI upskilling, and institutional workflow tools.`;
  if (layer === 'health') return `${name} gives the region a community health and service delivery partner signal.`;
  if (layer === 'faith') return `${name} can act as a trusted community implementation partner for programs and outreach.`;
  if (layer === 'power') return `${name} is a policy or public authority node that shapes the regional operating environment.`;
  if (layer === 'university') return `${name} is a state university/research node for talent, grants, applied AI, and partner credibility.`;
  if (layer === 'airport') return `${name} is a regional mobility node for employers, logistics, travel access, and economic development.`;
  const categories = Array.isArray(item?.categories) ? item.categories.slice(0, 2).join(' / ') : 'local business';
  return `${name} is a ${categories || 'local business'} node that can connect chamber relationships to paid tools, events, and partnerships.`;
}

function nextStepFor(layer: OpportunityLayer, name: string) {
  if (layer === 'events') return `Attend or sponsor the next ${name} touchpoint and capture three warm intros.`;
  if (layer === 'power') return `Map the policy owner and identify the public meeting or board agenda that creates an opening.`;
  if (layer === 'grants') return `Draft a one-page grant evidence and reporting workflow offer.`;
  if (layer === 'airport') return `Map the airport authority, economic development contact, and nearby employer/logistics cluster.`;
  return `Research ${name}, find the decision maker, and prepare a local workflow pain-point hypothesis.`;
}

export function buildOpportunities(data: IntelData, region: Region, intent: string, activeLayers: Record<OpportunityLayer, boolean>) {
  return collectOpportunities(data, region, intent, activeLayers, {
    chamber: 80,
    events: 80,
    grants: 80,
    housing: 50,
    workforce: 80,
    education: 80,
    university: 80,
    health: 50,
    faith: 50,
    power: 50,
    airport: 50,
  }).sort((a, b) => b.score - a.score).slice(0, 120);
}

export function buildMapEntities(data: IntelData, region: Region, intent: string, activeLayers: Record<OpportunityLayer, boolean>) {
  const layerLimits: Record<OpportunityLayer, number> = {
    chamber: 220,
    events: 120,
    grants: 140,
    housing: 90,
    workforce: 140,
    education: 140,
    university: 90,
    health: 90,
    faith: 110,
    power: 90,
    airport: 24,
  };
  return collectOpportunities(data, region, intent, activeLayers, layerLimits)
    .sort((a, b) => a.layer.localeCompare(b.layer) || b.score - a.score)
    .slice(0, 760);
}

function collectOpportunities(data: IntelData, region: Region, intent: string, activeLayers: Record<OpportunityLayer, boolean>, layerLimits: Record<OpportunityLayer, number>) {
  const chamberKey = region.id === 'sikeston-mo' ? 'sikeston_businesses' : 'hopewell_businesses';
  const eventKey = region.id === 'sikeston-mo' ? 'sikeston_events' : 'hopewell_events';
  const configs: Array<[OpportunityLayer, any[], number]> = [
    ['chamber', (data as any)[chamberKey] || [], 61],
    ['events', (data as any)[eventKey] || [], 66],
    ['grants', data.sbir_recipients || [], 69],
    ['housing', data.hud_phas || [], 68],
    ['workforce', data.workforce_orgs || [], 72],
    ['education', data.education_orgs || [], 70],
    ['university', data.university_research || [], 73],
    ['health', data.health_orgs || [], 63],
    ['faith', data.funded_faith_orgs || [], 62],
    ['power', data.federal_power || [], 60],
    ['airport', data.airports || [], 58],
  ];

  return configs.flatMap(([layer, records, base]) => {
    if (!activeLayers[layer]) return [];
    const stateWide = ['grants', 'workforce', 'education', 'university', 'power'].includes(layer);
    return records
      .filter((item) => inRegionOrState(region, item, stateWide))
      .slice(0, layerLimits[layer])
      .map((item, index) => makeOpportunity(region, item, layer, base, intent, String(index)))
      .filter(Boolean) as Opportunity[];
  });
}

export function fallbackOpportunities(region: Region): Opportunity[] {
  const seeds: Array<[OpportunityLayer, string, number, number, string]> = [
    ['chamber', 'Chamber Member CRM Pilot', 91, 18500, 'Package member data, events, and outreach into a chamber-facing workflow tool.'],
    ['workforce', 'Workforce Dashboard Partnership', 88, 22000, 'Connect employers, schools, and workforce programs into a measurable pipeline.'],
    ['grants', 'Grant Reporting Assistant', 84, 16000, 'Turn federal, state, and local award signals into reporting and renewal workflows.'],
    ['events', 'Chamber Lunch Touchpoint Campaign', 80, 9500, 'Use the next chamber event as the shortest path into target accounts.'],
    ['power', 'Policy Stakeholder Map', 76, 12500, 'Map city, county, state, and federal owners around the highest-value local initiative.'],
  ];
  return seeds.map(([layer, target, score, value, summary], index) => ({
    id: `fallback-${region.id}-${layer}`,
    title: target,
    target,
    layer,
    lat: region.lat + Math.sin(index * 1.4) * 0.035,
    lng: region.lng + Math.cos(index * 1.4) * 0.045,
    score,
    value,
    probability: 55 + index * 5,
    stage: index,
    regionId: region.id,
    summary,
    nextStep: 'Load live data, validate the first decision maker, and start the first touchpoint.',
    evidence: [region.label, LAYER_META[layer].label, 'Seed opportunity model'],
  }));
}
