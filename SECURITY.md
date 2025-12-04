**Security Notes & Admin User Management**

- **Session secret**: Always set `SESSION_SECRET` in production. Example in `.env`:

```
SESSION_SECRET=your-strong-random-secret
```

- **Redis**: For persistent session store and lockout counters set `REDIS_URL`. Example:

```
REDIS_URL=redis://:password@redis-host:6379
```

- **Admin users file**: Use `secrets/admin_users.json` (not committed) or set `ADMIN_USERS_JSON` environment variable.

Example `secrets/admin_users.json` structure:

```json
[
  { "username": "admin", "passwordHash": "$2b$10$...", "role": "admin", "name": "Admin" }
]
```

- **Generate password hashes**: Use `node scripts/gen_bcrypt.js` and paste the resulting hash into the users file.

- **Login lockout**: Implemented lockout of failed login attempts. Configurable via env vars:
  - `LOCKOUT_MAX_ATTEMPTS` (default 5)
  - `LOCKOUT_WINDOW_SECONDS` (default 900 = 15 minutes)

- **Rotate secrets & keys**: If you committed private keys or credentials, rotate them immediately and remove them from the repository.

- **HTTPS**: Use HTTPS in production and ensure `SESSION_COOKIE_SECURE=true` (or set `NODE_ENV=production`).

- **Further hardening suggestions**:
  - Add CSRF protection for admin POST endpoints (`csurf`) and update the frontend to include tokens.
  - Use a secrets manager (Vault/Key Vault/AWS Secrets Manager) in production.
  - Move file-based "compras" storage to a proper database to avoid TOCTOU/path traversal issues.
  - Use structured logging (winston/pino) with sensitive data redaction.

If you want, I can also:
- Add an admin management endpoint to create users (protected), or
- Add an automated script that creates `secrets/admin_users.json` from a list of plaintext credentials and writes hashed passwords.
