from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.responses import FileResponse, JSONResponse
from fastapi.middleware.cors import CORSMiddleware
import onnx
from onnx import numpy_helper
import numpy as np
import os
import uuid
import time
from typing import Dict, Optional, List, Tuple
import onnxruntime as ort
import logging

from pruning import (
    prune_by_magnitude,
    prune_structured,
    prune_gradient_based,
    prune_pattern_based
)
# quantization and benchmark imports removed - not yet implemented
from graph_parser import parse_onnx_graph_hierarchical

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Session storage
sessions: Dict[str, Dict] = {}

app = FastAPI()

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:5174", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

def get_session_model(session_id: str) -> str:
    if session_id not in sessions:
        raise HTTPException(status_code=404, detail="Session not found")
    return sessions[session_id]["model_path"]

@app.get("/")
def read_root():
    return {"message": "ONNX Optimizer API"}

@app.get("/api/health")
def health_check():
    return {"status": "ok"}

@app.post("/api/upload-model")
async def upload_model(model_file: UploadFile = File(...)):
    """Upload ONNX model and return hierarchical graph structure"""
    try:
        if not model_file.filename.endswith('.onnx'):
            raise HTTPException(status_code=400, detail="Only .onnx files are supported")
        
        # Generate session ID
        session_id = str(uuid.uuid4())
        temp_path = f"/tmp/{session_id}_{model_file.filename}"
        
        # Save file
        contents = await model_file.read()
        with open(temp_path, 'wb') as f:
            f.write(contents)
        
        # Store session
        sessions[session_id] = {
            "model_path": temp_path,
            "created_at": time.time()
        }
        
        # Parse with hierarchical structure
        model = onnx.load(temp_path)
        graph_data = parse_onnx_graph_hierarchical(model)
        
        # Add session_id to response
        graph_data['session_id'] = session_id
        
        logger.info(f"Model uploaded: {len(graph_data['nodes'])} nodes, {len(graph_data['stages'])} stages")
        
        return graph_data
        
    except Exception as e:
        logger.error(f"Upload error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/prune-model")
async def prune_model(
    session_id: str = Form(...),
    method: str = Form("magnitude"),
    ratio: float = Form(0.3)
):
    """Prune with multiple methods"""
    try:
        model_path = get_session_model(session_id)
        model = onnx.load(model_path)
        
        if method == "magnitude":
            pruned, stats = prune_by_magnitude(model, ratio)
        elif method == "structured":
            pruned, stats = prune_structured(model, ratio)
        elif method == "gradient":
            pruned, stats = prune_gradient_based(model, ratio)
        elif method == "pattern":
            pruned, stats = prune_pattern_based(model, ratio)
        else:
            raise HTTPException(400, f"Unknown method: {method}")
        
        if not stats.get('success'):
            raise HTTPException(500, stats.get('error', 'Pruning failed'))
        
        output_path = f"/tmp/pruned_{session_id}.onnx"
        onnx.save(pruned, output_path)
        
        return FileResponse(
            output_path,
            media_type="application/octet-stream",
            filename=f"model_pruned_{method}.onnx"
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, str(e))

@app.post("/api/quantize-model")
async def quantize_model(session_id: str = Form(...)):
    """Quantize to INT8"""
    try:
        model_path = get_session_model(session_id)
        output_path = f"/tmp/quantized_{session_id}.onnx"
        
        quantize_dynamic(
            model_path,
            output_path,
            weight_type=QuantType.QUInt8
        )
        
        return FileResponse(
            output_path,
            media_type="application/octet-stream",
            filename="model_quantized.onnx"
        )
    except Exception as e:
        raise HTTPException(500, str(e))

@app.post("/api/benchmark")
async def benchmark_model(session_id: str = Form(...)):
    """Real benchmark with inference timing"""
    try:
        model_path = get_session_model(session_id)
        
        session = ort.InferenceSession(model_path)
        input_info = session.get_inputs()[0]
        shape = input_info.shape
        
        # Generate dummy input
        dummy_shape = [s if isinstance(s, int) else 1 for s in shape]
        dummy_input = np.random.randn(*dummy_shape).astype(np.float32)
        
        # Warmup
        for _ in range(10):
            session.run(None, {input_info.name: dummy_input})
        
        # Measure
        times = []
        for _ in range(100):
            start = time.time()
            session.run(None, {input_info.name: dummy_input})
            times.append(time.time() - start)
        
        avg_time_ms = np.mean(times) * 1000
        model_size_mb = os.path.getsize(model_path) / (1024 ** 2)
        
        model = onnx.load(model_path)
        total_params = count_parameters(model)
        
        # Estimate FLOPs (simplified)
        flops = total_params * 2  # Rough estimate
        
        return {
            "inference_ms": round(avg_time_ms, 2),
            "memory_mb": round(model_size_mb, 2),
            "flops": f"{flops / 1e9:.2f} GFLOPs",
            "model_size_mb": round(model_size_mb, 2),
            "total_params": total_params
        }
    except Exception as e:
        raise HTTPException(500, str(e))

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
