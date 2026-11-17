import { useEffect, useState } from 'react';

export function PaymentPreparation({ request, csrf }) {
  const [data, setData] = useState(null);
  const [settings, setSettings] = useState({});
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    request('/api/payment-setup')
      .then(d => { setData(d); setSettings(d.settings || {}); })
      .catch(e => setError(e.message));
  }, []);

  const configured = Boolean(data?.connection?.configured);
  return (
    <section className="ac-panel sc-wallet-card">
      <div className="ac-section-intro">
        <div><h2>Paystack payment setup</h2><p>Server-side payment initialization, verification and webhook handling.</p></div>
        <span className="ac-badge">{configured ? 'Paystack connected · ' + data.connection.mode : 'Not connected'}</span>
      </div>
      {error && <p className="ac-error" role="alert">{error}</p>}
      {saved && <p className="ac-notice" role="status">Setup notes saved.</p>}
      {data && (
        <>
          <div className="ac-health">
            <div><span>Payment initialization</span><b>{configured ? 'Configured' : 'Waiting for PAYSTACK_SECRET_KEY'}</b></div>
            <div><span>Payment verification</span><b>{configured ? 'Server-side verification enabled' : 'Unavailable'}</b></div>
            <div><span>Webhook</span><b>{data.webhookPath}</b></div>
            <div><span>Automatic refunds</span><b>{data.connection.refundExecution ? 'Provider endpoint enabled' : 'Unavailable until Paystack is configured'}</b></div>
          </div>
          <form className="ac-form" onSubmit={async e => {
            e.preventDefault(); setBusy(true); setSaved(false); setError('');
            try { await request('/api/payment-setup', { method: 'PUT', csrf, body: settings }); setSaved(true); }
            catch (e) { setError(e.message); }
            finally { setBusy(false); }
          }}>
            <label>Payment provider<input value="Paystack" readOnly /></label>
            <label>Merchant / business name<input maxLength="200" value={settings.merchantName || ''} onChange={e => setSettings({ ...settings, merchantName: e.target.value })} /></label>
            <label>Payment support email<input type="email" maxLength="200" value={settings.supportEmail || ''} onChange={e => setSettings({ ...settings, supportEmail: e.target.value })} /></label>
            <label>Refund policy notes<textarea rows="3" maxLength="2000" value={settings.refundPolicy || ''} onChange={e => setSettings({ ...settings, refundPolicy: e.target.value })} /></label>
            <div className="ac-form-actions"><button className="ac-primary" disabled={busy}>{busy ? 'Saving…' : 'Save setup notes'}</button></div>
          </form>
          <p>Configure <code>PAYSTACK_SECRET_KEY</code> as an encrypted server-side secret for the Supabase Edge Function. Never put it in frontend code, browser storage, or these notes. Set the Paystack webhook URL to the endpoint above. Live mode requires an <code>sk_live_</code> key; test keys never mark a production listing as paid.</p>
        </>
      )}
    </section>
  );
}

export function ListingRefunds({ request, csrf, admin = false, refreshKey = 0 }) {
  const [items, setItems] = useState([]);
  const [executionConnected, setExecutionConnected] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const load = () => request('/api/listing-refunds').then(d => {
    setItems(d.items || []);
    setExecutionConnected(Boolean(d.executionConnected));
  }).catch(e => setError(e.message));
  useEffect(() => { load(); }, [refreshKey]);

  const action = async (item, actionName) => {
    setBusy(item.id); setError('');
    try { await request('/api/listing-refunds', { method: 'POST', csrf, body: { id: item.id, action: actionName } }); await load(); }
    catch (e) { setError(e.message); }
    finally { setBusy(''); }
  };

  return (
    <section className="ac-panel sc-wallet-card">
      <h2>Listing-fee refund requests</h2>
      <p>Refunds apply only to Auto Connect advertising fees. Provider confirmation is required before a payment is marked refunded.</p>
      {error && <p className="ac-error" role="alert">{error}</p>}
      {items.length ? items.map(r => (
        <div className="ac-health" key={r.id}>
          <div>
            <span><b>{new Intl.NumberFormat('en-GH', { style: 'currency', currency: r.currency || 'GHS' }).format((r.amount_minor || 0) / 100)} · {r.status}</b>
              <small className="sc-deadline">{r.reference}</small><small className="sc-deadline">{r.reason}</small>
            </span>
          </div>
          {admin && r.status === 'requested' && (
            <button className="ac-quiet" disabled={!!busy} onClick={() => action(r, 'review')}>{busy === r.id ? 'Saving…' : 'Mark reviewed'}</button>
          )}
          {admin && r.status === 'reviewed' && (
            <button className="ac-primary" disabled={!!busy || !executionConnected} onClick={() => action(r, 'refund')}>
              {busy === r.id ? 'Processing…' : executionConnected ? 'Issue Paystack refund' : 'Paystack not connected'}
            </button>
          )}
        </div>
      )) : <p>No refund requests yet.</p>}
    </section>
  );
}
