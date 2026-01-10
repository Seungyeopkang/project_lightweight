# ONNX Model Optimizer - Desktop App

**Cross-platform desktop application for optimizing ONNX models with pruning, quantization, and performance benchmarking.**

<img src="https://img.shields.io/badge/Platform-Linux%20%7C%20Windows-blue" />
<img src="https://img.shields.io/badge/Electron-28%2B-47848F" />
<img src="https://img.shields.io/badge/React-19-61DAFB" />
<img src="https://img.shields.io/badge/Python-3.10%2B-3776AB" />

---

## 📦 Features

### ✅ Implemented
- **🔧 Model Pruning**: Magnitude-based structured pruning (10%-90%)
- **⚡ Quantization**: INT8 dynamic quantization  
- **📊 Benchmarking**: Parameter count, FLOPs, model size
- **📈 Metrics Comparison**: Before/after optimization analysis
- **🎨 Netron-style UI**: Dark, professional interface
- **🖼️ Graph Visualization**: Interactive model architecture (Cytoscape.js)

### 🚧 Planned
- Multiple quantization methods (INT4, FP16)
- Dataset accuracy testing (MNIST, CIFAR-10)
- Advanced pruning algorithms
- Plugin architecture

---

## 🚀 Quick Start

### Prerequisites
- Node.js 18+
- Python 3.10+
- npm or yarn

### Installation

```bash
# Clone repository
git clone <repo-url>
cd project_lightweight

# Install frontend dependencies
npm install

# Install Python backend dependencies
cd backend
pip install -r requirements.txt
cd ..
```

### Development

```bash
# Run development mode (starts Vite + Electron + Python backend)
npm run dev
```

This will:
1. Start Vite dev server (frontend) on port 5173
2. Launch Electron app
3. Start Python FastAPI backend on port 8000

### Testing

```bash
# Run backend API tests
./test_api.sh

# Manual testing - see TESTING.md for detailed guide
```

---

## 📊 Results

### Model Optimization Examples (ResNet50-based, 23.5M params)

| Optimization | Original | Optimized | Reduction |
|--------------|----------|-----------|-----------|
| **Pruning 30%** | 89.59 MB | 62.87 MB | -30% |
| **Quantization INT8** | 89.59 MB | 23 MB | -74% |
| **Parameters (30% prune)** | 23.5M | 16.5M | -30% |
| **FLOPs (30% prune)** | 8.02 G | 3.97 G | -50% |

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────┐
│           Electron Desktop App              │
│  ┌───────────────────────────────────────┐  │
│  │     React Frontend (Vite)             │  │
│  │  - PruningPanel                       │  │
│  │  - QuantizationPanel                  │  │
│  │  - MetricsPanel                       │  │
│  │  - ComparisonPanel                    │  │
│  └──────────────┬────────────────────────┘  │
│                 │ IPC                        │
│  ┌──────────────▼────────────────────────┐  │
│  │   Python Backend (FastAPI)            │  │
│  │  - Pruning (magnitude-based)          │  │
│  │  - Quantization (ONNX Runtime)        │  │
│  │  - Benchmarking (FLOPs, params)       │  │
│  └───────────────────────────────────────┘  │
└─────────────────────────────────────────────┘
```

### Key Components

#### Backend (`backend/`)
- `main.py`: FastAPI server with 6 endpoints
- `pruning.py`: Magnitude-based structured pruning
- `benchmark.py`: FLOPs calculation, metrics extraction
- `requirements.txt`: Python dependencies

#### Frontend (`frontend/src/`)
- `components/PruningPanel.jsx`: Pruning UI with slider
- `components/QuantizationPanel.jsx`: Quantization controls
- `components/MetricsPanel.jsx`: Real-time model metrics
- `components/ComparisonPanel.jsx`: Before/after comparison
- `components/GraphViewer.jsx`: Cytoscape visualization
- `store.js`: Zustand state management

#### Electron (`electron/`)
- `main.js`: Main process, window management, IPC handlers
- `preload.js`: Secure IPC bridge
- `python-bridge.js`: Python subprocess manager

---

## 🔧 API Endpoints

### Backend (Python FastAPI)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/health` | GET | Health check |
| `/api/upload-model` | POST | Upload & parse ONNX model |
| `/api/prune` | POST | Apply pruning (ratio 0.0-1.0) |
| `/api/quantize` | POST | INT8 quantization |
| `/api/benchmark` | POST | Get model metrics |
| `/api/model-info` | POST | Get layer info |

