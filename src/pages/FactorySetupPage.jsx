import { PRODUCTS, LINES, CHANGEOVER_MATRIX, FAMILIES } from '../data/defaults.js';

const FAMILY_LABELS = {
  LATEX:     'Latex',
  NON_LATEX: 'Non-Latex',
  STANDARD:  'Standard',
};

const CHANGEOVER_DESC = {
  'LATEX-NON_LATEX': '60-min allergen clean required',
  'LATEX-STANDARD':  '60-min allergen clean required',
  'NON_LATEX-LATEX': '20-min clean required',
  'NON_LATEX-STANDARD': '15-min clean',
  'STANDARD-LATEX':  '20-min clean required',
  'STANDARD-NON_LATEX': '15-min clean',
};

export default function FactorySetupPage() {
  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Factory Setup</h1>
          <p className="page-desc">
            Read-only reference: line capabilities, products, and changeover rules.
          </p>
        </div>
      </div>

      <div className="setup-grid">
        {/* Products */}
        <div className="card">
          <div className="card-header">
            <div className="card-title">📦 Products</div>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Name</th>
                  <th>Family</th>
                  <th>Eligible Lines</th>
                  <th>Min/Unit</th>
                </tr>
              </thead>
              <tbody>
                {PRODUCTS.map(p => {
                  const isSingleLine = p.eligibleLines.length === 1;
                  const familyCls =
                    p.family === 'LATEX'     ? 'badge-family-latex' :
                    p.family === 'NON_LATEX' ? 'badge-family-nonlatex' :
                                               'badge-family-standard';
                  return (
                    <tr key={p.id}>
                      <td><strong>{p.id}</strong></td>
                      <td>{p.name}</td>
                      <td><span className={`badge ${familyCls}`}>{FAMILY_LABELS[p.family]}</span></td>
                      <td>
                        {p.eligibleLines.join(', ')}
                        {isSingleLine && (
                          <span className="restricted-line" style={{ marginLeft: 6 }}>
                            Single line only
                          </span>
                        )}
                      </td>
                      <td style={{ textAlign: 'right' }}>{p.minsPerUnit}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Lines */}
        <div className="card">
          <div className="card-header">
            <div className="card-title">🏭 Production Lines</div>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Line</th>
                  <th>Name</th>
                  <th>Eligible Products</th>
                </tr>
              </thead>
              <tbody>
                {LINES.map(l => {
                  const eligible = PRODUCTS.filter(p => p.eligibleLines.includes(l.id));
                  return (
                    <tr key={l.id}>
                      <td><strong>{l.id}</strong></td>
                      <td>{l.name}</td>
                      <td style={{ fontSize: 'var(--text-xs)', color: 'var(--gray-600)' }}>
                        {eligible.map(p => p.id).join(', ')}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="card-body" style={{ paddingTop: 0 }}>
            <div style={{
              background: 'var(--gray-50)',
              borderRadius: 'var(--r-md)',
              padding: 'var(--sp-3) var(--sp-4)',
              fontSize: 'var(--text-xs)',
              color: 'var(--gray-600)',
              marginTop: 'var(--sp-3)'
            }}>
              Each line processes one job at a time. Lines start clean (no initial setup). Jobs cannot be preempted or split across lines.
            </div>
          </div>
        </div>
      </div>

      {/* Changeover matrix */}
      <div className="card">
        <div className="card-header">
          <div className="card-title">🔄 Changeover Matrix (minutes)</div>
          <span style={{ fontSize: 'var(--text-xs)', color: 'var(--gray-400)' }}>
            Row = previous family · Column = next family
          </span>
        </div>
        <div className="card-body">
          <div className="table-wrap">
            <table className="matrix-table">
              <thead>
                <tr>
                  <th style={{ textAlign: 'left' }}>From \ To</th>
                  {FAMILIES.map(f => (
                    <th key={f}>{FAMILY_LABELS[f]}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {FAMILIES.map(from => (
                  <tr key={from}>
                    <td style={{ textAlign: 'left', fontWeight: 600 }}>{FAMILY_LABELS[from]}</td>
                    {FAMILIES.map(to => {
                      const mins = CHANGEOVER_MATRIX[from][to];
                      const is60 = mins === 60;
                      const isZero = mins === 0;
                      return (
                        <td
                          key={to}
                          className={is60 ? 'highlight-60' : isZero ? 'zero' : ''}
                        >
                          {mins}
                          {is60 && <span title="60-min allergen clean"> 🧹</span>}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ marginTop: 'var(--sp-4)', display: 'flex', flexDirection: 'column', gap: 'var(--sp-2)' }}>
            <div className="warning-banner">
              <span>🧹</span>
              <p>
                <strong>Allergen clean (60 min):</strong> Required whenever leaving the LATEX family for any latex-free family (NON_LATEX or STANDARD). This prevents cross-contamination of latex allergens.
              </p>
            </div>
            <div style={{
              background: 'var(--gray-50)',
              borderRadius: 'var(--r-md)',
              padding: 'var(--sp-3) var(--sp-4)',
              fontSize: 'var(--text-xs)',
              color: 'var(--gray-600)'
            }}>
              <strong>Note:</strong> Changeover is directional — transitioning from NON_LATEX → LATEX costs only 20 min (a standard clean),
              while LATEX → NON_LATEX costs 60 min (a full allergen clean). Same-family transitions cost 0 minutes.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
