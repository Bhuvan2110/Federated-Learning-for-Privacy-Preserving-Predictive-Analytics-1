# FedShield — Federated Learning for Privacy-Preserving Predictive Analytics

A production-style web platform that demonstrates **privacy-preserving federated learning** end to end:
multiple decentralized clients train local models on private data, and only **clipped, noised, masked weight
deltas** ever reach the server. The server aggregates them (FedAvg / FedProx) into a global model used for
predictive analytics — while **zero raw records** leave a client.

Built as a final-year project demo: every mechanism (non-IID splits, differential privacy, secure aggregation,
convergence telemetry, centralized baselines) runs live in the browser via a real in-browser FL engine.

---

## Feature map

| Area | What's implemented |
|---|---|
| **Authentication** | Email + password (SHA-256 hashed), registration, login, password validation w/ strength meter, forgot/reset flow (6-digit code + simulated inbox), Google OAuth 2.0 (simulated consent screen, Firebase-compatible adapter), logout |
| **Guest / Demo Mode** | "Skip for now" enters a clearly-badged Guest Mode with full dashboard + training access; exports, run deletion and the client registry stay locked |
| **FL workflow** | Dataset → distribution → clients → local training → privacy protection → secure aggregation → global model → predictive analytics, visualized as a live 8-stage pipeline and animated server↔client topology |
| **Engine** | Logistic-regression models, full-batch SGD, **FedAvg** + **FedProx** (proximal term μ), Dirichlet non-IID partitions, partial participation, per-round server-side evaluation on a holdout set |
| **Privacy** | Update **clipping** (‖Δw‖ ≤ C), **Gaussian mechanism** σ = (2C/n)·√(2 ln(1.25/δ))/ε, ε budget tracking (basic + √R composition), interactive noise-mechanism lab, **secure aggregation** with cancelling pairwise masks |
| **Analytics** | Single-record predictions with probability, top feature contributions, latency; holdout metrics (accuracy, precision, recall, F1, AUC, log-loss), derived confusion matrix, centralized-vs-federated comparison, JSON exports |
| **Dashboards** | Overview stats + convergence charts, client registry, dataset vault with local-only previews, privacy center, training history with per-round telemetry |

## Architecture

```
Frontend (React + Vite + Tailwind)
        │
Authentication adapter  ── email/password · Google OAuth · guest mode
        │                 (Firebase-compatible interface; swap in the real SDK)
Application store       ── runs · client registry · navigation · toasts
        │
Federated Learning engine (src/lib/flEngine.ts)
        │  broadcast wₜ ──► client models (local SGD, on-device data only)
        │  ◄── clipped Δw + 𝒩(0,σ²), wrapped in SecAgg masks
        │  FedAvg / FedProx aggregation ──► global model
        │
Prediction API          ── in-browser inference + contribution explanations
        │
Analytics dashboard     ── charts, metrics, privacy ledger, history
```

Everything is modular:

```
src/
├── lib/
│   ├── types.ts        # shared domain types
│   ├── datasets.ts     # seeded synthetic datasets + Dirichlet non-IID partitioning
│   ├── flEngine.ts     # FedAvg/FedProx, DP (clipping + Gaussian), secure aggregation, metrics
│   ├── auth.tsx        # Firebase-compatible auth adapter (localStorage demo backend)
│   ├── store.tsx       # app state: runs, registry, navigation, toasts
│   └── crosslink.ts    # tiny pub/sub between pages
├── components/
│   ├── icons.tsx       # hand-drawn inline SVG icon set
│   ├── ui.tsx          # buttons, panels, modals, toggles, toasts, rings…
│   ├── charts.tsx      # hand-rolled SVG charts (line, bars, sparkline, PDF curves)
│   ├── viz.tsx         # FL pipeline + network topology visualizations
│   └── Shell.tsx       # sidebar, topbar, guest banner
└── pages/              # AuthPage, Overview, TrainingLab, Clients, Datasets,
                        # Privacy, Analytics, History
```

## Security & privacy notes

- **No raw client data is transmitted or stored server-side.** The engine only moves weight deltas; the
  console even audits this (`raw rows transmitted: 0` by construction).
- **Guests are a separate trust tier**: they can explore and train, but model export, run deletion and
  registry mutation are disabled in the UI and would be rejected by API guards in the production backend.
- **Secrets**: nothing is hard-coded. To go live with Firebase, create `.env` with
  `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_APP_ID`
  and swap the adapter in `src/lib/auth.tsx` — the rest of the app only consumes the `useAuth()` interface.
- All user inputs are validated (email format, password policy, reset codes, slider bounds).

## Run it

```bash
npm install
npm run dev      # local development
npm run build    # production build (dist/)
```

## Demo walkthrough (for the viva)

1. **Skip for now** → Guest Mode (note the amber banner + locked exports).
2. **Overview** → pre-seeded runs show federated vs centralized convergence.
3. **Training Lab** → pick a dataset, set ε, toggle secure aggregation, start → watch packets flow
   client → server, DP events in the console, live accuracy/F1/ε tiles.
4. **Privacy Center** → drag ε and see the Gaussian noise widen; read the ε ledger and trade-off frontier.
5. **Analytics** → run a prediction, inspect feature contributions and the confusion matrix.
6. Register an account → exports and registry editing unlock.
