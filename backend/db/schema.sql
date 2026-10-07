CREATE TABLE settings (
  id INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  restaurant_name TEXT NOT NULL DEFAULT 'Mon Restaurant',
  tax_rate NUMERIC(5,2) NOT NULL DEFAULT 10,      -- TVA restauration 10%
  service_rate NUMERIC(5,2) NOT NULL DEFAULT 0
);
INSERT INTO settings DEFAULT VALUES;

CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('manager','waiter','kitchen'))
);

CREATE TABLE tables (
  id SERIAL PRIMARY KEY,
  number INT UNIQUE NOT NULL,
  qr_token TEXT UNIQUE NOT NULL DEFAULT replace(gen_random_uuid()::text,'-',''),
  active BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE categories (
  id SERIAL PRIMARY KEY,
  name_fr TEXT NOT NULL, name_ar TEXT NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE items (
  id SERIAL PRIMARY KEY,
  category_id INT NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  name_fr TEXT NOT NULL, name_ar TEXT NOT NULL,
  desc_fr TEXT DEFAULT '', desc_ar TEXT DEFAULT '',
  price_cents INT NOT NULL CHECK (price_cents >= 0),
  image_url TEXT,
  tags TEXT[] NOT NULL DEFAULT '{}',              -- {'spicy','vegetarian','halal'}
  in_stock BOOLEAN NOT NULL DEFAULT TRUE,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INT NOT NULL DEFAULT 0
);

-- Customization: groups ("Cuisson", "Suppléments") and their options
CREATE TABLE option_groups (
  id SERIAL PRIMARY KEY,
  item_id INT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  name_fr TEXT NOT NULL, name_ar TEXT NOT NULL,
  multi BOOLEAN NOT NULL DEFAULT FALSE,           -- false = pick one
  required BOOLEAN NOT NULL DEFAULT FALSE
);
CREATE TABLE options (
  id SERIAL PRIMARY KEY,
  group_id INT NOT NULL REFERENCES option_groups(id) ON DELETE CASCADE,
  name_fr TEXT NOT NULL, name_ar TEXT NOT NULL,   -- "Sans oignons", "Extra fromage"
  price_cents INT NOT NULL DEFAULT 0
);

CREATE TABLE orders (
  id SERIAL PRIMARY KEY,
  table_id INT NOT NULL REFERENCES tables(id),
  status TEXT NOT NULL DEFAULT 'new'
    CHECK (status IN ('new','preparing','ready','served','closed')),
  batch_count INT NOT NULL DEFAULT 0,
  subtotal_cents INT NOT NULL DEFAULT 0,
  tax_cents INT NOT NULL DEFAULT 0,
  service_cents INT NOT NULL DEFAULT 0,
  total_cents INT NOT NULL DEFAULT 0,
  payment_method TEXT CHECK (payment_method IN ('cash','card')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  accepted_at TIMESTAMPTZ, ready_at TIMESTAMPTZ, closed_at TIMESTAMPTZ,
  closed_by INT REFERENCES users(id)
);
-- Only ONE open order per table → safe merging under concurrency
CREATE UNIQUE INDEX one_active_order_per_table ON orders(table_id) WHERE status <> 'closed';
CREATE INDEX idx_orders_closed_at ON orders(closed_at) WHERE status = 'closed';

CREATE TABLE order_items (
  id SERIAL PRIMARY KEY,
  order_id INT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  item_id INT REFERENCES items(id) ON DELETE SET NULL,
  name_fr TEXT NOT NULL, name_ar TEXT NOT NULL,   -- snapshots
  unit_price_cents INT NOT NULL,                  -- item + options
  qty INT NOT NULL CHECK (qty > 0),
  options JSONB NOT NULL DEFAULT '[]',            -- [{name_fr,name_ar,price_cents}]
  note TEXT DEFAULT '',
  batch INT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_order_items_order ON order_items(order_id);