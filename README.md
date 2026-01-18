# ONNX Model Optimizer - Desktop App (Project Lightweight)

**Cross-platform desktop application for optimizing ONNX models and analyzing LLMs.**
Now supports a dual-track approach: **Track 1 (CNN/ONNX)** and **Track 2 (LLM/Transformer)**.

<img src="https://img.shields.io/badge/Status-Alpha-orange" />
<img src="https://img.shields.io/badge/Platform-Windows-blue" />
<img src="https://img.shields.io/badge/Electron-28%2B-47848F" />
<img src="https://img.shields.io/badge/React-19-61DAFB" />
<img src="https://img.shields.io/badge/Python-3.10%2B-3776AB" />

---

## 🏗️ Project Overview

This project consists of two main development tracks:

### **Track 1: CNN & Vision Models (Current)**
- **Input**: Single `.onnx` file.
- **Features**: Graph Visualization, Pruning, Quantization.
- **Status**: Visualization working. Pruning execution needs fixing.

### **Track 2: LLM & Transformers (Planned)**
- **Input**: Folder-based loading (`config.json`, `model.safetensors`).
- **Features**: Transformer block logic visualization, LLM-specific compression (AWQ, GPTQ).
- **Status**: In planning phase (Phase 3).

---

## 📦 Current Status (Features)

| Component | Status | Note |
| :--- | :--- | :--- |
| **Graph Visualization** | ✅ Working | Parsing ONNX nodes & Cytoscape rendering |
| **Model Upload** | ✅ Working | `.onnx` file support |
| **Automated Pruning** | ❌ **Buggy** | Backend logic exists but fails execution |
| **Manual Pruning** | ❌ **Missing** | UI for node selection/deletion not implemented |
| **Quantization** | ✅ Working | Basic INT8 dynamic quantization |
| **Benchmarks** | ⚠️ **Partial** | Dummy data only. No real CIFAR/ImageNet support yet. |

---

## 🚀 Quick Start

### Prerequisites
*   Node.js 18+
*   Python 3.10+ (Dependencies in `backend/requirements.txt`)

### Installation & Run
```bash
# 1. Install Frontend
npm install

# 2. Install Backend
cd backend && pip install -r requirements.txt && cd ..

# 3. Start App (Requires MCP servers configured)
npm run dev
```

---

## 🛠️ Configuration & Rules

*   **Project Rules**: See `RULES.md` for strict development guidelines (Template-first, MCP-first).
*   **Roadmap**: See `PROJECT_PLAN.md` for detailed Phase 2 (CNN Fix) and Phase 3 (LLM) plans.

---

## 🏗️ Architecture

```
project_lightweight/
├── backend/               # Python (FastAPI) - The Brain
│   ├── main.py            # API Endpoints
│   └── pruning.py         # Optimization Logic
├── electron/              # Electron - The Shell
│   ├── main.js            # Window Manager
│   └── preload.js         # Secure Bridge
├── frontend/              # React (Vite) - The Face
│   ├── src/components/    # UI Panels (Pruning, Graph, etc.)
│   └── store.js           # State Management
└── model.onnx             # Test Model
```

---

## 🤝 Contributing
Please follow the rules in `RULES.md`. All new pages must start from `.templates` (to be created in Phase 2).
