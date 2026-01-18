"""
Advanced Pruning Methods

Extended pruning algorithms beyond basic magnitude-based:
1. L1-Norm Pruning
2. Taylor Expansion Pruning  
3. Structured Group Pruning
4. Lottery Ticket Pruning
5. Movement Pruning
"""

import onnx
from onnx import numpy_helper
import numpy as np
from typing import Dict, Tuple, Optional
import logging

logger = logging.getLogger(__name__)


def prune_by_l1_norm(model: onnx.ModelProto, ratio: float = 0.3) -> Tuple[onnx.ModelProto, Dict]:
    """
    L1-Norm based pruning
    
    Removes weights with smallest L1 norm
    Better than magnitude for sparse models
    
    Args:
        model: ONNX model
        ratio: Pruning ratio (0.0 - 1.0)
    
    Returns:
        Pruned model and statistics
    """
    try:
        pruned_model = onnx.ModelProto()
        pruned_model.CopyFrom(model)
        
        total_pruned = 0
        total_params = 0
        
        for initializer in pruned_model.graph.initializer:
            if len(initializer.dims) >= 2:  # Only prune weight matrices
                weight = numpy_helper.to_array(initializer)
                original_shape = weight.shape
                total_params += weight.size
                
                # Calculate L1 norm for each filter/neuron
                if len(weight.shape) == 4:  # Conv weights [out_ch, in_ch, h, w]
                    l1_norms = np.sum(np.abs(weight), axis=(1, 2, 3))
                    num_to_prune = int(len(l1_norms) * ratio)
                    
                    if num_to_prune > 0 and num_to_prune < len(l1_norms):
                        keep_indices = np.argsort(l1_norms)[num_to_prune:]
                        pruned_weight = weight[keep_indices]
                        
                        total_pruned += weight.size - pruned_weight.size
                        
                        new_init = numpy_helper.from_array(pruned_weight, initializer.name)
                        initializer.CopyFrom(new_init)
                
                elif len(weight.shape) == 2:  # Linear weights [out, in]
                    l1_norms = np.sum(np.abs(weight), axis=1)
                    num_to_prune = int(len(l1_norms) * ratio)
                    
                    if num_to_prune > 0 and num_to_prune < len(l1_norms):
                        keep_indices = np.argsort(l1_norms)[num_to_prune:]
                        pruned_weight = weight[keep_indices]
                        
                        total_pruned += weight.size - pruned_weight.size
                        
                        new_init = numpy_helper.from_array(pruned_weight, initializer.name)
                        initializer.CopyFrom(new_init)
        
        stats = {
            'method': 'l1_norm',
            'total_params': total_params,
            'pruned_params': total_pruned,
            'pruning_ratio': total_pruned / total_params if total_params > 0 else 0,
            'success': True
        }
        
        return pruned_model, stats
    
    except Exception as e:
        logger.error(f"L1-norm pruning failed: {e}")
        return model, {'success': False, 'error': str(e)}


def prune_by_taylor(model: onnx.ModelProto, 
                    ratio: float = 0.3,
                    gradients: Optional[Dict] = None) -> Tuple[onnx.ModelProto, Dict]:
    """
    Taylor Expansion based pruning
    
    Importance = |weight * gradient|
    Requires gradient information (simulated here)
    
    Args:
        model: ONNX model
        ratio: Pruning ratio
        gradients: Gradient dict (if None, use random simulation)
    """
    try:
        pruned_model = onnx.ModelProto()
        pruned_model.CopyFrom(model)
        
        total_pruned = 0
        total_params = 0
        
        for initializer in pruned_model.graph.initializer:
            if len(initializer.dims) >= 2:
                weight = numpy_helper.to_array(initializer)
                original_shape = weight.shape
                total_params += weight.size
                
                # Simulate gradients if not provided
                if gradients is None or initializer.name not in gradients:
                    grad = np.random.randn(*weight.shape) * 0.01
                else:
                    grad = gradients[initializer.name]
                
                # Taylor importance: |w * g|
                importance = np.abs(weight * grad)
                
                # Flatten for global pruning
                importance_flat = importance.flatten()
                threshold_idx = int(len(importance_flat) * ratio)
                threshold = np.sort(importance_flat)[threshold_idx]
                
                # Create mask
                mask = importance >= threshold
                pruned_weight = weight * mask
                
                # Count pruned
                total_pruned += np.sum(mask == 0)
                
                new_init = numpy_helper.from_array(pruned_weight, initializer.name)
                initializer.CopyFrom(new_init)
        
        stats = {
            'method': 'taylor_expansion',
            'total_params': total_params,
            'pruned_params': total_pruned,
            'pruning_ratio': total_pruned / total_params if total_params > 0 else 0,
            'success': True,
            'note': 'Gradients simulated' if gradients is None else 'Real gradients used'
        }
        
        return pruned_model, stats
    
    except Exception as e:
        logger.error(f"Taylor pruning failed: {e}")
        return model, {'success': False, 'error': str(e)}


