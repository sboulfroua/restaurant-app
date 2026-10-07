import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { q } from './db.js';

export async function login(req, res) {
  const { username, password } = req.body;
  const { rows } = await q('SELECT * FROM users WHERE username=$1', [username]);
  const u = rows[0];
  if (!u || !(await bcrypt.compare(password, u.password_hash)))
    return res.status(401).json({ error: 'Invalid credentials' });
  const token = jwt.sign({ id: u.id, role: u.role, name: u.name }, process.env.JWT_SECRET, { expiresIn: '12h' });
  res.json({ token, user: { id: u.id, name: u.name, role: u.role } });
}

export const verify = (token) => jwt.verify(token, process.env.JWT_SECRET);

export const requireRole = (...roles) => (req, res, next) => {
  try {
    const user = verify((req.headers.authorization || '').replace('Bearer ', ''));
    if (roles.length && !roles.includes(user.role)) return res.status(403).json({ error: 'Forbidden' });
    req.user = user; next();
  } catch { res.status(401).json({ error: 'Unauthorized' }); }
};