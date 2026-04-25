/**
 * @stele-manifest
 * name: Site Prestart
 * version: 1.0.0
 * description: Generic daily prestart for tradies. Works on any site, captures GPS + photos, remembers your name and recent sites so day 2 takes 60 seconds. Self-contained — no server, no account.
 * archetype: self-contained
 * requires:
 *   - geolocation
 *   - camera
 *   - clipboard-write
 */

import { useState, useEffect, useRef } from 'react';

declare global {
  interface Window {
    storage: {
      get: (key: string, shared?: boolean) => Promise<{ key: string; value: string; shared: boolean } | null>;
      set: (key: string, value: string, shared?: boolean) => Promise<void>;
      delete: (key: string, shared?: boolean) => Promise<void>;
      list: (prefix?: string, shared?: boolean) => Promise<Array<{ key: string; value: string }>>;
    };
  }
}

// ─────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────

interface GpsPin { lat: number; lon: number; accuracy: number; capturedAt: number }
interface Photo { dataUrl: string; capturedAt: number; caption?: string }

interface PrestartRecord {
  id: string;                // 'prestart_<timestamp>'
  worker: string;
  site: string;
  startedAt: number;
  submittedAt: number | null;
  conditions: string[];      // 'sunny', 'wet', 'windy', 'hot', etc.
  ppe: string[];             // 'helmet', 'glasses', ...
  plant: string[];           // 'drill', 'saw', ...
  hazards: string;           // freeform text
  hazardPhotos: Photo[];
  sitePhoto: Photo | null;
  gps: GpsPin | null;
  notes: string;
}

const CONDITIONS = [
  { key: 'sunny',  label: '☀️ Sunny' },
  { key: 'cloudy', label: '☁️ Cloudy' },
  { key: 'wet',    label: '🌧 Wet' },
  { key: 'windy',  label: '💨 Windy' },
  { key: 'hot',    label: '🔥 Hot' },
  { key: 'cold',   label: '🥶 Cold' },
];

const PPE_ITEMS = [
  { key: 'helmet',  label: 'Hard hat' },
  { key: 'glasses', label: 'Safety glasses' },
  { key: 'hivis',   label: 'Hi-vis' },
  { key: 'gloves',  label: 'Gloves' },
  { key: 'boots',   label: 'Steel-cap boots' },
  { key: 'mask',    label: 'Dust mask / RPE' },
  { key: 'harness', label: 'Harness' },
  { key: 'hearing', label: 'Hearing protection' },
];

const PLANT_ITEMS = [
  { key: 'drill',   label: 'Drill' },
  { key: 'saw',     label: 'Saw' },
  { key: 'grinder', label: 'Grinder' },
  { key: 'ladder',  label: 'Ladder' },
  { key: 'scaffold', label: 'Scaffold' },
  { key: 'mewp',    label: 'MEWP / EWP' },
  { key: 'plant',   label: 'Mobile plant' },
  { key: 'electric', label: 'Energised electrical' },
];

// ─────────────────────────────────────────────────────────────────────
// Storage helpers
// ─────────────────────────────────────────────────────────────────────

async function loadWorker(): Promise<string> {
  const r = await window.storage.get('worker_name', true);
  return r?.value ?? '';
}
async function saveWorker(name: string): Promise<void> {
  await window.storage.set('worker_name', name, true);
}

async function loadSites(): Promise<string[]> {
  const r = await window.storage.get('recent_sites');
  if (!r) return [];
  try { return JSON.parse(r.value) as string[]; } catch { return []; }
}
async function saveSites(sites: string[]): Promise<void> {
  await window.storage.set('recent_sites', JSON.stringify(sites.slice(0, 6)));
}

async function listPrestartHistory(): Promise<PrestartRecord[]> {
  const rows = await window.storage.list('prestart_');
  const out: PrestartRecord[] = [];
  for (const row of rows) {
    try { out.push(JSON.parse(row.value) as PrestartRecord); } catch { /* skip */ }
  }
  return out.sort((a, b) => (b.submittedAt ?? b.startedAt) - (a.submittedAt ?? a.startedAt));
}