def prune_structured_groups(model: onnx.ModelProto, 
                            ratio: float = 0.3,
                            group_size: int = 4) -> Tuple[onnx.ModelProto, Dict]:
    """
    Structured Group Pruning
    
    Prunes weights in groups for hardware efficiency
    (e.g., groups of 4 for GPU tensor cores)
    
    Args:
        model: ONNX model
        ratio: Pruning ratio
        group_size: Size of weight groups (4, 8, 16)
    """
    try:
        pruned_model = onnx.ModelProto()
        pruned_model.CopyFrom(model)
        
        total_pruned = 0
        total_params = 0
        
        for initializer in pruned_model.graph.initializer:
            if len(initializer.dims) >= 2:
                weight = numpy_helper.to_array(initializer)
                total_params += weight.size
                
                # Reshape into groups
                flat_weight = weight.flatten()
                num_groups = len(flat_weight) // group_size
                
                if num_groups > 0:
                    grouped = flat_weight[:num_groups * group_size].reshape(-1, group_size)
                    
                    # Calculate group importance (L2 norm)
                    group_importance = np.linalg.norm(grouped, axis=1)
                    
                    # Prune groups
                    num_to_prune = int(len(group_importance) * ratio)
                    if num_to_prune > 0 and num_to_prune < len(group_importance):
                        threshold = np.sort(group_importance)[num_to_prune]
                        mask = (group_importance >= threshold).astype(float)
                        
                        # Apply mask
                        masked_groups = grouped * mask[:, np.newaxis]
                        flat_weight[:num_groups * group_size] = masked_groups.flatten()
                        
                        pruned_weight = flat_weight.reshape(weight.shape)
                        total_pruned += np.sum(pruned_weight == 0)
                        
                        new_init = numpy_helper.from_array(pruned_weight, initializer.name)
                        initializer.CopyFrom(new_init)
        
        stats = {
            'method': 'structured_group',
            'group_size': group_size,
            'total_params': total_params,
            'pruned_params': total_pruned,
            'pruning_ratio': total_pruned / total_params if total_params > 0 else 0,
            'success': True
        }
        
        return pruned_model, stats
    
    except Exception as e:
        logger.error(f"Structured group pruning failed: {e}")
        return model, {'success': False, 'error': str(e)}


def lottery_ticket_prune(model: onnx.ModelProto,
                        ratio: float = 0.3,
                        iterations: int = 3) -> Tuple[onnx.ModelProto, Dict]:
    """
    Lottery Ticket Hypothesis inspired pruning
    
    Iteratively prune and simulate retraining
    
    Args:
        model: ONNX model
        ratio: Pruning ratio per iteration
        iterations: Number of pruning iterations
    """
    try:
        pruned_model = onnx.ModelProto()
        pruned_model.CopyFrom(model)
        
        total_pruned = 0
        total_params = 0
        
        for iteration in range(iterations):
            for initializer in pruned_model.graph.initializer:
                if len(initializer.dims) >= 2:
                    weight = numpy_helper.to_array(initializer)
                    
                    if iteration == 0:
                        total_params += weight.size
                    
                    # Prune smallest magnitude weights
                    flat_weight = weight.flatten()
                    threshold_idx = int(len(flat_weight) * ratio / iterations)
                    threshold = np.sort(np.abs(flat_weight))[threshold_idx]
                    
                    mask = np.abs(weight) >= threshold
                    pruned_weight = weight * mask
                    
                    if iteration == iterations - 1:
                        total_pruned += np.sum(mask == 0)
                    
                    new_init = numpy_helper.from_array(pruned_weight, initializer.name)
                    initializer.CopyFrom(new_init)
        
        stats = {
            'method': 'lottery_ticket',
            'iterations': iterations,
            'total_params': total_params,
            'pruned_params': total_pruned,
            'pruning_ratio': total_pruned / total_params if total_params > 0 else 0,
            'success': True
        }
        
        return pruned_model, stats
    
    except Exception as e:
        logger.error(f"Lottery ticket pruning failed: {e}")
        return model, {'success': False, 'error': str(e)}


