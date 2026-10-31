import { useState } from 'react';
import { Plus, Pencil, Trash2, AlertTriangle, Loader2 } from 'lucide-react';
import { PRODUCTS } from '../data/defaults.js';
import { api, ApiError } from '../api/client.js';
import OrderModal from '../components/OrderModal.jsx';

function calcDuration(productId, quantity) {
  const p = PRODUCTS.find(p => p.id === productId);
  if (!p) return '—';
  const q = parseInt(quantity, 10);
  if (!Number.isInteger(q) || q <= 0) return '—';
  return `${q * p.minsPerUnit} min`;
}

export default function OrdersPage({
  orders, isStale, scheduleStart,
  onCreated, onUpdated, onDeleted,
}) {
  const [editOrder, setEditOrder]   = useState(null);
  const [showModal, setShowModal]   = useState(false);
  const [deleteId,  setDeleteId]    = useState(null);
  const [saving,    setSaving]      = useState(false);
  const [deleting,  setDeleting]    = useState(false);
  const [apiError,  setApiError]    = useState('');

  function openAdd()    { setEditOrder(null); setShowModal(true); setApiError(''); }
  function openEdit(o)  { setEditOrder(o);    setShowModal(true); setApiError(''); }
  function closeModal() { setShowModal(false); setEditOrder(null); }

  async function handleSave(form) {
    setSaving(true);
    setApiError('');
    try {
      if (editOrder) {
        const updated = await api.updateOrder(editOrder.id, {
          productId: form.productId,
          quantity:  parseInt(form.quantity, 10),
          dueISO:    form.dueISO,
        });
        onUpdated(updated);
      } else {
        const created = await api.createOrder({
          id:        form.id.trim(),
          productId: form.productId,
          quantity:  parseInt(form.quantity, 10),
          dueISO:    form.dueISO,
        });
        onCreated(created);
      }
      closeModal();
    } catch (e) {
      setApiError(e instanceof ApiError ? e.message : 'Save failed.');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id) {
    setDeleting(true);
    setApiError('');
    try {
      await api.deleteOrder(id);
      onDeleted(id);
      setDeleteId(null);
    } catch (e) {
      setApiError(e instanceof ApiError ? e.message : 'Delete failed.');
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Orders</h1>
          <p className="page-desc">Add, edit, and manage production orders. Changes require schedule regeneration.</p>
        </div>
        <button className="btn btn-primary" onClick={openAdd} id="add-order-btn">
          <Plus size={16} /> Add Order
        </button>
      </div>

      {apiError && (
        <div className="warning-banner">
          <AlertTriangle size={16} className="icon" />
          <p>{apiError}</p>
        </div>
      )}

      {isStale && (
        <div className="stale-banner">
          <AlertTriangle size={16} className="icon" />
          <p>Inputs changed — go to Overview and click "Generate Schedule" to update results.</p>
        </div>
      )}

      <div className="card">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Order ID</th>
                <th>Product</th>
                <th>Family</th>
                <th>Quantity</th>
                <th>Duration</th>
                <th>Eligible Lines</th>
                <th>Due</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {orders.length === 0 ? (
                <tr>
                  <td colSpan={8} style={{ textAlign: 'center', padding: 'var(--sp-8)', color: 'var(--gray-400)' }}>
                    No orders. Click "Add Order" to get started.
                  </td>
                </tr>
              ) : orders.map(o => {
                const product   = PRODUCTS.find(p => p.id === o.productId);
                const dueDate   = new Date(o.dueISO);
                const familyCls =
                  product?.family === 'LATEX'     ? 'badge-family-latex' :
                  product?.family === 'NON_LATEX' ? 'badge-family-nonlatex' : 'badge-family-standard';
                const familyLabel =
                  product?.family === 'LATEX'     ? 'Latex' :
                  product?.family === 'NON_LATEX' ? 'Non-Latex' : 'Standard';

                return (
                  <tr key={o.id}>
                    <td><strong>{o.id}</strong></td>
                    <td>{product?.name ?? o.productId}</td>
                    <td><span className={`badge ${familyCls}`}>{familyLabel}</span></td>
                    <td>{o.quantity}</td>
                    <td style={{ color: 'var(--gray-600)' }}>{calcDuration(o.productId, o.quantity)}</td>
                    <td style={{ color: 'var(--gray-600)' }}>
                      {product?.eligibleLines.join(', ') ?? '—'}
                      {product?.eligibleLines.length === 1 && (
                        <span className="restricted-line" style={{ marginLeft: 6 }}>Single line</span>
                      )}
                    </td>
                    <td>
                      {dueDate.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' })}
                      {' '}
                      {dueDate.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: 4 }}>
                        <button className="icon-btn" title="Edit"   onClick={() => openEdit(o)}><Pencil size={14} /></button>
                        <button className="icon-btn" title="Delete" style={{ color: 'var(--red-500)' }} onClick={() => setDeleteId(o.id)}><Trash2 size={14} /></button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add/Edit Modal */}
      {showModal && (
        <OrderModal
          order={editOrder}
          existingOrders={orders}
          onSave={handleSave}
          onClose={closeModal}
          saving={saving}
          apiError={apiError}
        />
      )}

      {/* Delete confirm */}
      {deleteId && (
        <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) setDeleteId(null); }}>
          <div className="modal" style={{ maxWidth: 380 }}>
            <div className="modal-header">
              <div className="modal-title">Delete Order</div>
            </div>
            <div className="modal-body">
              <p style={{ color: 'var(--gray-600)', fontSize: 'var(--text-sm)' }}>
                Are you sure you want to delete order <strong>{deleteId}</strong>? This cannot be undone.
              </p>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setDeleteId(null)}>Cancel</button>
              <button
                className="btn btn-danger"
                onClick={() => handleDelete(deleteId)}
                disabled={deleting}
              >
                {deleting ? <Loader2 size={14} className="animate-pulse" /> : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
