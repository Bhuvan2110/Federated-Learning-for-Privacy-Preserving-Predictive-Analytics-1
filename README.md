# FedShield — Federated Learning for Privacy-Preserving Predictive Analytics

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Framework: React 18](https://img.shields.io/badge/React-18-61dafb.svg)](https://react.dev/)
[![Engine: TypeScript](https://img.shields.io/badge/TypeScript-5.7-3178c6.svg)](https://www.typescriptlang.org/)
[![Bundler: Vite](https://img.shields.io/badge/Vite-6.3-646cff.svg)](https://vitejs.dev/)

**FedShield** is an advanced, production-grade web platform for **privacy-preserving federated machine learning and predictive analytics**. The platform enables multiple decentralized client nodes (e.g. hospitals, banking institutions, power grid substations) to collaboratively train global predictive models on private data **without raw data ever leaving client premises**.

Only masked, clipped, and noised weight updates are transmitted to the aggregator server, ensuring strict mathematical privacy guarantees via **$(\epsilon, \delta)$-Differential Privacy** and **Cryptographic Secure Aggregation**.

---

## 🌟 Key Highlights & Feature Matrix

| Feature Area | Implementation & Capabilities |
| :--- | :--- |
| 🛡️ **Federated Learning Algorithms** | Implements **FedAvg**, **FedProx** (proximal $\mu$-term), **SCAFFOLD** (control variates $c_i, c$), **FL + DP-SGD** (differentially private SGD), and **Centralized Baseline** models. |
| 🔒 **Privacy & Security** | Per-update norm clipping ($\|\Delta w\| \le C$), **Gaussian Mechanism** noise injection ($\sigma$), cumulative $\epsilon$-budget tracking, and **Secure Aggregation** pairwise masks. |
| 🤖 **Google AI Studio Voice Controller** | Embedded AI Assistant powered by Google AI Studio (Gemini 2.5 Flash). Features **Speech-to-Text voice control**, **Text-to-Speech spoken responses**, and hands-free website navigation. |
| 📁 **Dataset Vault & ZIP Importer** | Supports local **CSV** and **.zip archive** uploads with client-side unzipping via `JSZip`. Features **Remote Dataset URL Importer** and automatic continuous target binarization (median-split). |
| 📱 **QR Code Verification Portal** | Generates scannable QR verification certificates opening an interactive standalone **Verification Web Portal** (`/?verifyRun=`) displaying the full Confusion Matrix, ROC curves, and audit trail. |
| 🏢 **Client Registry Management** | Register extra custom client nodes, toggle participation on/off per round, delete nodes, or reset defaults. |
| 🔮 **Inference Engine & Analytics** | Interactive prediction console with natural language query parsing, feature contribution breakdown, holdout metric evaluation, and JSON model weight exports. |

---

## 🔬 Algorithmic Methods & Mathematical Rationale

### 1. Federated Averaging (FedAvg)
- **Method**: Computes a weighted average of client parameters based on sample counts:
  $$w^{t+1} = \sum_{i=1}^{K} \frac{n_i}{N} w_i^t$$
- **Rationale**: Serves as the foundational FL algorithm. Reduces network communication overhead by allowing clients to perform $E$ local training epochs before transmitting updates to the central aggregator.

### 2. Federated Proximal (FedProx)
- **Method**: Modifies the local objective function by adding a proximal regularization term:
  $$\min_{w} h_i(w; w^t) = L_i(w) + \frac{\mu}{2} \|w - w^t\|^2$$
- **Rationale**: Prevents local model weights from drifting excessively on heterogeneous (Non-IID) data splits (Dirichlet $\alpha < 0.5$) and accommodates partial participation.

### 3. SCAFFOLD (Stochastic Controlled Averaging)
- **Method**: Tracks client control variates $c_i$ and a global control variate $c$ to correct gradient step direction:
  $$g_{\text{scaffold}} = g + c - c_i$$
  $$c_i^{+} = c_i - c + \frac{w^t - w_i}{K \cdot \eta}$$
- **Rationale**: Completely eliminates client drift caused by non-IID label skew across edge nodes, accelerating convergence stability.

### 4. FL + DP-SGD (Federated Differentially Private SGD)
- **Method**: Combines sample-level/update-level $L_2$ norm clipping with Gaussian noise injection:
  $$\bar{\Delta w}_i = \Delta w_i \cdot \min\left(1, \frac{C}{\|\Delta w_i\|_2}\right)$$
  $$\tilde{\Delta w} = \sum_{i=1}^K \frac{n_i}{N} \bar{\Delta w}_i + \mathcal{N}\left(0, \sigma^2 I\right), \quad \sigma = \frac{2C}{n}\frac{\sqrt{2\ln(1.25/\delta)}}{\epsilon}$$
- **Rationale**: Provides mathematical $(\epsilon, \delta)$-Differential Privacy bounds to prevent membership inference attacks and data reconstruction attacks.

### 5. Cryptographic Secure Aggregation
- **Method**: Negotiates pairwise additive zero-sum masks $s_{i,j}$ between clients such that $\sum_{i,j} s_{i,j} = 0$.
- **Rationale**: Ensures the central server only observes aggregated global parameter sums, keeping individual client updates completely unreadable.

---

## 🏗️ System Architecture

```
                                  ┌─────────────────────────────────────────┐
                                  │           User Web Interface            │
                                  │   React 18 + TailwindCSS + Recharts     │
                                  └────────────────────┬────────────────────┘
                                                       │
                                  ┌────────────────────┴────────────────────┐
                                  │    Google AI Studio Assistant Agent     │
                                  │ Voice Input (STT) + Speech Synthesis    │
                                  └────────────────────┬────────────────────┘
                                                       │
                                  ┌────────────────────┴────────────────────┐
                                  │   In-Browser FL Simulation Engine     │
                                  │  (FedAvg, FedProx, SCAFFOLD, DP-SGD)    │
                                  └──────────┬───────────────────┬──────────┘
                                             │                   │
                     ┌───────────────────────┴──┐             ┌──┴───────────────────────┐
                     │ Client Edge Nodes (1..N) │             │ Aggregator Server State  │
                     │  • On-device SGD         │             │  • Masked Weight Sync    │
                     │  • Gradient Norm Clip C  │ ──────────> │  • Noise Addition σ      │
                     │  • SecAgg Pairwise Mask  │             │  • Holdout Validation    │
                     └──────────────────────────┘             └──────────────────────────┘
```

---

## 📂 Project Structure

```
src/
├── lib/
│   ├── flEngine.ts       # Core Federated Learning engine (FedAvg, FedProx, SCAFFOLD, DP-SGD)
│   ├── gemini.ts         # Google AI Studio API streaming client & website voice controller
│   ├── csv.ts            # CSV parser, column analyzer, and continuous target binarizer
│   ├── datasets.ts       # Benchmark datasets (Cardio, Credit, ICU, Churn, SmartGrid) & custom registry
│   ├── auth.tsx          # Authentication provider (Email/Password & Google Sign-In adapter)
│   ├── store.tsx         # Application state, run history, and client registry overrides
│   ├── types.ts          # Shared TypeScript type definitions
│   └── crosslink.ts      # Pub/Sub event bridge for inter-page navigation
├── components/
│   ├── AgentWidget.tsx   # Google AI Studio Copilot widget with Voice Control & TTS
│   ├── QrCodeModal.tsx   # Fast-scan QR code certificate modal & verifier
│   ├── Shell.tsx         # Responsive application layout shell & portal router
│   ├── ui.tsx            # UI design primitives (Button, Modal, Panel, Toggle, Ring)
│   ├── charts.tsx        # Convergence line charts, metric bars, and privacy curves
│   ├── icons.tsx         # Hand-drawn inline SVG icon library
│   └── viz.tsx           # Interactive FL pipeline & node network topology diagrams
└── pages/
    ├── Overview.tsx      # Platform dashboard, convergence comparison, and system metrics
    ├── TrainingLab.tsx   # Interactive FL simulation lab with algorithm & privacy controls
    ├── Predicting.tsx    # Natural language query prediction console & feature drivers
    ├── Clients.tsx       # Decentralized client node registry (Add, Turn Off, Delete nodes)
    ├── Datasets.tsx      # Dataset vault with CSV/ZIP file upload & Remote URL importer
    ├── Privacy.tsx       # Differential Privacy (ε, δ)-DP math ledger & trade-off curves
    ├── Analytics.tsx     # Holdout evaluation metrics, ROC curves, and confusion matrices
    ├── History.tsx       # Completed run audit trail & JSON model weight exports
    └── VerifyPortal.tsx  # Standalone verification web portal opened via QR code
```

---

## 🛠️ Quick Start & Local Setup

### Prerequisites
- **Node.js**: v18.0.0 or higher
- **npm**: v9.0.0 or higher

### Installation

1. **Clone the repository**:
   ```bash
   git clone https://github.com/Bhuvan2110/Federated-Learning-for-Privacy-Preserving-Predictive-Analytics-1.git
   cd Federated-Learning-for-Privacy-Preserving-Predictive-Analytics-1
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Configure Environment Variables**:
   Create a `.env` file in the root directory (refer to `.env.example`):
   ```env
   # Google AI Studio API Key (Get yours at https://aistudio.google.com/)
   VITE_GEMINI_API_KEY=YOUR_GEMINI_API_KEY_HERE
   VITE_GEMINI_MODEL=gemini-2.5-flash

   # Google Identity Services Client ID (Optional)
   VITE_GOOGLE_CLIENT_ID=YOUR_GOOGLE_CLIENT_ID_HERE
   ```

4. **Launch Local Development Server**:
   ```bash
   npm run dev
   ```
   Open your browser and navigate to **`http://localhost:3000/`**.

5. **Typecheck & Production Build**:
   ```bash
   npm run typecheck    # Validate TypeScript types
   npm run build        # Build production bundle in dist/
   ```

---

## 🔒 Security & Data Protection Principles

- **Zero Raw Data Transmission**: All local model training, CSV parsing, ZIP decompression, and feature standardization take place strictly inside the browser client.
- **No Hardcoded Secrets**: Secrets and API keys are loaded via environment variables or entered dynamically via the secure settings interface.
- **Auditability**: Every training run produces a cryptographically verifiable JSON weight artifact and scannable QR verification certificate.

---

## 📜 License

This project is licensed under the [MIT License](LICENSE).
