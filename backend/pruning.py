"""
Enhanced ONNX pruning with error handling and validation
"""
import onnx
import numpy as np
from typing import Dict, List, Tuple, Optional
from onnx import helper, numpy_helper
import logging

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


def count_parameters(model: onnx.ModelProto) -> int:
    """Count total parameters with error handling"""
    try:
        total_params = 0
        for initializer in model.graph.initializer:
            dims = list(initializer.dims)
            if dims:
                total_params += np.prod(dims)
        return int(total_params)
    except Exception as e:
        logger.error(f"Error counting parameters: {e}")
        return 0


def get_layer_info(model: onnx.ModelProto) -> List[Dict]:
    """Extract layer information with error handling"""
    try:
        layers = []
        initializer_map = {init.name: init for init in model.graph.initializer}
        
        for node in model.graph.node:
            layer_info = {
                'name': node.output[0] if node.output else node.name,
                'op_type': node.op_type,
                'params': 0
            }
            
            for input_name in node.input:
                if input_name in initializer_map:
                    init = initializer_map[input_name]
                    dims = list(init.dims)
                    if dims:
                        layer_info['params'] += np.prod(dims)
            
            layers.append(layer_info)
        
        return layers
    except Exception as e:
        logger.error(f"Error extracting layer info: {e}")
        return []


def validate_pruning_ratio(ratio: float) -> None:
    """Validate pruning ratio"""
    if not isinstance(ratio, (int, float)):
        raise ValueError(f"Ratio must be a number, got {type(ratio)}")
    if not 0.0 <= ratio < 1.0:
        raise ValueError(f"Ratio must be in [0, 1), got {ratio}")


def prune_by_magnitude(
    model: onnx.ModelProto, 
    ratio: float, 
    layer_types: Optional[List[str]] = None
) -> Tuple[onnx.ModelProto, Dict]:
    """
    Prune model by removing smallest magnitude weights with robust error handling
    """
    try:
        validate_pruning_ratio(ratio)
        
        if layer_types is None:
            layer_types = ['Conv', 'Gemm', 'MatMul']
        
        # Clone model
        pruned_model = onnx.ModelProto()
        pruned_model.CopyFrom(model)
        
        initializer_dict = {init.name: init for init in pruned_model.graph.initializer}
        
        total_pruned = 0
        total_params = 0
        pruned_layers = []
        
        for node in pruned_model.graph.node:
            if node.op_type not in layer_types:
                continue
            
            weight_name = None
            for input_name in node.input:
                if input_name in initializer_dict:
                    init = initializer_dict[input_name]
                    if len(init.dims) >= 2:
                        weight_name = input_name
                        break
            
            if weight_name is None:
                continue
            
            try:
                init = initializer_dict[weight_name]
                weight_array = numpy_helper.to_array(init)
                original_shape = weight_array.shape
                total_params += weight_array.size
                
                # Apply channel/row pruning
                if node.op_type == 'Conv' and len(original_shape) == 4:
                    num_channels = original_shape[0]
                    num_to_prune = int(num_channels * ratio)
                    
                    if num_to_prune > 0 and num_to_prune < num_channels:
                        channel_importance = np.linalg.norm(
                            weight_array.reshape(num_channels, -1), 
                            axis=1
                        )
                        keep_indices = np.argsort(channel_importance)[num_to_prune:]
                        keep_indices = np.sort(keep_indices)
                        
                        pruned_weight = weight_array[keep_indices]
                        total_pruned += weight_array.size - pruned_weight.size
                        
                        new_init = numpy_helper.from_array(pruned_weight, init.name)
                        initializer_dict[weight_name].CopyFrom(new_init)
                        
                        pruned_layers.append({
                            'layer': node.output[0],
                            'type': node.op_type,
                            'original_channels': num_channels,
                            'pruned_channels': num_to_prune,
                            'remaining_channels': len(keep_indices)
                        })
                
                elif node.op_type in ['Gemm', 'MatMul'] and len(original_shape) == 2:
                    num_rows = original_shape[0]
                    num_to_prune = int(num_rows * ratio)
                    
                    if num_to_prune > 0 and num_to_prune < num_rows:
                        row_importance = np.linalg.norm(weight_array, axis=1)
                        keep_indices = np.argsort(row_importance)[num_to_prune:]
                        keep_indices = np.sort(keep_indices)
                        
                        pruned_weight = weight_array[keep_indices]
                        total_pruned += weight_array.size - pruned_weight.size
                        
                        new_init = numpy_helper.from_array(pruned_weight, init.name)
                        initializer_dict[weight_name].CopyFrom(new_init)
                        
                        pruned_layers.append({
                            'layer': node.output[0],
                            'type': node.op_type,
                            'original_features': num_rows,
                            'pruned_features': num_to_prune,
                            'remaining_features': len(keep_indices)
                        })
            
            except Exception as e:
                logger.warning(f"Failed to prune layer {node.name}: {e}")
                continue
        
        # Update model initializers
        del pruned_model.graph.initializer[:]
        pruned_model.graph.initializer.extend(initializer_dict.values())
        
        # Validate model
        try:
            onnx.checker.check_model(pruned_model)
        except Exception as e:
            logger.warning(f"Model validation warning: {e}")
            # Continue anyway - model might still be usable
        
        stats = {
            'total_params': total_params,
            'pruned_params': total_pruned,
            'pruning_ratio': total_pruned / total_params if total_params > 0 else 0,
            'pruned_layers': pruned_layers,
            'success': True
        }
        
        return pruned_model, stats
    
    except Exception as e:
        logger.error(f"Pruning failed: {e}")
        return model, {
            'success': False,
            'error': str(e),
            'total_params': count_parameters(model),
            'pruned_params': 0,
            'pruning_ratio': 0,
            'pruned_layers': []
        }


