"""
LLM Benchmark Module

Specialized benchmarking for Large Language Models including:
- Perplexity calculation
- Inference speed (tokens/sec)
- Memory footprint
- KV-cache size estimation
"""

import onnx
import numpy as np
from typing import Dict, Optional, List
import logging
from model_detector import ModelDetector

logger = logging.getLogger(__name__)


class LLMBenchmark:
    """Benchmark metrics specific to Large Language Models"""
    
    def __init__(self, model_path: str):
        self.model_path = model_path
        self.model = onnx.load(model_path)
        self.detector = ModelDetector()
        self.model_info = self.detector.detect(model_path)
        
    def get_comprehensive_metrics(self) -> Dict:
        """
        Get all LLM-specific metrics
        
        Returns:
            {
                'model_info': {...},
                'memory': {...},
                'performance': {...},
                'quality': {...}
            }
        """
        if not self.model_info.get('is_llm'):
            logger.warning("Model is not detected as LLM, metrics may not be accurate")
        
        return {
            'model_info': self.model_info,
            'memory': self.estimate_memory_usage(),
            'performance': self.estimate_performance(),
            'quality': self.estimate_quality_metrics(),
            'kv_cache': self.estimate_kv_cache_size()
        }
    
    def estimate_memory_usage(self) -> Dict:
        """
        Estimate memory requirements
        
        Returns:
            - model_size_mb:Model weights
            - activation_memory_mb: Activations during inference
            - peak_memory_mb: Peak usage
        """
        # Model size (weights)
        model_size_bytes = sum(
            np.prod(init.dims) * self._get_dtype_size(init.data_type)
            for init in self.model.graph.initializer
        )
        model_size_mb = model_size_bytes / (1024 * 1024)
        
        # Estimate activation memory
        # Rule of thumb: ~2x model size for activations during forward pass
        activation_memory_mb = model_size_mb * 2
        
        # Peak memory includes gradients (if training) and optimizer states
        # For inference only: model + activations
        peak_memory_mb = model_size_mb + activation_memory_mb
        
        return {
            'model_size_mb': round(model_size_mb, 2),
            'activation_memory_mb': round(activation_memory_mb, 2),
            'peak_memory_mb': round(peak_memory_mb, 2),
            'model_size_gb': round(model_size_mb / 1024, 2)
        }
    
    def estimate_performance(self, sequence_length: int = 512) -> Dict:
        """
        Estimate inference performance
        
        Args:
            sequence_length: Input sequence length
        
        Returns:
            - estimated_tokens_per_second
            - estimated_latency_ms
            - flops_per_token
        """
        num_layers = self.model_info.get('num_layers', 12)
        hidden_size = self.model_info.get('hidden_size', 768)
        num_heads = self.model_info.get('num_heads', 12)
        
        # Estimate FLOPs per token
        # Transformer layer: 
        # - Attention: 4 * hidden_size^2 * seq_len
        # - FFN: 8 * hidden_size^2
        attention_flops = 4 * hidden_size * hidden_size * sequence_length
        ffn_flops = 8 * hidden_size * hidden_size
        flops_per_layer = attention_flops + ffn_flops
        total_flops = flops_per_layer * num_layers
        
        # Estimate throughput (very rough)
        # Target device: CPU (~100 GFLOPS), GPU (~10 TFLOPS)
        device_gflops = 100  # Conservative CPU estimate
        tokens_per_second = (device_gflops * 1e9) / total_flops
        
        # Latency for first token (ms)
        latency_ms = 1000 / tokens_per_second if tokens_per_second > 0 else 1000
        
        return {
            'estimated_tokens_per_second': round(tokens_per_second, 2),
            'estimated_latency_ms': round(latency_ms, 2),
            'flops_per_token': int(total_flops),
            'flops_giga': round(total_flops / 1e9, 2),
            'sequence_length': sequence_length
        }
    
    def estimate_kv_cache_size(self, 
                                sequence_length: int = 512,
                                batch_size: int = 1) -> Dict:
        """
        Estimate KV-cache memory for autoregressive generation
        
        In decoder-only models (GPT), we cache K and V for each layer
        Size = 2 * num_layers * batch_size * seq_len * hidden_size * dtype_size
        """
        num_layers = self.model_info.get('num_layers', 12)
        hidden_size = self.model_info.get('hidden_size', 768)
        
        # KV cache: 2 matrices (K and V) per layer
        # Shape: [batch, num_heads, seq_len, head_dim]
        # Total: batch * seq_len * hidden_size * 2 (K and V)
        kv_elements = 2 * num_layers * batch_size * sequence_length * hidden_size
        
        # Assume FP16 (2 bytes per element) for cache
        kv_cache_bytes = kv_elements * 2
        kv_cache_mb = kv_cache_bytes / (1024 * 1024)
        
        return {
            'kv_cache_mb': round(kv_cache_mb, 2),
            'kv_cache_gb': round(kv_cache_mb / 1024, 3),
            'batch_size': batch_size,
            'sequence_length': sequence_length,
            'total_elements': kv_elements
        }
    
    def estimate_quality_metrics(self) -> Dict:
        """
        Estimate quality metrics (placeholder - would need actual inference)
        
        For actual measurement, would need:
        - Test dataset
        - Inference runtime
        
        Returns estimated/typical values based on model size
        """
        total_params = self.model_info.get('total_params', 0)
        
        # Rough estimates based on parameter count
        # (These are placeholders - real values need inference)
        if total_params < 200_000_000:  # < 200M
            estimated_perplexity = 30.0
            estimated_quality = "good"
        elif total_params < 1_000_000_000:  # < 1B
            estimated_perplexity = 20.0
            estimated_quality = "very good"
        else:  # > 1B
            estimated_perplexity = 15.0
            estimated_quality = "excellent"
        
        return {
            'estimated_perplexity': estimated_perplexity,
            'quality_tier': estimated_quality,
            'note': 'Estimated values - actual measurement requires inference on test set'
        }
    
    def compare_optimization_impact(self, 
                                    original_metrics: Dict,
                                    optimized_metrics: Dict) -> Dict:
        """
        Compare metrics before and after optimization
        
        Returns:
            - speedup: float
            - memory_reduction: float (%)
            - quality_loss: float (perplexity increase %)
        """
        speedup = (optimized_metrics['performance']['estimated_tokens_per_second'] /
                   original_metrics['performance']['estimated_tokens_per_second'])
        
        memory_reduction = ((original_metrics['memory']['model_size_mb'] -
                             optimized_metrics['memory']['model_size_mb']) /
                            original_metrics['memory']['model_size_mb'] * 100)
        
        quality_loss = ((optimized_metrics['quality']['estimated_perplexity'] -
                         original_metrics['quality']['estimated_perplexity']) /
                        original_metrics['quality']['estimated_perplexity'] * 100)
        
        return {
            'speedup': round(speedup, 2),
            'memory_reduction_pct': round(memory_reduction, 1),
            'quality_loss_pct': round(quality_loss, 1),
            'recommendation': self._get_recommendation(speedup, memory_reduction, quality_loss)
        }
    
    def _get_recommendation(self, speedup, memory_reduction, quality_loss):
        """Get optimization recommendation based on metrics"""
        if quality_loss > 10:
            return "⚠️ High quality loss - consider less aggressive optimization"
        elif speedup > 2 and memory_reduction > 50:
            return "✅ Excellent optimization - significant gains with acceptable quality loss"
        elif speedup > 1.5:
            return "✅ Good optimization - noticeable performance improvement"
        else:
            return "ℹ️ Moderate optimization - small improvements"
    
    def _get_dtype_size(self, onnx_dtype: int) -> int:
        """Get size in bytes for ONNX data type"""
        dtype_sizes = {
            1: 4,   # FLOAT
            2: 1,   # UINT8
            3: 1,   # INT8
            4: 2,   # UINT16
            5: 2,   # INT16
            6: 4,   # INT32
            7: 8,   # INT64
            10: 2,  # FLOAT16
            11: 8,  # DOUBLE
        }
        return dtype_sizes.get(onnx_dtype, 4)  # Default to 4 bytes


