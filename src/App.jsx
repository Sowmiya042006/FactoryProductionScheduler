import { useState, useEffect, useCallback } from 'react';
import {
  LayoutDashboard, ClipboardList, Settings, Factory,
  Zap
} from 'lucide-react';
import './index.css';

import { DEFAULT_ORDERS } from './data/defaults.js';
import { generateSchedules, getImpossibleWarnings } from './scheduler/scheduler.js';
import OverviewPage     from './pages/OverviewPage.jsx';
import OrdersPage       from './pages/OrdersPage.jsx';
import FactorySetupPage from './pages/FactorySetupPage.jsx';

// ─── localStorage helpers ─────────────────────────────────────────────────────
const LS_KEY = 'flowplan_orders_v1';

function loadOrders() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length === 0) return null;
    return parsed;
  } catch {
    return null;
  }
}

function saveOrders(orders) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(orders));
  } catch { /* quota exceeded — silently ignore */ }
}

// ─── App ──────────────────────────────────────────────────────────────────────
export default function App() {
  const [page, setPage]     = useState('overview');
  const [orders, setOrders] = useState(() => loadOrders() ?? DEFAULT_ORDERS);

  // Schedule results
  const [result, setResult] = useState(null);
  const [isStale, setIsStale] = useState(false);
  const [canExport, setCanExport] = useState(false);

  // Toggle: 'best' or 'baseline'
  const [view, setView] = useState('best');

  // Auto-generate on mount
  useEffect(() => {
    runScheduler(orders);
  }, []);

  function runScheduler(ordersToRun) {
    const r = generateSchedules(ordersToRun);
    setResult(r);
    setIsStale(false);
    setCanExport(true);
  }

  function handleGenerate() {
    runScheduler(orders);
  }

  function handleOrdersChange(newOrders) {
    setOrders(newOrders);
    saveOrders(newOrders);
    setIsStale(true);
    setCanExport(false);
  }

  const warnings = getImpossibleWarnings(orders);

  const activeSchedule   = view === 'best' ? result?.best       : result?.baseline;
  const baselineSchedule = result?.baseline;
  const baselineMetrics  = result?.baselineMetrics;
  const bestMetrics      = result?.bestMetrics;

  const NAV = [
    { id: 'overview',      label: 'Overview',       icon: LayoutDashboard },
    { id: 'orders',        label: 'Orders',         icon: ClipboardList },
    { id: 'factory-setup', label: 'Factory Setup',  icon: Factory },
  ];

  return (
    <div className="app">
      {/* Sidebar */}
      <aside className="sidebar">
        <div className="sidebar-brand">
          <div className="brand-name">FlowPlan</div>
          <div className="brand-sub">Factory Scheduling</div>
          <div className="sidebar-badge">
            <Zap size={10} /> Demo factory
          </div>
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
                {n.id === 'orders' && orders.length > 0 && (
                  <span style={{
                    marginLeft: 'auto',
                    background: 'rgba(99,102,241,.3)',
                    color: '#c7d2fe',
                    borderRadius: 99,
                    padding: '1px 7px',
                    fontSize: '10px',
                    fontWeight: 700,
                  }}>
                    {orders.length}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        <div className="sidebar-footer">
          FlowPlan v1.0 · Single-op model
        </div>
      </aside>

      {/* Main */}
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
            <span className="demo-badge">
              <Factory size={11} /> Demo factory
            </span>
            {isStale && (
              <span style={{
                fontSize: 'var(--text-xs)',
                color: 'var(--amber-600)',
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                gap: 4,
              }}>
                ● Inputs changed
              </span>
            )}
          </div>
        </header>

        {/* Pages */}
        {page === 'overview' && (
          <OverviewPage
            scheduled={activeSchedule}
            baselineScheduled={baselineSchedule}
            baselineMetrics={baselineMetrics}
            bestMetrics={bestMetrics}
            warnings={warnings}
            isStale={isStale}
            canExport={canExport}
            onGenerate={handleGenerate}
            view={view}
            onViewChange={setView}
          />
        )}
        {page === 'orders' && (
          <OrdersPage
            orders={orders}
            onOrdersChange={handleOrdersChange}
            isStale={isStale}
          />
        )}
        {page === 'factory-setup' && <FactorySetupPage />}
      </main>
    </div>
  );
}