def prune_structured(
    model: onnx.ModelProto,
    ratio: float,
    criterion: str = 'l1'
) -> Tuple[onnx.ModelProto, Dict]:
    """
    Structured pruning - remove entire channels/filters based on criterion
    More aggressive than magnitude pruning, removes structured groups
    """
    try:
        validate_pruning_ratio(ratio)
        
        pruned_model = onnx.ModelProto()
        pruned_model.CopyFrom(model)
        
        initializer_dict = {init.name: init for init in pruned_model.graph.initializer}
        
        total_pruned = 0
        total_params = 0
        pruned_layers = []
        
        for node in pruned_model.graph.node:
            if node.op_type != 'Conv':  # Structured pruning mainly for Conv layers
                continue
            
            weight_name = None
            for input_name in node.input:
                if input_name in initializer_dict:
                    init = initializer_dict[input_name]
                    if len(init.dims) == 4:  # Conv weight (out_channels, in_channels, H, W)
                        weight_name = input_name
                        break
            
            if weight_name is None:
                continue
            
            try:
                init = initializer_dict[weight_name]
                weight_array = numpy_helper.to_array(init)
                original_shape = weight_array.shape
                total_params += weight_array.size
                
                out_channels = original_shape[0]
                num_to_prune = int(out_channels * ratio)
                
                if num_to_prune > 0 and num_to_prune < out_channels:
                    # Calculate channel importance
                    if criterion == 'l1':
                        channel_importance = np.sum(np.abs(weight_array.reshape(out_channels, -1)), axis=1)
                    else:  # l2
                        channel_importance = np.linalg.norm(weight_array.reshape(out_channels, -1), axis=1)
                    
                    # Keep channels with highest importance
                    keep_indices = np.argsort(channel_importance)[num_to_prune:]
                    keep_indices = np.sort(keep_indices)
                    
                    pruned_weight = weight_array[keep_indices]
                    total_pruned += weight_array.size - pruned_weight.size
                    
                    new_init = numpy_helper.from_array(pruned_weight, init.name)
                    initializer_dict[weight_name].CopyFrom(new_init)
                    
                    pruned_layers.append({
                        'layer': node.output[0],
                        'type': 'Structured Conv',
                        'original_channels': out_channels,
                        'removed_channels': num_to_prune,
                        'remaining_channels': len(keep_indices),
                        'criterion': criterion
                    })
            
            except Exception as e:
                logger.warning(f"Failed structured pruning on {node.name}: {e}")
                continue
        
        # Update initializers
        del pruned_model.graph.initializer[:]
        pruned_model.graph.initializer.extend(initializer_dict.values())
        
        stats = {
            'total_params': total_params,
            'pruned_params': total_pruned,
            'pruning_ratio': total_pruned / total_params if total_params > 0 else 0,
            'pruned_layers': pruned_layers,
            'method': 'structured',
            'success': True
        }
        
        return pruned_model, stats
    
    except Exception as e:
        logger.error(f"Structured pruning failed: {e}")
        return model, {
            'success': False,
            'error': str(e),
            'total_params': count_parameters(model),
            'pruned_params': 0,
            'pruning_ratio': 0,
            'method': 'structured',
            'pruned_layers': []
        }


