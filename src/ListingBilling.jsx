import { useEffect, useState } from 'react';
import { PaymentPreparation, ListingRefunds } from './PaymentPreparation.jsx';

export default function ListingBilling({ request, csrf, admin = false }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [pending, setPending] = useState('');
  const [refundRefresh, setRefundRefresh] = useState(0);

  const load = async () => {
    const result = await request('/api/listing-billing');
    setData(result);
    return result;
  };

  useEffect(() => {
    let active = true;
    request('/api/listing-billing')
      .then(result => { if (active) setData(result); })
      .catch(e => { if (active) setError(e.message); });

    const params = new URLSearchParams(window.location.search);
    const reference = params.get('reference');
    if (reference && !admin) {
      setPending(reference);
      request('/api/listing-billing/verify', {
        method: 'POST', csrf, body: { reference }
      }).then(result => {
        if (!active) return;
        setNotice('Paystack confirmed your listing publication fee. Reference: ' + result.reference);
        params.delete('reference');
        const query = params.toString();
        window.history.replaceState({}, '', window.location.pathname + (query ? '?' + query : '') + window.location.hash);
        setRefundRefresh(v => v + 1);
        return load();
      }).catch(e => { if (active) setError(e.message); })
        .finally(() => { if (active) setPending(''); });
    }
    return () => { active = false; };
  }, [csrf, admin]);

  const cash = (n, currency = 'GHS') =>
    new Intl.NumberFormat('en-GH', { style: 'currency', currency, maximumFractionDigits: 2 })
      .format((Number(n) || 0) / 100);

  const checkout = async listing => {
    setPending(listing.id);
    setError('');
    setNotice('');
    try {
      const result = await request('/api/listing-billing/checkout', {
        method: 'POST', csrf, body: { listingId: listing.id }
      });
      if (!result.url || !/^https:\/\/checkout\.paystack\.com\//.test(result.url)) {
        throw new Error('Paystack did not return a valid checkout link.');
      }
      window.location.assign(result.url);
    } catch (e) {
      setError(e.message);
      setPending('');
      await load().catch(() => {});
    }
  };

  const unpaid = (data?.items || []).filter(v =>
    !v.feePaid && v.feeAmountMinor !== null && ['pending', 'active', 'paused'].includes(v.status)
  );

  return (
    <>
      <div className="ac-section-intro">
        <div>
          <h1>{admin ? 'Seller listing fees' : 'Pay to publish your listing'}</h1>
          <p>Sellers pay Auto Connect for advertising through Paystack. Buyers arrange vehicle purchases directly with sellers.</p>
        </div>
        {!admin && unpaid.length > 0 && (
          <button type="button" className="ac-primary" disabled={!data?.connected || !!pending}
            onClick={() => checkout(unpaid[0])}>
            {data?.connected ? 'Pay listing fee with Paystack' : 'Payment service unavailable'}
          </button>
        )}
      </div>

      {error && <div className="ac-error" role="alert">{error}</div>}
      {notice && <div className="ac-panel" role="status">{notice}</div>}

      {data?.connected && data?.testMode && (
        <div className="ac-provider-note">
          Paystack is connected in test mode. Test transactions do not count as live payments and cannot publish production listings.
        </div>
      )}
      {!data?.connected && (
        <div className="ac-provider-note">
          Paystack is not connected. No payment can be collected and no listing fee will be marked paid until the server-side Paystack secret key and webhook are configured.
        </div>
      )}

      <section className="ac-panel sc-wallet-card">
        <h2>Listing fees based on your asking price</h2>
        <div className="ac-health">
          {data?.bands?.map(b => <div key={b.amountMinor}><span>{b.label}</span><b>{cash(b.amountMinor)}</b></div>)}
        </div>
        <p>Drafts are free to prepare. A listing needs its publication fee and marketplace approval before it can appear publicly. The fee pays for advertising, not the vehicle.</p>
      </section>

      {admin && <PaymentPreparation request={request} csrf={csrf} />}
      <ListingRefunds request={request} csrf={csrf} admin={admin} refreshKey={refundRefresh} />

      {!data ? (
        <p role="status" className="ac-loading">Loading listing fees…</p>
      ) : admin ? (
        <section className="ac-panel ac-table-panel">
          <div className="ac-table-scroll">
            <table>
              <thead><tr><th>Reference</th><th>Seller</th><th>Listing</th><th>Listing fee</th><th>Status</th></tr></thead>
              <tbody>
                {(data.payments || []).map(p => (
                  <tr key={p.reference}>
                    <td>{p.reference}</td><td>{p.seller_id}</td><td>{p.vehicle_id}</td>
                    <td>{cash(p.amount_minor, p.currency)}</td>
                    <td>{p.status}{p.livemode ? '' : ' · test'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!(data.payments || []).length && <p className="ac-empty">No seller listing-fee payments yet.</p>}
        </section>
      ) : (
        <>
          <section className="ac-panel">
            <div className="ac-panel-head"><h2>Your listings</h2></div>
            <div className="ac-health">
              {(data.items || []).map(v => (
                <div key={v.id}>
                  <span>
                    <b>{v.year} {v.make} {v.model}</b>
                    <small className="sc-deadline">Asking price: {cash(v.price_minor, v.currency)}{v.feeAmountMinor !== null ? ' · Listing fee: ' + cash(v.feeAmountMinor) : ''}</small>
                    <small className="sc-deadline">
                      {v.feePaid ? 'Publishing fee paid' : v.feeAmountMinor === null ? 'Set a GHS asking price to calculate the fee' : v.status === 'draft' ? 'Draft · submit for review first' : 'Publishing fee required'} · {v.status}
                    </small>
                  </span>
                  <button type="button" className={v.feePaid ? 'ac-quiet' : 'ac-primary'}
                    disabled={!data.connected || v.feeAmountMinor === null || v.feePaid || !!pending || !['pending', 'active', 'paused'].includes(v.status)}
                    onClick={() => checkout(v)}>
                    {pending === v.id ? 'Opening Paystack…' : v.feePaid ? 'Paid' : data.connected ? 'Pay with Paystack' : 'Not connected'}
                  </button>
                </div>
              ))}
              {!(data.items || []).length && <p className="ac-empty">Prepare a listing in Inventory, then return here to pay its publication fee.</p>}
            </div>
          </section>

          <section className="ac-panel sc-wallet-card">
            <h2>Listing payment history</h2>
            {(data.payments || []).map(p => (
              <div className="ac-health" key={p.reference}>
                <div>
                  <span>{cash(p.amount_minor, p.currency)} · {p.status}{p.livemode ? ' · live' : ' · test'}
                    <small className="sc-deadline">{p.reference}</small>
                  </span>
                </div>
              </div>
            ))}
            {!(data.payments || []).length && <p>No listing-fee payments yet.</p>}
          </section>
        </>
      )}
    </>
  );
}
