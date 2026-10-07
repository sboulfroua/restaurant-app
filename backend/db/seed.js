import bcrypt from 'bcryptjs';
import { q, pool } from '../src/db.js';

await q(`INSERT INTO users(name,username,password_hash,role) VALUES
  ('Manager','manager',$1,'manager'),('Serveur','waiter',$1,'waiter'),('Cuisine','kitchen',$1,'kitchen')
  ON CONFLICT DO NOTHING`, [await bcrypt.hash('admin123', 10)]);
for (let n = 1; n <= 10; n++) await q('INSERT INTO tables(number) VALUES($1) ON CONFLICT DO NOTHING', [n]);
const c = (await q(`INSERT INTO categories(name_fr,name_ar,sort_order) VALUES('Plats','الأطباق',2) RETURNING id`)).rows[0];
await q(`INSERT INTO items(category_id,name_fr,name_ar,desc_fr,price_cents,tags)
  VALUES($1,'Tajine poulet citron','طاجين الدجاج بالليمون','Olives et citron confit',6500,'{halal}')`, [c.id]);
await pool.end(); console.log('Seeded. Login: manager / admin123  (change it!)');