async function savePrestart(record: PrestartRecord): Promise<void> {
  await window.storage.set(record.id, JSON.stringify(record));
}

async function deletePrestart(id: string): Promise<void> {
  await window.storage.delete(id);
}

// ─────────────────────────────────────────────────────────────────────
// Time / format
// ─────────────────────────────────────────────────────────────────────

function fmtDate(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}
function shortDate(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}
function fmtCoord(n: number): string { return n.toFixed(5); }

// ─────────────────────────────────────────────────────────────────────
// Photo capture
// ─────────────────────────────────────────────────────────────────────

/**
 * Read a File from a hidden <input> as a data URL. Browsers/PWAs route
 * `<input capture="environment">` to the camera on mobile, file picker on
 * desktop. Both end up the same here.
 */
function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
}

// ─────────────────────────────────────────────────────────────────────
// Top-level component
// ─────────────────────────────────────────────────────────────────────

type View = 'today' | 'history' | 'detail';

export default function SitePrestart() {
  const [view, setView] = useState<View>('today');
  const [detailId, setDetailId] = useState<string | null>(null);

  // Persisted "remembered" data
  const [worker, setWorker] = useState('');
  const [recentSites, setRecentSites] = useState<string[]>([]);
  const [history, setHistory] = useState<PrestartRecord[]>([]);

  // Today's draft
  const [draft, setDraft] = useState<PrestartRecord>(() => ({
    id: 'prestart_' + Date.now(),
    worker: '',
    site: '',
    startedAt: Date.now(),
    submittedAt: null,
    conditions: [],
    ppe: [],
    plant: [],
    hazards: '',
    hazardPhotos: [],
    sitePhoto: null,
    gps: null,
    notes: '',
  }));

  // Initial load
  useEffect(() => {
    (async () => {
      const [w, s, h] = await Promise.all([loadWorker(), loadSites(), listPrestartHistory()]);
      setWorker(w);
      setRecentSites(s);
      setHistory(h);
      if (w) setDraft((d) => ({ ...d, worker: w }));
    })();
  }, []);

  const handleSubmit = async () => {
    if (!draft.worker.trim()) { alert('Add your name before submitting.'); return; }
    if (!draft.site.trim())   { alert('Pick or enter today’s site.'); return; }

    const submitted: PrestartRecord = { ...draft, submittedAt: Date.now() };
    await savePrestart(submitted);

    // Remember worker + bump site to top of recents
    if (submitted.worker !== worker) await saveWorker(submitted.worker);
    const nextSites = [submitted.site, ...recentSites.filter((s) => s !== submitted.site)].slice(0, 6);
    await saveSites(nextSites);

    setWorker(submitted.worker);
    setRecentSites(nextSites);
    setHistory(await listPrestartHistory());

    // Reset to a fresh draft for the next prestart
    setDraft({
      id: 'prestart_' + Date.now(),
      worker: submitted.worker,
      site: '',
      startedAt: Date.now(),
      submittedAt: null,
      conditions: [],
      ppe: [],
      plant: [],
      hazards: '',
      hazardPhotos: [],
      sitePhoto: null,
      gps: null,
      notes: '',
    });
    setView('history');
  };

  return (
    <div style={{
      fontFamily: '-apple-system, system-ui, sans-serif',
      maxWidth: 640,
      margin: '0 auto',
      padding: 16,
      paddingBottom: 80,
      color: '#0f172a',
      background: '#f8fafc',
      minHeight: '100vh',
    }}>
      <Header view={view} onView={setView} />

      {view === 'today' && (
        <TodayView
          draft={draft}
          recentSites={recentSites}
          setDraft={setDraft}
          onSubmit={handleSubmit}
        />
      )}

      {view === 'history' && (
        <HistoryView
          history={history}
          onOpen={(id) => { setDetailId(id); setView('detail'); }}
          onBack={() => setView('today')}
        />
      )}

      {view === 'detail' && detailId && (
        <DetailView
          record={history.find((h) => h.id === detailId)!}
          onBack={() => setView('history')}
          onDelete={async () => {
            await deletePrestart(detailId);
            setHistory(await listPrestartHistory());
            setView('history');
          }}
        />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Header / nav
// ─────────────────────────────────────────────────────────────────────

function Header({ view, onView }: { view: View; onView: (v: View) => void }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
      <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, flex: 1 }}>Site prestart</h1>
      <NavBtn active={view === 'today'} onClick={() => onView('today')}>Today</NavBtn>
      <NavBtn active={view === 'history' || view === 'detail'} onClick={() => onView('history')}>History</NavBtn>
    </div>
  );
}

function NavBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: '8px 14px',
        borderRadius: 8,
        border: '1px solid',
        borderColor: active ? '#1e3a8a' : '#cbd5e1',
        background: active ? '#1e3a8a' : 'white',
        color: active ? 'white' : '#475569',
        fontSize: 13,
        fontWeight: 500,
        cursor: 'pointer',
      }}
    >
      {children}
    </button>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Today view
