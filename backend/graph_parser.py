"""
Hierarchical graph parsing for ONNX models
Groups sequential nodes into stages for better visualization
"""

def parse_onnx_graph_hierarchical(model):
    """
    Parse ONNX graph and create hierarchical structure
    Groups nodes into stages for overview, keeps individual nodes for detail
    """
    graph = model.graph
    
    # Parse all individual nodes first
    nodes = []
    node_types = []
    
    for i, node in enumerate(graph.node):
        node_id = node.output[0] if node.output else node.name or f"node_{i}"
        node_data = {
            'id': node_id,
            'data': {
                'id': node_id,
                'label': node.op_type,
                'type': node.op_type,
                'index': i
            }
        }
        nodes.append(node_data)
        node_types.append(node.op_type)
    
    # Create stages by grouping consecutive similar layers
    stages = []
    current_stage = None
    stage_id = 0
    
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
