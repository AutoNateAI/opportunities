'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { User } from 'firebase/auth';
import { addDoc, collection, getDocs, limit, query, serverTimestamp, where } from 'firebase/firestore';
import { ArrowLeft, CheckCircle2, Code2, Database, Layers, MapPinned, Plus, Save, Search, Sparkles, Target, X } from 'lucide-react';
import { db } from '@/lib/firebase';
import { LAYER_META, Opportunity, OpportunityLayer, Region } from '@/lib/opportunities';

export type ReportDoc = {
  id: string;
  name: string;
  regionId: string;
  regionLabel: string;
  audienceDirectory: string;
  status: string;
  entityCount: number;
  entities: ReportEntity[];
  campaigns?: CampaignPlan[];
  githubRepos?: RepoMatch[];
  createdAt?: any;
  updatedAt?: any;
};

type ReportEntity = Opportunity & {
  fitGrade: 'A' | 'B' | 'C' | 'D';
  fitSignals: FitSignals;
};

type CampaignPlan = {
  id?: string;
  campaignName: string;
  targetEntityIds: string[];
  angle: string;
  offer: string;
  advantage: string;
  contentAssets: string[];
  closeGoal: string;
  touchpoints: string[];
};

type RepoMatch = {
  id: string;
  name: string;
  useCase: string;
  deploymentPath: string;
  brandingNotes: string;
  firebaseAuthNeeded: boolean;
  firestoreSchemaNeeded: boolean;
  githubPagesCompatible: boolean;
  promptPack: string;
};

type FitSignals = {
  budgetSignal: number;
  strategicRelevance: number;
  networkCentrality: number;
  eventAccessibility: number;
  digitalNeed: number;
  partnershipPotential: number;
  githubSolutionMatch: number;
  censusNeedMatch: number;
};

type ScreenerFilters = {
  query: string;
  city: string;
  layer: 'all' | OpportunityLayer;
  minScore: number;
  grade: 'all' | 'A' | 'B' | 'C' | 'D';
};

type Props = {
  user: User | null;
  region: Region;
  candidates: Opportunity[];
  focusedReportId?: string;
  onClose: () => void;
  onFocusReport: (report: ReportDoc | null) => void;
};

const DEFAULT_FILTERS: ScreenerFilters = {
  query: '',
  city: '',
  layer: 'all',
  minScore: 55,
  grade: 'all',
};

const FALLBACK_REPOS: RepoMatch[] = [
  {
    id: 'repo-local-opportunity-portal',
    name: 'local-opportunity-portal',
    useCase: 'Branded chamber and regional opportunity map with auth, reports, and campaign workflow.',
    deploymentPath: 'GitHub Pages + Firebase Auth + Firestore',
    brandingNotes: 'Swap palette, logo, OG image, chamber directory copy, and local region defaults.',
    firebaseAuthNeeded: true,
    firestoreSchemaNeeded: true,
    githubPagesCompatible: true,
    promptPack: 'Customize regional portal, generate report schema, wire Firestore, deploy Pages workflow.',
  },
  {
    id: 'repo-chamber-crm-dashboard',
    name: 'chamber-crm-dashboard',
    useCase: 'Member CRM, events, touchpoints, pipeline, and sponsor opportunity tracking.',
    deploymentPath: 'Static frontend + Firebase backend',
    brandingNotes: 'Brand around the chamber or economic development office.',
    firebaseAuthNeeded: true,
    firestoreSchemaNeeded: true,
    githubPagesCompatible: true,
    promptPack: 'Generate member CRM workflows, campaign prompts, follow-up scripts, and dashboards.',
  },
  {
    id: 'repo-workforce-ai-portal',
    name: 'workforce-ai-portal',
    useCase: 'Employer, school, workforce board, and training partner action-planning portal.',
    deploymentPath: 'GitHub Pages + Firebase Auth + Firestore',
    brandingNotes: 'Package as a workforce board pilot or employer coalition tool.',
    firebaseAuthNeeded: true,
    firestoreSchemaNeeded: true,
    githubPagesCompatible: true,
    promptPack: 'Generate workforce campaign, employer intake, school partner map, and grant evidence workflow.',
  },
];

