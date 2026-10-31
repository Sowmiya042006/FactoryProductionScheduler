import { useState, useEffect, useCallback, useRef } from 'react';
import {
  LayoutDashboard, ClipboardList, Factory,
  Zap, RefreshCw, WifiOff, Upload, X, RotateCcw
} from 'lucide-react';
import './index.css';

import { api, ApiError } from './api/client.js';
import OverviewPage     from './pages/OverviewPage.jsx';
import OrdersPage       from './pages/OrdersPage.jsx';
import FactorySetupPage from './pages/FactorySetupPage.jsx';

// ─── localStorage keys (UI preferences + stale-tracking only) ─────────────────
const LS_LEGACY_ORDERS = 'flowplan_orders_v1';  // old format to offer import
const LS_STALE_RUN_ID  = 'flowplan_stale_run';  // track if current result is outdated
const LS_VIEW_PREF     = 'flowplan_view';

// ─── fromMins helper (kept in frontend for display) ──────────────────────────
export function fromMins(mins, scheduleStartISO) {
  const start = new Date(scheduleStartISO ?? '2026-11-02T08:00:00');
  return new Date(start.getTime() + mins * 60000);
}

// ─── Components ───────────────────────────────────────────────────────────────

function ErrorScreen({ message, onRetry }) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', minHeight: '100vh', gap: 'var(--sp-4)',
      padding: 'var(--sp-6)', textAlign: 'center', background: 'var(--color-bg)',
    }}>
      <WifiOff size={48} style={{ color: 'var(--red-400)', opacity: .7 }} />
      <div>
        <div style={{ fontSize: 'var(--text-xl)', fontWeight: 700, color: 'var(--gray-900)', marginBottom: 8 }}>
          Cannot connect to backend
        </div>
        <div style={{ fontSize: 'var(--text-sm)', color: 'var(--gray-500)', maxWidth: 420, lineHeight: 1.6 }}>
          {message}
        </div>
      </div>
      <button className="btn btn-primary" onClick={onRetry}>
        <RefreshCw size={15} /> Retry
      </button>
      <div style={{ fontSize: 'var(--text-xs)', color: 'var(--gray-400)', marginTop: 8 }}>
        Make sure the backend is running: <code style={{ background: 'var(--gray-100)', padding: '2px 6px', borderRadius: 4 }}>npm run dev</code>
      </div>
    </div>
  );
}

function LoadingScreen() {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', minHeight: '100vh', gap: 'var(--sp-3)',
      background: 'var(--color-bg)',
    }}>
      <div style={{
        width: 40, height: 40, border: '3px solid var(--indigo-100)',
        borderTopColor: 'var(--indigo-500)', borderRadius: '50%',
        animation: 'spin 0.8s linear infinite',
      }} />
      <div style={{ fontSize: 'var(--text-sm)', color: 'var(--gray-500)', fontWeight: 500 }}>
        Connecting to FlowPlan backend…
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

/** Banner offering one-time import of old localStorage data */
function ImportBanner({ legacyOrders, onImport, onDismiss, importing, importError }) {
  return (
    <div style={{
      background: 'linear-gradient(135deg, #fdf4ff, #ede9fe)',
      border: '1px solid #c4b5fd',
      borderRadius: 'var(--r-md)',
      padding: 'var(--sp-3) var(--sp-4)',
      display: 'flex',
      alignItems: 'center',
      gap: 'var(--sp-3)',
      flexWrap: 'wrap',
    }}>
      <Upload size={16} style={{ color: '#7c3aed', flexShrink: 0 }} />
      <div style={{ flex: 1, fontSize: 'var(--text-sm)', color: '#5b21b6', lineHeight: 1.5 }}>
        <strong>Import browser data?</strong> Found {legacyOrders.length} order(s) saved in your browser from a previous session.
        {importError && <div style={{ color: 'var(--red-600)', marginTop: 4 }}>{importError}</div>}
      </div>
      <div style={{ display: 'flex', gap: 'var(--sp-2)', flexShrink: 0 }}>
        <button
          className="btn btn-secondary btn-sm"
          onClick={onImport}
          disabled={importing}
        >
          {importing ? 'Importing…' : 'Import'}
        </button>
        <button className="icon-btn" onClick={onDismiss} title="Dismiss">
          <X size={14} />
        </button>
      </div>
    </div>
  );
}

