import React, { useMemo } from 'react';
import {
  Chart as ChartJS, CategoryScale, LinearScale, BarElement, ArcElement, Tooltip, Legend,
} from 'chart.js';
import { Bar, Doughnut } from 'react-chartjs-2';
import {
  Wallet, Landmark, CreditCard, Globe, Building2, PiggyBank,
  ArrowDownCircle, ArrowUpCircle, Scale, AlertTriangle,
} from 'lucide-react';
import '../../styles/balanceSheet.css';

ChartJS.register(CategoryScale, LinearScale, BarElement, ArcElement, Tooltip, Legend);

/**
 * The balance sheet, read rather than tabulated.
 *
 * The report used to be the generic table every other report gets: five rows of
 * numbers with no sense of proportion, so "which account holds the money" and
 * "what actually moved this period" both took arithmetic to answer. Here each
 * account is a card that says what kind of account it is, where its closing
 * balance sits against the rest, and how much came in against how much went
 * out — with the company totals reconciled underneath.
 *
 * Opening + In − Out = Closing is stated per account and checked for the
 * company as a whole, because a balance sheet that does not add up is worse
 * than no balance sheet.
 */

/** Each kind of account gets its own mark, so a card is recognisable at a glance. */
const LOOK = {
  petty_cash: { Icon: Wallet, tint: '#d97706', soft: '#fef3c7', label: 'Petty cash' },
  ibft: { Icon: Landmark, tint: '#2563eb', soft: '#dbeafe', label: 'IBFT / bank transfer' },
  card_machine: { Icon: CreditCard, tint: '#7c3aed', soft: '#ede9fe', label: 'Card machine' },
  online_payment: { Icon: Globe, tint: '#0891b2', soft: '#cffafe', label: 'Online payment' },
  internal_company: { Icon: Building2, tint: '#059669', soft: '#d1fae5', label: 'Internal company' },
  bank: { Icon: Landmark, tint: '#1d4ed8', soft: '#dbeafe', label: 'Bank' },
  other: { Icon: PiggyBank, tint: '#64748b', soft: '#f1f5f9', label: 'Other' },
};
const lookOf = (type) => LOOK[type] || LOOK.other;

