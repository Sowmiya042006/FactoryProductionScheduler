import { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';

export default function AssumptionsPanel() {
  const [open, setOpen] = useState(false);

  return (
    <div className="assumptions-panel">
      <button className="assumptions-toggle" onClick={() => setOpen(o => !o)}>
        <span>Factory Assumptions</span>
        {open ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
      </button>
      {open && (
        <div className="assumptions-body">
          <ul>
            <li>Single-operation model: each order runs on one eligible line only (not through multiple stages).</li>
            <li>All orders are available at schedule start (2026-11-02 08:00).</li>
            <li>Lines start clean, so no initial setup time is required.</li>
            <li>A line cannot process two jobs simultaneously.</li>
            <li>Orders cannot be split or interrupted.</li>
            <li>Breaks, shifts, and maintenance are ignored.</li>
            <li>STANDARD and NON_LATEX products are latex-free.</li>
            <li>Same-family changeover takes zero time.</li>
            <li>Leaving LATEX for either latex-free family requires a <strong>60-minute allergen clean</strong>.</li>
            <li>Leaving NON_LATEX → STANDARD (or reverse) requires 15 minutes.</li>
            <li>Leaving LATEX family always triggers the 60-minute allergen clean, regardless of the receiving family.</li>
          </ul>
        </div>
      )}
    </div>
  );
}
