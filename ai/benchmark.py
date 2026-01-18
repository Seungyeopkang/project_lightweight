import os
import requests
import tarfile
import numpy as np
import onnxruntime as ort
from pathlib import Path

# Data directory
DATA_DIR = Path("backend/data")
DATA_DIR.mkdir(parents=True, exist_ok=True)

CIFAR10_URL = "https://www.cs.toronto.edu/~kriz/cifar-10-python.tar.gz"

def download_cifar10():
    """Download and extract CIFAR-10 if not exists."""
    tar_path = DATA_DIR / "cifar-10-python.tar.gz"
    extract_path = DATA_DIR / "cifar-10-batches-py"

    if extract_path.exists():
        return str(extract_path)

    print(f"Downloading CIFAR-10 to {tar_path}...")
    response = requests.get(CIFAR10_URL, stream=True)
    with open(tar_path, "wb") as f:
        for chunk in response.iter_content(chunk_size=8192):
            f.write(chunk)

    print("Extracting...")
    with tarfile.open(tar_path, "r:gz") as tar:
        tar.extractall(path=DATA_DIR)
    
    return str(extract_path)

def load_cifar10_batch(file):
    import pickle
    with open(file, 'rb') as f:
        dict = pickle.load(f, encoding='bytes')
    # Reshape to (N, 3, 32, 32) and normalize to [0,1]
    data = dict[b'data'].reshape(-1, 3, 32, 32).astype("float32") / 255.0
    labels = np.array(dict[b'labels'])
    return data, labels

def evaluate_model(model_path, dataset_name="cifar10", limit=1000):
    """Run inference on a subset of test data."""
    if dataset_name != "cifar10":
        return {"error": "Only CIFAR-10 supported currently"}

    data_path = download_cifar10()
    test_batch = Path(data_path) / "test_batch"
    
    # Load data
    images, labels = load_cifar10_batch(test_batch)
    
    # Limit for speed
    images = images[:limit]
    labels = labels[:limit]

    # Run Inference
    session = ort.InferenceSession(model_path)
    input_name = session.get_inputs()[0].name
    
    correct = 0
    import time
    start_time = time.time()
    
    # Batch processing could be optimized, but strict loop for simplicity first
    # Doing small batches
    batch_size = 100
    for i in range(0, len(images), batch_size):
        batch_imgs = images[i:i+batch_size]
        batch_labels = labels[i:i+batch_size]
        
        # ONNX Runtime expects specific input shape usually
        outputs = session.run(None, {input_name: batch_imgs})
        predictions = np.argmax(outputs[0], axis=1)
        correct += np.sum(predictions == batch_labels)

    total_time = time.time() - start_time
    accuracy = (correct / len(images)) * 100
    latency_ms = (total_time / len(images)) * 1000

    return {
        "accuracy": float(accuracy),
        "latency_ms": float(latency_ms),
        "samples": len(images)
    }
