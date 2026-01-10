"""
Improved ONNX Benchmark with better shape inference
"""
import onnx
from onnx import shape_inference
import numpy as np
from typing import Dict, List, Tuple
import os


def count_parameters(model: onnx.ModelProto) -> int:
    """Count total parameters"""
    total = 0
    for init in model.graph.initializer:
        if init.dims:
            total += np.prod(init.dims)
    return int(total)


def get_model_size(model_path: str) -> int:
    """Get file size in bytes"""
    return os.path.getsize(model_path)


def calculate_conv_flops(attrs: Dict, input_shape: List, output_shape: List) -> int:
    """Calculate Conv FLOPs"""
    if len(input_shape) < 4 or len(output_shape) < 4:
        return 0
    
    _, c_in, h_in, w_in = input_shape
    _, c_out, h_out, w_out = output_shape
    
    # Get kernel shape
    k_h, k_w = attrs.get('kernel_shape', [3, 3])
    
    # FLOPs = 2 * kernel_ops * output_elements
    kernel_ops = c_in * k_h * k_w
    output_elements = c_out * h_out * w_out
    
    return int(2 * kernel_ops * output_elements)


def calculate_gemm_flops(input_shape: List, output_shape: List, weight_shape: List) -> int:
    """Calculate Gemm/MatMul FLOPs"""
    if not input_shape or not output_shape:
        return 0
    
    # Gemm: (M x K) * (K x N) = M x N
    # FLOPs = 2 * M * K * N
    if len(input_shape) >= 2 and len(output_shape) >= 2:
        M = input_shape[0]  # batch
        K = input_shape[-1]  # input features
        N = output_shape[-1]  # output features
        
        return int(2 * M * K * N)
    
    return 0


def extract_shapes_from_model(model: onnx.ModelProto) -> Dict[str, List[int]]:
    """Extract tensor shapes using ONNX shape inference"""
    try:
        # Apply shape inference
        inferred_model = shape_inference.infer_shapes(model)
        
        shapes = {}
        
        # Get input shapes
        for inp in inferred_model.graph.input:
            shape = [d.dim_value if d.dim_value > 0 else 1 
                    for d in inp.type.tensor_type.shape.dim]
            shapes[inp.name] = shape
        
        # Get value info shapes (intermediate tensors)
        for value_info in inferred_model.graph.value_info:
            shape = [d.dim_value if d.dim_value > 0 else 1 
                    for d in value_info.type.tensor_type.shape.dim]
            shapes[value_info.name] = shape
        
        # Get output shapes
        for out in inferred_model.graph.output:
            shape = [d.dim_value if d.dim_value > 0 else 1 
                    for d in out.type.tensor_type.shape.dim]
            shapes[out.name] = shape
        
        # Get initializer shapes
        for init in model.graph.initializer:
            shapes[init.name] = list(init.dims)
        
        return shapes
    
    except Exception as e:
        print(f"Shape inference failed: {e}")
        # Fallback: get shapes from initializers only
        shapes = {}
        for init in model.graph.initializer:
            shapes[init.name] = list(init.dims)
        return shapes


def calculate_model_flops(model: onnx.ModelProto) -> Tuple[int, Dict]:
    """Calculate total FLOPs with improved shape inference"""
    shapes = extract_shapes_from_model(model)
    
    total_flops = 0
    layer_flops = []
    
    for node in model.graph.node:
        node_flops = 0
        attrs = {attr.name: list(attr.ints) if attr.ints else attr for attr in node.attribute}
        
        if node.op_type == 'Conv':
            input_name = node.input[0] if node.input else None
            output_name = node.output[0] if node.output else None
            
            if input_name in shapes and output_name in shapes:
                input_shape = shapes[input_name]
                output_shape = shapes[output_name]
                
                # Parse kernel_shape
                kernel_shape = [3, 3]  # default
                for attr in node.attribute:
                    if attr.name == 'kernel_shape':
                        kernel_shape = list(attr.ints)
                
                attrs['kernel_shape'] = kernel_shape
                node_flops = calculate_conv_flops(attrs, input_shape, output_shape)
        
        elif node.op_type in ['Gemm', 'MatMul']:
            input_name = node.input[0] if node.input else None
            output_name = node.output[0] if node.output else None
            weight_name = node.input[1] if len(node.input) > 1 else None
            
            if input_name in shapes and output_name in shapes:
                input_shape = shapes[input_name]
                output_shape = shapes[output_name]
                weight_shape = shapes.get(weight_name, []) if weight_name else []
                
                node_flops = calculate_gemm_flops(input_shape, output_shape, weight_shape)
        
        if node_flops > 0:
            total_flops += node_flops
            layer_flops.append({
                'name': node.output[0] if node.output else node.name,
                'type': node.op_type,
                'flops': node_flops
            })
    
    return total_flops, {'layers': layer_flops}


def get_model_metrics(model_path: str) -> Dict:
    """Get comprehensive model metrics"""
    model = onnx.load(model_path)
    
    params = count_parameters(model)
    file_size = get_model_size(model_path)
    total_flops, flops_breakdown = calculate_model_flops(model)
    
    return {
        'total_parameters': params,
        'file_size_bytes': file_size,
        'file_size_mb': round(file_size / (1024 * 1024), 2),
        'total_flops': total_flops,
        'flops_giga': round(total_flops / 1e9, 2),
        'flops_mega': round(total_flops / 1e6, 2),
        'layer_stats': flops_breakdown
    }


if __name__ == "__main__":
    import sys
    if len(sys.argv) > 1:
        metrics = get_model_metrics(sys.argv[1])
        print(f"\n📊 Model Metrics:")
        print(f"  Parameters: {metrics['total_parameters']:,}")
        print(f"  File Size: {metrics['file_size_mb']} MB")
        print(f"  FLOPs: {metrics['flops_giga']:.2f} GFLOPs ({metrics['flops_mega']:.0f} MFLOPs)")
        
        if metrics['layer_stats']['layers']:
            print(f"\n🔍 Top 5 layers by FLOPs:")
            layers = sorted(metrics['layer_stats']['layers'], 
                          key=lambda x: x['flops'], reverse=True)[:5]
            for layer in layers:
                print(f"  {layer['name']} ({layer['type']}): {layer['flops'] / 1e6:.2f} MFLOPs")
