import { useState, useCallback } from 'react';
import { AlertCircle } from 'lucide-react';
import { LINES } from '../data/defaults.js';
import { fmtTime, fromMins } from '../scheduler/scheduler.js';

const PIXELS_PER_MIN = 3;
const LANE_HEIGHT    = 60;

function familyClass(family) {
  if (family === 'LATEX')     return 'block-latex';
  if (family === 'NON_LATEX') return 'block-nonlatex';
  return 'block-standard';
}

function buildBlocks(scheduled) {
  const blocks = [];
  for (const row of scheduled) {
    if (row.cleaning > 0) {
      blocks.push({ type: 'cleaning', lineId: row.lineId, start: row.setupStart, end: row.prodStart, width: row.cleaning, orderId: row.id, label: `Clean ${row.cleaning}m`, order: row });
    }
    blocks.push({ type: 'production', lineId: row.lineId, start: row.prodStart, end: row.finish, width: row.duration, orderId: row.id, family: row.product?.family, isLate: row.isLate, label: row.id, order: row });
  }
  return blocks;
}

function Tooltip({ block, x, y, scheduleStart }) {
  const { order, type } = block;
  if (!order) return null;
  const fmt = (mins) => fmtTime(fromMins(mins, scheduleStart), scheduleStart);
  return (
    <div className="tl-tooltip" style={{ left: x + 14, top: y - 10 }}>
      {type === 'cleaning' ? (
        <>
          <div className="tt-title">🧹 Allergen Clean — {order.id}</div>
          <div className="tt-row"><span className="tt-label">Line</span><span className="tt-val">{order.lineName}</span></div>
          <div className="tt-row"><span className="tt-label">Start</span><span className="tt-val">{fmt(block.start)}</span></div>
          <div className="tt-row"><span className="tt-label">End</span><span className="tt-val">{fmt(block.end)}</span></div>
          <div className="tt-row"><span className="tt-label">Duration</span><span className="tt-val">{block.width} min</span></div>
        </>
      ) : (
        <>
          <div className="tt-title">{order.id} — {order.product?.name}</div>
          <div className="tt-row"><span className="tt-label">Line</span><span className="tt-val">{order.lineName}</span></div>
          <div className="tt-row"><span className="tt-label">Start</span><span className="tt-val">{fmt(block.start)}</span></div>
          <div className="tt-row"><span className="tt-label">Finish</span><span className="tt-val">{fmt(block.end)}</span></div>
          <div className="tt-row"><span className="tt-label">Duration</span><span className="tt-val">{block.width} min</span></div>
          <div className="tt-row"><span className="tt-label">Due</span><span className="tt-val">{fmtTime(order.dueDate, scheduleStart)}</span></div>
          {order.isLate && <div className="late-flag">⚠ Late by {order.lateness} min</div>}
        </>
      )}
    </div>
  );
}

export default function Timeline({ scheduled, onSelectOrder, selectedOrderId, scheduleStart }) {
  const [tooltip, setTooltip] = useState(null);

  const handleMouseMove  = useCallback((block, e) => setTooltip({ block, x: e.clientX, y: e.clientY }), []);
  const handleMouseLeave = useCallback(() => setTooltip(null), []);

  if (!scheduled || scheduled.length === 0) {
    return (
      <div className="empty-state">
        <AlertCircle size={32} />
        <p>No schedule generated yet. Click "Generate Schedule" to begin.</p>
      </div>
    );
  }

  const blocks    = buildBlocks(scheduled);
  const maxMin    = Math.max(...scheduled.map(r => r.finish), 60);
  const totalPx   = maxMin * PIXELS_PER_MIN + 60;
  const fmt       = (m) => fmtTime(fromMins(m, scheduleStart), scheduleStart);

  const ticks = [];
  for (let m = 0; m <= maxMin + 30; m += 30) ticks.push(m);

  return (
    <div>
      <div className="timeline-wrap">
        <div className="timeline-container" style={{ width: totalPx + 80 }}>
          {/* Time axis */}
          <div className="timeline-header" style={{ width: totalPx }}>
            {ticks.map(m => (
              <div key={m} className="time-tick" style={{ left: m * PIXELS_PER_MIN }}>
                <div className="time-tick-line" />
                <div className="time-tick-label">{fmt(m)}</div>
              </div>
            ))}
          </div>

          {/* Lanes */}
          <div className="timeline-lanes">
            {LINES.map(line => {
              const lineBlocks = blocks.filter(b => b.lineId === line.id);
              return (
                <div key={line.id} className="timeline-lane">
                  <div className="lane-label">
                    <div className="lane-name">{line.name}</div>
                    <div className="lane-id">{line.id}</div>
                  </div>
                  <div className="lane-track" style={{ width: totalPx, height: LANE_HEIGHT }}>
                    {lineBlocks.map((block, bi) => {
                      const left  = block.start * PIXELS_PER_MIN;
                      const width = Math.max(block.width * PIXELS_PER_MIN, 4);
                      const isSelected = selectedOrderId && block.orderId === selectedOrderId;

                      if (block.type === 'cleaning') {
                        return (
                          <div
                            key={`c-${bi}`}
                            className="block block-cleaning"
                            style={{ left, width, top: 4, height: LANE_HEIGHT - 8 }}
                            onMouseMove={e => handleMouseMove(block, e)}
                            onMouseLeave={handleMouseLeave}
                          >
                            {width > 28 && <span className="block-label">{block.label}</span>}
                          </div>
                        );
                      }
                      return (
                        <div
                          key={`p-${bi}`}
                          className={`block ${familyClass(block.family)} ${block.isLate ? 'late' : ''}`}
                          style={{ left, width, top: 4, height: LANE_HEIGHT - 8, outline: isSelected ? '2px solid #fbbf24' : undefined, outlineOffset: isSelected ? '-2px' : undefined }}
                          onMouseMove={e => handleMouseMove(block, e)}
                          onMouseLeave={handleMouseLeave}
                          onClick={() => onSelectOrder && onSelectOrder(block.orderId)}
                        >
                          {width > 20 && <span className="block-label">{block.label}</span>}
                          {block.isLate && (
                            <div className="late-marker" title={`Late ${block.order.lateness}m`}>
                              <AlertCircle size={8} />
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Legend */}
      <div className="tl-legend">
        <div className="legend-item"><div className="legend-swatch latex"    /><span>Latex family</span></div>
        <div className="legend-item"><div className="legend-swatch nonlatex" /><span>Non-Latex family</span></div>
        <div className="legend-item"><div className="legend-swatch standard" /><span>Standard family</span></div>
        <div className="legend-item"><div className="legend-swatch cleaning" /><span>Allergen clean</span></div>
        <div className="legend-item">
          <div className="legend-swatch late" style={{ width: 16, height: 10, border: '2px solid var(--red-500)', borderRadius: 3 }} />
          <span>Late order</span>
        </div>
      </div>

      {tooltip && <Tooltip block={tooltip.block} x={tooltip.x} y={tooltip.y} scheduleStart={scheduleStart} />}
    </div>
  );
}
