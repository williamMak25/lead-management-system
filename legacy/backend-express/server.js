import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import session from 'express-session';
import connectPgSimple from 'connect-pg-simple';
import { pool } from './db.js';
import passport, { requireAuth } from './auth.js';
import authRouter from './routes/auth.js';
import companiesRouter from './routes/companies.js';
import contactsRouter from './routes/contacts.js';
import dealsRouter from './routes/deals.js';
import leadsRouter from './routes/leads.js';
import tasksRouter from './routes/tasks.js';
import notesRouter from './routes/notes.js';
import dashboardRouter from './routes/dashboard.js';

const app = express();
const PORT = process.env.PORT || 4000;
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';

app.set('trust proxy', 1);
app.use(cors({ origin: FRONTEND_URL, credentials: true }));
app.use(express.json());

const PgSession = connectPgSimple(session);
app.use(
  session({
    store: new PgSession({ pool, createTableIfMissing: true }),
    secret: process.env.SESSION_SECRET || 'dev-only-insecure-secret-change-me',
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 30 * 24 * 60 * 60 * 1000,
    },
  })
);

app.use(passport.initialize());
app.use(passport.session());

app.get('/api/health', (req, res) => res.json({ ok: true }));

app.use('/api/auth', authRouter);

app.use('/api/companies', requireAuth, companiesRouter);
app.use('/api/contacts', requireAuth, contactsRouter);
app.use('/api/deals', requireAuth, dealsRouter);
app.use('/api/leads', requireAuth, leadsRouter);
app.use('/api/tasks', requireAuth, tasksRouter);
app.use('/api/notes', requireAuth, notesRouter);
app.use('/api/dashboard', requireAuth, dashboardRouter);

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(PORT, () => {
  console.log(`CRM API listening on http://localhost:${PORT}`);
});
