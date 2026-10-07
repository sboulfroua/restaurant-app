import { pool, q } from './db.js';

export async function getOrder(id, client = pool) {
  const { rows } = await client.query(
    `SELECT o.*, t.number AS table_number,
       COALESCE((SELECT json_agg(oi ORDER BY oi.batch, oi.id)
                 FROM order_items oi WHERE oi.order_id=o.id), '[]') AS items
     FROM orders o JOIN tables t ON t.id=o.table_id WHERE o.id=$1`, [id]);
  return rows[0];
}

// lines: [{ itemId, qty, optionIds:[], note }]
export async function submitOrder(tableId, lines) {
  if (!lines?.length) throw Object.assign(new Error('Empty order'), { status: 400 });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const ids = lines.map(l => l.itemId);
    const items = (await client.query(
      'SELECT * FROM items WHERE id = ANY($1) AND active AND in_stock', [ids])).rows;
    const optRows = (await client.query(
      `SELECT o.*, g.item_id FROM options o JOIN option_groups g ON g.id=o.group_id
       WHERE g.item_id = ANY($1)`, [ids])).rows;

    const prepared = lines.map(l => {
      const item = items.find(i => i.id === l.itemId);
      if (!item) throw Object.assign(new Error(`Item ${l.itemId} unavailable`), { status: 409 });
      const qty = Math.min(Math.max(parseInt(l.qty) || 1, 1), 50);
      const chosen = optRows.filter(o => o.item_id === item.id && (l.optionIds || []).includes(o.id));
      const unit = item.price_cents + chosen.reduce((s, o) => s + o.price_cents, 0);
      return { item, qty, unit, note: (l.note || '').slice(0, 200),
        options: chosen.map(o => ({ name_fr: o.name_fr, name_ar: o.name_ar, price_cents: o.price_cents })) };
    });

    // Find or create the single active order (merge)
    let order;
    for (let attempt = 0; attempt < 2 && !order; attempt++) {
      order = (await client.query(
        `SELECT * FROM orders WHERE table_id=$1 AND status<>'closed' FOR UPDATE`, [tableId])).rows[0];
      if (!order) {
        try { order = (await client.query(
          'INSERT INTO orders(table_id) VALUES($1) RETURNING *', [tableId])).rows[0]; }
        catch (e) { if (e.code !== '23505') throw e; }   // race: someone else created it → retry
      }
    }
    const batch = order.batch_count + 1;
    for (const p of prepared) {
      await client.query(
        `INSERT INTO order_items(order_id,item_id,name_fr,name_ar,unit_price_cents,qty,options,note,batch)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [order.id, p.item.id, p.item.name_fr, p.item.name_ar, p.unit, p.qty,
         JSON.stringify(p.options), p.note, batch]);
    }
    await recalc(client, order.id, { batch, resetStatus: batch > 1 });
    await client.query('COMMIT');
    const full = await getOrder(order.id);
    return { order: full, merged: batch > 1 };
  } catch (e) { await client.query('ROLLBACK'); throw e; }
  finally { client.release(); }
}

async function recalc(client, orderId, { batch, resetStatus } = {}) {
  const s = (await client.query('SELECT * FROM settings WHERE id=1')).rows[0];
  const sub = (await client.query(
    'SELECT COALESCE(SUM(unit_price_cents*qty),0)::int AS s FROM order_items WHERE order_id=$1', [orderId])).rows[0].s;
  const tax = Math.round(sub * s.tax_rate / 100);
  const svc = Math.round(sub * s.service_rate / 100);
  // New items on an existing order bring it back to "new" so the kitchen notices
  await client.query(
    `UPDATE orders SET subtotal_cents=$2, tax_cents=$3, service_cents=$4, total_cents=$5,
       batch_count=COALESCE($6,batch_count),
       status = CASE WHEN $7 THEN 'new' ELSE status END
     WHERE id=$1`, [orderId, sub, tax, svc, sub + tax + svc, batch ?? null, !!resetStatus]);
}

const FLOW = { accept: ['new','preparing'], ready: ['preparing','ready'], served: ['ready','served'] };

export async function transition(orderId, action, userId, paymentMethod) {
  if (action === 'close') {
    if (!['cash','card'].includes(paymentMethod))
      throw Object.assign(new Error('payment_method required'), { status: 400 });
    const r = await q(
      `UPDATE orders SET status='closed', closed_at=now(), closed_by=$2, payment_method=$3
       WHERE id=$1 AND status<>'closed' RETURNING id`, [orderId, userId, paymentMethod]);
    if (!r.rowCount) throw Object.assign(new Error('Order not found or already closed'), { status: 409 });
  } else {
    const [from, to] = FLOW[action] || [];
    if (!from) throw Object.assign(new Error('Unknown action'), { status: 400 });
    const r = await q(
      `UPDATE orders SET status=$3,
         accepted_at = CASE WHEN $3='preparing' THEN now() ELSE accepted_at END,
         ready_at    = CASE WHEN $3='ready' THEN now() ELSE ready_at END
       WHERE id=$1 AND status=$2 RETURNING id`, [orderId, from, to]);
    if (!r.rowCount) throw Object.assign(new Error(`Order must be "${from}"`), { status: 409 });
  }
  return getOrder(orderId);
}