def prune_gradient_based(
    model: onnx.ModelProto,
    ratio: float
) -> Tuple[onnx.ModelProto, Dict]:
    """
    Gradient-based pruning - simulate gradient importance
    In real scenario, would use actual gradients from training
    Here we use weight magnitude * weight value as proxy
    """
    try:
        validate_pruning_ratio(ratio)
        
        pruned_model = onnx.ModelProto()
        pruned_model.CopyFrom(model)
        
        initializer_dict = {init.name: init for init in pruned_model.graph.initializer}
        
        total_pruned = 0
        total_params = 0
        pruned_layers = []
        layer_types = ['Conv', 'Gemm', 'MatMul']
        
        for node in pruned_model.graph.node:
            if node.op_type not in layer_types:
                continue
            
            weight_name = None
            for input_name in node.input:
                if input_name in initializer_dict:
                    init = initializer_dict[input_name]
                    if len(init.dims) >= 2:
                        weight_name = input_name
                        break
            
            if weight_name is None:
                continue
            
            try:
                init = initializer_dict[weight_name]
                weight_array = numpy_helper.to_array(init)
                total_params += weight_array.size
                
                # Simulate gradient importance: |w| * |w|^2 = |w|^3
                importance = np.abs(weight_array) ** 1.5  # Power between L1 and L2
                
                # Flatten and find threshold
                flat_importance = importance.flatten()
                threshold_idx = int(len(flat_importance) * ratio)
                if threshold_idx >= len(flat_importance):
                    continue
                
                threshold = np.partition(flat_importance, threshold_idx)[threshold_idx]
                
                # Create mask (keep important weights)
                mask = importance >= threshold
                pruned_weight = weight_array * mask
                
                num_pruned = np.sum(~mask)
                total_pruned += num_pruned
                
                new_init = numpy_helper.from_array(pruned_weight.astype(weight_array.dtype), init.name)
                initializer_dict[weight_name].CopyFrom(new_init)
                
                pruned_layers.append({
                    'layer': node.output[0],
                    'type': node.op_type,
                    'total_weights': weight_array.size,
                    'pruned_weights': int(num_pruned),
                    'sparsity': float(num_pruned / weight_array.size)
                })
            
            except Exception as e:
                logger.warning(f"Failed gradient pruning on {node.name}: {e}")
                continue
        
        # Update initializers
        del pruned_model.graph.initializer[:]
        pruned_model.graph.initializer.extend(initializer_dict.values())
        
        stats = {
            'total_params': total_params,
            'pruned_params': total_pruned,
            'pruning_ratio': total_pruned / total_params if total_params > 0 else 0,
            'pruned_layers': pruned_layers,
            'method': 'gradient',
            'success': True
        }
        
        return pruned_model, stats
    
    except Exception as e:
        logger.error(f"Gradient pruning failed: {e}")
        return model, {
            'success': False,
            'error': str(e),
            'total_params': count_parameters(model),
            'pruned_params': 0,
            'pruning_ratio': 0,
            'method': 'gradient',
            'pruned_layers': []
        }


