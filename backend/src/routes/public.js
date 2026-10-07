import { Router } from 'express';
import { q } from '../db.js';
import { submitOrder, getOrder } from '../orders.js';
import { emitOrder } from '../socket.js';

const r = Router();

async function tableFromToken(req) {
  const { rows } = await q('SELECT * FROM tables WHERE number=$1 AND qr_token=$2 AND active',
    [parseInt(req.params.number), req.query.t || req.body?.token]);
  return rows[0];
}

// Full menu with options, in one request
r.get('/menu', async (_req, res) => {
  const { rows } = await q(`
    SELECT c.*, COALESCE(json_agg(json_build_object(
      'id',i.id,'name_fr',i.name_fr,'name_ar',i.name_ar,'desc_fr',i.desc_fr,'desc_ar',i.desc_ar,
      'price_cents',i.price_cents,'image_url',i.image_url,'tags',i.tags,'in_stock',i.in_stock,
      'option_groups',(SELECT COALESCE(json_agg(json_build_object(
          'id',g.id,'name_fr',g.name_fr,'name_ar',g.name_ar,'multi',g.multi,'required',g.required,
          'options',(SELECT COALESCE(json_agg(o ORDER BY o.id),'[]') FROM options o WHERE o.group_id=g.id))),'[]')
        FROM option_groups g WHERE g.item_id=i.id)
    ) ORDER BY i.sort_order, i.id) FILTER (WHERE i.id IS NOT NULL), '[]') AS items
    FROM categories c LEFT JOIN items i ON i.category_id=c.id AND i.active
    WHERE c.active GROUP BY c.id ORDER BY c.sort_order, c.id`);
  const s = (await q('SELECT restaurant_name,tax_rate,service_rate FROM settings')).rows[0];
  res.json({ settings: s, categories: rows });
});

// Validate QR + return the table's current order (for status tracking)
r.get('/table/:number', async (req, res) => {
  const t = await tableFromToken(req);
  if (!t) return res.status(404).json({ error: 'Invalid table or QR code' });
  const { rows } = await q(`SELECT id FROM orders WHERE table_id=$1 AND status<>'closed'`, [t.id]);
  res.json({ table: { id: t.id, number: t.number }, order: rows[0] ? await getOrder(rows[0].id) : null });
});

// Send order (creates OR merges into the active order)
r.post('/table/:number/orders', async (req, res) => {
  const t = await tableFromToken(req);
  if (!t) return res.status(404).json({ error: 'Invalid table or QR code' });
  const { order, merged } = await submitOrder(t.id, req.body.lines);
  emitOrder(merged ? 'order:merged' : 'order:new', order);
  res.status(201).json({ order, merged });
});

export default r;