import { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { PRODUCTS } from '../data/defaults.js';
import { validateOrder } from '../scheduler/scheduler.js';

const EMPTY_FORM = {
  id:        '',
  productId: '',
  quantity:  '',
  dueISO:    '',
};

function calcDuration(productId, quantity) {
  const p = PRODUCTS.find(p => p.id === productId);
  if (!p || !quantity) return null;
  const q = parseInt(quantity, 10);
  if (!Number.isInteger(q) || q <= 0) return null;
  return q * p.minsPerUnit;
}

export default function OrderModal({ order, existingOrders, onSave, onClose }) {
  const isEdit = !!order;
  const [form, setForm]     = useState(isEdit ? { ...order, _editKey: order.id } : EMPTY_FORM);
  const [errors, setErrors] = useState([]);

  useEffect(() => {
    if (isEdit) {
      setForm({ ...order, _editKey: order.id });
    }
  }, [order]);

  const duration = calcDuration(form.productId, form.quantity);

  function handleChange(field, val) {
    setForm(f => ({ ...f, [field]: val }));
    setErrors([]);
  }

  function handleSubmit() {
    const toValidate = { ...form, id: form.id.trim() };
    const errs = validateOrder(
      toValidate,
      isEdit ? existingOrders.filter(o => o.id !== order.id) : existingOrders
    );
    if (errs.length > 0) { setErrors(errs); return; }
    onSave({ ...toValidate });
  }

  // Format dueISO to datetime-local value
  const dueValue = form.dueISO
    ? form.dueISO.slice(0, 16)  // trim seconds
    : '';

  return (
    <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal">
        <div className="modal-header">
          <div className="modal-title">{isEdit ? 'Edit Order' : 'Add Order'}</div>
          <button className="icon-btn" onClick={onClose}><X size={18} /></button>
        </div>

        <div className="modal-body">
          {errors.length > 0 && (
            <div className="form-errors">
              {errors.map((e, i) => <div key={i}>• {e}</div>)}
            </div>
          )}

          <div className="form-group">
            <label className="form-label">Order ID</label>
            <input
              className={`form-input ${errors.length && !form.id ? 'error' : ''}`}
              value={form.id}
              onChange={e => handleChange('id', e.target.value)}
              placeholder="e.g. O13"
              disabled={isEdit}
            />
            {isEdit && <div className="form-hint">Order ID cannot be changed after creation.</div>}
          </div>

          <div className="form-group">
            <label className="form-label">Product</label>
            <select
              className="form-input"
              value={form.productId}
              onChange={e => handleChange('productId', e.target.value)}
            >
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
              type="number"
              min="1"
              step="1"
              value={form.quantity}
              onChange={e => handleChange('quantity', e.target.value)}
              placeholder="Enter quantity"
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
            />
            <div className="form-hint">Schedule starts 2026-11-02 08:00. Past due dates will be flagged as late.</div>
          </div>

          {form.productId && (
            <div className="form-hint" style={{ background: 'var(--gray-50)', padding: 'var(--sp-3)', borderRadius: 'var(--r-md)' }}>
              <strong>Eligible lines:</strong>{' '}
              {PRODUCTS.find(p => p.id === form.productId)?.eligibleLines.join(', ') ?? '—'}
            </div>
          )}
        </div>

        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={handleSubmit}>
            {isEdit ? 'Save Changes' : 'Add Order'}
          </button>
        </div>
      </div>
    </div>
  );
}
