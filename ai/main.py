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
    prune_pattern_based,
    remove_layer_by_name,
    prune_single_node,
    count_parameters
)
from onnxruntime.quantization import quantize_dynamic, QuantType
from graph_parser import parse_onnx_graph_hierarchical, get_node_detailed_stats

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Session storage
sessions: Dict[str, Dict] = {}
session_history: Dict[str, List[str]] = {}

app = FastAPI()

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:5174", "http://127.0.0.1:5173", "file://*", "http://127.0.0.1:8000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

def get_session_model(session_id: str) -> str:
    if session_id not in sessions:
        raise HTTPException(status_code=404, detail="Session not found")
    return sessions[session_id]["model_path"]

def push_history(session_id: str):
    """Save current model path to history stack"""
    if session_id not in sessions:
        return
    
    current_path = sessions[session_id]["model_path"]
    if session_id not in session_history:
        session_history[session_id] = []
    
    # Store copy or path?
    # Since we overwrite or create new files, if we create new files every time, we can just store the path.
    # remove-node creates "removed_..."
    # prune creates "pruned_..."
    # So storing path is fine provided we don't delete them immediately.
    # However, if we overwrite, we need to copy.
    # The current logic creates NEW files mostly.
    
    # But to be safe against overwrite, let's create a backup version if it's the same name?
    # For now, just store the path, assuming immutability of past step files or unique naming.
    session_history[session_id].append(current_path)

@app.post("/api/undo")
async def undo_last_action(session_id: str = Form(...)):
    """Revert to previous model state"""
    if session_id not in session_history or not session_history[session_id]:
        raise HTTPException(400, "No history to undo")
    
    previous_path = session_history[session_id].pop()
    
    if not os.path.exists(previous_path):
         raise HTTPException(500, "History file missing")
    
    # Restore
    sessions[session_id]["model_path"] = previous_path
    
    # Parse graph
    model = onnx.load(previous_path)
    graph_data = parse_onnx_graph_hierarchical(model)
    graph_data['session_id'] = session_id
    graph_data['message'] = "Undone successfully"
    return graph_data


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
    """Prune and return the new graph structure (not file download)"""
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
            push_history(session_id) # Save history before change
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
        
        # 3. Save to temp
        output_path = f"/tmp/pruned_{current_session_id}_{int(time.time())}.onnx"
        onnx.save(pruned, output_path)
        
        # Update session
        sessions[current_session_id]["model_path"] = output_path
        
        # 4. Parse new graph for UI
        graph_data = parse_onnx_graph_hierarchical(pruned)
        graph_data['session_id'] = current_session_id
        graph_data['stats'] = stats # Pass stats to frontend
        
        return graph_data

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Pruning error: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(500, str(e))

@app.get("/api/download-model")
async def download_model(session_id: str):
    """Download the current session model"""
    try:
        model_path = get_session_model(session_id)
        filename = os.path.basename(model_path)
        if not filename.endswith('.onnx'):
            filename = "model.onnx"
            
        return FileResponse(
            model_path,
            media_type="application/octet-stream",
            filename=filename
        )
    except Exception as e:
        raise HTTPException(404, str(e))

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
            sessions[current_session_id] = {"model_path": temp_path, "created_at": time.time()}
        elif session_id:
            push_history(session_id) # Save history
            model_path = get_session_model(session_id)
            model = onnx.load(model_path)
        else:
            raise HTTPException(400, "Either session_id or model_file is required")

        # 2. Remove Layer
        modified_model, success, msg = remove_layer_by_name(model, node_name)
        
        if not success:
             # Just raise error, frontend will catch it
             raise HTTPException(500, f"Removal Failed: {msg}")

        # 3. Save & Return
        output_path = f"/tmp/removed_{current_session_id}_{int(time.time())}.onnx"
        onnx.save(modified_model, output_path)
        
        # Update session with new model path
        sessions[current_session_id]["model_path"] = output_path
        
        # 4. Parse new graph for UI
        graph_data = parse_onnx_graph_hierarchical(modified_model)
        graph_data['session_id'] = current_session_id
        graph_data['message'] = f"Node {node_name} removed successfully"
        
        return graph_data
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
            weight_type=QuantType.QUInt8,
            extra_options={'DisableShapeInference': True}
        )
        
        return FileResponse(
            output_path,
            media_type="application/octet-stream",
            filename="model_quantized.onnx"
        )
    except Exception as e:
        logger.error(f"Quantization error: {e}")
        import traceback
        traceback.print_exc()
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


@app.post("/api/get-node-details")
async def get_node_details(
    session_id: str = Form(...),
    node_name: str = Form(...)
):
    """
    Get granular details for a specific node (weights, channels, sparsity).
    """
    if session_id not in sessions:
        raise HTTPException(status_code=404, detail="Session not found")
    
    model_path = sessions[session_id]["model_path"]
    
    try:
        model = onnx.load(model_path)
        stats = get_node_detailed_stats(model, node_name)
        return stats
    except Exception as e:
        logger.error(f"Error fetching node details: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/apply-node-pruning")
async def apply_node_pruning(
    session_id: str = Form(...),
    node_name: str = Form(...),
    threshold: float = Form(0.1),
    mode: str = Form('unstructured') # 'structured' or 'unstructured'
):
    """
    Apply pruning to a single node.
    Currently only supports 'unstructured' (weight zeroing).
    'structured' is a placeholder.
    """
    if session_id not in sessions:
        raise HTTPException(status_code=404, detail="Session not found")

    if mode == 'structured':
         # User requested only button for now, logic not implemented
         return {'success': False, 'error': 'Structured pruning for single node not yet implemented.'}

    push_history(session_id) # Save current state to history

    model_path = sessions[session_id]["model_path"]
    try:
        model = onnx.load(model_path)
        
        # Apply Pruning
        success, msg, new_sparsity = prune_single_node(model, node_name, threshold)
        
        if not success:
             raise Exception(msg)

        # Save Result
        output_path = f"/tmp/node_pruned_{session_id}_{int(time.time())}.onnx"
        onnx.save(model, output_path)
        sessions[session_id]["model_path"] = output_path
        
        # Parse for Frontend
        graph_data = parse_onnx_graph_hierarchical(model)
        graph_data['session_id'] = session_id
        graph_data['stats'] = {
            'success': True,
            'message': msg,
            'node_id': node_name,
            'new_sparsity': new_sparsity
        }
        
        return graph_data

    except Exception as e:
        logger.error(f"Node pruning error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
