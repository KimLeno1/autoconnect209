import { PaymentPreparation, ListingRefunds } from './PaymentPreparation.jsx';
import { useEffect, useState } from 'react';

export default function ListingBilling({ request, csrf, admin = false }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [pending, setPending] = useState('');
  const [refundRefresh, setRefundRefresh] = useState(0);
  const [refundTarget, setRefundTarget] = useState('');
  const [refundReason, setRefundReason] = useState('');

  // Paystack Checkout Simulator state
  const [checkoutSession, setCheckoutSession] = useState(null);
  const [channel, setChannel] = useState('mobile_money');
  const [network, setNetwork] = useState('MTN MoMo');
  const [momoPhone, setMomoPhone] = useState('024 800 9900');
  const [cardNumber, setCardNumber] = useState('4084 0840 8408 4084');
  const [cardExpiry, setCardExpiry] = useState('08/28');
  const [cardCvv, setCardCvv] = useState('408');
  const [bankName, setBankName] = useState('Ecobank Ghana (*771#)');
  const [receipt, setReceipt] = useState(null);

  const load = () =>
    request('/api/listing-billing')
      .then(setData)
      .catch(e => setError(e.message));

  useEffect(() => {
    load();
  }, []);

  const cash = (n, c) =>
    new Intl.NumberFormat('en-GH', { style: 'currency', currency: c || 'GHS' }).format((Number(n) || 0) / 100);

  const action = async (path, body, key) => {
    setPending(key);
    setError('');
    setNotice('');
    try {
      const r = await request('/api/listing-billing/' + path, { method: 'POST', csrf, body });
      if (r.url) {
        location.assign(r.url);
      } else {
        await load();
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setPending('');
    }
  };

  const startPaystackSimulation = async listing => {
    setPending(listing.id);
    setError('');
    setNotice('');
    setReceipt(null);
    try {
      const session = await request('/api/listing-billing/paystack-simulate/initialize', {
        method: 'POST',
        csrf,
        body: { listingId: listing.id }
      });
      setCheckoutSession(session);
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setPending('');
    }
  };

  const completePaystackSimulation = async (outcome = 'success', customRef = null) => {
    const ref = customRef || checkoutSession?.reference;
    if (!ref) return;
    setPending(ref);
    setError('');
    setNotice('');
    try {
      const selectedNetwork =
        channel === 'mobile_money'
          ? `${network} (${momoPhone})`
          : channel === 'card'
            ? `VISA •••• ${cardNumber.replace(/\s+/g, '').slice(-4)}`
            : bankName;

      const result = await request('/api/listing-billing/paystack-simulate/complete', {
        method: 'POST',
        csrf,
        body: {
          reference: ref,
          outcome,
          channel,
          network: selectedNetwork
        }
      });

      if (outcome === 'abandoned') {
        setCheckoutSession(null);
        setNotice(`Paystack transaction ${ref} saved as pending. You can resume or complete it below.`);
      } else if (result.paid) {
        setReceipt(result);
        setCheckoutSession(null);
        setNotice(`Paystack payment confirmed (${result.receiptNumber}). Listing publishing fee is now marked paid in SQLite.`);
      }
      await load();
    } catch (e) {
      setError(e.message);
      await load();
    } finally {
      setPending('');
    }
  };

  const unpaidListings = (data?.items || []).filter(
    v => !v.feePaid && v.feeAmountMinor !== null && ['pending', 'active', 'paused'].includes(v.status)
  );

  return (
    <>
      <div className="ac-section-intro">
        <div>
          <h1>{admin ? 'Seller listing fees' : 'Pay to publish your listing'}</h1>
          <p>Sellers pay Auto Connect for advertising via Paystack (GHS). Buyers arrange vehicle purchases directly with sellers.</p>
        </div>
        {!admin && unpaidListings.length > 0 && (
          <button
            type="button"
            className="ac-primary"
            disabled={!!pending}
            onClick={() => startPaystackSimulation(unpaidListings[0])}
          >
            Simulate Paystack Checkout ({unpaidListings[0].year} {unpaidListings[0].make} {unpaidListings[0].model})
          </button>
        )}
      </div>

      {error && (
        <div className="ac-error" role="alert">
          {error}
        </div>
      )}
      {notice && (
        <div className="ac-panel" role="status">
          <b>Paystack Checkout Simulator:</b> {notice}
        </div>
      )}

      {receipt && (
        <section className="ac-panel sc-wallet-card" aria-label="Paystack payment receipt">
          <div className="ac-panel-head">
            <div>
              <span className="ac-badge">PAYSTACK TEST RECEIPT</span>
              <h2>{cash(receipt.amountMinor, receipt.currency)} Paid Successfully</h2>
            </div>
            <button type="button" className="ac-quiet" onClick={() => setReceipt(null)}>
              Dismiss receipt
            </button>
          </div>
          <div className="ac-health">
            <div>
              <span>Receipt Number</span>
              <b>{receipt.receiptNumber}</b>
            </div>
            <div>
              <span>Paystack Reference</span>
              <b>{receipt.reference}</b>
            </div>
            <div>
              <span>Payment Channel</span>
              <b>
                {receipt.channel === 'mobile_money'
                  ? 'Ghana Mobile Money'
                  : receipt.channel === 'card'
                    ? 'Bank Card'
                    : 'Bank / USSD'}{' '}
                · {receipt.network}
              </b>
            </div>
            <div>
              <span>Status</span>
              <b>Paid (Test Mode · SQLite Verified)</b>
            </div>
          </div>
        </section>
      )}

      {checkoutSession && (
        <section className="ac-panel" aria-label="Simulated Paystack Checkout">
          <div className="ac-panel-head">
            <div>
              <span className="ac-badge">PAYSTACK CHECKOUT · TEST MODE</span>
              <h2>
                Auto Connect Ghana — {cash(checkoutSession.amountMinor, checkoutSession.currency)}
              </h2>
              <p>
                Customer: <b>{checkoutSession.email}</b> · Listing:{' '}
                <b>
                  {checkoutSession.listing?.year} {checkoutSession.listing?.make} {checkoutSession.listing?.model}
                </b>{' '}
                · Ref: <code>{checkoutSession.reference}</code>
              </p>
            </div>
            <button
              type="button"
              className="ac-quiet"
              onClick={() => completePaystackSimulation('abandoned')}
            >
              Keep pending & close
            </button>
          </div>

          <div className="ac-inline" role="tablist" aria-label="Paystack payment channels">
            <button
              type="button"
              className={channel === 'mobile_money' ? 'ac-primary' : 'ac-quiet'}
              onClick={() => setChannel('mobile_money')}
            >
              Mobile Money (Ghana)
            </button>
            <button
              type="button"
              className={channel === 'card' ? 'ac-primary' : 'ac-quiet'}
              onClick={() => setChannel('card')}
            >
              Card (Visa / Mastercard)
            </button>
            <button
              type="button"
              className={channel === 'ussd' ? 'ac-primary' : 'ac-quiet'}
              onClick={() => setChannel('ussd')}
            >
              Bank / USSD (*771#)
            </button>
          </div>

          {channel === 'mobile_money' && (
            <div className="ac-health">
              <div>
                <label>
                  <span>Mobile Money Provider</span>
                  <select value={network} onChange={e => setNetwork(e.target.value)}>
                    <option value="MTN MoMo">MTN Mobile Money (*170#)</option>
                    <option value="Telecel Cash">Telecel Cash (*110#)</option>
                    <option value="AT Money">AT Money (*110#)</option>
                  </select>
                </label>
              </div>
              <div>
                <label>
                  <span>Ghana Mobile Number</span>
                  <input
                    value={momoPhone}
                    onChange={e => setMomoPhone(e.target.value)}
                    placeholder="024 800 9900"
                  />
                </label>
              </div>
              <div>
                <span>Simulated Prompt</span>
                <small className="sc-deadline">
                  Approving sends a simulated Paystack <code>charge.success</code> event from {network} ({momoPhone}).
                </small>
              </div>
            </div>
          )}

          {channel === 'card' && (
            <div className="ac-health">
              <div>
                <label>
                  <span>Paystack Test Card Number</span>
                  <input value={cardNumber} onChange={e => setCardNumber(e.target.value)} />
                </label>
              </div>
              <div>
                <label>
                  <span>Expiry</span>
                  <input value={cardExpiry} onChange={e => setCardExpiry(e.target.value)} />
                </label>
              </div>
              <div>
                <label>
                  <span>CVV</span>
                  <input value={cardCvv} onChange={e => setCardCvv(e.target.value)} />
                </label>
              </div>
            </div>
          )}

          {channel === 'ussd' && (
            <div className="ac-health">
              <div>
                <label>
                  <span>Select Ghana Bank USSD</span>
                  <select value={bankName} onChange={e => setBankName(e.target.value)}>
                    <option value="Ecobank Ghana (*771#)">Ecobank Ghana (*771#)</option>
                    <option value="GCB Bank (*422#)">GCB Bank (*422#)</option>
                    <option value="Fidelity Bank Ghana (*776#)">Fidelity Bank Ghana (*776#)</option>
                    <option value="Stanbic Bank Ghana (*715#)">Stanbic Bank Ghana (*715#)</option>
                  </select>
                </label>
              </div>
              <div>
                <span>USSD Authorization</span>
                <small className="sc-deadline">
                  Simulates instant bank USSD confirmation for {cash(checkoutSession.amountMinor, checkoutSession.currency)}.
                </small>
              </div>
            </div>
          )}

          <div className="ac-inline">
            <button
              type="button"
              className="ac-primary"
              disabled={pending === checkoutSession.reference}
              onClick={() => completePaystackSimulation('success')}
            >
              {pending === checkoutSession.reference
                ? 'Authorizing with Paystack…'
                : `Authorize & Pay ${cash(checkoutSession.amountMinor, checkoutSession.currency)}`}
            </button>
            <button
              type="button"
              className="ac-quiet"
              disabled={pending === checkoutSession.reference}
              onClick={() => completePaystackSimulation('declined')}
            >
              Simulate Declined Charge
            </button>
            <button
              type="button"
              className="ac-quiet"
              disabled={pending === checkoutSession.reference}
              onClick={() => completePaystackSimulation('abandoned')}
            >
              Save as Pending
            </button>
          </div>
        </section>
      )}

      <section className="ac-panel sc-wallet-card">
        {data?.connected && data?.testMode && (
          <p>Test mode: no real advertising payment is collected. Test payments cannot publish production listings.</p>
        )}
        <h2>Listing fees based on your asking price</h2>
        <div className="ac-health">
          {data?.bands?.map(b => (
            <div key={b.amountMinor}>
              <span>{b.label}</span>
              <b>{cash(b.amountMinor, 'GHS')}</b>
            </div>
          ))}
        </div>
        <p>
          Drafts are free to prepare. A listing needs its publishing fee and marketplace approval before it can appear
          publicly. The listing fee pays for advertising, not the vehicle.
        </p>
        {!data?.connected && (
          <p>
            Live Paystack keys are not required in this preview: use <b>Simulate Paystack Checkout</b> on any unpaid
            listing below to walk through Mobile Money (MTN MoMo, Telecel Cash, AT Money), Card, or USSD payment
            verification in SQLite.
          </p>
        )}
      </section>

      {admin && <PaymentPreparation request={request} csrf={csrf} />}
      <ListingRefunds request={request} csrf={csrf} admin={admin} refreshKey={refundRefresh} />

      {!data ? (
        <p role="status" className="ac-loading">
          Loading listing fees…
        </p>
      ) : admin ? (
        <section className="ac-panel ac-table-panel">
          <div className="ac-table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Reference</th>
                  <th>Seller</th>
                  <th>Listing</th>
                  <th>Listing fee</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map(p => (
                  <tr key={p.reference}>
                    <td>{p.reference}</td>
                    <td>{p.seller_id}</td>
                    <td>{p.vehicle_id}</td>
                    <td>{cash(p.amount_minor, p.currency)}</td>
                    <td>
                      {p.status}
                      {p.livemode ? '' : ' · test'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!data.items.length && <p className="ac-empty">No seller listing-fee payments yet.</p>}
        </section>
      ) : (
        <>
          <section className="ac-panel">
            <div className="ac-panel-head">
              <h2>Your listings</h2>
            </div>
            <div className="ac-health">
              {data.items.map(v => (
                <div key={v.id}>
                  <span>
                    <b>
                      {v.year} {v.make} {v.model}
                    </b>
                    <small className="sc-deadline">
                      Asking price: {cash(v.price_minor, v.currency)}
                      {v.feeAmountMinor !== null ? ` · Listing fee: ${cash(v.feeAmountMinor, 'GHS')}` : ''}
                    </small>
                    <small className="sc-deadline">
                      {v.feeAmountMinor === null
                        ? 'Set a GHS asking price to calculate your fee'
                        : v.feePaid
                          ? 'Publishing fee paid'
                          : v.status === 'draft'
                            ? 'Draft · submit for review first'
                            : 'Publishing fee required'}{' '}
                      · {v.status}
                    </small>
                  </span>
                  <div className="ac-inline">
                    <button
                      type="button"
                      className={v.feePaid ? 'ac-quiet' : 'ac-primary'}
                      disabled={
                        v.feeAmountMinor === null ||
                        v.feePaid ||
                        !!pending ||
                        !['pending', 'active', 'paused'].includes(v.status)
                      }
                      onClick={() =>
                        data.connected
                          ? action('checkout', { listingId: v.id }, v.id)
                          : startPaystackSimulation(v)
                      }
                    >
                      {pending === v.id
                        ? 'Opening Paystack…'
                        : v.feePaid
                          ? 'Paid'
                          : data.connected
                            ? 'Pay with Paystack'
                            : 'Simulate Paystack Checkout'}
                    </button>
                  </div>
                </div>
              ))}
              {!data.items.length && (
                <p className="ac-empty">Prepare a listing in Inventory, then return here to pay its publishing fee.</p>
              )}
            </div>
          </section>

          <section className="ac-panel sc-wallet-card">
            <h2>Listing payment history</h2>
            {data.payments.map(p => (
              <div className="ac-health" key={p.reference}>
                <div>
                  <span>
                    {cash(p.amount_minor, p.currency)} · {p.status}
                    {p.livemode ? '' : ' · test'}
                    <small className="sc-deadline">{p.reference}</small>
                  </span>
                  {p.status === 'paid' &&
                    (refundTarget === p.reference ? (
                      <div className="ac-inline">
                        <input
                          aria-label="Refund reason"
                          placeholder="Explain why you are requesting a refund…"
                          value={refundReason}
                          onChange={e => setRefundReason(e.target.value)}
                        />
                        <button
                          type="button"
                          className="ac-primary"
                          disabled={refundReason.trim().length < 10}
                          onClick={async () => {
                            try {
                              await request('/api/listing-refunds', {
                                method: 'POST',
                                csrf,
                                body: { reference: p.reference, reason: refundReason }
                              });
                              setRefundTarget('');
                              setRefundReason('');
                              setRefundRefresh(v => v + 1);
                            } catch (e) {
                              setError(e.message);
                            }
                          }}
                        >
                          Submit
                        </button>
                        <button
                          type="button"
                          className="ac-quiet"
                          onClick={() => {
                            setRefundTarget('');
                            setRefundReason('');
                          }}
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        className="ac-quiet"
                        onClick={() => {
                          setRefundTarget(p.reference);
                          setRefundReason('');
                        }}
                      >
                        Request refund
                      </button>
                    ))}
                  {p.status === 'pending' && (
                    <div className="ac-inline">
                      {String(p.reference).startsWith('pstk_sim_') ? (
                        <button
                          type="button"
                          className="ac-primary"
                          disabled={!!pending}
                          onClick={() => completePaystackSimulation('success', p.reference)}
                        >
                          Complete Paystack payment
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="ac-quiet"
                          disabled={!!pending}
                          onClick={() => action('verify', { reference: p.reference }, p.reference)}
                        >
                          Check payment
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ))}
            {!data.payments.length && (
              <p>No listing fees paid yet. There is no buyer checkout, seller wallet or payout account.</p>
            )}
          </section>
        </>
      )}
    </>
  );
}
