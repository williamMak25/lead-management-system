import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { nanoid } from 'nanoid';
import passport, { hasAllowlist, isAllowedEmail, googleEnabled } from '../auth.js';
import { query } from '../db.js';
import { mapUser } from '../db/mappers.js';

const router = Router();

router.get('/config', (req, res) => {
  res.json({ googleEnabled });
});

router.get('/me', (req, res) => {
  res.json({ user: req.isAuthenticated() ? mapUser(req.user) : null });
});

router.post('/signup', async (req, res) => {
  const { name, email, password } = req.body;
  if (!name || !email || !password) {
    return res.status(400).json({ error: 'name, email, and password are required' });
  }
  if (password.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters' });
  }
  if (!hasAllowlist) {
    return res.status(500).json({ error: 'Sign-in is not configured yet. Set ALLOWED_EMAILS on the server.' });
  }
  const normalizedEmail = email.toLowerCase().trim();
  if (!isAllowedEmail(normalizedEmail)) {
    return res.status(403).json({ error: 'This email is not authorized to access this CRM.' });
  }

  const { rows: existing } = await query('SELECT id FROM users WHERE email = $1', [normalizedEmail]);
  if (existing.length > 0) {
    return res.status(409).json({ error: 'An account with this email already exists.' });
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const { rows } = await query(
    `INSERT INTO users (id, email, name, password_hash, last_login_at) VALUES ($1, $2, $3, $4, now()) RETURNING *`,
    [nanoid(8), normalizedEmail, name, passwordHash]
  );

  req.login(rows[0], (err) => {
    if (err) return res.status(500).json({ error: 'Could not start session' });
    res.status(201).json({ user: mapUser(rows[0]) });
  });
});

router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'email and password are required' });
  }
  const normalizedEmail = email.toLowerCase().trim();
  if (!isAllowedEmail(normalizedEmail)) {
    return res.status(403).json({ error: 'This email is not authorized to access this CRM.' });
  }

  const { rows } = await query('SELECT * FROM users WHERE email = $1', [normalizedEmail]);
  const user = rows[0];
  if (!user || !user.password_hash) {
    return res.status(401).json({ error: 'Invalid email or password.' });
  }
  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) {
    return res.status(401).json({ error: 'Invalid email or password.' });
  }

  await query('UPDATE users SET last_login_at = now() WHERE id = $1', [user.id]);
  req.login(user, (err) => {
    if (err) return res.status(500).json({ error: 'Could not start session' });
    res.json({ user: mapUser(user) });
  });
});

router.post('/logout', (req, res) => {
  req.logout((err) => {
    if (err) return res.status(500).json({ error: 'Could not log out' });
    req.session.destroy(() => {
      res.clearCookie('connect.sid');
      res.status(204).end();
    });
  });
});

router.get('/google', (req, res, next) => {
  if (!googleEnabled) return res.status(501).json({ error: 'Google sign-in is not configured on this server.' });
  passport.authenticate('google', { scope: ['profile', 'email'] })(req, res, next);
});

router.get('/google/callback', (req, res, next) => {
  if (!googleEnabled) return res.status(501).send('Google sign-in is not configured on this server.');
  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
  passport.authenticate('google', (err, user, info) => {
    if (err) {
      console.error(err);
      return res.redirect(`${frontendUrl}/login?error=server_error`);
    }
    if (!user) {
      const reason = info?.message === 'not_allowed' ? 'not_allowed' : 'google_failed';
      return res.redirect(`${frontendUrl}/login?error=${reason}`);
    }
    req.login(user, (loginErr) => {
      if (loginErr) return res.redirect(`${frontendUrl}/login?error=server_error`);
      res.redirect(frontendUrl);
    });
  })(req, res, next);
});

export default router;
