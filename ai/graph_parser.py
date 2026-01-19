"""
Hierarchical graph parsing for ONNX models
Groups sequential nodes into stages for better visualization
"""
import numpy as np
from onnx import numpy_helper, shape_inference
import logging

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def parse_onnx_graph_hierarchical(model):
    """
    Parse ONNX graph and create hierarchical structure
    Groups nodes into stages for better visualization
    """
    try:
        # Run shape inference to populate value_info for intermediate tensors
        try:
             model = shape_inference.infer_shapes(model)
        except Exception as e:
             logger.warning(f"Shape inference failed: {e}")
             
        graph = model.graph
        
        # Parse all individual nodes first
        # Create maps for quick lookup
        initializer_map = {init.name: init for init in graph.initializer}
        
        # Map for shapes (ValueInfo + Graph Inputs + Graph Outputs)
        value_info_map = {vi.name: vi for vi in graph.value_info}
        for inp in graph.input:
            value_info_map[inp.name] = inp
        for out in graph.output:
            value_info_map[out.name] = out

        def get_shape_str(name):
            if name in value_info_map:
                try:
                    val_info = value_info_map[name]
                    if hasattr(val_info, 'type') and hasattr(val_info.type, 'tensor_type') and hasattr(val_info.type.tensor_type, 'shape'):
                         dims = [d.dim_value for d in val_info.type.tensor_type.shape.dim]
                         return dims
                except Exception:
                    pass
            return "?"

        def get_node_stats(node):
            stats = {}
            try:
                # 1. IO Shapes
                input_shapes = [get_shape_str(inp) for inp in node.input]
                output_shapes = [get_shape_str(out) for out in node.output]
                stats['input_shapes'] = input_shapes
                stats['output_shapes'] = output_shapes

                # 2. Weights & Sparsity (Specific to Conv/Gemm)
                if node.op_type in ['Conv', 'Gemm', 'MatMul']:
                    # Usually weight is the second input (index 1)
                    if len(node.input) > 1:
                        weight_name = node.input[1]
                        if weight_name in initializer_map:
                            tensor = initializer_map[weight_name]
                            try:
                                # Convert to numpy for stats
                                np_tensor = numpy_helper.to_array(tensor)
                                size = np_tensor.size
                                zeros = np.count_nonzero(np_tensor == 0)
                                sparsity = (zeros / size) * 100 if size > 0 else 0
                                
                                stats['params'] = int(size)
                                stats['weight_shape'] = list(np_tensor.shape)
                                stats['sparsity'] = round(sparsity, 2)
                            except Exception as e:
                                logger.warning(f"Error calculating weight stats for {node.name}: {e}")
            except Exception as e:
                 logger.warning(f"Error in get_node_stats for {node.name}: {e}")
            
            return stats

        # Helper to parse attributes safely
        def get_attributes(node):
            attrs = {}
            try:
                for attr in node.attribute:
                    try:
                        # Handle different attribute types
                        if attr.type == 1: # FLOAT
                            attrs[attr.name] = attr.f
                        elif attr.type == 2: # INT
                            attrs[attr.name] = attr.i
                        elif attr.type == 3: # STRING
                            attrs[attr.name] = attr.s.decode('utf-8')
                        elif attr.type == 4: # TENSOR
                            attrs[attr.name] = "Tensor"
                        elif attr.type == 6: # FLOATS
                            attrs[attr.name] = list(attr.floats)
                        elif attr.type == 7: # INTS
                            attrs[attr.name] = list(attr.ints)
                        elif attr.type == 8: # STRINGS
                            attrs[attr.name] = [s.decode('utf-8') for s in attr.strings]
                        else:
                            attrs[attr.name] = str(attr)
                    except Exception as e:
                        attrs[attr.name] = f"<Error decoding: {e}>"
            except Exception as e:
                 logger.warning(f"Error parsing attributes for node {node.name}: {e}")
            return attrs

        nodes = []
        node_types = []

        for i, node in enumerate(graph.node):
            node_id = node.output[0] if node.output else node.name or f"node_{i}"
            
            # Calculate stats safely
            statistics = get_node_stats(node)

            node_data = {
                'id': node_id,
                'data': {
                    'id': node_id,
                    'label': node.op_type,
                    'type': node.op_type,
                    'index': i,
                    'attributes': get_attributes(node),
                    'inputs': list(node.input),
                    'outputs': list(node.output),
                    'statistics': statistics
                }
            }
            nodes.append(node_data)
            node_types.append(node.op_type)
        
        # Create stages by grouping consecutive similar layers
        stages = []
        current_stage = None
        
        for i, node in enumerate(nodes):
            node_type = node['data']['type']
            
            # Determine stage category
            if 'Conv' in node_type:
                category = 'Convolution'
            elif 'Relu' in node_type or 'Activation' in node_type:
                category = 'Activation'
            elif 'Pool' in node_type:
                category = 'Pooling'
            elif 'Norm' in node_type or 'BatchNorm' in node_type:
                category = 'Normalization'
            elif 'Gemm' in node_type or 'MatMul' in node_type or 'Dense' in node_type:
                category = 'Linear'
            else:
                category = 'Other'
            
            # Group every N nodes into a stage (simpler grouping)
            stage_size = 10  # Group 10 nodes per stage
            stage_index = i // stage_size
            
            if current_stage is None or current_stage['index'] != stage_index:
                if current_stage:
                    stages.append(current_stage)
                
                current_stage = {
                    'id': f'stage_{stage_index}',
                    'index': stage_index,
                    'label': f'Block {stage_index + 1}',
                    'children': [],
                    'types': set()
                }
            
            current_stage['children'].append(node['data']['id'])
            current_stage['types'].add(category)
            node['data']['parent'] = current_stage['id']  # Set parent for compound graph
        
        if current_stage:
            stages.append(current_stage)
        
        # Create stage summary labels
        for stage in stages:
            type_list = list(stage['types'])
            if len(type_list) > 3:
                stage['label'] = f"Block {stage['index'] + 1} ({len(stage['children'])} layers)"
            else:
                stage['label'] = f"Block {stage['index'] + 1}: {', '.join(type_list[:3])}"
        
        # Parse edges
        edges = []
        name_to_idx = {node.output[0] if node.output else node.name: i 
                       for i, node in enumerate(graph.node)}
        
        for node in graph.node:
            target_id = node.output[0] if node.output else node.name
            for inp in node.input:
                if inp in name_to_idx:
                    edges.append({
                        'data': {
                            'source': inp,
                            'target': target_id
                        }
                    })
        
        return {
            'nodes': nodes,
            'edges': edges,
            'stages': stages,
            'hierarchical': True
        }

    except Exception as e:
        logger.error(f"Critical error in ONNX parsing: {e}", exc_info=True)
        # Rethrow with more context or return empty structure?
        # Rethrowing is safer so the API sees the error, but we logged it clearly now.
        raise RuntimeError(f"Failed to parse ONNX graph: {str(e)}")