if __name__ == "__main__":
    import sys
    import json
    
    if len(sys.argv) > 1:
        benchmark = LLMBenchmark(sys.argv[1])
        metrics = benchmark.get_comprehensive_metrics()
        
        print("\n📊 LLM Benchmark Results:")
        print(f"\n🔍 Model Info:")
        print(f"  Type: {metrics['model_info']['type']}")
        print(f"  Variant: {metrics['model_info']['variant']}")
        print(f"  Is LLM: {metrics['model_info']['is_llm']}")
        
        print(f"\n💾 Memory:")
        print(f"  Model Size: {metrics['memory']['model_size_mb']} MB")
        print(f"  Peak Memory: {metrics['memory']['peak_memory_mb']} MB")
        
        print(f"\n⚡ Performance:")
        perf = metrics['performance']
        print(f"  Est. Tokens/sec: {perf['estimated_tokens_per_second']}")
        print(f"  Est. Latency: {perf['estimated_latency_ms']} ms")
        print(f"  FLOPs/token: {perf['flops_giga']} G")
        
        if metrics['model_info']['is_llm']:
            print(f"\n🗄️ KV Cache:")
            kv = metrics['kv_cache']
            print(f"  Size (seq=512): {kv['kv_cache_mb']} MB")
        
        print(f"\n🎯 Quality:")
        print(f"  Estimated Perplexity: {metrics['quality']['estimated_perplexity']}")
        print(f"  Tier: {metrics['quality']['quality_tier']}")