// ─────────────────────────────────────────────────────────────────────

function TodayView({
  draft, recentSites, setDraft, onSubmit,
}: {
  draft: PrestartRecord;
  recentSites: string[];
  setDraft: React.Dispatch<React.SetStateAction<PrestartRecord>>;
  onSubmit: () => void;
}) {
  return (
    <>
      <Card title="Who & where">
        <Field label="Your name">
          <input
            value={draft.worker}
            onChange={(e) => setDraft((d) => ({ ...d, worker: e.target.value }))}
            placeholder="Trevor Norman"
            style={inputStyle}
          />
        </Field>
        <Field label="Today's site">
          <input
            value={draft.site}
            onChange={(e) => setDraft((d) => ({ ...d, site: e.target.value }))}
            placeholder="123 Smith St, Wollongong"
            style={inputStyle}
          />
          {recentSites.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
              {recentSites.map((s) => (
                <button
                  key={s}
                  onClick={() => setDraft((d) => ({ ...d, site: s }))}
                  style={chipStyle(draft.site === s)}
                >
                  {s}
                </button>
              ))}
            </div>
          )}
        </Field>
      </Card>

      <ChipCard
        title="Conditions"
        items={CONDITIONS}
        selected={draft.conditions}
        onToggle={(key) => setDraft((d) => ({
          ...d, conditions: d.conditions.includes(key) ? d.conditions.filter((k) => k !== key) : [...d.conditions, key],
        }))}
      />

      <ChipCard
        title="PPE worn"
        items={PPE_ITEMS}
        selected={draft.ppe}
        onToggle={(key) => setDraft((d) => ({
          ...d, ppe: d.ppe.includes(key) ? d.ppe.filter((k) => k !== key) : [...d.ppe, key],
        }))}
      />

      <ChipCard
        title="Plant / hazardous activities"
        items={PLANT_ITEMS}
        selected={draft.plant}
        onToggle={(key) => setDraft((d) => ({
          ...d, plant: d.plant.includes(key) ? d.plant.filter((k) => k !== key) : [...d.plant, key],
        }))}
      />

      <Card title="Hazards spotted (optional)">
        <textarea
          value={draft.hazards}
          onChange={(e) => setDraft((d) => ({ ...d, hazards: e.target.value }))}
          placeholder="Loose tiles in the entry, scaffold a bit wobbly on west side..."
          rows={3}
          style={{ ...inputStyle, fontFamily: 'inherit', resize: 'vertical' }}
        />
        <PhotoStrip
          photos={draft.hazardPhotos}
          onAdd={(p) => setDraft((d) => ({ ...d, hazardPhotos: [...d.hazardPhotos, p] }))}
          onRemove={(i) => setDraft((d) => ({ ...d, hazardPhotos: d.hazardPhotos.filter((_, idx) => idx !== i) }))}
          max={3}
          label="Add hazard photo"
        />
      </Card>

      <Card title="Site photo">
        <PhotoSlot
          photo={draft.sitePhoto}
          onSet={(p) => setDraft((d) => ({ ...d, sitePhoto: p }))}
          onClear={() => setDraft((d) => ({ ...d, sitePhoto: null }))}
        />
      </Card>

      <Card title="Location">
        <GpsCapture
          gps={draft.gps}
          onCapture={(g) => setDraft((d) => ({ ...d, gps: g }))}
        />
      </Card>

      <Card title="Notes (optional)">
        <textarea
          value={draft.notes}
          onChange={(e) => setDraft((d) => ({ ...d, notes: e.target.value }))}
          placeholder="Anything else to flag for the office or next shift…"
          rows={2}
          style={{ ...inputStyle, fontFamily: 'inherit', resize: 'vertical' }}
        />
      </Card>

      <button
        onClick={onSubmit}
        style={{
          width: '100%',
          padding: '14px 20px',
          marginTop: 8,
          borderRadius: 12,
          border: 'none',
          background: '#16a34a',
          color: 'white',
          fontSize: 16,
          fontWeight: 700,
          cursor: 'pointer',
        }}
      >
        Submit prestart
      </button>
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────
// History view
// ─────────────────────────────────────────────────────────────────────

function HistoryView({ history, onOpen, onBack }: {
  history: PrestartRecord[];
  onOpen: (id: string) => void;
  onBack: () => void;
}) {
  if (history.length === 0) {
    return (
      <div style={{ padding: 40, textAlign: 'center', color: '#64748b' }}>
        <div style={{ fontSize: 15, marginBottom: 8 }}>No prestarts yet.</div>
        <button onClick={onBack} style={primaryBtnStyle}>Start one</button>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {history.map((h) => (
        <button
          key={h.id}
          onClick={() => onOpen(h.id)}
          style={{
            background: 'white',
            border: '1px solid #e2e8f0',
            borderRadius: 10,
            padding: 14,
            textAlign: 'left',
            cursor: 'pointer',
            fontSize: 14,
            color: 'inherit',
            display: 'flex',
            gap: 12,
            alignItems: 'center',
          }}
        >
          <div style={{
            width: 56, textAlign: 'center', flexShrink: 0,
            color: '#64748b', fontSize: 12, lineHeight: 1.2,
          }}>
            <div style={{ fontWeight: 700, fontSize: 15, color: '#0f172a' }}>{shortDate(h.submittedAt ?? h.startedAt)}</div>
            <div>{new Date(h.submittedAt ?? h.startedAt).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}</div>
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 600, marginBottom: 2 }}>{h.site}</div>
            <div style={{ color: '#64748b', fontSize: 12 }}>
              {h.worker} · {h.ppe.length} PPE · {h.plant.length} plant
              {h.hazards && ' · hazards noted'}
              {h.gps && ' · GPS pinned'}
            </div>
          </div>
        </button>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Detail view (read-only summary of a submitted prestart)
// ─────────────────────────────────────────────────────────────────────

function DetailView({ record, onBack, onDelete }: {
  record: PrestartRecord;
  onBack: () => void;
  onDelete: () => void;
}) {
  const summaryHtml = () => {
    const ts = record.submittedAt ?? record.startedAt;
    return `<!doctype html>
<html><head><meta charset="utf-8"><title>Prestart — ${escapeHtml(record.site)}</title>
<style>
body{font-family:-apple-system,system-ui,sans-serif;max-width:720px;margin:0 auto;padding:32px 24px;color:#0f172a;line-height:1.5}
h1{margin:0 0 4px}h2{font-size:14px;margin:24px 0 8px;color:#475569;text-transform:uppercase;letter-spacing:.05em}
.row{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:6px}
.chip{padding:4px 10px;border-radius:14px;background:#f1f5f9;font-size:13px}
.muted{color:#64748b;font-size:13px}
img{max-width:100%;border-radius:8px;margin-top:8px}
</style></head><body>
<h1>Site prestart</h1>
<div class="muted">${escapeHtml(record.site)} · ${fmtDate(ts)}</div>
<h2>Worker</h2><div>${escapeHtml(record.worker)}</div>
${record.gps ? `<h2>Location</h2><div class="muted">${fmtCoord(record.gps.lat)}, ${fmtCoord(record.gps.lon)} (±${Math.round(record.gps.accuracy)}m)</div>` : ''}
<h2>Conditions</h2><div class="row">${record.conditions.map((c) => `<span class="chip">${escapeHtml(labelOf(CONDITIONS, c))}</span>`).join('') || '<span class="muted">none</span>'}</div>
<h2>PPE</h2><div class="row">${record.ppe.map((c) => `<span class="chip">${escapeHtml(labelOf(PPE_ITEMS, c))}</span>`).join('') || '<span class="muted">none</span>'}</div>
<h2>Plant</h2><div class="row">${record.plant.map((c) => `<span class="chip">${escapeHtml(labelOf(PLANT_ITEMS, c))}</span>`).join('') || '<span class="muted">none</span>'}</div>
${record.hazards ? `<h2>Hazards</h2><div>${escapeHtml(record.hazards)}</div>` : ''}
${record.hazardPhotos.map((p) => `<img src="${p.dataUrl}">`).join('')}
${record.sitePhoto ? `<h2>Site photo</h2><img src="${record.sitePhoto.dataUrl}">` : ''}
${record.notes ? `<h2>Notes</h2><div>${escapeHtml(record.notes)}</div>` : ''}
<div class="muted" style="margin-top:32px">Submitted at ${fmtDate(record.submittedAt ?? record.startedAt)} · id ${record.id}</div>
</body></html>`;
  };

  const handleExport = () => {
    const blob = new Blob([summaryHtml()], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `prestart-${record.id}.html`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <>
      <button onClick={onBack} style={{ ...secondaryBtnStyle, marginBottom: 12 }}>← Back</button>
      <Card title={record.site}>
        <div style={{ color: '#64748b', fontSize: 13, marginBottom: 12 }}>
          {fmtDate(record.submittedAt ?? record.startedAt)} · {record.worker}
        </div>
        {record.gps && (
          <div style={{ fontSize: 13, marginBottom: 6 }}>
            <strong>GPS:</strong> {fmtCoord(record.gps.lat)}, {fmtCoord(record.gps.lon)} (±{Math.round(record.gps.accuracy)}m)
          </div>
        )}
        <SummaryRow label="Conditions" items={record.conditions} from={CONDITIONS} />
        <SummaryRow label="PPE"        items={record.ppe}        from={PPE_ITEMS} />
        <SummaryRow label="Plant"      items={record.plant}      from={PLANT_ITEMS} />
        {record.hazards && (
          <div style={{ marginTop: 12 }}>
            <div style={{ fontSize: 12, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Hazards</div>
            <div>{record.hazards}</div>
          </div>
        )}
        {record.hazardPhotos.length > 0 && (
          <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
            {record.hazardPhotos.map((p, i) => (
              <img key={i} src={p.dataUrl} style={{ width: 100, height: 100, objectFit: 'cover', borderRadius: 6 }} />
            ))}
          </div>
        )}
        {record.sitePhoto && (
          <div style={{ marginTop: 12 }}>
            <div style={{ fontSize: 12, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>Site photo</div>
            <img src={record.sitePhoto.dataUrl} style={{ width: '100%', borderRadius: 8 }} />
          </div>
        )}
        {record.notes && (
          <div style={{ marginTop: 12 }}>
            <div style={{ fontSize: 12, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Notes</div>
            <div>{record.notes}</div>
          </div>
        )}
      </Card>
      <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
        <button onClick={handleExport} style={{ ...primaryBtnStyle, flex: 1 }}>Export HTML</button>
        <button onClick={onDelete} style={dangerBtnStyle}>Delete</button>
      </div>
    </>
  );
}

function SummaryRow({ label, items, from }: { label: string; items: string[]; from: { key: string; label: string }[] }) {
  if (items.length === 0) return null;
  return (
    <div style={{ marginTop: 10 }}>
      <div style={{ fontSize: 12, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>{label}</div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {items.map((k) => (
          <span key={k} style={{ padding: '2px 8px', background: '#f1f5f9', borderRadius: 12, fontSize: 12 }}>
            {labelOf(from, k)}
          </span>
        ))}
      </div>
    </div>
  );
}

function labelOf(items: { key: string; label: string }[], key: string): string {
  return items.find((i) => i.key === key)?.label ?? key;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ─────────────────────────────────────────────────────────────────────
// Reusable building blocks
// ─────────────────────────────────────────────────────────────────────

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{
      background: 'white',
      border: '1px solid #e2e8f0',
      borderRadius: 12,
      padding: 14,
      marginBottom: 10,
    }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10 }}>
        {title}
      </div>
      {children}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ fontSize: 12, color: '#64748b', marginBottom: 4 }}>{label}</div>
      {children}
    </div>
  );
}

function ChipCard({ title, items, selected, onToggle }: {
  title: string;
  items: { key: string; label: string }[];
  selected: string[];
  onToggle: (key: string) => void;
}) {
  return (
    <Card title={title}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {items.map((i) => (
          <button
            key={i.key}
            onClick={() => onToggle(i.key)}
            style={chipStyle(selected.includes(i.key))}
          >
            {i.label}
          </button>
        ))}
      </div>
    </Card>
  );
}

function PhotoStrip({ photos, onAdd, onRemove, max, label }: {
  photos: Photo[];
  onAdd: (p: Photo) => void;
  onRemove: (i: number) => void;
  max: number;
  label: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const dataUrl = await readAsDataUrl(file);
    onAdd({ dataUrl, capturedAt: Date.now() });
  };
  return (
    <div style={{ marginTop: 8 }}>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        {photos.map((p, i) => (
          <div key={i} style={{ position: 'relative' }}>
            <img src={p.dataUrl} style={{ width: 72, height: 72, objectFit: 'cover', borderRadius: 6 }} />
            <button
              onClick={() => onRemove(i)}
              style={{
                position: 'absolute', top: -6, right: -6,
                width: 22, height: 22, borderRadius: 11,
                background: '#dc2626', color: 'white',
                border: '2px solid white', fontSize: 12, lineHeight: 1, cursor: 'pointer',
              }}
            >×</button>
          </div>
        ))}
        {photos.length < max && (
          <>
            <input
              ref={inputRef}
              type="file"
              accept="image/*"
              capture="environment"
              onChange={handleFile}
              style={{ display: 'none' }}
            />
            <button
              onClick={() => inputRef.current?.click()}
              style={{
                width: 72, height: 72, borderRadius: 8,
                border: '2px dashed #cbd5e1', background: '#f8fafc',
                color: '#64748b', fontSize: 11, cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                textAlign: 'center', padding: 4,
              }}
            >
              📷<br/>{label.replace('Add ', '+ ')}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function PhotoSlot({ photo, onSet, onClear }: {
  photo: Photo | null;
  onSet: (p: Photo) => void;
  onClear: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const dataUrl = await readAsDataUrl(file);
    onSet({ dataUrl, capturedAt: Date.now() });
  };
  return (
    <>
      <input ref={inputRef} type="file" accept="image/*" capture="environment" onChange={handleFile} style={{ display: 'none' }} />
      {photo ? (
        <div style={{ position: 'relative' }}>
          <img src={photo.dataUrl} style={{ width: '100%', borderRadius: 8 }} />
          <button onClick={onClear} style={{
            position: 'absolute', top: 8, right: 8,
            background: 'rgba(15, 23, 42, 0.7)', color: 'white',
            border: 'none', padding: '6px 12px', borderRadius: 6, fontSize: 12, cursor: 'pointer',
          }}>Replace</button>
        </div>
      ) : (
        <button
          onClick={() => inputRef.current?.click()}
          style={{
            width: '100%', padding: '24px 16px',
            borderRadius: 8, border: '2px dashed #cbd5e1',
            background: '#f8fafc', color: '#475569',
            fontSize: 15, fontWeight: 500, cursor: 'pointer',
          }}
        >
          📷 Take site photo
        </button>
      )}
    </>
  );
}

function GpsCapture({ gps, onCapture }: { gps: GpsPin | null; onCapture: (g: GpsPin) => void }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const capture = () => {
    if (!navigator.geolocation) { setErr('Geolocation not available in this browser'); return; }
    setBusy(true); setErr(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        onCapture({
          lat: pos.coords.latitude,
          lon: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
          capturedAt: Date.now(),
        });
        setBusy(false);
      },
      (e) => { setErr(e.message); setBusy(false); },
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 0 },
    );
  };

  return (
    <>
      {gps ? (
        <div style={{
          background: '#f0fdf4',
          border: '1px solid #86efac',
          borderRadius: 8,
          padding: 12,
          fontSize: 14,
        }}>
          <div style={{ fontWeight: 600, color: '#15803d', marginBottom: 4 }}>📍 Location pinned</div>
          <div style={{ fontFamily: 'ui-monospace, monospace', fontSize: 12, color: '#475569' }}>
            {fmtCoord(gps.lat)}, {fmtCoord(gps.lon)} (±{Math.round(gps.accuracy)}m)
          </div>
          <button onClick={capture} disabled={busy} style={{ ...secondaryBtnStyle, marginTop: 8, fontSize: 12, padding: '6px 12px' }}>
            {busy ? 'Re-capturing…' : 'Re-capture'}
          </button>
        </div>
      ) : (
        <button
          onClick={capture}
          disabled={busy}
          style={{
            width: '100%', padding: '14px 16px',
            borderRadius: 8, border: '2px solid #1e3a8a',
            background: busy ? '#1e3a8a' : 'white',
            color: busy ? 'white' : '#1e3a8a',
            fontSize: 15, fontWeight: 600, cursor: busy ? 'wait' : 'pointer',
          }}
        >
          {busy ? 'Capturing GPS…' : '📍 Capture GPS location'}
        </button>
      )}
      {err && (
        <div style={{ marginTop: 8, padding: 10, background: '#fee2e2', color: '#991b1b', borderRadius: 6, fontSize: 13 }}>
          {err}
        </div>
      )}
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Shared styles
// ─────────────────────────────────────────────────────────────────────

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '10px 12px',
  borderRadius: 8,
  border: '1px solid #cbd5e1',
  background: 'white',
  fontSize: 15,
  outline: 'none',
  boxSizing: 'border-box',
};

function chipStyle(active: boolean): React.CSSProperties {
  return {
    padding: '8px 14px',
    borderRadius: 20,
    border: '1px solid',
    borderColor: active ? '#1e3a8a' : '#cbd5e1',
    background: active ? '#1e3a8a' : 'white',
    color: active ? 'white' : '#475569',
    fontSize: 13,
    fontWeight: 500,
    cursor: 'pointer',
  };
}

const primaryBtnStyle: React.CSSProperties = {
  padding: '10px 16px',
  borderRadius: 8,
  border: 'none',
  background: '#1e3a8a',
  color: 'white',
  fontSize: 14,
  fontWeight: 600,
  cursor: 'pointer',
};

const secondaryBtnStyle: React.CSSProperties = {
  padding: '8px 14px',
  borderRadius: 8,
  border: '1px solid #cbd5e1',
  background: 'white',
  color: '#475569',
  fontSize: 13,
  fontWeight: 500,
  cursor: 'pointer',
};

const dangerBtnStyle: React.CSSProperties = {
  padding: '10px 16px',
  borderRadius: 8,
  border: '1px solid #fecaca',
  background: 'white',
  color: '#b91c1c',
  fontSize: 14,
  fontWeight: 500,
  cursor: 'pointer',
};
