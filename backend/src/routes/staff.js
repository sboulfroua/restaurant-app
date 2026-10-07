import { Router } from 'express';
import { q } from '../db.js';
import { requireRole } from '../auth.js';
import { getOrder, transition } from '../orders.js';
import { emitOrder } from '../socket.js';

const r = Router();
r.use(requireRole('waiter', 'kitchen', 'manager'));

// Active orders, oldest first (queue)
r.get('/orders', async (_req, res) => {
  const { rows } = await q(`SELECT id FROM orders WHERE status<>'closed' ORDER BY created_at`);
  res.json(await Promise.all(rows.map(o => getOrder(o.id))));
});

// action: accept | ready | served | close
r.post('/orders/:id/:action', async (req, res) => {
  const { action } = req.params;
  if (action === 'close' && req.user.role === 'kitchen')
    return res.status(403).json({ error: 'Kitchen cannot close orders' });
  const order = await transition(+req.params.id, action, req.user.id, req.body.payment_method);
  emitOrder('order:updated', order);
  res.json(order);
});

export default r;