def movement_prune(model: onnx.ModelProto,
                   ratio: float = 0.3,
                   threshold: float = 0.1) -> Tuple[onnx.ModelProto, Dict]:
    """
    Movement Pruning
    
    Prunes weights that don't "move" during training
    (simulated here with weight variance)
    
    Args:
        model: ONNX model
        ratio: Pruning ratio
        threshold: Movement threshold
    """
    try:
        pruned_model = onnx.ModelProto()
        pruned_model.CopyFrom(model)
        
        total_pruned = 0
        total_params = 0
        
        for initializer in pruned_model.graph.initializer:
            if len(initializer.dims) >= 2:
                weight = numpy_helper.to_array(initializer)
                total_params += weight.size
                
                # Simulate "movement" with local variance
                # In real implementation, would track weight changes during training
                movement = np.abs(weight) + np.random.randn(*weight.shape) * 0.01
                
                # Prune low movement weights
                flat_movement = np.abs(movement).flatten()
                threshold_idx = int(len(flat_movement) * ratio)
                prune_threshold = np.sort(flat_movement)[threshold_idx]
                
                mask = np.abs(movement) >= prune_threshold
                pruned_weight = weight * mask
                
                total_pruned += np.sum(mask == 0)
                
                new_init = numpy_helper.from_array(pruned_weight, initializer.name)
                initializer.CopyFrom(new_init)
        
        stats = {
            'method': 'movement',
            'total_params': total_params,
            'pruned_params': total_pruned,
            'pruning_ratio': total_pruned / total_params if total_params > 0 else 0,
            'success': True,
            'note': 'Movement simulated with variance'
        }
        
        return pruned_model, stats
    
    except Exception as e:
        logger.error(f"Movement pruning failed: {e}")
        return model, {'success': False, 'error': str(e)}


if __name__ == "__main__":
    import sys
    
    if len(sys.argv) > 1:
        model = onnx.load(sys.argv[1])
        
        print("\n🔧 Testing Advanced Pruning Methods:")
        
        print("\n1. L1-Norm Pruning (30%):")
        _, stats = prune_by_l1_norm(model, ratio=0.3)
        print(f"   Pruned: {stats.get('pruning_ratio', 0):.2%}")
        print(f"   Success: {stats.get('success')}")
        
        print("\n2. Taylor Expansion Pruning (30%):")
        _, stats = prune_by_taylor(model, ratio=0.3)
        print(f"   Pruned: {stats.get('pruning_ratio', 0):.2%}")
        print(f"   Success: {stats.get('success')}")
        
        print("\n3. Structured Group Pruning (30%, group=4):")
        _, stats = prune_structured_groups(model, ratio=0.3, group_size=4)
        print(f"   Pruned: {stats.get('pruning_ratio', 0):.2%}")
        print(f"   Success: {stats.get('success')}")
        
        print("\n4. Lottery Ticket Pruning (30%, 3 iter):")
        _, stats = lottery_ticket_prune(model, ratio=0.3, iterations=3)
        print(f"   Pruned: {stats.get('pruning_ratio', 0):.2%}")
        print(f"   Success: {stats.get('success')}")
        
        print("\n5. Movement Pruning (30%):")
        _, stats = movement_prune(model, ratio=0.3)
        print(f"   Pruned: {stats.get('pruning_ratio', 0):.2%}")
        print(f"   Success: {stats.get('success')}")
