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
    session_id: Optional[str] = Form(None),
    model_file: Optional[UploadFile] = File(None),
    method: str = Form("magnitude"),
    ratio: float = Form(0.3)
):
    """Prune with multiple methods (Supports both session-based and file-upload based)"""
    try:
        model = None
        current_session_id = session_id

        # 1. Load Model
        if model_file:
            # Save uploaded file temporarily to process
            current_session_id = str(uuid.uuid4())
            temp_path = f"/tmp/{current_session_id}_{model_file.filename}"
            contents = await model_file.read()
            with open(temp_path, 'wb') as f:
                f.write(contents)
            model = onnx.load(temp_path)
            # Register session implicitly?
            sessions[current_session_id] = {"model_path": temp_path, "created_at": time.time()}
        elif session_id:
            model_path = get_session_model(session_id)
            model = onnx.load(model_path)
        else:
            raise HTTPException(400, "Either session_id or model_file is required")

        # 2. Apply Pruning
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
        
        # 3. Save & Return
        output_path = f"/tmp/pruned_{current_session_id}.onnx"
        onnx.save(pruned, output_path)
        
        # Update session
        sessions[current_session_id] = {
            "model_path": output_path,
            "created_at": time.time()
        }
        
        # Serialize stats to JSON string for header
        import json
        stats_header = json.dumps(stats)
        
        return FileResponse(
            output_path,
            media_type="application/octet-stream",
            filename=f"model_pruned_{method}.onnx",
            headers={"x-pruning-stats": stats_header, "x-session-id": current_session_id}
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Pruning error: {e}")
        raise HTTPException(500, str(e))

from pruning import remove_layer_by_name

@app.post("/api/remove-node")
async def remove_node(
    session_id: Optional[str] = Form(None),
    model_file: Optional[UploadFile] = File(None),
    node_name: str = Form(...)
):
    """Remove a specific node/layer by name"""
    try:
        model = None
        current_session_id = session_id

        # 1. Load Model
        if model_file:
            current_session_id = str(uuid.uuid4())
            temp_path = f"/tmp/{current_session_id}_{model_file.filename}"
            contents = await model_file.read()
            with open(temp_path, 'wb') as f:
                f.write(contents)
            model = onnx.load(temp_path)
        elif session_id:
            model_path = get_session_model(session_id)
            model = onnx.load(model_path)
        else:
            raise HTTPException(400, "Either session_id or model_file is required")

        # 2. Remove Layer
        modified_model, success = remove_layer_by_name(model, node_name)
        
        if not success:
             raise HTTPException(500, f"Failed to remove node '{node_name}'. Ensure it exists and connectivity can be preserved.")

        # 3. Save & Return
        output_path = f"/tmp/removed_{current_session_id}.onnx"
        onnx.save(modified_model, output_path)
        
        # Update session with new model path
        sessions[current_session_id] = {
            "model_path": output_path,
            "created_at": time.time()
        }
        
        return FileResponse(
            output_path,
            media_type="application/octet-stream",
            filename=f"model_removed_{node_name}.onnx",
            headers={"x-operation": "remove-node", "x-node": node_name, "x-session-id": current_session_id}
        )
    except Exception as e:
        logger.error(f"Remove node error: {e}")
        raise HTTPException(500, str(e))

@app.get("/api/graph")
async def get_graph(session_id: str):
    """Get the hierarchical graph structure for the current session model"""
    try:
        model_path = get_session_model(session_id)
        model = onnx.load(model_path)
        graph_data = parse_onnx_graph_hierarchical(model)
        graph_data['session_id'] = session_id
        return graph_data
    except Exception as e:
        logger.error(f"Get graph error: {e}")
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
async def benchmark_model(
    session_id: Optional[str] = Form(None),
    model_file: Optional[UploadFile] = File(None),
    dataset: str = Form("cifar10"),
    limit: int = Form(1000)
):
    """
    Run local benchmark on the model using actual dataset.
    """
    try:
        import benchmark
        
        current_session_id = session_id
        model_path = None
        
        if model_file:
            # Save uploaded file temporarily
            current_session_id = str(uuid.uuid4())
            temp_path = f"/tmp/{current_session_id}_{model_file.filename}"
            contents = await model_file.read()
            with open(temp_path, 'wb') as f:
                f.write(contents)
            model_path = temp_path
        elif session_id:
            model_path = get_session_model(session_id)
        else:
            raise HTTPException(400, "Either session_id or model_file is required")
            
        # Run benchmark
        # Note: evaluate_model downloads dataset if needed
        results = benchmark.evaluate_model(model_path, dataset, limit)
        
        # Cleanup if temp file
        if model_file and os.path.exists(model_path):
            os.remove(model_path)
            
        if "error" in results:
             raise HTTPException(500, results["error"])
             
        return JSONResponse(content=results)
    except Exception as e:
        logger.error(f"Benchmark error: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(500, str(e))

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