// ─── App ──────────────────────────────────────────────────────────────────────
export default function App() {
  const [page, setPage]     = useState('overview');

  // Backend connection state
  const [appState, setAppState] = useState('loading'); // 'loading' | 'error' | 'ready'
  const [connError, setConnError] = useState('');

  // Core data (from API)
  const [orders,       setOrders]       = useState([]);
  const [settings,     setSettings]     = useState({ schedule_start: '2026-11-02T08:00:00' });
  const [orderCount,   setOrderCount]   = useState(0);

  // Schedule result
  const [result,    setResult]    = useState(null);  // { runId, baseline, best, baselineMetrics, bestMetrics, warnings }
  const [isStale,   setIsStale]   = useState(false);
  const [canExport, setCanExport] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [genError,   setGenError]   = useState('');

  // View preference (localStorage UI pref, fine to keep here)
  const [view, setView] = useState(() => localStorage.getItem(LS_VIEW_PREF) ?? 'best');

  // localStorage import banner
  const [legacyOrders,  setLegacyOrders]  = useState(null); // null = dismissed/no data
  const [importError,   setImportError]   = useState('');
  const [importing,     setImporting]     = useState(false);

  // ─── Boot: connect to backend ───────────────────────────────────────────────
  const boot = useCallback(async () => {
    setAppState('loading');
    setConnError('');
    try {
      await api.health();

      // Load initial data in parallel
      const [fetchedOrders, fetchedSettings, latestSched] = await Promise.all([
        api.getOrders(),
        api.getSettings(),
        api.latestSchedule(),
      ]);

      setOrders(fetchedOrders);
      setOrderCount(fetchedOrders.length);
      setSettings(fetchedSettings);

      if (latestSched) {
        // Check if latest run is stale (orders may have changed since last run)
        const savedRunId    = localStorage.getItem(LS_STALE_RUN_ID);
        const isResultStale = savedRunId === String(latestSched.runId) + '_stale';

        setResult(latestSched);
        setIsStale(isResultStale);
        setCanExport(!isResultStale);
      } else {
        setIsStale(false);
        setCanExport(false);
      }

      // Check for legacy localStorage data
      checkLegacyData();

      setAppState('ready');
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : 'Unexpected error during startup.';
      setConnError(msg);
      setAppState('error');
    }
  }, []);

  useEffect(() => { boot(); }, [boot]);

  function checkLegacyData() {
    try {
      const raw = localStorage.getItem(LS_LEGACY_ORDERS);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        setLegacyOrders(parsed);
      }
    } catch { /* malformed — ignore */ }
  }

  // ─── View preference ────────────────────────────────────────────────────────
  function handleViewChange(v) {
    setView(v);
    localStorage.setItem(LS_VIEW_PREF, v);
  }

  // ─── Schedule generation ────────────────────────────────────────────────────
  async function handleGenerate() {
    if (generating) return;
    setGenerating(true);
    setGenError('');
    try {
      const r = await api.generateSchedule();
      setResult(r);
      setIsStale(false);
      setCanExport(true);
      // Clear stale marker in localStorage
      localStorage.removeItem(LS_STALE_RUN_ID);
    } catch (e) {
      setGenError(e instanceof ApiError ? e.message : 'Failed to generate schedule.');
    } finally {
      setGenerating(false);
    }
  }

  // ─── Mark stale when orders change ─────────────────────────────────────────
  function markStale() {
    setIsStale(true);
    setCanExport(false);
    // Persist stale marker so it survives a refresh
    if (result?.runId) {
      localStorage.setItem(LS_STALE_RUN_ID, String(result.runId) + '_stale');
    }
  }

  // ─── Order CRUD (delegated to OrdersPage, propagated here) ─────────────────
  async function handleOrderCreated(order) {
    setOrders(prev => [...prev, order]);
    setOrderCount(c => c + 1);
    markStale();
  }
  async function handleOrderUpdated(order) {
    setOrders(prev => prev.map(o => o.id === order.id ? order : o));
    markStale();
  }
  async function handleOrderDeleted(id) {
    setOrders(prev => prev.filter(o => o.id !== id));
    setOrderCount(c => c - 1);
    markStale();
  }

  // ─── Demo reset ─────────────────────────────────────────────────────────────
  async function handleDemoReset() {
    try {
      await api.demoReset();
      await boot();
    } catch (e) {
      alert(e.message);
    }
  }

  // ─── Import legacy localStorage data ────────────────────────────────────────
  async function handleImport() {
    if (!legacyOrders) return;
    setImporting(true);
    setImportError('');
    try {
      await api.importData(legacyOrders);
      // Success: clear legacy data, reload
      localStorage.removeItem(LS_LEGACY_ORDERS);
      setLegacyOrders(null);
      await boot();
    } catch (e) {
      setImportError(e instanceof ApiError ? e.message : 'Import failed.');
    } finally {
      setImporting(false);
    }
  }

  // ─── Settings update ────────────────────────────────────────────────────────
  async function handleSettingsUpdate(newSettings) {
    try {
      const saved = await api.updateSettings(newSettings);
      setSettings(saved);
      markStale();
    } catch (e) {
      alert(e.message);
    }
  }

  // ─── Derived schedule state ─────────────────────────────────────────────────
  const scheduleStart   = settings.schedule_start ?? '2026-11-02T08:00:00';
  const activeSchedule  = view === 'best' ? result?.best       : result?.baseline;
  const baselineSchedule = result?.baseline;
  const baselineMetrics  = result?.baselineMetrics;
  const bestMetrics      = result?.bestMetrics;
  const warnings         = result?.warnings ?? [];

  // ─── Render states ──────────────────────────────────────────────────────────
  if (appState === 'loading') return <LoadingScreen />;
  if (appState === 'error')   return <ErrorScreen message={connError} onRetry={boot} />;

  const NAV = [
    { id: 'overview',      label: 'Overview',      icon: LayoutDashboard },
    { id: 'orders',        label: 'Orders',        icon: ClipboardList   },
    { id: 'factory-setup', label: 'Factory Setup', icon: Factory         },
  ];

  return (
    <div className="app">
      {/* ─── Sidebar ────────────────────────────────────────────────────── */}
      <aside className="sidebar">
        <div className="sidebar-brand">
          <div className="brand-name">FlowPlan</div>
          <div className="brand-sub">Factory Scheduling</div>
          <div className="sidebar-badge"><Zap size={10} /> Demo factory</div>
        </div>

        <nav className="sidebar-nav">
          <div className="nav-label">Navigation</div>
          {NAV.map(n => {
            const Icon = n.icon;
            return (
              <button
                key={n.id}
                className={`nav-item ${page === n.id ? 'active' : ''}`}
                onClick={() => setPage(n.id)}
              >
                <Icon size={16} />
                {n.label}
                {n.id === 'orders' && orderCount > 0 && (
                  <span style={{
                    marginLeft: 'auto', background: 'rgba(99,102,241,.3)',
                    color: '#c7d2fe', borderRadius: 99, padding: '1px 7px',
                    fontSize: '10px', fontWeight: 700,
                  }}>
                    {orderCount}
                  </span>
                )}
              </button>
            );
          })}

          <div style={{ marginTop: 'auto', paddingTop: 'var(--sp-4)' }} />
          <button
            className="nav-item"
            onClick={handleDemoReset}
            title="Restore all 12 demo orders and reset schedule start"
            style={{ color: 'rgba(255,255,255,.35)', fontSize: 'var(--text-xs)' }}
          >
            <RotateCcw size={14} /> Reset demo data
          </button>
        </nav>

        <div className="sidebar-footer">
          FlowPlan v2.0 · Node + SQLite
        </div>
      </aside>

      {/* ─── Main ───────────────────────────────────────────────────────── */}
      <main className="main">
        {/* Header */}
        <header className="header">
          <div className="header-left">
            <div>
              <div className="header-title">
                {NAV.find(n => n.id === page)?.label ?? 'FlowPlan'}
              </div>
              <div className="header-subtitle">
                Manufacturing Production Scheduler
              </div>
            </div>
          </div>
          <div className="header-right">
            <span className="demo-badge"><Factory size={11} /> Demo factory</span>
            {isStale && (
              <span style={{ fontSize: 'var(--text-xs)', color: 'var(--amber-600)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}>
                ● Inputs changed
              </span>
            )}
          </div>
        </header>

        {/* Pages */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
          {/* Legacy import banner (shown on every page until dismissed) */}
          {legacyOrders && (
            <div style={{ padding: 'var(--sp-4) var(--sp-6) 0' }}>
              <ImportBanner
                legacyOrders={legacyOrders}
                onImport={handleImport}
                onDismiss={() => {
                  setLegacyOrders(null);
                  localStorage.removeItem(LS_LEGACY_ORDERS);
                }}
                importing={importing}
                importError={importError}
              />
            </div>
          )}

          {page === 'overview' && (
            <OverviewPage
              scheduled={activeSchedule}
              baselineScheduled={baselineSchedule}
              baselineMetrics={baselineMetrics}
              bestMetrics={bestMetrics}
              warnings={warnings}
              isStale={isStale}
              canExport={canExport}
              generating={generating}
              genError={genError}
              onGenerate={handleGenerate}
              view={view}
              onViewChange={handleViewChange}
              scheduleStart={scheduleStart}
              settings={settings}
              onSettingsUpdate={handleSettingsUpdate}
            />
          )}
          {page === 'orders' && (
            <OrdersPage
              orders={orders}
              isStale={isStale}
              scheduleStart={scheduleStart}
              onCreated={handleOrderCreated}
              onUpdated={handleOrderUpdated}
              onDeleted={handleOrderDeleted}
            />
          )}
          {page === 'factory-setup' && <FactorySetupPage />}
        </div>
      </main>
    </div>
  );
}
