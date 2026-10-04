import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import { nanoid } from 'nanoid';
import { query } from './db.js';

const allowedEmails = (process.env.ALLOWED_EMAILS || '')
  .split(',')
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

export const hasAllowlist = allowedEmails.length > 0;

export function isAllowedEmail(email) {
  return hasAllowlist && allowedEmails.includes(String(email).toLowerCase());
}

export const googleEnabled = Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);

if (googleEnabled) {
  passport.use(
    new GoogleStrategy(
      {
        clientID: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        callbackURL: process.env.GOOGLE_CALLBACK_URL || 'http://localhost:4000/api/auth/google/callback',
      },
      async (accessToken, refreshToken, profile, done) => {
        try {
          const email = profile.emails?.[0]?.value?.toLowerCase();
          if (!email) return done(null, false, { message: 'no_email' });
          if (!isAllowedEmail(email)) return done(null, false, { message: 'not_allowed' });

          const avatarUrl = profile.photos?.[0]?.value || null;

          const { rows: byGoogle } = await query('SELECT * FROM users WHERE google_id = $1', [profile.id]);
          if (byGoogle.length > 0) {
            const { rows } = await query('UPDATE users SET last_login_at = now() WHERE id = $1 RETURNING *', [byGoogle[0].id]);
            return done(null, rows[0]);
          }

          const { rows: byEmail } = await query('SELECT * FROM users WHERE email = $1', [email]);
          if (byEmail.length > 0) {
            const { rows } = await query(
              `UPDATE users SET google_id = $1, avatar_url = COALESCE($2, avatar_url), last_login_at = now() WHERE id = $3 RETURNING *`,
              [profile.id, avatarUrl, byEmail[0].id]
            );
            return done(null, rows[0]);
          }

          const { rows } = await query(
            `INSERT INTO users (id, email, name, avatar_url, google_id, last_login_at)
             VALUES ($1, $2, $3, $4, $5, now()) RETURNING *`,
            [nanoid(8), email, profile.displayName || email, avatarUrl, profile.id]
          );
          return done(null, rows[0]);
        } catch (err) {
          return done(err);
        }
      }
    )
  );
}

passport.serializeUser((user, done) => done(null, user.id));

passport.deserializeUser(async (id, done) => {
  try {
    const { rows } = await query('SELECT * FROM users WHERE id = $1', [id]);
    done(null, rows[0] || false);
  } catch (err) {
    done(err);
  }
});

export function requireAuth(req, res, next) {
  if (!req.isAuthenticated?.()) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  next();
}

export default passport;
