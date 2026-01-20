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



class DependencyGraph:
    """
    Simple dependency graph to track producer-consumer relationships in ONNX model.
    Used for structured pruning to propagate channel masks.
    """
    def __init__(self, model: onnx.ModelProto):
        self.model = model
        self.node_map = {node.name: node for node in model.graph.node}
        self.input_map = {}  # tensor_name -> list of consuming nodes
        self.output_map = {} # tensor_name -> producing node
        self._build_maps()

    def _build_maps(self):
        for node in self.model.graph.node:
            for out_name in node.output:
                self.output_map[out_name] = node
            for in_name in node.input:
                if in_name not in self.input_map:
                    self.input_map[in_name] = []
                self.input_map[in_name].append(node)

    def get_consumers(self, node: onnx.NodeProto) -> List[onnx.NodeProto]:
        """Get nodes that consume any output of the given node"""
        consumers = []
        for out_name in node.output:
            if out_name in self.input_map:
                consumers.extend(self.input_map[out_name])
        return consumers

    def get_producer(self, tensor_name: str) -> Optional[onnx.NodeProto]:
        """Get node that produces the given tensor"""
        return self.output_map.get(tensor_name)

    def find_next_convs(self, start_node: onnx.NodeProto) -> List[Tuple[onnx.NodeProto, str]]:
        """
        Traverse downstream validation-safe layers to find next Convs.
        Returns list of (ConvNode, input_tensor_name_of_that_conv).
        """
        next_convs = []
        visited = set()
        # Queue: (current_node, output_tensor_name_being_tracked)
        queue = [(start_node, start_node.output[0])] 

        while queue:
            curr_node, tracked_output = queue.pop(0)
            if curr_node.name in visited:
                continue
            visited.add(curr_node.name)

            if tracked_output not in self.input_map:
                continue
            
            consumers = self.input_map[tracked_output]
            for consumer in consumers:
                if consumer.op_type == 'Conv':
                    # Found a consumer Conv!
                    next_convs.append((consumer, tracked_output))
                elif consumer.op_type in ['Relu', 'LeakyRelu', 'BatchNormalization', 'MaxPool', 'AveragePool', 'GlobalAveragePool', 'Flatten']:
                    # Pass through these layers
                    if consumer.output:
                        queue.append((consumer, consumer.output[0]))
                
        return next_convs


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
    Global Unstructured Pruning:
    1. Collect all weights.
    2. Determine global threshold based on ratio.
    3. Mask weights < threshold (set to 0).
    4. Keep Shapes UNCHANGED.
    """
    try:
        validate_pruning_ratio(ratio)
        
        if layer_types is None:
            layer_types = ['Conv', 'Gemm', 'MatMul']
        
        # Clone model
        pruned_model = onnx.ModelProto()
        pruned_model.CopyFrom(model)
        
        initializer_dict = {init.name: init for init in pruned_model.graph.initializer}
        
        # 1. Collect all weights for global thresholding
        all_weights = []
        nodes_to_prune = [] # List of (node, weight_name, init)
        
        for node in pruned_model.graph.node:
            if node.op_type not in layer_types:
                continue
            
            weight_name = None
            for input_name in node.input:
                if input_name in initializer_dict:
                    init = initializer_dict[input_name]
                    # Heuristic: Weights usually have >1 dim.
                    if len(init.dims) >= 2:
                        weight_name = input_name
                        break
            
            if weight_name:
                init = initializer_dict[weight_name]
                w_arr = numpy_helper.to_array(init)
                # Keep absolute values for thresholding
                all_weights.append(np.abs(w_arr).flatten())
                nodes_to_prune.append((node, weight_name))

        if not all_weights:
            return model, {'success': False, 'error': 'No pruneable weights found'}

        # 2. Global Threshold
        global_concat = np.concatenate(all_weights)
        k = int(len(global_concat) * ratio)
        # Use partition to find k-th smallest value (threshold)
        if k >= len(global_concat):
             k = len(global_concat) - 1
        threshold = np.partition(global_concat, k)[k]
        
        total_params = global_concat.size
        total_zeros = 0
        pruned_info = []

        # 3. Apply Mask
        for node, weight_name in nodes_to_prune:
            init = initializer_dict[weight_name]
            w_arr = numpy_helper.to_array(init)
            
            # Mask
            mask = np.abs(w_arr) >= threshold
            new_w_arr = w_arr * mask # Zero out small weights
            
            # Check zeros
            layer_zeros = new_w_arr.size - np.count_nonzero(new_w_arr)
            total_zeros += layer_zeros
            
            # Update Initializer (Shape is PRESERVED)
            new_init = numpy_helper.from_array(new_w_arr, init.name)
            initializer_dict[weight_name].CopyFrom(new_init)
            
            pruned_info.append({
                'layer': node.name,
                'type': node.op_type,
                'sparsity': layer_zeros / new_w_arr.size
            })

        # Update model initializers
        del pruned_model.graph.initializer[:]
        pruned_model.graph.initializer.extend(initializer_dict.values())
        
        stats = {
            'total_params': total_params,
            'pruned_params': total_zeros,
            'pruning_ratio': total_zeros / total_params if total_params > 0 else 0,
            'method': 'global_unstructured',
            'success': True,
            'pruned_layers': pruned_info
        }
        
        return pruned_model, stats

    except Exception as e:
        logger.error(f"Global pruning failed: {e}")
        return model, {'success': False, 'error': str(e)}
    
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

        # Build dependency graph
        dep_graph = DependencyGraph(pruned_model)
        
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
                    
                    # 1. Prune Current Conv Output Weights
                    pruned_weight = weight_array[keep_indices]
                    total_pruned += weight_array.size - pruned_weight.size
                    
                    new_init = numpy_helper.from_array(pruned_weight, init.name)
                    initializer_dict[weight_name].CopyFrom(new_init)

                    # Update Bias if present
                    if len(node.input) > 2 and node.input[2] in initializer_dict:
                        bias_init = initializer_dict[node.input[2]]
                        bias_arr = numpy_helper.to_array(bias_init)
                        pruned_bias = bias_arr[keep_indices]
                        initializer_dict[node.input[2]].CopyFrom(numpy_helper.from_array(pruned_bias, bias_init.name))

                    
                    # 2. Propagate to Next Layers (BN / Conv inputs)
                    # Find consumers using DepGraph
                    consumers = dep_graph.input_map.get(node.output[0], [])
                    # Queue for propagation: (node, input_idx_of_incoming_tensor)
                    # Simpler: just use find_next_convs approach but we need to handle BNs in between
                    
                    # Manual breadth-first propagation for BNs
                    prop_queue = [node.output[0]]
                    visited_tensors = set()

                    while prop_queue:
                        curr_tensor = prop_queue.pop(0)
                        if curr_tensor in visited_tensors: continue
                        visited_tensors.add(curr_tensor)

                        curr_consumers = dep_graph.input_map.get(curr_tensor, [])
                        for consumer in curr_consumers:
                            if consumer.op_type == 'BatchNormalization':
                                # Prune BN weights (scale, B, mean, var)
                                # Start from input 1 (scale) to 4
                                for bin_idx in range(1, 5):
                                    if bin_idx < len(consumer.input) and consumer.input[bin_idx] in initializer_dict:
                                        bn_init = initializer_dict[consumer.input[bin_idx]]
                                        bn_arr = numpy_helper.to_array(bn_init)
                                        if len(bn_arr) == out_channels: # Safety check
                                            pruned_bn = bn_arr[keep_indices]
                                            initializer_dict[consumer.input[bin_idx]].CopyFrom(numpy_helper.from_array(pruned_bn, bn_init.name))
                                # Continue propagation
                                if consumer.output:
                                    prop_queue.append(consumer.output[0])

                            elif consumer.op_type in ['Relu', 'LeakyRelu', 'MaxPool', 'AveragePool', 'GlobalAveragePool']:
                                # Pass through
                                if consumer.output:
                                    prop_queue.append(consumer.output[0])
                            
                            elif consumer.op_type == 'Conv':
                                # Prune Input Channels of Next Conv
                                # Usually input 0 is data, input 1 is weight (out, in, k, k)
                                if len(consumer.input) > 1 and consumer.input[1] in initializer_dict:
                                    next_w_init = initializer_dict[consumer.input[1]]
                                    next_w_arr = numpy_helper.to_array(next_w_init)
                                    # Shape: (out, in, k, k) - prune axis 1
                                    if next_w_arr.shape[1] == out_channels:
                                        pruned_next_w = next_w_arr[:, keep_indices, ...]
                                        initializer_dict[consumer.input[1]].CopyFrom(numpy_helper.from_array(pruned_next_w, next_w_init.name))
                                # Stop propagation at Conv (we don't prune ITS output, just its input)
                    
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



def check_removal_safety(model: onnx.ModelProto, layer_name: str) -> Tuple[bool, str]:
    """
    Check if removing a layer breaks the graph due to shape mismatches.
    Returns (safe: bool, message: str)
    """
    try:
        # Run shape inference to get tensor shapes
        inferred_model = onnx.shape_inference.infer_shapes(model)
        val_info = {v.name: v for v in inferred_model.graph.value_info}
        # Also include inputs/outputs in shape map
        for i in inferred_model.graph.input:
            val_info[i.name] = i
        for o in inferred_model.graph.output:
            val_info[o.name] = o

        target_node = None
        for node in inferred_model.graph.node:
            if node.output[0] == layer_name or node.name == layer_name:
                target_node = node
                break
        
        if not target_node:
            return False, f"Layer {layer_name} not found"

        input_name = target_node.input[0]
        output_name = target_node.output[0]

        # Get shapes
        if input_name not in val_info:
            return True, "Input shape unknown, assuming safe (risky)"
        if output_name not in val_info:
             return True, "Output shape unknown, assuming safe (risky)"
        
        input_shape_proto = val_info[input_name].type.tensor_type.shape
        output_shape_proto = val_info[output_name].type.tensor_type.shape

        input_dims = [d.dim_value for d in input_shape_proto.dim]
        output_dims = [d.dim_value for d in output_shape_proto.dim]

        # If shapes are identical, it's usually safe
        if input_dims == output_dims:
            return True, "Shapes match"

        # If shapes mismatch, check if consumers can handle the input shape
        # Find consumers
        dep_graph = DependencyGraph(model)
        consumers = dep_graph.input_map.get(output_name, [])
        
        for consumer in consumers:
            # Conv/Gemm usually require specific input channels
            if consumer.op_type == 'Conv':
                # Conv weight shape: (M, C/group, kH, kW)
                # We need to check if C/group matches input_dims[1]
                # This requires finding the weight initializer for the consumer
                # This is complex. 
                # Simplified check: strictly require shape match for now if strict safety is requested.
                pass

        return False, f"Shape mismatch: Input {input_dims} != Output {output_dims}. Removal violates graph dependencies."

    except Exception as e:
        logger.warning(f"Safety check failed: {e}")
        return False, f"Safety check error: {e}"


def remove_layer_by_name(
    model: onnx.ModelProto, 
    layer_name: str
) -> Tuple[onnx.ModelProto, bool, str]:
    """Remove a specific layer with error handling and safety check"""
    try:
        # Safety Check
        is_safe, msg = check_removal_safety(model, layer_name)
        if not is_safe:
            logger.warning(f"Aborting removal of {layer_name}: {msg}")
            return model, False, msg

        modified_model = onnx.ModelProto()
        modified_model.CopyFrom(model)
        # ... (rest of logic)
        
        target_node = None
        for node in modified_model.graph.node:
            if node.output[0] == layer_name or node.name == layer_name:
                target_node = node
                break
        
        if target_node is None:
            logger.warning(f"Layer {layer_name} not found")
            return model, False, "Layer not found"
        
        node_input = target_node.input[0] if target_node.input else None
        node_output = target_node.output[0] if target_node.output else None
        
        if not node_input or not node_output:
            logger.warning("Cannot remove layer: missing input/output")
            return model, False, "Missing input/output"
        
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
            return modified_model, True, "Success"
        except Exception as e:
            logger.error(f"Layer removal failed validation: {e}")
            return model, False, f"Validation failed: {e}"
    
    except Exception as e:
        logger.error(f"Error removing layer: {e}")
        return model, False, str(e)


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

def prune_single_node(model, node_name, threshold):
    """
    Prune a specific node by zeroing out weights with magnitude < threshold.
    Returns (success, message, new_sparsity).
    """
    graph = model.graph
    target_node = None
    
    # 1. Search in Nodes (Name OR Output[0] as Frontend uses Output[0] as ID)
    for node in graph.node:
        if node.name == node_name:
            target_node = node
            break
        if node_name in node.output:
            target_node = node
            break
            
    if not target_node:
        return False, f"Node {node_name} not found", 0.0

    if target_node.op_type not in ['Conv', 'Gemm', 'MatMul']:
        return False, f"Node {node_name} ({target_node.op_type}) is not prunable", 0.0

    initializer_map = {init.name: init for init in graph.initializer}
    
    # Find weight input
    weight_name = None
    for input_name in target_node.input:
        if input_name in initializer_map:
             if len(initializer_map[input_name].dims) >= 2:
                weight_name = input_name
                break
    
    if not weight_name:
        return False, "No weights found for this node", 0.0

    try:
        w_init = initializer_map[weight_name]
        w_arr = numpy_helper.to_array(w_init)
        
        # Apply Threshold Pruning (Unstructured)
        mask = np.abs(w_arr) >= threshold
        new_w_arr = w_arr * mask
        
        # Calculate new sparsity
        zeros = np.count_nonzero(new_w_arr == 0)
        total = new_w_arr.size
        sparsity = zeros / total if total > 0 else 0
        
        # Update Initializer
        new_tensor = numpy_helper.from_array(new_w_arr, name=weight_name)
        
        # Replace in graph
        graph.initializer.remove(w_init)
        graph.initializer.extend([new_tensor])
        
        logger.info(f"Pruned node {node_name} (weight: {weight_name}) with threshold {threshold}. New Sparsity: {sparsity:.2%}")
        return True, f"Pruned {node_name}. New Sparsity: {sparsity:.2%}", sparsity

    except Exception as e:
        logger.error(f"Error pruning node {node_name}: {e}")
        return False, str(e), 0.0
