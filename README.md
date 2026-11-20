# Collectors Den Cafe — online ordering + POS + admin
Run: `npm install` → copy `.env.example` to `.env` (set JWT_SECRET, ADMIN_PASSWORD) → `export $(cat .env|xargs) && npm start`
Customers: `/` · Staff (POS, orders, admin): `/staff`
Roles: cashier (POS/orders) · manager (+menu, stock, reports) · owner (+staff, audit log)
Security: bcrypt(12), HttpOnly+SameSite=Strict JWT cookie, session revocation on logout/disable, 5-try lockout, CSRF token+origin check, Helmet CSP/HSTS, rate limits, zod validation, parameterized SQL, server-side pricing and stock checks in transactions, audit log.
Deploy behind HTTPS (Render/Railway/VPS + Caddy/Nginx); set NODE_ENV=production. Back up den.db regularly.
