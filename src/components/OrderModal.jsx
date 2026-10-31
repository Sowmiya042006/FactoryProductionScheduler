import { useState, useEffect } from 'react';
import { X, Loader2 } from 'lucide-react';
import { PRODUCTS } from '../data/defaults.js';

const EMPTY_FORM = { id: '', productId: '', quantity: '', dueISO: '' };

function calcDuration(productId, quantity) {
  const p = PRODUCTS.find(p => p.id === productId);
  if (!p) return null;
  const q = parseInt(quantity, 10);
  if (!Number.isInteger(q) || q <= 0) return null;
  return q * p.minsPerUnit;
}

/**
 * OrderModal — client-side form, server-side validation.
 * Validation errors come back from the API via the apiError prop.
 */
export default function OrderModal({ order, existingOrders, onSave, onClose, saving, apiError }) {
  const isEdit = !!order;
  const [form, setForm] = useState(
    isEdit
      ? { id: order.id, productId: order.productId, quantity: String(order.quantity), dueISO: order.dueISO }
      : EMPTY_FORM
  );

  useEffect(() => {
    if (isEdit) {
      setForm({ id: order.id, productId: order.productId, quantity: String(order.quantity), dueISO: order.dueISO });
    }
  }, [order]);

  const duration = calcDuration(form.productId, form.quantity);
  const dueValue = form.dueISO ? form.dueISO.slice(0, 16) : '';

  function handleChange(field, val) {
    setForm(f => ({ ...f, [field]: val }));
  }

  function handleSubmit() {
    // Hand off to parent; server does validation
    onSave({ ...form });
  }

  return (
    <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget && !saving) onClose(); }}>
      <div className="modal">
        <div className="modal-header">
          <div className="modal-title">{isEdit ? 'Edit Order' : 'Add Order'}</div>
          <button className="icon-btn" onClick={onClose} disabled={saving}><X size={18} /></button>
        </div>

        <div className="modal-body">
          {apiError && (
            <div className="form-errors">
              {apiError.split('\n').map((e, i) => <div key={i}>• {e}</div>)}
            </div>
          )}

          <div className="form-group">
            <label className="form-label">Order ID</label>
            <input
              className="form-input"
              value={form.id}
              onChange={e => handleChange('id', e.target.value)}
              placeholder="e.g. O13"
              disabled={isEdit || saving}
            />
            {isEdit && <div className="form-hint">Order ID cannot be changed after creation.</div>}
          </div>

          <div className="form-group">
            <label className="form-label">Product</label>
            <select className="form-input" value={form.productId} onChange={e => handleChange('productId', e.target.value)} disabled={saving}>
              <option value="">— Select product —</option>
              {PRODUCTS.map(p => (
                <option key={p.id} value={p.id}>
                  {p.id} — {p.name} ({p.family}, {p.minsPerUnit} min/unit)
                </option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label className="form-label">Quantity</label>
            <input
              className="form-input"
              type="number" min="1" step="1"
              value={form.quantity}
              onChange={e => handleChange('quantity', e.target.value)}
              placeholder="Enter quantity"
              disabled={saving}
            />
            {duration !== null && (
              <div className="form-hint">
                Production duration: <strong>{duration} min</strong>
                {' '}({form.quantity} × {PRODUCTS.find(p => p.id === form.productId)?.minsPerUnit} min/unit)
              </div>
            )}
          </div>

          <div className="form-group">
            <label className="form-label">Due Date / Time</label>
            <input
              className="form-input"
              type="datetime-local"
              value={dueValue}
              onChange={e => handleChange('dueISO', e.target.value ? e.target.value + ':00' : '')}
              disabled={saving}
            />
            <div className="form-hint">Past due dates will be flagged as late in the schedule.</div>
          </div>

          {form.productId && (
            <div className="form-hint" style={{ background: 'var(--gray-50)', padding: 'var(--sp-3)', borderRadius: 'var(--r-md)' }}>
              <strong>Eligible lines:</strong>{' '}
              {PRODUCTS.find(p => p.id === form.productId)?.eligibleLines.join(', ') ?? '—'}
            </div>
          )}
        </div>

        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose} disabled={saving}>Cancel</button>
          <button className="btn btn-primary" onClick={handleSubmit} disabled={saving}>
            {saving ? <><Loader2 size={14} className="animate-pulse" /> Saving…</> : isEdit ? 'Save Changes' : 'Add Order'}
          </button>
        </div>
      </div>
    </div>
  );
}
