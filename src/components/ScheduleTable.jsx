import { useState } from 'react';
import { Download, Filter, AlertTriangle, CheckCircle2, Clock } from 'lucide-react';
import { LINES } from '../data/defaults.js';
import { fmtTime, fromMins } from '../scheduler/scheduler.js';

function StatusBadge({ row }) {
  if (row.impossibleDeadline) return <span className="badge badge-impossible">Impossible deadline</span>;
  if (row.isLate)             return <span className="badge badge-late"><AlertTriangle size={10} /> Late in schedule</span>;
  return                             <span className="badge badge-success"><CheckCircle2 size={10} /> On time</span>;
}

function FamilyBadge({ family }) {
  const cls   = family === 'LATEX' ? 'badge-family-latex' : family === 'NON_LATEX' ? 'badge-family-nonlatex' : 'badge-family-standard';
  const label = family === 'LATEX' ? 'Latex' : family === 'NON_LATEX' ? 'Non-Latex' : 'Standard';
  return <span className={`badge ${cls}`}>{label}</span>;
}

function downloadCSV(rows, scheduleStart) {
  const fmt = (v) => fmtTime(fromMins(v, scheduleStart), scheduleStart);
  const headers = ['Order','Product','Family','Line','Cleaning (min)','Start','Finish','Due','Late (min)','Status'];
  const lines = [
    headers.join(','),
    ...rows.map(r => [
      r.id,
      `"${r.product?.name ?? ''}"`,
      r.product?.family ?? '',
      r.lineName,
      r.cleaning,
      fmt(r.prodStart),
      fmt(r.finish),
      fmtTime(r.dueDate, scheduleStart),
      r.lateness,
      r.impossibleDeadline ? 'Impossible deadline' : r.isLate ? 'Late' : 'On time',
    ].join(','))
  ];
  const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = 'flowplan_schedule.csv'; a.click();
  URL.revokeObjectURL(url);
}

export default function ScheduleTable({ scheduled, canExport, onRowClick, selectedOrderId, scheduleStart }) {
  const [lineFilter, setLineFilter] = useState('ALL');
  const [lateOnly,   setLateOnly]   = useState(false);

  if (!scheduled || scheduled.length === 0) {
    return (
      <div className="empty-state">
        <Clock size={32} />
        <p>Generate a schedule to see results here.</p>
      </div>
    );
  }

  let rows = [...scheduled];
  if (lineFilter !== 'ALL') rows = rows.filter(r => r.lineId === lineFilter);
  if (lateOnly)             rows = rows.filter(r => r.isLate);

  const fmt = (v) => fmtTime(fromMins(v, scheduleStart), scheduleStart);

  return (
    <div>
      <div className="card-header" style={{ padding: 'var(--sp-3) var(--sp-4)' }}>
        <div className="table-filters">
          <Filter size={14} style={{ color: 'var(--gray-400)' }} />
          <select className="filter-select" value={lineFilter} onChange={e => setLineFilter(e.target.value)}>
            <option value="ALL">All Lines</option>
            {LINES.map(l => <option key={l.id} value={l.id}>{l.id} — {l.name}</option>)}
          </select>
          <label className="filter-toggle">
            <input type="checkbox" checked={lateOnly} onChange={e => setLateOnly(e.target.checked)} />
            Late orders only
          </label>
        </div>
        <button
          className="btn btn-secondary btn-sm"
          onClick={() => downloadCSV(rows, scheduleStart)}
          disabled={!canExport}
          title={canExport ? 'Download CSV' : 'Regenerate schedule to enable export'}
          id="csv-download-btn"
        >
          <Download size={13} /> CSV
        </button>
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Order</th><th>Product</th><th>Family</th><th>Line</th>
              <th>Clean (min)</th><th>Start</th><th>Finish</th><th>Due</th>
              <th>Late (min)</th><th>Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={10} style={{ textAlign: 'center', color: 'var(--gray-400)', padding: 'var(--sp-6)' }}>
                  No matching orders.
                </td>
              </tr>
            ) : rows.map(row => (
              <tr
                key={row.id}
                className={row.isLate ? 'tr-late' : ''}
                onClick={() => onRowClick && onRowClick(row.id)}
                style={{ cursor: 'pointer', outline: selectedOrderId === row.id ? '2px solid var(--indigo-400)' : undefined }}
              >
                <td><strong>{row.id}</strong></td>
                <td>{row.product?.name ?? '—'}</td>
                <td><FamilyBadge family={row.product?.family} /></td>
                <td>{row.lineName}</td>
                <td>
                  {row.cleaning > 0
                    ? <span style={{ color: 'var(--amber-600)', fontWeight: 700 }}>{row.cleaning}</span>
                    : '—'}
                </td>
                <td>{fmt(row.prodStart)}</td>
                <td>{fmt(row.finish)}</td>
                <td>{fmtTime(row.dueDate, scheduleStart)}</td>
                <td>
                  {row.lateness > 0
                    ? <span style={{ color: 'var(--red-600)', fontWeight: 700 }}>{row.lateness}</span>
                    : '—'}
                </td>
                <td><StatusBadge row={row} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