const money = (value) => `PKR ${Number(value || 0).toLocaleString('en-PK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const short = (value) => {
  const n = Math.abs(Number(value) || 0);
  if (n >= 1e7) return `${(n / 1e7).toFixed(1)}cr`;
  if (n >= 1e5) return `${(n / 1e5).toFixed(1)}L`;
  if (n >= 1e3) return `${Math.round(n / 1e3)}k`;
  return String(Math.round(n));
};

export default function BalanceSheet({ rows = [], summary = {}, period }) {
  const accounts = Array.isArray(rows) ? rows : [];

  const totals = useMemo(() => {
    const sum = (key) => accounts.reduce((t, r) => t + (Number(r[key]) || 0), 0);
    const opening = Number(summary.opening ?? sum('opening'));
    const moneyIn = Number(summary.total_in ?? sum('money_in'));
    const moneyOut = Number(summary.total_out ?? sum('money_out'));
    const closing = Number(summary.closing ?? sum('closing'));
    return {
      opening,
      moneyIn,
      moneyOut,
      closing,
      // A balance sheet that does not reconcile is worth saying out loud.
      reconciles: Math.abs(opening + moneyIn - moneyOut - closing) < 0.01,
      overLimit: accounts.filter((r) => r.over_limit).length,
      largest: accounts.reduce((max, r) => Math.max(max, Math.abs(Number(r.closing) || 0)), 0),
    };
  }, [accounts, summary]);

  if (!accounts.length) {
    return <p className="bs-empty">No accounts to report on yet — add one under Accounts &amp; Petty Cash.</p>;
  }

  const held = accounts.filter((r) => Number(r.closing) > 0);
  const doughnut = {
    labels: held.map((r) => r.account),
    datasets: [{
      data: held.map((r) => Number(r.closing) || 0),
      backgroundColor: held.map((r) => lookOf(r.type).tint),
      borderColor: '#fff',
      borderWidth: 2,
    }],
  };

  const movement = {
    labels: accounts.map((r) => r.account),
    datasets: [
      { label: 'In', data: accounts.map((r) => Number(r.money_in) || 0), backgroundColor: '#16a34a', borderRadius: 4 },
      { label: 'Out', data: accounts.map((r) => Number(r.money_out) || 0), backgroundColor: '#dc2626', borderRadius: 4 },
    ],
  };
  const movementOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { position: 'bottom', labels: { boxWidth: 12, font: { size: 11 } } },
      tooltip: { callbacks: { label: (c) => `${c.dataset.label}: ${money(c.raw)}` } },
    },
    scales: {
      x: { grid: { display: false }, ticks: { font: { size: 10 } } },
      y: { beginAtZero: true, ticks: { font: { size: 10 }, callback: (v) => short(v) }, grid: { color: '#eef2f7' } },
    },
  };

  return (
    <div className="bs">
      <div className="bs-head">
        <div>
          <h3>Balance Sheet</h3>
          <p>{period || 'All time'} · {accounts.length} account{accounts.length === 1 ? '' : 's'}</p>
        </div>
        <div className={`bs-reconcile ${totals.reconciles ? 'ok' : 'bad'}`}>
          <Scale size={15} />
          {totals.reconciles
            ? 'Opening + In − Out = Closing'
            : 'These figures do not reconcile — check the ledger'}
        </div>
      </div>

      {totals.overLimit > 0 && (
        <div className="bs-banner">
          <AlertTriangle size={16} />
          <span>{totals.overLimit} account{totals.overLimit === 1 ? ' is' : 's are'} over the limit set for {totals.overLimit === 1 ? 'it' : 'them'}.</span>
        </div>
      )}

      {/* The four figures the whole sheet resolves to. */}
      <div className="bs-totals">
        {[
          { key: 'opening', label: 'Opening', value: totals.opening, Icon: PiggyBank, tint: '#64748b' },
          { key: 'in', label: 'Money in', value: totals.moneyIn, Icon: ArrowDownCircle, tint: '#16a34a' },
          { key: 'out', label: 'Money out', value: totals.moneyOut, Icon: ArrowUpCircle, tint: '#dc2626' },
          { key: 'closing', label: 'Closing', value: totals.closing, Icon: Scale, tint: '#2563eb', strong: true },
        ].map(({ key, label, value, Icon, tint, strong }) => (
          <article key={key} className={`bs-total${strong ? ' strong' : ''}`}>
            <span className="bs-total-icon" style={{ color: tint, background: `${tint}18` }}><Icon size={19} /></span>
            <div>
              <small>{label}</small>
              <strong style={strong ? { color: tint } : undefined}>{money(value)}</strong>
            </div>
          </article>
        ))}
      </div>

      <div className="bs-charts">
        <section className="bs-chart">
          <h4>Where the money sits</h4>
          {held.length
            ? <div className="bs-chart-canvas"><Doughnut data={doughnut} options={{ responsive: true, maintainAspectRatio: false, cutout: '62%', plugins: { legend: { position: 'bottom', labels: { boxWidth: 12, font: { size: 11 } } }, tooltip: { callbacks: { label: (c) => `${c.label}: ${money(c.raw)}` } } } }} /></div>
            : <p className="bs-empty">No account is holding a positive balance.</p>}
        </section>
        <section className="bs-chart">
          <h4>What moved this period</h4>
          <div className="bs-chart-canvas"><Bar data={movement} options={movementOptions} /></div>
        </section>
      </div>

      {/* One card per account: what it is, what it holds, and what moved. */}
      <div className="bs-accounts">
        {accounts.map((row) => {
          const { Icon, tint, soft, label } = lookOf(row.type);
          const closing = Number(row.closing) || 0;
          const share = totals.largest > 0 ? Math.min(100, (Math.abs(closing) / totals.largest) * 100) : 0;
          const moved = (Number(row.money_in) || 0) + (Number(row.money_out) || 0);
          const inShare = moved > 0 ? ((Number(row.money_in) || 0) / moved) * 100 : 0;
          return (
            <article key={row.id || row.account} className={`bs-account${row.over_limit ? ' over' : ''}`}>
              <header>
                <span className="bs-account-icon" style={{ color: tint, background: soft }}><Icon size={20} /></span>
                <div className="bs-account-name">
                  <strong>{row.account}</strong>
                  <small>{label}</small>
                </div>
                <div className="bs-account-closing">
                  <small>Closing</small>
                  <strong style={{ color: closing < 0 ? '#dc2626' : '#0f172a' }}>{money(closing)}</strong>
                </div>
              </header>

              {/* How this account's balance compares with the largest one. */}
              <div className="bs-bar" title={`${share.toFixed(0)}% of the largest balance`}>
                <span style={{ width: `${share}%`, background: tint }} />
              </div>

              <dl className="bs-account-figures">
                <div><dt>Opening</dt><dd>{money(row.opening)}</dd></div>
                <div><dt>In</dt><dd style={{ color: '#16a34a' }}>{money(row.money_in)}</dd></div>
                <div><dt>Out</dt><dd style={{ color: '#dc2626' }}>{money(row.money_out)}</dd></div>
                <div>
                  <dt>Limit</dt>
                  <dd>{Number(row.limit) > 0 ? money(row.limit) : '—'}</dd>
                </div>
              </dl>

              {moved > 0 && (
                <div className="bs-flow" title={`In ${money(row.money_in)} · Out ${money(row.money_out)}`}>
                  <span className="in" style={{ width: `${inShare}%` }} />
                  <span className="out" style={{ width: `${100 - inShare}%` }} />
                </div>
              )}

              {row.over_limit && (
                <p className="bs-account-warn"><AlertTriangle size={13} /> Over its limit — move the excess to the internal company account.</p>
              )}
            </article>
          );
        })}
      </div>
    </div>
  );
}
