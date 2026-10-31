import { useState } from 'react';
import {
  Package, Clock, AlertTriangle, CheckCircle2, Timer,
  Info, ChevronRight, X
} from 'lucide-react';
import Timeline from '../components/Timeline.jsx';
import ScheduleTable from '../components/ScheduleTable.jsx';
import AssumptionsPanel from '../components/AssumptionsPanel.jsx';
import { fmtTime, fromMins } from '../scheduler/scheduler.js';

// ─── Metric Card ─────────────────────────────────────────────────────────────
function MetricCard({ label, value, sub, color, icon: Icon }) {
  return (
    <div className={`metric-card ${color}`}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div className="metric-label">{label}</div>
        {Icon && <Icon size={16} style={{ color: `var(--${color === 'indigo' ? 'indigo' : color}-500)`, opacity: .6 }} />}
      </div>
      <div className={`metric-value ${color === 'teal' ? 'teal' : color === 'red' ? 'red' : color === 'amber' ? 'amber' : ''}`}>
        {value}
      </div>
      {sub && <div className="metric-sub">{sub}</div>}
    </div>
  );
}

// ─── Comparison Panel ─────────────────────────────────────────────────────────
function ComparisonPanel({ baselineMetrics, bestMetrics }) {
  if (!baselineMetrics || !bestMetrics) return null;

  function Delta({ base, best, lowerIsBetter = true }) {
    const diff = best - base;
    if (diff === 0) return <span className="cmp-delta same">No change</span>;
    const better = lowerIsBetter ? diff < 0 : diff > 0;
    return (
      <span className={`cmp-delta ${better ? 'better' : 'worse'}`}>
        {diff > 0 ? '+' : ''}{diff} min
      </span>
    );
  }

  const rows = [
    {
      label: 'Total late minutes',
      baseVal: baselineMetrics.totalLate,
      bestVal: bestMetrics.totalLate,
      lowerBetter: true,
      fmt: v => `${v} min`,
    },
    {
      label: 'Late order count',
      baseVal: baselineMetrics.lateCount,
      bestVal: bestMetrics.lateCount,
      lowerBetter: true,
      fmt: v => `${v}`,
      noDelta: true,
    },
    {
      label: 'Cleaning minutes',
      baseVal: baselineMetrics.totalCleaning,
      bestVal: bestMetrics.totalCleaning,
      lowerBetter: true,
      fmt: v => `${v} min`,
    },
    {
      label: 'Overall finish',
      baseVal: baselineMetrics.overallFinish,
      bestVal: bestMetrics.overallFinish,
      lowerBetter: true,
      fmt: v => fmtTime(fromMins(v)),
      noDelta: true,
    },
  ];

  return (
    <div>
      <div className="algo-note" style={{ marginBottom: 'var(--sp-4)' }}>
        <Info size={14} />
        <span>
          We compare <strong>7 candidate schedules</strong> (1 EDD baseline + 6 family-order permutations),
          selecting the best by: lowest total late minutes → lowest cleaning time → earliest finish.
          The result is a <strong>best candidate found</strong>, not a guaranteed optimum.
        </span>
      </div>

      <div className="comparison-grid">
        <div className="cmp-col baseline">
          <h4 style={{ color: 'var(--gray-700)' }}>
            <Clock size={16} /> Due-date Baseline (EDD)
          </h4>
          {rows.map(r => (
            <div className="cmp-row" key={r.label}>
              <label>{r.label}</label>
              <div className="val">{r.fmt(r.baseVal)}</div>
            </div>
          ))}
        </div>
        <div className="cmp-col best">
          <h4 style={{ color: 'var(--teal-600)' }}>
            <CheckCircle2 size={16} /> Best Candidate Found
          </h4>
          {rows.map(r => (
            <div className="cmp-row" key={r.label}>
              <label>{r.label}</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <span className={`val ${r.bestVal < r.baseVal && r.lowerBetter ? 'better' : r.bestVal > r.baseVal && r.lowerBetter ? 'worse' : ''}`}>
                  {r.fmt(r.bestVal)}
                </span>
                {!r.noDelta && (
                  <Delta base={r.baseVal} best={r.bestVal} lowerIsBetter={r.lowerBetter} />
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Order Detail Panel ───────────────────────────────────────────────────────
function OrderDetailPanel({ order, onClose }) {
  if (!order) return null;
  return (
    <div className="order-detail-panel">
      <h4>
        <span>{order.id} — {order.product?.name}</span>
        <button className="icon-btn" onClick={onClose} style={{ color: 'rgba(255,255,255,.5)' }}>
          <X size={16} />
        </button>
      </h4>
      <div className="detail-grid">
        <div className="detail-item">
          <label>Product</label>
          <span>{order.product?.name}</span>
        </div>
        <div className="detail-item">
          <label>Family</label>
          <span>{order.product?.family}</span>
        </div>
        <div className="detail-item">
          <label>Line</label>
          <span>{order.lineName} ({order.lineId})</span>
        </div>
        <div className="detail-item">
          <label>Quantity</label>
          <span>{order.quantity}</span>
        </div>
        <div className="detail-item">
          <label>Clean</label>
          <span>{order.cleaning > 0 ? `${order.cleaning} min` : 'None'}</span>
        </div>
        <div className="detail-item">
          <label>Prod Start</label>
          <span>{fmtTime(fromMins(order.prodStart))}</span>
        </div>
        <div className="detail-item">
          <label>Finish</label>
          <span>{fmtTime(fromMins(order.finish))}</span>
        </div>
        <div className="detail-item">
          <label>Due</label>
          <span>{fmtTime(order.dueDate)}</span>
        </div>
        <div className="detail-item">
          <label>Duration</label>
          <span>{order.duration} min</span>
        </div>
        <div className="detail-item">
          <label>Status</label>
          <span className={order.isLate ? 'detail-late' : ''}>
            {order.impossibleDeadline
              ? '⚠ Impossible deadline'
              : order.isLate
              ? `⚠ Late by ${order.lateness} min`
              : '✓ On time'}
          </span>
        </div>
      </div>
    </div>
  );
}

// ─── Overview Page ────────────────────────────────────────────────────────────
export default function OverviewPage({
  scheduled,
  baselineScheduled,
  baselineMetrics,
  bestMetrics,
  warnings,
  isStale,
  canExport,
  onGenerate,
  view,
  onViewChange,
}) {
  const [selectedOrderId, setSelectedOrderId] = useState(null);
  const [showComparison, setShowComparison]   = useState(false);

  const activeSchedule = view === 'baseline' ? baselineScheduled : scheduled;
  const selectedOrder  = activeSchedule?.find(r => r.id === selectedOrderId) ?? null;

  const onTime     = activeSchedule?.filter(r => !r.isLate).length ?? 0;
  const lateCount  = activeSchedule?.filter(r => r.isLate).length ?? 0;
  const totalLate  = activeSchedule?.reduce((s, r) => s + r.lateness, 0) ?? 0;
  const totalClean = activeSchedule?.reduce((s, r) => s + r.cleaning, 0) ?? 0;
  const totalOrds  = activeSchedule?.length ?? 0;

  const activeMetrics = view === 'baseline' ? baselineMetrics : bestMetrics;

  return (
    <div className="page">
      {/* Page header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Production Overview</h1>
          <p className="page-desc">Schedule starting 2026-11-02 08:00 · Factory time</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-3)' }}>
          <div className="view-toggle">
            <button
              className={`toggle-btn ${view === 'best' ? 'active' : ''}`}
              onClick={() => onViewChange('best')}
            >
              Best candidate
            </button>
            <button
              className={`toggle-btn ${view === 'baseline' ? 'active' : ''}`}
              onClick={() => onViewChange('baseline')}
            >
              Baseline (EDD)
            </button>
          </div>
          <button className="btn btn-primary btn-lg" onClick={onGenerate}>
            ⚡ Generate Schedule
          </button>
        </div>
      </div>

      {/* Stale banner */}
      {isStale && (
        <div className="stale-banner">
          <Info size={16} className="icon" />
          <p>Inputs changed — regenerate schedule to update results and enable CSV export.</p>
        </div>
      )}

      {/* Impossible deadline warnings */}
      {warnings?.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-2)' }}>
          {warnings.map(w => (
            <div key={w.orderId} className="warning-banner">
              <AlertTriangle size={16} className="icon" />
              <p><strong>{w.orderId}:</strong> {w.message}</p>
            </div>
          ))}
        </div>
      )}

      {/* Metric cards */}
      <div className="metrics-grid">
        <MetricCard
          label="Total Orders"
          value={totalOrds}
          color="indigo"
          icon={Package}
          sub={`${view === 'best' ? 'Best candidate' : 'Baseline'} schedule`}
        />
        <MetricCard
          label="On Time"
          value={onTime}
          color="teal"
          icon={CheckCircle2}
          sub={totalOrds > 0 ? `${Math.round((onTime / totalOrds) * 100)}% of orders` : ''}
        />
        <MetricCard
          label="Late Orders"
          value={lateCount}
          color={lateCount > 0 ? 'red' : 'teal'}
          icon={AlertTriangle}
        />
        <MetricCard
          label="Total Late Minutes"
          value={`${totalLate}`}
          color={totalLate > 0 ? 'amber' : 'teal'}
          icon={Timer}
          sub="minutes behind schedule"
        />
        <MetricCard
          label="Changeover Minutes"
          value={`${totalClean}`}
          color="amber"
          icon={Clock}
          sub="allergen cleaning time"
        />
      </div>

      <AssumptionsPanel />

      {/* Timeline */}
      <div className="card">
        <div className="card-header">
          <div className="card-title">
            <span>📊</span>
            Production Timeline
            <span style={{ fontSize: 'var(--text-xs)', fontWeight: 400, color: 'var(--gray-400)', marginLeft: 4 }}>
              ({view === 'best' ? 'Best candidate' : 'EDD baseline'}) — click a block for details
            </span>
          </div>
        </div>
        <div className="card-body">
          <Timeline
            scheduled={activeSchedule}
            onSelectOrder={setSelectedOrderId}
            selectedOrderId={selectedOrderId}
          />
        </div>
      </div>

      {/* Order detail panel */}
      {selectedOrder && (
        <OrderDetailPanel
          order={selectedOrder}
          onClose={() => setSelectedOrderId(null)}
        />
      )}

      {/* Baseline comparison */}
      <div className="card">
        <div className="card-header">
          <div className="card-title">
            <span>⚖</span>
            Baseline Comparison
          </div>
          <button
            className="btn btn-secondary btn-sm"
            onClick={() => setShowComparison(s => !s)}
          >
            {showComparison ? 'Hide' : 'Show'} Comparison
          </button>
        </div>
        {showComparison && (
          <div className="card-body">
            <ComparisonPanel
              baselineMetrics={baselineMetrics}
              bestMetrics={bestMetrics}
            />
          </div>
        )}
        {!showComparison && (
          <div style={{ padding: 'var(--sp-3) var(--sp-5)', color: 'var(--gray-400)', fontSize: 'var(--text-sm)' }}>
            Click "Show Comparison" to see baseline vs. best candidate metrics side-by-side.
          </div>
        )}
      </div>

      {/* Schedule Table */}
      <div className="card">
        <div className="card-header">
          <div className="card-title">
            <span>📋</span>
            Schedule Details
          </div>
          <span style={{ fontSize: 'var(--text-xs)', color: 'var(--gray-400)' }}>
            {view === 'best' ? 'Best candidate' : 'EDD baseline'} · Click row to highlight in timeline
          </span>
        </div>
        <ScheduleTable
          scheduled={activeSchedule}
          canExport={canExport}
          onRowClick={setSelectedOrderId}
          selectedOrderId={selectedOrderId}
        />
      </div>
    </div>
  );
}