export default function ReportsWorkspace({ user, region, candidates, focusedReportId, onClose, onFocusReport }: Props) {
  const [reports, setReports] = useState<ReportDoc[]>([]);
  const [loadingReports, setLoadingReports] = useState(false);
  const [creatorOpen, setCreatorOpen] = useState(false);
  const [selectedReport, setSelectedReport] = useState<ReportDoc | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [reportName, setReportName] = useState(`${region.label} Chamber Mini-Market`);
  const [repoMatches, setRepoMatches] = useState<RepoMatch[]>(FALLBACK_REPOS);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState('');

  const screened = useMemo(() => {
    const rows = rankEntities(candidates)
      .filter((entity) => entity.layer === 'chamber' || entity.layer === 'events' || entity.layer === 'housing' || entity.layer === 'workforce' || entity.layer === 'education' || entity.layer === 'university' || entity.layer === 'grants' || entity.layer === 'faith' || entity.layer === 'airport')
      .filter((entity) => entity.score >= filters.minScore)
      .filter((entity) => filters.layer === 'all' || entity.layer === filters.layer)
      .filter((entity) => filters.grade === 'all' || entity.fitGrade === filters.grade)
      .filter((entity) => !filters.query || `${entity.target} ${entity.summary} ${entity.evidence.join(' ')}`.toLowerCase().includes(filters.query.toLowerCase()))
      .filter((entity) => !filters.city || entity.evidence.join(' ').toLowerCase().includes(filters.city.toLowerCase()));
    return rows.sort((a, b) => gradeRank(a.fitGrade) - gradeRank(b.fitGrade) || b.score - a.score).slice(0, 260);
  }, [candidates, filters]);

  const selectedEntities = useMemo(() => selectedIds.map((id) => screened.find((entity) => entity.id === id) || rankEntities(candidates).find((entity) => entity.id === id)).filter(Boolean) as ReportEntity[], [candidates, screened, selectedIds]);
  const previewCampaigns = useMemo(() => generateCampaigns(selectedEntities), [selectedEntities]);

  useEffect(() => {
    setReportName(`${region.label} Chamber Mini-Market`);
    setSelectedIds([]);
    setFilters(DEFAULT_FILTERS);
  }, [region.id, region.label]);

  useEffect(() => {
    if (!user) return;
    let active = true;
    setLoadingReports(true);
    Promise.all([loadReports(user.uid), loadRepoMatches()])
      .then(([nextReports, nextRepos]) => {
        if (!active) return;
        setReports(nextReports);
        if (nextRepos.length) setRepoMatches(nextRepos);
      })
      .finally(() => {
        if (active) setLoadingReports(false);
      });
    return () => {
      active = false;
    };
  }, [user]);

  const toggleSelected = (id: string) => {
    setSelectedIds((current) => {
      if (current.includes(id)) return current.filter((item) => item !== id);
      if (current.length >= 9) return current;
      return [...current, id];
    });
  };

  const autoPick = () => {
    const picked: string[] = [];
    const groups: Array<['A' | 'B' | 'C', number]> = [['A', 3], ['B', 3], ['C', 3]];
    groups.forEach(([grade, count]) => {
      screened.filter((entity) => entity.fitGrade === grade).slice(0, count).forEach((entity) => {
        if (!picked.includes(entity.id) && picked.length < 9) picked.push(entity.id);
      });
    });
    screened.forEach((entity) => {
      if (picked.length < 9 && !picked.includes(entity.id)) picked.push(entity.id);
    });
    setSelectedIds(picked.slice(0, 9));
  };

  const saveReport = async (event: FormEvent) => {
    event.preventDefault();
    if (!user || !selectedEntities.length) return;
    setSaving(true);
    setNotice('');
    try {
      const campaigns = previewCampaigns;
      const attachedRepos = pickReposForEntities(selectedEntities, repoMatches);
      const reportPayload = {
        ownerUid: user.uid,
        ownerEmail: user.email || '',
        name: reportName.trim() || `${region.label} Opportunity Report`,
        regionId: region.id,
        regionLabel: region.label,
        audienceDirectory: 'Chamber of Commerce',
        status: 'active',
        entityCount: selectedEntities.length,
        entities: selectedEntities.map(serializeEntity),
        mapSnapshot: {
          center: { lat: region.lat, lng: region.lng },
          zoom: region.zoom,
          radiusMiles: region.radiusMiles,
          selectedEntityIds: selectedEntities.map((entity) => entity.id),
        },
        savedFilters: filters,
        githubRepos: attachedRepos,
        aiWorkflows: attachedRepos.map((repo) => ({ repoId: repo.id, promptPack: repo.promptPack, deploymentPath: repo.deploymentPath })),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };
      const reportRef = await addDoc(collection(db, 'opportunityReports'), reportPayload);
      await addDoc(collection(db, 'savedFilters'), {
        ownerUid: user.uid,
        reportId: reportRef.id,
        regionId: region.id,
        name: `${reportPayload.name} screener`,
        filters,
        createdAt: serverTimestamp(),
      });
      const savedCampaigns = await Promise.all(campaigns.map(async (campaign) => {
        const campaignRef = await addDoc(collection(db, 'campaigns'), {
          ...campaign,
          ownerUid: user.uid,
          reportId: reportRef.id,
          status: 'planned',
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        await Promise.all(campaign.touchpoints.map((touchpoint, index) => addDoc(collection(db, 'touchpoints'), {
          ownerUid: user.uid,
          reportId: reportRef.id,
          campaignId: campaignRef.id,
          label: touchpoint,
          sequence: index + 1,
          status: index === 0 ? 'ready' : 'queued',
          createdAt: serverTimestamp(),
        })));
        return { ...campaign, id: campaignRef.id };
      }));
      const report: ReportDoc = {
        id: reportRef.id,
        name: reportPayload.name,
        regionId: region.id,
        regionLabel: region.label,
        audienceDirectory: 'Chamber of Commerce',
        status: 'active',
        entityCount: selectedEntities.length,
        entities: selectedEntities.map(serializeEntity),
        campaigns: savedCampaigns,
        githubRepos: attachedRepos,
      };
      setReports((current) => [report, ...current]);
      setSelectedReport(report);
      onFocusReport(report);
      setCreatorOpen(false);
      setNotice('Opportunity report saved with campaigns and touchpoints.');
    } catch (error) {
      console.error('[Reports] Failed to save opportunity report', error);
      setNotice(error instanceof Error ? error.message : 'Failed to save opportunity report.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="absolute bottom-0 right-0 top-0 z-40 grid w-full max-w-[1080px] bg-slate-950/98 text-slate-100 shadow-[0_0_80px_rgba(0,0,0,0.65)] lg:grid-cols-[330px_minmax(0,1fr)]">
      <aside className="min-h-0 overflow-y-auto border-r border-white/10 bg-slate-950 p-4">
        <div className="flex items-center justify-between gap-3">
          <button onClick={onClose} className="inline-flex items-center gap-2 rounded border border-white/10 bg-white/[0.04] px-2.5 py-2 text-xs font-semibold text-slate-200 transition hover:bg-white/10">
            <ArrowLeft className="h-4 w-4" />
            Main View
          </button>
          <button onClick={() => setCreatorOpen(true)} className="inline-flex items-center gap-2 rounded border border-emerald-300/30 bg-emerald-300/10 px-2.5 py-2 text-xs font-semibold text-emerald-100 transition hover:bg-emerald-300/15">
            <Plus className="h-4 w-4" />
            Create Report
          </button>
        </div>
        <div className="mt-5">
          <div className="text-xs font-bold uppercase tracking-[0.18em] text-cyan-200">Opportunity Reports</div>
          <p className="mt-2 text-sm leading-6 text-slate-400">Mini-markets of 9 ranked entities, campaigns, repositories, and six-touchpoint close plans.</p>
        </div>
        {notice && <div className="mt-4 rounded border border-cyan-300/25 bg-cyan-300/10 p-3 text-xs leading-5 text-cyan-100">{notice}</div>}
        <div className="mt-5 space-y-2">
          {loadingReports && <div className="rounded border border-white/10 bg-white/[0.03] p-3 text-xs text-slate-400">Loading saved reports...</div>}
          {reports.map((report) => (
            <button key={report.id} onClick={() => { setSelectedReport(report); onFocusReport(report); }} className={`block w-full rounded border p-3 text-left transition ${selectedReport?.id === report.id || focusedReportId === report.id ? 'border-cyan-300/55 bg-cyan-300/10' : 'border-white/10 bg-white/[0.035] hover:bg-white/[0.07]'}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="truncate text-sm font-bold text-white">{report.name}</div>
                  <div className="mt-1 text-xs text-slate-400">{report.regionLabel} · {report.entityCount} entities</div>
                </div>
                <span className="rounded border border-emerald-300/25 bg-emerald-300/10 px-2 py-1 text-[10px] uppercase text-emerald-100">{report.status}</span>
              </div>
            </button>
          ))}
          {!loadingReports && !reports.length && <EmptyState label="No reports yet" detail="Create the first Chamber mini-market and turn the map into a campaign plan." />}
        </div>
      </aside>

      <section className="min-h-0 overflow-y-auto bg-[radial-gradient(circle_at_25%_10%,rgba(14,165,233,0.16),transparent_32%),linear-gradient(180deg,#07111f,#020617)] p-5">
        {selectedReport ? (
          <ReportDetail report={selectedReport} onFocus={() => onFocusReport(selectedReport)} />
        ) : (
          <div className="grid min-h-full place-items-center">
            <div className="max-w-3xl">
              <div className="inline-flex items-center gap-2 rounded border border-amber-200/25 bg-amber-200/10 px-3 py-2 text-xs font-bold uppercase tracking-[0.16em] text-amber-100">
                <Sparkles className="h-4 w-4" />
                Campaign Machine
              </div>
              <h2 className="mt-5 text-4xl font-black leading-tight text-white">Turn the regional map into a nine-entity opportunity report.</h2>
              <p className="mt-4 max-w-2xl text-sm leading-7 text-slate-300">Start with the Chamber directory, screen the market, pick a tight set of targets, attach deployable software ideas, and generate campaigns that aim to close in six touchpoints or fewer.</p>
              <button onClick={() => setCreatorOpen(true)} className="mt-6 inline-flex items-center gap-2 rounded border border-cyan-300/35 bg-cyan-300/10 px-4 py-3 text-sm font-bold text-cyan-100 transition hover:bg-cyan-300/15">
                <Target className="h-4 w-4" />
                Build First Report
              </button>
            </div>
          </div>
        )}
      </section>

      {creatorOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 p-3 backdrop-blur-sm">
          <form onSubmit={saveReport} className="mx-auto grid h-full max-w-7xl grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden rounded border border-cyan-300/25 bg-slate-950 shadow-2xl">
            <div className="border-b border-white/10 p-4">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <div className="text-xs font-bold uppercase tracking-[0.18em] text-cyan-200">Create Opportunity Report</div>
                  <h2 className="mt-1 text-2xl font-black text-white">Screener: {region.label} Chamber Mini-Market</h2>
                </div>
                <div className="flex items-center gap-2">
                  <button type="button" onClick={autoPick} className="inline-flex items-center gap-2 rounded border border-amber-200/25 bg-amber-200/10 px-3 py-2 text-xs font-semibold text-amber-100 transition hover:bg-amber-200/15">
                    <Sparkles className="h-4 w-4" />
                    Auto-pick 9
                  </button>
                  <button type="button" onClick={() => setCreatorOpen(false)} className="grid h-9 w-9 place-items-center rounded border border-white/10 bg-white/[0.04] text-slate-200 transition hover:bg-white/10">
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>
              <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(220px,1fr)_160px_160px_120px_120px]">
                <label className="rounded border border-white/10 bg-black/20 px-3 py-2">
                  <span className="text-[9px] font-bold uppercase tracking-[0.16em] text-slate-500">Report name</span>
                  <input value={reportName} onChange={(event) => setReportName(event.target.value)} className="mt-1 w-full bg-transparent text-sm font-semibold text-white outline-none" />
                </label>
                <FilterSelect label="Layer" value={filters.layer} onChange={(value) => setFilters((current) => ({ ...current, layer: value as ScreenerFilters['layer'] }))} options={['all', ...Object.keys(LAYER_META)]} />
                <FilterSelect label="Grade" value={filters.grade} onChange={(value) => setFilters((current) => ({ ...current, grade: value as ScreenerFilters['grade'] }))} options={['all', 'A', 'B', 'C', 'D']} />
                <label className="rounded border border-white/10 bg-black/20 px-3 py-2">
                  <span className="text-[9px] font-bold uppercase tracking-[0.16em] text-slate-500">Min score</span>
                  <input value={filters.minScore} onChange={(event) => setFilters((current) => ({ ...current, minScore: Number(event.target.value) || 0 }))} type="number" min={0} max={99} className="mt-1 w-full bg-transparent text-sm font-semibold text-white outline-none" />
                </label>
                <div className="rounded border border-cyan-300/25 bg-cyan-300/10 px-3 py-2">
                  <div className="text-[9px] font-bold uppercase tracking-[0.16em] text-cyan-200">Selected</div>
                  <div className="mt-1 text-sm font-black text-white">{selectedIds.length}/9</div>
                </div>
              </div>
              <div className="mt-3 grid gap-3 lg:grid-cols-2">
                <SearchField icon={<Search className="h-4 w-4" />} placeholder="Search organization, category, need, signal..." value={filters.query} onChange={(value) => setFilters((current) => ({ ...current, query: value }))} />
                <SearchField icon={<MapPinned className="h-4 w-4" />} placeholder="Filter city/evidence..." value={filters.city} onChange={(value) => setFilters((current) => ({ ...current, city: value }))} />
              </div>
            </div>

            <div className="grid min-h-0 lg:grid-cols-[minmax(0,1fr)_360px]">
              <div className="min-h-0 overflow-auto">
                <ScreenerTable rows={screened} selectedIds={selectedIds} onToggle={toggleSelected} />
              </div>
              <aside className="min-h-0 overflow-y-auto border-l border-white/10 bg-white/[0.025] p-4">
                <div className="text-xs font-bold uppercase tracking-[0.18em] text-emerald-200">Report Preview</div>
                <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                  <MiniStat label="A" value={String(selectedEntities.filter((entity) => entity.fitGrade === 'A').length)} />
                  <MiniStat label="B" value={String(selectedEntities.filter((entity) => entity.fitGrade === 'B').length)} />
                  <MiniStat label="C/D" value={String(selectedEntities.filter((entity) => ['C', 'D'].includes(entity.fitGrade)).length)} />
                </div>
                <div className="mt-4 space-y-2">
                  {selectedEntities.map((entity) => <EntityMiniCard key={entity.id} entity={entity} onRemove={() => toggleSelected(entity.id)} />)}
                  {!selectedEntities.length && <EmptyState label="Select up to 9" detail="Use the screener or auto-pick to build the mini-market." />}
                </div>
                <div className="mt-5">
                  <div className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.18em] text-amber-200">
                    <Code2 className="h-4 w-4" />
                    Repo Matches
                  </div>
                  <div className="space-y-2">
                    {pickReposForEntities(selectedEntities, repoMatches).map((repo) => <RepoCard key={repo.id} repo={repo} />)}
                  </div>
                </div>
                <div className="mt-5">
                  <div className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.18em] text-cyan-200">
                    <Layers className="h-4 w-4" />
                    Campaign Drafts
                  </div>
                  <div className="space-y-2">
                    {previewCampaigns.map((campaign) => <CampaignDraft key={campaign.campaignName} campaign={campaign} entities={selectedEntities} />)}
                  </div>
                </div>
              </aside>
            </div>

            <div className="flex items-center justify-between gap-3 border-t border-white/10 p-4">
              <div className="text-xs text-slate-400">Saves to Firestore: opportunityReports, campaigns, touchpoints, savedFilters.</div>
              <button type="submit" disabled={saving || !selectedEntities.length} className="inline-flex items-center gap-2 rounded border border-emerald-300/35 bg-emerald-300/10 px-4 py-2.5 text-sm font-bold text-emerald-100 transition hover:bg-emerald-300/15 disabled:cursor-not-allowed disabled:opacity-40">
                {saving ? <Database className="h-4 w-4 animate-pulse" /> : <Save className="h-4 w-4" />}
                Generate Report
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

function ReportDetail({ report, onFocus }: { report: ReportDoc; onFocus: () => void }) {
  const campaigns = report.campaigns?.length ? report.campaigns : generateCampaigns(report.entities);
  return (
    <div className="mx-auto max-w-7xl">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="text-xs font-bold uppercase tracking-[0.18em] text-amber-200">Opportunity Report</div>
          <h2 className="mt-2 text-3xl font-black text-white">{report.name}</h2>
          <p className="mt-2 text-sm text-slate-400">{report.regionLabel} · {report.audienceDirectory} · {report.entityCount} selected entities</p>
        </div>
        <button onClick={onFocus} className="inline-flex items-center gap-2 rounded border border-cyan-300/30 bg-cyan-300/10 px-3 py-2 text-sm font-bold text-cyan-100 transition hover:bg-cyan-300/15">
          <MapPinned className="h-4 w-4" />
          Focus Map Layer
        </button>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-4">
        <MetricTile label="Mini-market" value={`${report.entityCount}/9`} />
        <MetricTile label="A targets" value={String(report.entities.filter((entity) => entity.fitGrade === 'A').length)} />
        <MetricTile label="Campaigns" value={String(campaigns.length)} />
        <MetricTile label="Touchpoints" value={String(campaigns.reduce((sum, campaign) => sum + campaign.touchpoints.length, 0))} />
      </div>

      <section className="mt-6">
        <div className="mb-3 text-xs font-bold uppercase tracking-[0.18em] text-cyan-200">Ranked Entities</div>
        <div className="grid gap-3 lg:grid-cols-3">
          {report.entities.map((entity, index) => (
            <div key={entity.id} className="rounded border border-white/10 bg-slate-950/70 p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-[10px] text-slate-500">#{index + 1}</div>
                  <div className="mt-1 line-clamp-2 text-sm font-bold text-white">{entity.target}</div>
                </div>
                <GradeBadge grade={entity.fitGrade} />
              </div>
              <div className="mt-3 flex items-center justify-between text-xs">
                <span className="rounded px-2 py-1 font-semibold" style={{ backgroundColor: `${LAYER_META[entity.layer].color}22`, color: LAYER_META[entity.layer].color }}>{LAYER_META[entity.layer].label}</span>
                <span className="font-mono text-amber-200">{entity.score}</span>
              </div>
              <p className="mt-3 line-clamp-3 text-xs leading-5 text-slate-400">{entity.summary}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-6 grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div>
          <div className="mb-3 text-xs font-bold uppercase tracking-[0.18em] text-emerald-200">Campaigns</div>
          <div className="space-y-3">
            {campaigns.map((campaign) => <CampaignDetail key={campaign.campaignName} campaign={campaign} entities={report.entities} />)}
          </div>
        </div>
        <aside>
          <div className="mb-3 text-xs font-bold uppercase tracking-[0.18em] text-amber-200">Deployable Solutions</div>
          <div className="space-y-2">
            {(report.githubRepos?.length ? report.githubRepos : FALLBACK_REPOS).slice(0, 3).map((repo) => <RepoCard key={repo.id} repo={repo} />)}
          </div>
        </aside>
      </section>
    </div>
  );
}

function ScreenerTable({ rows, selectedIds, onToggle }: { rows: ReportEntity[]; selectedIds: string[]; onToggle: (id: string) => void }) {
  return (
    <table className="w-full min-w-[1100px] border-separate border-spacing-0 text-left text-xs">
      <thead className="sticky top-0 z-10 bg-slate-950">
        <tr className="text-[10px] uppercase tracking-[0.14em] text-slate-500">
          {['Pick', 'Name', 'Type', 'City / Evidence', 'Budget', 'Events', 'Digital', 'Partnership', 'GitHub', 'Census', 'Fit'].map((label) => (
            <th key={label} className="border-b border-white/10 px-3 py-3 font-bold">{label}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((entity) => {
          const selected = selectedIds.includes(entity.id);
          return (
            <tr key={entity.id} className={selected ? 'bg-cyan-300/10' : 'odd:bg-white/[0.015]'}>
              <td className="border-b border-white/5 px-3 py-2">
                <button type="button" onClick={() => onToggle(entity.id)} disabled={!selected && selectedIds.length >= 9} className={`grid h-7 w-7 place-items-center rounded border transition ${selected ? 'border-cyan-300/60 bg-cyan-300/15 text-cyan-100' : 'border-white/10 bg-white/[0.04] text-slate-500 hover:text-white disabled:cursor-not-allowed disabled:opacity-35'}`}>
                  {selected && <CheckCircle2 className="h-4 w-4" />}
                </button>
              </td>
              <td className="max-w-[260px] border-b border-white/5 px-3 py-2">
                <div className="truncate font-bold text-white">{entity.target}</div>
                <div className="mt-1 truncate text-slate-500">{entity.sourceUrl || entity.nextStep}</div>
              </td>
              <td className="border-b border-white/5 px-3 py-2"><span className="rounded px-2 py-1 font-semibold" style={{ backgroundColor: `${LAYER_META[entity.layer].color}22`, color: LAYER_META[entity.layer].color }}>{LAYER_META[entity.layer].label}</span></td>
              <td className="max-w-[220px] border-b border-white/5 px-3 py-2 text-slate-400">{entity.evidence.slice(0, 2).join(' · ') || entity.regionId}</td>
              <ScoreCell value={entity.fitSignals.budgetSignal} />
              <ScoreCell value={entity.fitSignals.eventAccessibility} />
              <ScoreCell value={entity.fitSignals.digitalNeed} />
              <ScoreCell value={entity.fitSignals.partnershipPotential} />
              <ScoreCell value={entity.fitSignals.githubSolutionMatch} />
              <ScoreCell value={entity.fitSignals.censusNeedMatch} />
              <td className="border-b border-white/5 px-3 py-2"><GradeBadge grade={entity.fitGrade} /></td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function CampaignDetail({ campaign, entities }: { campaign: CampaignPlan; entities: ReportEntity[] }) {
  const targets = campaign.targetEntityIds.map((id) => entities.find((entity) => entity.id === id)?.target).filter(Boolean);
  return (
    <div className="rounded border border-white/10 bg-slate-950/75 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-black text-white">{campaign.campaignName}</h3>
          <p className="mt-1 text-sm leading-6 text-slate-300">{campaign.angle}</p>
        </div>
        <span className="rounded border border-emerald-300/25 bg-emerald-300/10 px-2 py-1 text-[10px] uppercase tracking-wide text-emerald-100">6-touch close</span>
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {targets.map((target) => <span key={target} className="rounded border border-white/10 bg-white/[0.04] px-2 py-1 text-[10px] text-slate-300">{target}</span>)}
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-3">
        <InfoBlock label="Offer" value={campaign.offer} />
        <InfoBlock label="Advantage" value={campaign.advantage} />
        <InfoBlock label="Close Goal" value={campaign.closeGoal} />
      </div>
      <div className="mt-4 grid gap-2 md:grid-cols-6">
        {campaign.touchpoints.map((touchpoint, index) => (
          <div key={touchpoint} className="rounded border border-cyan-300/20 bg-cyan-300/10 p-2">
            <div className="text-[9px] font-bold uppercase tracking-wide text-cyan-200">Step {index + 1}</div>
            <div className="mt-1 text-xs font-semibold text-white">{touchpoint}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function CampaignDraft({ campaign, entities }: { campaign: CampaignPlan; entities: ReportEntity[] }) {
  const targets = campaign.targetEntityIds.map((id) => entities.find((entity) => entity.id === id)?.target).filter(Boolean).slice(0, 3);
  return (
    <div className="rounded border border-white/10 bg-slate-950/70 p-3">
      <div className="text-sm font-bold text-white">{campaign.campaignName}</div>
      <div className="mt-1 text-xs leading-5 text-slate-400">{campaign.offer}</div>
      <div className="mt-2 flex flex-wrap gap-1">
        {targets.map((target) => <span key={target} className="rounded bg-white/[0.06] px-1.5 py-0.5 text-[10px] text-slate-300">{target}</span>)}
      </div>
    </div>
  );
}

function EntityMiniCard({ entity, onRemove }: { entity: ReportEntity; onRemove: () => void }) {
  return (
    <div className="rounded border border-white/10 bg-slate-950/70 p-2.5">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate text-sm font-bold text-white">{entity.target}</div>
          <div className="mt-1 text-[10px] text-slate-500">{LAYER_META[entity.layer].label} · Score {entity.score}</div>
        </div>
        <button type="button" onClick={onRemove} className="text-slate-500 hover:text-red-200"><X className="h-4 w-4" /></button>
      </div>
    </div>
  );
}

function RepoCard({ repo }: { repo: RepoMatch }) {
  return (
    <div className="rounded border border-white/10 bg-slate-950/70 p-3">
      <div className="flex items-center gap-2 text-sm font-bold text-white"><Code2 className="h-4 w-4 text-slate-300" />{repo.name}</div>
      <p className="mt-2 text-xs leading-5 text-slate-400">{repo.useCase}</p>
      <div className="mt-2 rounded border border-cyan-300/15 bg-cyan-300/10 px-2 py-1 text-[10px] text-cyan-100">{repo.deploymentPath}</div>
    </div>
  );
}

function FilterSelect({ label, value, options, onChange }: { label: string; value: string; options: string[]; onChange: (value: string) => void }) {
  return (
    <label className="rounded border border-white/10 bg-black/20 px-3 py-2">
      <span className="text-[9px] font-bold uppercase tracking-[0.16em] text-slate-500">{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)} className="mt-1 w-full bg-slate-950 text-sm font-semibold text-white outline-none">
        {options.map((option) => <option key={option} value={option}>{option === 'all' ? 'All' : option}</option>)}
      </select>
    </label>
  );
}

function SearchField({ icon, placeholder, value, onChange }: { icon: ReactNode; placeholder: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="flex items-center gap-2 rounded border border-white/10 bg-black/20 px-3 py-2 text-slate-400">
      {icon}
      <input value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} className="w-full bg-transparent text-sm text-white outline-none placeholder:text-slate-600" />
    </label>
  );
}

function EmptyState({ label, detail }: { label: string; detail: string }) {
  return <div className="rounded border border-dashed border-white/15 bg-white/[0.02] p-4 text-center"><div className="text-sm font-bold text-white">{label}</div><p className="mt-1 text-xs leading-5 text-slate-500">{detail}</p></div>;
}

function ScoreCell({ value }: { value: number }) {
  return <td className="border-b border-white/5 px-3 py-2 font-mono text-slate-200">{value}</td>;
}

function GradeBadge({ grade }: { grade: ReportEntity['fitGrade'] }) {
  const styles = {
    A: 'border-emerald-300/40 bg-emerald-300/15 text-emerald-100',
    B: 'border-cyan-300/40 bg-cyan-300/15 text-cyan-100',
    C: 'border-amber-200/40 bg-amber-200/15 text-amber-100',
    D: 'border-slate-400/30 bg-slate-400/10 text-slate-300',
  };
  return <span className={`rounded border px-2 py-1 text-xs font-black ${styles[grade]}`}>{grade}</span>;
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return <div className="rounded border border-white/10 bg-white/[0.035] p-2"><div className="font-mono text-lg font-black text-white">{value}</div><div className="text-[9px] uppercase tracking-wide text-slate-500">{label}</div></div>;
}

function MetricTile({ label, value }: { label: string; value: string }) {
  return <div className="rounded border border-white/10 bg-slate-950/70 p-3"><div className="text-[10px] uppercase tracking-[0.16em] text-slate-500">{label}</div><div className="mt-1 text-2xl font-black text-white">{value}</div></div>;
}

function InfoBlock({ label, value }: { label: string; value: string }) {
  return <div className="rounded border border-white/10 bg-white/[0.035] p-3"><div className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">{label}</div><p className="mt-2 text-xs leading-5 text-slate-300">{value}</p></div>;
}

function rankEntities(candidates: Opportunity[]): ReportEntity[] {
  return candidates.map((candidate) => {
    const signals = scoreSignals(candidate);
    const blended = Math.round((candidate.score * 0.45) + (Object.values(signals).reduce((sum, value) => sum + value, 0) / 8) * 0.55);
    const score = Math.max(candidate.score, Math.min(99, blended));
    return {
      ...candidate,
      score,
      fitGrade: score >= 82 ? 'A' : score >= 70 ? 'B' : score >= 58 ? 'C' : 'D',
      fitSignals: signals,
    };
  });
}

function scoreSignals(entity: Opportunity): FitSignals {
  const evidence = `${entity.summary} ${entity.evidence.join(' ')} ${entity.nextStep}`.toLowerCase();
  const budgetSignal = clampScore(entity.value / 650 + (entity.layer === 'grants' || entity.layer === 'housing' ? 18 : 0));
  const strategicRelevance = clampScore(entity.score + (['chamber', 'workforce', 'education'].includes(entity.layer) ? 10 : 0));
  const networkCentrality = clampScore(entity.probability + (entity.layer === 'chamber' ? 16 : entity.layer === 'events' ? 10 : 0));
  const eventAccessibility = clampScore(entity.layer === 'events' ? 92 : evidence.includes('event') || evidence.includes('chamber') ? 72 : 48);
  const digitalNeed = clampScore(evidence.includes('website') || evidence.includes('crm') || evidence.includes('dashboard') ? 84 : entity.layer === 'chamber' ? 76 : 62);
  const partnershipPotential = clampScore(entity.score + (['chamber', 'faith', 'workforce', 'education', 'housing'].includes(entity.layer) ? 12 : 0));
  const githubSolutionMatch = clampScore(['chamber', 'workforce', 'education', 'housing', 'grants'].includes(entity.layer) ? 84 : 66);
  const censusNeedMatch = clampScore(['housing', 'workforce', 'education', 'health'].includes(entity.layer) ? 86 : 61);
  return { budgetSignal, strategicRelevance, networkCentrality, eventAccessibility, digitalNeed, partnershipPotential, githubSolutionMatch, censusNeedMatch };
}

function clampScore(value: number) {
  return Math.max(35, Math.min(99, Math.round(value)));
}

function gradeRank(grade: ReportEntity['fitGrade']) {
  return { A: 1, B: 2, C: 3, D: 4 }[grade];
}

function generateCampaigns(entities: ReportEntity[]): CampaignPlan[] {
  if (!entities.length) return [];
  const sorted = [...entities].sort((a, b) => gradeRank(a.fitGrade) - gradeRank(b.fitGrade) || b.score - a.score);
  const chamber = sorted.filter((entity) => entity.layer === 'chamber');
  const workforce = sorted.filter((entity) => ['workforce', 'education', 'university'].includes(entity.layer));
  const civic = sorted.filter((entity) => ['housing', 'grants', 'faith', 'power'].includes(entity.layer));
  const events = sorted.filter((entity) => entity.layer === 'events');
  const campaigns: CampaignPlan[] = [
    makeCampaign('Chamber AI Revenue Sprint', [...chamber, ...events, ...sorted].slice(0, 4), 'Use the Chamber directory as the wedge, then convert member data and local events into a simple revenue pipeline.', 'AI-powered chamber member CRM and opportunity dashboard', 'Starts with trusted local relationships and turns messy directory/event data into measurable outreach.', 'Paid discovery sprint or chamber-facing pilot build'),
    makeCampaign('Workforce + Schools Partnership', [...workforce, ...chamber, ...sorted].slice(0, 4), 'Connect employers, schools, and workforce partners around a live local talent and opportunity map.', 'Workforce intelligence portal with employer pipeline tracking', 'Ties public workforce need to visible local partners and a deployable software asset.', 'Pilot with workforce board, college, or employer coalition'),
    makeCampaign('Public Funding Proof Loop', [...civic, ...chamber, ...sorted].slice(0, 4), 'Package grant, housing, civic, and local business signals into an evidence workflow that helps partners win and report funding.', 'Grant evidence, reporting, and partner-development workflow', 'Combines public funding signals with local implementation partners and ready-to-brand software.', 'Funded reporting workflow or regional grant support retainer'),
  ];
  return campaigns.filter((campaign) => campaign.targetEntityIds.length >= 2).slice(0, 3);
}

function makeCampaign(campaignName: string, targets: ReportEntity[], angle: string, offer: string, advantage: string, closeGoal: string): CampaignPlan {
  const uniqueTargets = Array.from(new Map(targets.map((entity) => [entity.id, entity])).values()).slice(0, 4);
  return {
    campaignName,
    targetEntityIds: uniqueTargets.map((entity) => entity.id),
    angle,
    offer,
    advantage,
    contentAssets: ['One-page value memo', 'Branded demo link', 'Local opportunity snapshot', 'Follow-up proposal'],
    closeGoal,
    touchpoints: ['LinkedIn connect', 'Event introduction', 'Value memo', 'Demo link', 'Follow-up call', 'Proposal'],
  };
}

function pickReposForEntities(entities: ReportEntity[], repos: RepoMatch[]) {
  if (!entities.length) return repos.slice(0, 2);
  const layers = new Set(entities.map((entity) => entity.layer));
  return [...repos].sort((a, b) => repoScore(b, layers) - repoScore(a, layers)).slice(0, 3);
}

function repoScore(repo: RepoMatch, layers: Set<OpportunityLayer>) {
  const text = `${repo.name} ${repo.useCase} ${repo.promptPack}`.toLowerCase();
  let score = 0;
  layers.forEach((layer) => {
    if (text.includes(layer)) score += 20;
    if (layer === 'chamber' && text.includes('crm')) score += 16;
    if (layer === 'workforce' && text.includes('workforce')) score += 16;
    if (layer === 'grants' && text.includes('grant')) score += 16;
  });
  if (repo.githubPagesCompatible) score += 8;
  if (repo.firebaseAuthNeeded) score += 6;
  return score;
}

function serializeEntity(entity: ReportEntity): ReportEntity {
  return JSON.parse(JSON.stringify(entity));
}

async function loadReports(uid: string): Promise<ReportDoc[]> {
  const snap = await getDocs(query(collection(db, 'opportunityReports'), where('ownerUid', '==', uid), limit(50)));
  return snap.docs
    .map((doc) => ({ id: doc.id, ...doc.data() }) as ReportDoc)
    .sort((a, b) => toMillis(b.createdAt) - toMillis(a.createdAt));
}

async function loadRepoMatches(): Promise<RepoMatch[]> {
  try {
    const snap = await getDocs(query(collection(db, 'githubRepos'), limit(30)));
    return snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }) as RepoMatch);
  } catch (error) {
    console.warn('[Reports] Falling back to local repo matches', error);
    return FALLBACK_REPOS;
  }
}

function toMillis(value: any) {
  if (!value) return 0;
  if (typeof value.toMillis === 'function') return value.toMillis();
  if (typeof value.seconds === 'number') return value.seconds * 1000;
  return Number(value) || 0;
}
