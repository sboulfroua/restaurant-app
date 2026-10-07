import { Router } from 'express';
import { q } from '../db.js';
import { requireRole } from '../auth.js';

const r = Router();
r.use(requireRole('manager'));

// Generic CRUD helper (column names are whitelisted → no SQL injection)
function crud(path, table, cols) {
  r.get(path, async (_q, res) => res.json((await q(`SELECT * FROM ${table} ORDER BY id`)).rows));
  r.post(path, async (req, res) => {
    const c = cols.filter(k => req.body[k] !== undefined);
    const { rows } = await q(
      `INSERT INTO ${table}(${c.join(',')}) VALUES(${c.map((_, i) => '$' + (i + 1)).join(',')}) RETURNING *`,
      c.map(k => req.body[k]));
    res.status(201).json(rows[0]);
  });
  r.put(`${path}/:id`, async (req, res) => {
    const c = cols.filter(k => req.body[k] !== undefined);
    const { rows } = await q(
      `UPDATE ${table} SET ${c.map((k, i) => `${k}=$${i + 2}`).join(',')} WHERE id=$1 RETURNING *`,
      [req.params.id, ...c.map(k => req.body[k])]);
    rows[0] ? res.json(rows[0]) : res.sendStatus(404);
  });
  r.delete(`${path}/:id`, async (req, res) => {
    await q(`DELETE FROM ${table} WHERE id=$1`, [req.params.id]); res.sendStatus(204);
  });
}
crud('/categories', 'categories', ['name_fr','name_ar','sort_order','active']);
crud('/items', 'items', ['category_id','name_fr','name_ar','desc_fr','desc_ar','price_cents','image_url','tags','in_stock','active','sort_order']);
crud('/option-groups', 'option_groups', ['item_id','name_fr','name_ar','multi','required']);
crud('/options', 'options', ['group_id','name_fr','name_ar','price_cents']);
crud('/tables', 'tables', ['number','active']);

// Quick "out of stock" toggle
r.patch('/items/:id/stock', async (req, res) => {
  const { rows } = await q('UPDATE items SET in_stock = NOT in_stock WHERE id=$1 RETURNING id,in_stock', [req.params.id]);
  res.json(rows[0]);
});

// QR URLs per table (frontend renders the QR image / printable sheet)
r.get('/tables/qr-links', async (req, res) => {
  const base = req.query.base || process.env.PUBLIC_URL || 'https://domain.com';
  const { rows } = await q('SELECT number, qr_token FROM tables WHERE active ORDER BY number');
  res.json(rows.map(t => ({ number: t.number, url: `${base}/table/${String(t.number).padStart(2, '0')}?t=${t.qr_token}` })));
});

// Daily Z-report (Morocco timezone)
r.get('/reports/z', async (req, res) => {
  const date = req.query.date || new Date().toISOString().slice(0, 10);
  const day = `(closed_at AT TIME ZONE 'Africa/Casablanca')::date = $1`;
  const totals = (await q(`
    SELECT COUNT(*)::int AS orders, COALESCE(SUM(total_cents),0)::int AS revenue_cents,
           COALESCE(AVG(total_cents),0)::int AS avg_order_cents,
           COALESCE(SUM(tax_cents),0)::int AS tax_cents
    FROM orders WHERE status='closed' AND ${day}`, [date])).rows[0];
  const byPayment = (await q(`
    SELECT payment_method, COUNT(*)::int AS orders, SUM(total_cents)::int AS revenue_cents
    FROM orders WHERE status='closed' AND ${day} GROUP BY payment_method`, [date])).rows;
  res.json({ date, ...totals, byPayment });
});

// Analytics: revenue per day, peak hours, top dishes
r.get('/reports/analytics', async (req, res) => {
  const from = req.query.from || new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10);
  const to = req.query.to || new Date().toISOString().slice(0, 10);
  const L = `(closed_at AT TIME ZONE 'Africa/Casablanca')`;
  const f = `status='closed' AND ${L}::date BETWEEN $1 AND $2`;
  const [daily, hours, top] = await Promise.all([
    q(`SELECT ${L}::date AS day, SUM(total_cents)::int AS revenue_cents, COUNT(*)::int AS orders
       FROM orders WHERE ${f} GROUP BY 1 ORDER BY 1`, [from, to]),
    q(`SELECT EXTRACT(HOUR FROM ${L})::int AS hour, COUNT(*)::int AS orders
       FROM orders WHERE ${f} GROUP BY 1 ORDER BY 1`, [from, to]),
    q(`SELECT oi.name_fr, oi.name_ar, SUM(oi.qty)::int AS qty, SUM(oi.qty*oi.unit_price_cents)::int AS revenue_cents
       FROM order_items oi JOIN orders o ON o.id=oi.order_id
       WHERE ${f.replaceAll('closed_at', 'o.closed_at').replace('status', 'o.status')}
       GROUP BY 1,2 ORDER BY qty DESC LIMIT 10`, [from, to]),
  ]);
  res.json({ daily: daily.rows, peakHours: hours.rows, topDishes: top.rows });
});

// Archive search
r.get('/archive', async (req, res) => {
  const { rows } = await q(`
    SELECT o.id, t.number AS table_number, o.total_cents, o.payment_method, o.created_at, o.closed_at
    FROM orders o JOIN tables t ON t.id=o.table_id
    WHERE o.status='closed' ORDER BY o.closed_at DESC LIMIT $1 OFFSET $2`,
    [Math.min(+req.query.limit || 50, 200), +req.query.offset || 0]);
  res.json(rows);
});

export default r;