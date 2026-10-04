--
-- PostgreSQL database dump
--

\restrict im8mzPlmcqu6Sqqo33jC2ZsutOertsK5162LGIevbXyWpHG7QbzcQDQTtvE4NSs

-- Dumped from database version 16.14
-- Dumped by pg_dump version 16.14

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: activity; Type: TABLE; Schema: public; Owner: crm
--

CREATE TABLE public.activity (
    id text NOT NULL,
    type text NOT NULL,
    message text NOT NULL,
    entity_type text,
    entity_id text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.activity OWNER TO crm;

--
-- Name: companies; Type: TABLE; Schema: public; Owner: crm
--

CREATE TABLE public.companies (
    id text NOT NULL,
    name text NOT NULL,
    industry text DEFAULT ''::text NOT NULL,
    website text DEFAULT ''::text NOT NULL,
    size text DEFAULT ''::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.companies OWNER TO crm;

--
-- Name: contacts; Type: TABLE; Schema: public; Owner: crm
--

CREATE TABLE public.contacts (
    id text NOT NULL,
    name text NOT NULL,
    email text DEFAULT ''::text NOT NULL,
    phone text DEFAULT ''::text NOT NULL,
    title text DEFAULT ''::text NOT NULL,
    company_id text,
    tags text[] DEFAULT '{}'::text[] NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.contacts OWNER TO crm;

--
-- Name: deals; Type: TABLE; Schema: public; Owner: crm
--

CREATE TABLE public.deals (
    id text NOT NULL,
    title text NOT NULL,
    company_id text,
    contact_id text,
    value numeric DEFAULT 0 NOT NULL,
    stage text DEFAULT 'New Lead'::text NOT NULL,
    expected_close_date timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.deals OWNER TO crm;

--
-- Name: leads; Type: TABLE; Schema: public; Owner: crm
--

CREATE TABLE public.leads (
    id text NOT NULL,
    name text NOT NULL,
    email text DEFAULT ''::text NOT NULL,
    phone text DEFAULT ''::text NOT NULL,
    company_name text DEFAULT ''::text NOT NULL,
    title text DEFAULT ''::text NOT NULL,
    source text DEFAULT 'Other'::text NOT NULL,
    status text DEFAULT 'New'::text NOT NULL,
    value numeric DEFAULT 0 NOT NULL,
    converted_company_id text,
    converted_contact_id text,
    converted_deal_id text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.leads OWNER TO crm;

--
-- Name: litestar_session; Type: TABLE; Schema: public; Owner: crm
--

CREATE TABLE public.litestar_session (
    id uuid NOT NULL,
    key character varying(255) NOT NULL,
    namespace character varying(255) NOT NULL,
    value bytea NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    sa_orm_sentinel integer
);


ALTER TABLE public.litestar_session OWNER TO crm;

--
-- Name: notes; Type: TABLE; Schema: public; Owner: crm
--

CREATE TABLE public.notes (
    id text NOT NULL,
    body text NOT NULL,
    deal_id text,
    contact_id text,
    lead_id text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.notes OWNER TO crm;

--
-- Name: tasks; Type: TABLE; Schema: public; Owner: crm
--

CREATE TABLE public.tasks (
    id text NOT NULL,
    title text NOT NULL,
    type text DEFAULT 'Other'::text NOT NULL,
    deal_id text,
    contact_id text,
    due_date timestamp with time zone DEFAULT now() NOT NULL,
    done boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.tasks OWNER TO crm;

--
-- Name: users; Type: TABLE; Schema: public; Owner: crm
--

CREATE TABLE public.users (
    id text NOT NULL,
    email text NOT NULL,
    name text DEFAULT ''::text NOT NULL,
    avatar_url text,
    password_hash text,
    google_id text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    last_login_at timestamp with time zone
);


ALTER TABLE public.users OWNER TO crm;

--
-- Data for Name: activity; Type: TABLE DATA; Schema: public; Owner: crm
--

COPY public.activity (id, type, message, entity_type, entity_id, created_at) FROM stdin;
0X6DwegL	deal_created	Deal "Fleet tracking platform rollout" created	deal	tvBk9dfn	2026-10-03 19:44:11.782788+00
0NZk8GYq	deal_created	Deal "Warehouse IoT sensors — Phase 1" created	deal	qOYk2oNM	2026-10-03 19:44:11.782834+00
Sf8qCGVM	deal_created	Deal "Robotics arm service contract" created	deal	fosxQ4_9	2026-10-03 19:44:11.782846+00
_giHG1wD	deal_created	Deal "EMR integration package" created	deal	HhS3PY9U	2026-10-03 19:44:11.782859+00
rWB07fgL	deal_created	Deal "Patient portal add-on" created	deal	80dPNjp1	2026-10-03 19:44:11.782869+00
geKwrcpv	deal_created	Deal "POS system refresh" created	deal	nxsTTPgb	2026-10-03 19:44:11.782878+00
vA8lpnXh	deal_created	Deal "Contract review automation" created	deal	c1Yz0Ob7	2026-10-03 19:44:11.782888+00
SzIp2alA	deal_created	Deal "Analytics dashboard seats — annual" created	deal	jJHORNtK	2026-10-03 19:44:11.782898+00
dq1u_JEK	deal_created	Deal "Data warehouse migration" created	deal	ebbvKF4L	2026-10-03 19:44:11.78291+00
jx0ph4KJ	lead_created	Lead "Harper Voss" added	lead	dhwQ1SUW	2026-10-03 19:44:11.782921+00
fky2JQwV	lead_created	Lead "Callum Reid" added	lead	TtEq9xOA	2026-10-03 19:44:11.782939+00
gY-OFKUN	lead_created	Lead "Nadia Farouk" added	lead	Ct6V2Ic5	2026-10-03 19:44:11.78295+00
N0oEp9P0	lead_created	Lead "Owen Blackwood" added	lead	qRyPeYmg	2026-10-03 19:44:11.782969+00
MVYv5h7a	lead_created	Lead "Simone Achterberg" added	lead	TF6s3kH5	2026-10-03 19:44:11.782983+00
\.


--
-- Data for Name: companies; Type: TABLE DATA; Schema: public; Owner: crm
--

COPY public.companies (id, name, industry, website, size, created_at) FROM stdin;
h9_QzemI	Aurora Freight Co.	Logistics	aurorafreight.com	51-200	2026-07-15 19:44:11.746661+00
9EOOAYHl	Basalt Robotics	Manufacturing	basaltrobotics.io	11-50	2026-07-31 19:44:11.760637+00
egYdekRi	Fernwood Health	Healthcare	fernwoodhealth.com	201-500	2026-06-05 19:44:11.760711+00
ZEH8f4kn	Cobalt & Vine Retail	Retail	cobaltvine.com	1-10	2026-09-03 19:44:11.76076+00
sNLEOlq7	Meridian Legal Group	Legal	meridianlegal.com	11-50	2026-08-19 19:44:11.760813+00
yXPXa_ae	Northstar Analytics	Software	northstaranalytics.dev	51-200	2026-03-17 19:44:11.760865+00
\.


--
-- Data for Name: contacts; Type: TABLE DATA; Schema: public; Owner: crm
--

COPY public.contacts (id, name, email, phone, title, company_id, tags, created_at) FROM stdin;
JhLHM109	Priya Nandakumar	priya.n@aurorafreight.com	+1 415 555 0148	VP Operations	h9_QzemI	{decision-maker}	2026-07-25 19:44:11.761064+00
br1comqn	Diego Marchetti	d.marchetti@aurorafreight.com	+1 415 555 0149	Logistics Manager	h9_QzemI	{}	2026-07-28 19:44:11.761155+00
1_tR6vMJ	Wren Okafor	wren@basaltrobotics.io	+1 212 555 0110	Founder	9EOOAYHl	{}	2026-07-31 19:44:11.761203+00
NlMghyiK	Sana Blythe	sana.blythe@fernwoodhealth.com	+1 617 555 0177	Director of IT	egYdekRi	{decision-maker}	2026-08-03 19:44:11.761249+00
0k6LUk93	Tomas Reyes	t.reyes@fernwoodhealth.com	+1 617 555 0178	Procurement Lead	egYdekRi	{}	2026-08-06 19:44:11.761289+00
YeLmr36V	Iris Falk	iris@cobaltvine.com	+1 312 555 0192	Owner	ZEH8f4kn	{}	2026-08-09 19:44:11.761333+00
SKK1uTkM	Malcolm Deveraux	malcolm@meridianlegal.com	+1 646 555 0133	Managing Partner	sNLEOlq7	{decision-maker}	2026-08-12 19:44:11.761379+00
Stmu3Kz0	Yuki Tanaka	yuki.tanaka@northstaranalytics.dev	+1 206 555 0166	Head of Sales	yXPXa_ae	{}	2026-08-15 19:44:11.761419+00
GLYecBFt	Odette Villanueva	odette@northstaranalytics.dev	+1 206 555 0167	CFO	yXPXa_ae	{}	2026-08-18 19:44:11.76146+00
\.


--
-- Data for Name: deals; Type: TABLE DATA; Schema: public; Owner: crm
--

COPY public.deals (id, title, company_id, contact_id, value, stage, expected_close_date, created_at, updated_at) FROM stdin;
tvBk9dfn	Fleet tracking platform rollout	h9_QzemI	JhLHM109	42000	Negotiation	2026-10-18 19:44:11.761645+00	2026-07-05 19:44:11.76165+00	2026-09-13 19:44:11.761653+00
qOYk2oNM	Warehouse IoT sensors — Phase 1	h9_QzemI	br1comqn	18500	Proposal Sent	2026-10-25 19:44:11.761726+00	2026-07-10 19:44:11.76173+00	2026-09-15 19:44:11.761733+00
fosxQ4_9	Robotics arm service contract	9EOOAYHl	1_tR6vMJ	76000	Contacted	2026-11-12 19:44:11.76178+00	2026-07-15 19:44:11.761783+00	2026-09-17 19:44:11.761785+00
HhS3PY9U	EMR integration package	egYdekRi	NlMghyiK	125000	Won	2026-09-28 19:44:11.761896+00	2026-07-20 19:44:11.761902+00	2026-09-19 19:44:11.761906+00
80dPNjp1	Patient portal add-on	egYdekRi	0k6LUk93	31000	New Lead	2026-12-02 19:44:11.762014+00	2026-07-25 19:44:11.762019+00	2026-09-21 19:44:11.762024+00
c1Yz0Ob7	Contract review automation	sNLEOlq7	SKK1uTkM	27500	Proposal Sent	2026-10-21 19:44:11.762201+00	2026-08-04 19:44:11.762205+00	2026-09-25 19:44:11.762207+00
jJHORNtK	Analytics dashboard seats — annual	yXPXa_ae	Stmu3Kz0	54000	Won	2026-07-05 19:44:11.762251+00	2026-08-09 19:44:11.762254+00	2026-09-27 19:44:11.762256+00
ebbvKF4L	Data warehouse migration	yXPXa_ae	GLYecBFt	61000	Lost	2026-09-03 19:44:11.762299+00	2026-08-14 19:44:11.762302+00	2026-09-29 19:44:11.762304+00
nxsTTPgb	POS system refresh	ZEH8f4kn	YeLmr36V	8600	New Lead	2026-10-15 19:44:11.762127+00	2026-07-30 19:44:11.762135+00	2026-10-03 19:51:47.516159+00
\.


--
-- Data for Name: leads; Type: TABLE DATA; Schema: public; Owner: crm
--

COPY public.leads (id, name, email, phone, company_name, title, source, status, value, converted_company_id, converted_contact_id, converted_deal_id, created_at, updated_at) FROM stdin;
dhwQ1SUW	Harper Voss	harper.voss@brightlanefinance.com	+1 503 555 0121	Brightlane Finance	Ops Director	Website	New	15000	\N	\N	\N	2026-10-01 19:44:11.780242+00	2026-10-01 19:44:11.780245+00
TtEq9xOA	Callum Reid	callum@ridgeportbrew.com	+1 971 555 0134	Ridgeport Brewing Co.	Owner	Referral	Contacted	9000	\N	\N	\N	2026-09-28 19:44:11.780354+00	2026-09-28 19:44:11.780356+00
Ct6V2Ic5	Nadia Farouk	nadia.farouk@stellarhealth.io	+1 720 555 0187	Stellar Health	VP Engineering	Event	Qualified	48000	\N	\N	\N	2026-09-24 19:44:11.780437+00	2026-09-24 19:44:11.78044+00
qRyPeYmg	Owen Blackwood	owen.b@ferrousmetal.com	+1 314 555 0165	Ferrous Metalworks	Plant Manager	Cold Call	New	22000	\N	\N	\N	2026-10-02 19:44:11.780517+00	2026-10-02 19:44:11.78052+00
TF6s3kH5	Simone Achterberg	simone@lumen-creative.studio	+1 646 555 0198	Lumen Creative Studio	Founder	Advertisement	Disqualified	4000	\N	\N	\N	2026-09-13 19:44:11.780595+00	2026-09-13 19:44:11.780597+00
\.


--
-- Data for Name: litestar_session; Type: TABLE DATA; Schema: public; Owner: crm
--

COPY public.litestar_session (id, key, namespace, value, expires_at, sa_orm_sentinel) FROM stdin;
b97c396f-f01d-4fdc-a316-cccf00371e06	aa82b002f7eb098a573c766c28b1709e4bf3531d961ba1341e3feb86c5752052	sessions	\\x7b7d	2026-11-03 15:27:11.146702+00	\N
4c3c9b6e-8f66-4f81-a42e-34d8a7f83761	2c22ee0c7b65ec139d343b6451379dd4a4e4dfbf59c46002d1d4f7fa416d77e8	sessions	\\x7b7d	2026-11-03 15:29:27.199126+00	\N
df52825a-b4c4-4c36-9a25-15deac211f5f	ef5a08b87b12bf8e3f53beea587c26f0f0362a6418f7146317d851dfddd066b2	sessions	\\x7b22757365725f6964223a22553363566e527273227d	2026-11-03 17:15:21.090085+00	\N
\.


--
-- Data for Name: notes; Type: TABLE DATA; Schema: public; Owner: crm
--

COPY public.notes (id, body, deal_id, contact_id, lead_id, created_at) FROM stdin;
qqz9-pIo	Priya wants a pilot with 5 trucks before committing to the full fleet.	tvBk9dfn	JhLHM109	\N	2026-09-18 19:44:11.779893+00
gbb6MxFQ	Wren is comparing us against two competitors, price sensitive.	fosxQ4_9	1_tR6vMJ	\N	2026-09-21 19:44:11.779937+00
rhYn69kD	Sana confirmed budget is approved for Q3.	HhS3PY9U	NlMghyiK	\N	2026-09-24 19:44:11.779965+00
YQ5Awdi9	Yuki mentioned they may expand seats by 20% next renewal.	jJHORNtK	Stmu3Kz0	\N	2026-09-27 19:44:11.779988+00
\.


--
-- Data for Name: tasks; Type: TABLE DATA; Schema: public; Owner: crm
--

COPY public.tasks (id, title, type, deal_id, contact_id, due_date, done, created_at) FROM stdin;
3a60PD3B	Call Priya to confirm rollout timeline	Call	tvBk9dfn	JhLHM109	2026-10-04 19:44:11.779486+00	f	2026-09-23 19:44:11.779498+00
K5HNgjc7	Send updated proposal PDF	Email	qOYk2oNM	br1comqn	2026-10-02 19:44:11.779595+00	f	2026-09-24 19:44:11.779599+00
RkvPFu2g	Discovery call with Wren	Meeting	fosxQ4_9	1_tR6vMJ	2026-10-05 19:44:11.779645+00	f	2026-09-25 19:44:11.779648+00
sSGxI0cN	Check in on EMR go-live	Follow-up	HhS3PY9U	NlMghyiK	2026-10-08 19:44:11.77969+00	f	2026-09-26 19:44:11.779692+00
0EztkYh-	Prep demo for patient portal	Meeting	80dPNjp1	0k6LUk93	2026-10-06 19:44:11.779729+00	f	2026-09-27 19:44:11.779731+00
vG5L8T4g	Follow up on POS quote	Follow-up	nxsTTPgb	YeLmr36V	2026-10-01 19:44:11.779765+00	f	2026-09-28 19:44:11.779767+00
A-0ghY_a	Review contract redlines	Other	c1Yz0Ob7	SKK1uTkM	2026-10-03 19:44:11.779814+00	f	2026-09-29 19:44:11.779817+00
jFUNxLgC	Renewal call — annual seats	Call	jJHORNtK	Stmu3Kz0	2026-10-13 19:44:11.779853+00	t	2026-09-30 19:44:11.779855+00
\.


--
-- Data for Name: users; Type: TABLE DATA; Schema: public; Owner: crm
--

COPY public.users (id, email, name, avatar_url, password_hash, google_id, created_at, last_login_at) FROM stdin;
U3cVnRrs	waiyanwinlwin25@gmail.com	zee	\N	$2b$12$jvGg2vImm.IL6BlnLoi3feIYbx66vJrLa7w5/S96EoEelzxUq.vnS	\N	2026-10-04 17:14:37.983364+00	2026-10-04 17:14:37.981968+00
\.


--
-- Name: activity activity_pkey; Type: CONSTRAINT; Schema: public; Owner: crm
--

ALTER TABLE ONLY public.activity
    ADD CONSTRAINT activity_pkey PRIMARY KEY (id);


--
-- Name: companies companies_pkey; Type: CONSTRAINT; Schema: public; Owner: crm
--

ALTER TABLE ONLY public.companies
    ADD CONSTRAINT companies_pkey PRIMARY KEY (id);


--
-- Name: contacts contacts_pkey; Type: CONSTRAINT; Schema: public; Owner: crm
--

ALTER TABLE ONLY public.contacts
    ADD CONSTRAINT contacts_pkey PRIMARY KEY (id);


--
-- Name: deals deals_pkey; Type: CONSTRAINT; Schema: public; Owner: crm
--

ALTER TABLE ONLY public.deals
    ADD CONSTRAINT deals_pkey PRIMARY KEY (id);


--
-- Name: leads leads_pkey; Type: CONSTRAINT; Schema: public; Owner: crm
--

ALTER TABLE ONLY public.leads
    ADD CONSTRAINT leads_pkey PRIMARY KEY (id);


--
-- Name: notes notes_pkey; Type: CONSTRAINT; Schema: public; Owner: crm
--

ALTER TABLE ONLY public.notes
    ADD CONSTRAINT notes_pkey PRIMARY KEY (id);


--
-- Name: litestar_session pk_litestar_session; Type: CONSTRAINT; Schema: public; Owner: crm
--

ALTER TABLE ONLY public.litestar_session
    ADD CONSTRAINT pk_litestar_session PRIMARY KEY (id);


--
-- Name: tasks tasks_pkey; Type: CONSTRAINT; Schema: public; Owner: crm
--

ALTER TABLE ONLY public.tasks
    ADD CONSTRAINT tasks_pkey PRIMARY KEY (id);


--
-- Name: litestar_session uq_litestar_session_key_namespace; Type: CONSTRAINT; Schema: public; Owner: crm
--

ALTER TABLE ONLY public.litestar_session
    ADD CONSTRAINT uq_litestar_session_key_namespace UNIQUE (key, namespace);


--
-- Name: users users_email_key; Type: CONSTRAINT; Schema: public; Owner: crm
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_email_key UNIQUE (email);


--
-- Name: users users_google_id_key; Type: CONSTRAINT; Schema: public; Owner: crm
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_google_id_key UNIQUE (google_id);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: crm
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: idx_activity_created; Type: INDEX; Schema: public; Owner: crm
--

CREATE INDEX idx_activity_created ON public.activity USING btree (created_at DESC);


--
-- Name: idx_contacts_company; Type: INDEX; Schema: public; Owner: crm
--

CREATE INDEX idx_contacts_company ON public.contacts USING btree (company_id);


--
-- Name: idx_deals_company; Type: INDEX; Schema: public; Owner: crm
--

CREATE INDEX idx_deals_company ON public.deals USING btree (company_id);


--
-- Name: idx_deals_contact; Type: INDEX; Schema: public; Owner: crm
--

CREATE INDEX idx_deals_contact ON public.deals USING btree (contact_id);


--
-- Name: idx_deals_stage; Type: INDEX; Schema: public; Owner: crm
--

CREATE INDEX idx_deals_stage ON public.deals USING btree (stage);


--
-- Name: idx_leads_created; Type: INDEX; Schema: public; Owner: crm
--

CREATE INDEX idx_leads_created ON public.leads USING btree (created_at DESC);


--
-- Name: idx_leads_status; Type: INDEX; Schema: public; Owner: crm
--

CREATE INDEX idx_leads_status ON public.leads USING btree (status);


--
-- Name: idx_notes_contact; Type: INDEX; Schema: public; Owner: crm
--

CREATE INDEX idx_notes_contact ON public.notes USING btree (contact_id);


--
-- Name: idx_notes_deal; Type: INDEX; Schema: public; Owner: crm
--

CREATE INDEX idx_notes_deal ON public.notes USING btree (deal_id);


--
-- Name: idx_notes_lead; Type: INDEX; Schema: public; Owner: crm
--

CREATE INDEX idx_notes_lead ON public.notes USING btree (lead_id);


--
-- Name: idx_tasks_contact; Type: INDEX; Schema: public; Owner: crm
--

CREATE INDEX idx_tasks_contact ON public.tasks USING btree (contact_id);


--
-- Name: idx_tasks_deal; Type: INDEX; Schema: public; Owner: crm
--

CREATE INDEX idx_tasks_deal ON public.tasks USING btree (deal_id);


--
-- Name: idx_tasks_due_date; Type: INDEX; Schema: public; Owner: crm
--

CREATE INDEX idx_tasks_due_date ON public.tasks USING btree (due_date);


--
-- Name: idx_users_google; Type: INDEX; Schema: public; Owner: crm
--

CREATE INDEX idx_users_google ON public.users USING btree (google_id);


--
-- Name: ix_litestar_session_expires_at; Type: INDEX; Schema: public; Owner: crm
--

CREATE INDEX ix_litestar_session_expires_at ON public.litestar_session USING btree (expires_at);


--
-- Name: contacts contacts_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: crm
--

ALTER TABLE ONLY public.contacts
    ADD CONSTRAINT contacts_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE SET NULL;


--
-- Name: deals deals_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: crm
--

ALTER TABLE ONLY public.deals
    ADD CONSTRAINT deals_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE SET NULL;


--
-- Name: deals deals_contact_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: crm
--

ALTER TABLE ONLY public.deals
    ADD CONSTRAINT deals_contact_id_fkey FOREIGN KEY (contact_id) REFERENCES public.contacts(id) ON DELETE SET NULL;


--
-- Name: leads leads_converted_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: crm
--

ALTER TABLE ONLY public.leads
    ADD CONSTRAINT leads_converted_company_id_fkey FOREIGN KEY (converted_company_id) REFERENCES public.companies(id) ON DELETE SET NULL;


--
-- Name: leads leads_converted_contact_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: crm
--

ALTER TABLE ONLY public.leads
    ADD CONSTRAINT leads_converted_contact_id_fkey FOREIGN KEY (converted_contact_id) REFERENCES public.contacts(id) ON DELETE SET NULL;


--
-- Name: leads leads_converted_deal_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: crm
--

ALTER TABLE ONLY public.leads
    ADD CONSTRAINT leads_converted_deal_id_fkey FOREIGN KEY (converted_deal_id) REFERENCES public.deals(id) ON DELETE SET NULL;


--
-- Name: notes notes_contact_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: crm
--

ALTER TABLE ONLY public.notes
    ADD CONSTRAINT notes_contact_id_fkey FOREIGN KEY (contact_id) REFERENCES public.contacts(id) ON DELETE CASCADE;


--
-- Name: notes notes_deal_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: crm
--

ALTER TABLE ONLY public.notes
    ADD CONSTRAINT notes_deal_id_fkey FOREIGN KEY (deal_id) REFERENCES public.deals(id) ON DELETE CASCADE;


--
-- Name: notes notes_lead_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: crm
--

ALTER TABLE ONLY public.notes
    ADD CONSTRAINT notes_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES public.leads(id) ON DELETE CASCADE;


--
-- Name: tasks tasks_contact_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: crm
--

ALTER TABLE ONLY public.tasks
    ADD CONSTRAINT tasks_contact_id_fkey FOREIGN KEY (contact_id) REFERENCES public.contacts(id) ON DELETE CASCADE;


--
-- Name: tasks tasks_deal_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: crm
--

ALTER TABLE ONLY public.tasks
    ADD CONSTRAINT tasks_deal_id_fkey FOREIGN KEY (deal_id) REFERENCES public.deals(id) ON DELETE CASCADE;


--
-- PostgreSQL database dump complete
--

\unrestrict im8mzPlmcqu6Sqqo33jC2ZsutOertsK5162LGIevbXyWpHG7QbzcQDQTtvE4NSs