### IPC (Electron)

| Method | Description |
|--------|-------------|
| `uploadModel(path)` | Upload ONNX model |
| `pruneModel(path, ratio)` | Prune model |
| `quantizeModel(path)` | Quantize model |
| `getModelInfo(path)` | Get model info |
| `selectFile()` | Open file dialog |
| `saveFile(name)` | Save file dialog |

---

## 📖 Usage Example

```python
# Python: Direct pruning
from backend.pruning import prune_by_magnitude
import onnx

model = onnx.load('model.onnx')
pruned_model, stats = prune_by_magnitude(model, ratio=0.3)
print(f"Pruned {stats['pruning_ratio']:.2%} of parameters")
onnx.save(pruned_model, 'pruned_model.onnx')
```

```bash
# CLI: Quantize model
curl -X POST -F "model_file=@model.onnx" \
  http://localhost:8000/api/quantize \
  -o quantized_model.onnx
```

```javascript
// Electron: Complete workflow
const { electronAPI } = window;

// 1. Upload model
const file = await electronAPI.selectFile();
const result = await electronAPI.uploadModel(file.filePath);

// 2. Prune 40%
const pruned = await electronAPI.pruneModel(file.filePath, 0.4);

// 3. Save
const savePath = await electronAPI.saveFile('pruned_model.onnx');
await electronAPI.writeFile(savePath.filePath, pruned.data);
```

---

## 🧪 Development & Testing

### Run Tests
```bash
# Backend API test suite
./test_api.sh

# Python unit tests (if available)
cd backend && pytest
```

### Manual Testing Workflow
1. Start dev server: `npm run dev`
2. Upload `model.onnx` (89.59 MB, 23.5M params)
3. **Metrics Panel**: Verify shows correct stats
4. **Pruning**: Apply 30% pruning, save result
5. **Quantization**: Quantize to INT8, save result
6. **Comparison**: Capture before/after metrics

Expected results documented in `TESTING.md`.

---

## 📝 Project Structure

```
project_lightweight/
├── backend/
│   ├── main.py              # FastAPI server
│   ├── pruning.py           # Pruning algorithms
│   ├── benchmark.py         # Metrics calculation
│   └── requirements.txt     # Python deps
├── electron/
│   ├── main.js              # Electron main process
│   ├── preload.js           # IPC bridge
│   └── python-bridge.js     # Python subprocess
├── frontend/
│   ├── src/
│   │   ├── components/      # React components (10 files)
│   │   ├── App.jsx          # Main app
│   │   └── store.js         # Zustand store
│   └── vite.config.js       # Vite config
├── model.onnx               # Test model (89.59 MB)
├── package.json             # Node dependencies
├── TESTING.md               # Testing guide
└── README.md                # This file
```

---

## 🎨 Design Philosophy

**Netron-inspired Dark UI**: Professional, minimalistic interface with:
- Dark theme (#2a2a2a background)
- Color-coded panels (blue=pruning, green=quantization, indigo=metrics)
- Monospace fonts for technical data
- Clean card-based layouts

---

## 🛠️ Tech Stack

| Layer | Technology |
|-------|-----------|
| **Desktop** | Electron 28+ |
| **Frontend** | React 19, Vite, Cytoscape.js |
| **State** | Zustand |
| **Backend** | Python 3.10+, FastAPI |
| **ML** | ONNX, ONNXRuntime, PyTorch |
| **Build** | electron-builder (planned) |

---

## 📄 License

MIT (or your chosen license)

---

## 🤝 Contributing

Contributions welcome! Areas for improvement:
- [ ] Additional pruning algorithms (L1-norm, Taylor)
- [ ] More quantization methods (INT4, FP16)
- [ ] Dataset accuracy testing
- [ ] Latency benchmarking
- [ ] macOS support
- [ ] Automated packaging (Phase 4)

---

## 📧 Contact

For issues or questions, please open a GitHub issue.

---

**Status**: ✅ Phase 0-3 Complete | 🚧 Phase 4 (Packaging) Pending  
**Last Updated**: 2026-01-09  
**Version**: 0.3.0-alpha