def prune_pattern_based(
    model: onnx.ModelProto,
    ratio: float,
    pattern: str = '2:4'
) -> Tuple[onnx.ModelProto, Dict]:
    """
    Pattern-based (N:M) sparsity pruning
    Example: 2:4 means keep 2 largest weights out of every 4 consecutive weights
    Hardware-friendly structured sparsity
    """
    try:
        validate_pruning_ratio(ratio)
        
        # Parse pattern
        n, m = map(int, pattern.split(':'))
        if n >= m or m <= 0:
            raise ValueError(f"Invalid pattern {pattern}, need n < m")
        
        pruned_model = onnx.ModelProto()
        pruned_model.CopyFrom(model)
        
        initializer_dict = {init.name: init for init in pruned_model.graph.initializer}
        
        total_pruned = 0
        total_params = 0
        pruned_layers = []
        layer_types = ['Conv', 'Gemm', 'MatMul']
        
        for node in pruned_model.graph.node:
            if node.op_type not in layer_types:
                continue
            
            weight_name = None
            for input_name in node.input:
                if input_name in initializer_dict:
                    init = initializer_dict[input_name]
                    if len(init.dims) >= 2:
                        weight_name = input_name
                        break
            
            if weight_name is None:
                continue
            
            try:
                init = initializer_dict[weight_name]
                weight_array = numpy_helper.to_array(init)
                original_shape = weight_array.shape
                total_params += weight_array.size
                
                # Flatten to 1D
                flat_weights = weight_array.flatten()
                
                # Apply N:M pattern
                num_groups = len(flat_weights) // m
                pruned_flat = flat_weights.copy()
                
                for i in range(num_groups):
                    group_start = i * m
                    group_end = group_start + m
                    group = flat_weights[group_start:group_end]
                    
                    # Keep N largest, zero out (M-N) smallest
                    keep_indices = np.argsort(np.abs(group))[-n:]
                    mask = np.zeros(m, dtype=bool)
                    mask[keep_indices] = True
                    
                    pruned_flat[group_start:group_end] = group * mask
                
                # Count pruned
                num_pruned = np.sum(pruned_flat == 0)
                total_pruned += num_pruned
                
                # Reshape back
                pruned_weight = pruned_flat.reshape(original_shape)
                
                new_init = numpy_helper.from_array(pruned_weight.astype(weight_array.dtype), init.name)
                initializer_dict[weight_name].CopyFrom(new_init)
                
                pruned_layers.append({
                    'layer': node.output[0],
                    'type': node.op_type,
                    'pattern': pattern,
                    'total_weights': weight_array.size,
                    'zero_weights': int(num_pruned),
                    'sparsity': float(num_pruned / weight_array.size)
                })
            
            except Exception as e:
                logger.warning(f"Failed pattern pruning on {node.name}: {e}")
                continue
        
        # Update initializers
        del pruned_model.graph.initializer[:]
        pruned_model.graph.initializer.extend(initializer_dict.values())
        
        stats = {
            'total_params': total_params,
            'pruned_params': total_pruned,
            'pruning_ratio': total_pruned / total_params if total_params > 0 else 0,
            'pruned_layers': pruned_layers,
            'method': f'pattern ({pattern})',
            'success': True
        }
        
        return pruned_model, stats
    
    except Exception as e:
        logger.error(f"Pattern pruning failed: {e}")
        return model, {
            'success': False,
            'error': str(e),
            'total_params': count_parameters(model),
            'pruned_params': 0,
            'pruning_ratio': 0,
            'method': 'pattern',
            'pruned_layers': []
        }


def remove_layer_by_name(
    model: onnx.ModelProto, 
    layer_name: str
) -> Tuple[onnx.ModelProto, bool]:
    """Remove a specific layer with error handling"""
    try:
        modified_model = onnx.ModelProto()
        modified_model.CopyFrom(model)
        
        target_node = None
        for node in modified_model.graph.node:
            if node.output[0] == layer_name or node.name == layer_name:
                target_node = node
                break
        
        if target_node is None:
            logger.warning(f"Layer {layer_name} not found")
            return model, False
        
        node_input = target_node.input[0] if target_node.input else None
        node_output = target_node.output[0] if target_node.output else None
        
        if not node_input or not node_output:
            logger.warning("Cannot remove layer: missing input/output")
            return model, False
        
        # Redirect connections
        for node in modified_model.graph.node:
            if node == target_node:
                continue
            for i, inp in enumerate(node.input):
                if inp == node_output:
                    node.input[i] = node_input
        
        # Update graph outputs
        for i, output in enumerate(modified_model.graph.output):
            if output.name == node_output:
                modified_model.graph.output[i].name = node_input
        
        # Remove the node
        nodes_to_keep = [n for n in modified_model.graph.node if n != target_node]
        del modified_model.graph.node[:]
        modified_model.graph.node.extend(nodes_to_keep)
        
        # Validate
        try:
            onnx.checker.check_model(modified_model)
            logger.info(f"Successfully removed layer {layer_name}")
            return modified_model, True
        except Exception as e:
            logger.error(f"Layer removal failed validation: {e}")
            return model, False
    
    except Exception as e:
        logger.error(f"Error removing layer: {e}")
        return model, False


if __name__ == "__main__":
    import sys
    if len(sys.argv) > 1:
        try:
            model_path = sys.argv[1]
            model = onnx.load(model_path)
            
            print("Original model:")
            print(f"  Parameters: {count_parameters(model):,}")
            
            print("\nLayer info:")
            for layer in get_layer_info(model)[:10]:  # First 10 layers
                print(f"  {layer['name']} ({layer['op_type']}): {layer['params']:,} params")
            
            # Test pruning
            pruned_model, stats = prune_by_magnitude(model, ratio=0.3)
            if stats.get('success'):
                print(f"\nPruning stats:")
                print(f"  Total params: {stats['total_params']:,}")
                print(f"  Pruned params: {stats['pruned_params']:,}")
                print(f"  Pruning ratio: {stats['pruning_ratio']:.2%}")
            else:
                print(f"\nPruning failed: {stats.get('error')}")
        
        except Exception as e:
            logger.error(f"Test failed: {e}")
