"""
ONNX Model Type Detector

Automatically detects model architecture and type to enable
appropriate optimization strategies.

Supports:
- CNN models (ResNet, VGG, MobileNet, EfficientNet)
- Transformer models (BERT, GPT, T5, LLaMA)
- RNN models (LSTM, GRU)
"""

import onnx
from onnx import numpy_helper
import numpy as np
from typing import Dict, List, Optional
import logging

logger = logging.getLogger(__name__)


class ModelDetector:
    """Detect ONNX model type and architecture"""
    
    def __init__(self):
        self.model = None
        self.node_types = []
        self.layer_shapes = {}
        
    def detect(self, model_path: str) -> Dict:
        """
        Main detection method
        
        Returns:
            {
                'type': 'cnn' | 'transformer' | 'rnn' | 'mlp',
                'variant': specific model name,
                'is_llm': bool,
                'num_layers': int,
                'hidden_size': int,
                'num_heads': int (for transformers),
                'vocab_size': int (for language models),
                'total_params': int,
                'characteristics': {...}
            }
        """
        try:
            self.model = onnx.load(model_path)
            self._analyze_structure()
            
            # Detect transformer/LLM
            if self._is_transformer():
                return self._detect_transformer_variant()
            
            # Detect CNN
            elif self._is_cnn():
                return self._detect_cnn_variant()
            
            # Detect RNN
            elif self._is_rnn():
                return self._detect_rnn_variant()
            
            # Default: MLP
            else:
                return {
                    'type': 'mlp',
                    'variant': 'feedforward',
                    'is_llm': False,
                    'num_layers': self._count_linear_layers(),
                    'total_params': self._count_params()
                }
        
        except Exception as e:
            logger.error(f"Model detection failed: {e}")
            return {
                'type': 'unknown',
                'variant': 'unknown',
                'is_llm': False,
                'error': str(e)
            }
    
    def _analyze_structure(self):
        """Analyze model structure"""
        self.node_types = [node.op_type for node in self.model.graph.node]
        
        # Build layer shapes map
        initializers = {init.name: init for init in self.model.graph.initializer}
        for node in self.model.graph.node:
            for inp in node.input:
                if inp in initializers:
                    self.layer_shapes[node.name] = list(initializers[inp].dims)
    
    def _is_transformer(self) -> bool:
        """Check if model is a Transformer"""
        # Key indicators:
        # 1. MatMul operations (attention)
        # 2. Multiple MatMul in sequence
        # 3. Softmax (for attention scores)
        # 4. LayerNorm or BatchNorm
        
        has_matmul = 'MatMul' in self.node_types
        has_softmax = 'Softmax' in self.node_types
        has_norm = 'LayerNormalization' in self.node_types or 'BatchNormalization' in self.node_types
        
        # Count MatMul density
        matmul_count = self.node_types.count('MatMul')
        total_ops = len(self.node_types)
        matmul_density = matmul_count / total_ops if total_ops > 0 else 0
        
        # Transformer typically has high MatMul density (>20%)
        return has_matmul and has_softmax and matmul_density > 0.2
    
    def _is_cnn(self) -> bool:
        """Check if model is a CNN"""
        has_conv = 'Conv' in self.node_types
        has_pool = 'MaxPool' in self.node_types or 'AveragePool' in self.node_types
        
        conv_count = self.node_types.count('Conv')
        total_ops = len(self.node_types)
        conv_density = conv_count / total_ops if total_ops > 0 else 0
        
        return has_conv and conv_density > 0.1
    
    def _is_rnn(self) -> bool:
        """Check if model is an RNN"""
        return ('LSTM' in self.node_types or 
                'GRU' in self.node_types or 
                'RNN' in self.node_types)
    
    def _detect_transformer_variant(self) -> Dict:
        """Detect specific Transformer model"""
        num_layers = self._count_transformer_layers()
        hidden_size = self._get_hidden_size()
        num_heads = self._estimate_attention_heads()
        vocab_size = self._get_vocab_size()
        
        variant = 'transformer'
        is_llm = False
        
        # GPT-2 detection
        if 1000 < vocab_size < 60000:
            if hidden_size == 768 and num_layers == 12:
                variant = 'gpt2-base'
                is_llm = True
            elif hidden_size == 1024 and num_layers == 24:
                variant = 'gpt2-medium'
                is_llm = True
            elif hidden_size == 1280 and num_layers == 36:
                variant = 'gpt2-large'
                is_llm = True
            elif hidden_size == 1600 and num_layers == 48:
                variant = 'gpt2-xl'
                is_llm = True
        
        # BERT detection
        elif vocab_size > 25000 and vocab_size < 35000:
            if hidden_size == 768 and num_layers == 12:
                variant = 'bert-base'
                is_llm = True
            elif hidden_size == 1024 and num_layers == 24:
                variant = 'bert-large'
                is_llm = True
        
        # T5 detection
        elif 'Embedding' in self.node_types and 'Split' in self.node_types:
            variant = 't5'
            is_llm = True
        
        return {
            'type': 'transformer',
            'variant': variant,
            'is_llm': is_llm,
            'num_layers': num_layers,
            'hidden_size': hidden_size,
            'num_heads': num_heads,
            'vocab_size': vocab_size,
            'total_params': self._count_params(),
            'characteristics': {
                'matmul_count': self.node_types.count('MatMul'),
                'softmax_count': self.node_types.count('Softmax'),
                'layernorm_count': self.node_types.count('LayerNormalization')
            }
        }
    
    def _detect_cnn_variant(self) -> Dict:
        """Detect specific CNN model"""
        num_layers = self.node_types.count('Conv')
        
        variant = 'cnn'
        
        # ResNet detection (has Add operations for skip connections)
        if 'Add' in self.node_types:
            add_count = self.node_types.count('Add')
            if add_count > 10:
                if num_layers < 20:
                    variant = 'resnet18'
                elif num_layers < 40:
                    variant = 'resnet34'
                elif num_layers < 60:
                    variant = 'resnet50'
                else:
                    variant = 'resnet101'
        
        # MobileNet detection (has DepthwiseConv)
        elif 'DepthwiseConv' in [n.op_type for n in self.model.graph.node]:
            variant = 'mobilenet'
        
        # VGG detection (many Conv layers, few other ops)
        elif num_layers > 10 and self.node_types.count('MaxPool') > 4:
            variant = 'vgg'
        
        return {
            'type': 'cnn',
            'variant': variant,
            'is_llm': False,
            'num_layers': num_layers,
            'total_params': self._count_params(),
            'characteristics': {
                'conv_count': num_layers,
                'pool_count': self.node_types.count('MaxPool') + self.node_types.count('AveragePool')
            }
        }
    
    def _detect_rnn_variant(self) -> Dict:
        """Detect specific RNN model"""
        if 'LSTM' in self.node_types:
            variant = 'lstm'
        elif 'GRU' in self.node_types:
            variant = 'gru'
        else:
            variant = 'rnn'
        
        return {
            'type': 'rnn',
            'variant': variant,
            'is_llm': False,
            'num_layers': self.node_types.count(variant.upper()),
            'total_params': self._count_params()
        }
    
    def _count_transformer_layers(self) -> int:
        """Count number of Transformer layers (encoder/decoder blocks)"""
        # Count LayerNorm operations as proxy (2 per Transformer layer typically)
        layernorm_count = self.node_types.count('LayerNormalization')
        return max(layernorm_count // 2, 1)
    
    def _get_hidden_size(self) -> Optional[int]:
        """Estimate hidden size from weight matrices"""
        for node in self.model.graph.node:
            if node.op_type == 'MatMul' or node.op_type == 'Gemm':
                if node.name in self.layer_shapes:
                    shape = self.layer_shapes[node.name]
                    if len(shape) >= 2:
                        # Common hidden sizes: 768, 1024, 1280, etc.
                        hidden = shape[-1]
                        if 500 < hidden < 5000:
                            return int(hidden)
        
        return None
    
    def _estimate_attention_heads(self) -> Optional[int]:
        """Estimate number of attention heads"""
        hidden_size = self._get_hidden_size()
        if hidden_size:
            # Common configurations
            if hidden_size == 768:
                return 12  # BERT-base, GPT-2
            elif hidden_size == 1024:
                return 16  # BERT-large
            elif hidden_size == 1280:
                return 20  # GPT-2-large
            elif hidden_size == 1600:
                return 25  # GPT-2-xl
        
        return None
    
    def _get_vocab_size(self) -> Optional[int]:
        """Get vocabulary size from embedding layer"""
        for init in self.model.graph.initializer:
            if 'embedding' in init.name.lower() or 'token' in init.name.lower():
                shape = list(init.dims)
                if len(shape) >= 2:
                    # First dimension is typically vocab size
                    vocab_size = shape[0]
                    if vocab_size > 1000:  # Sanity check
                        return int(vocab_size)
        
        return None
    
    def _count_params(self) -> int:
        """Count total parameters"""
        total = 0
        for init in self.model.graph.initializer:
            if init.dims:
                total += np.prod(init.dims)
        return int(total)
    
    def _count_linear_layers(self) -> int:
        """Count number of linear/dense layers"""
        return (self.node_types.count('MatMul') + 
                self.node_types.count('Gemm'))


if __name__ == "__main__":
    import sys
    if len(sys.argv) > 1:
        detector = ModelDetector()
        result = detector.detect(sys.argv[1])
        
        print(f"\n🔍 Model Detection Results:")
        print(f"  Type: {result.get('type')}")
        print(f"  Variant: {result.get('variant')}")
        print(f"  Is LLM: {result.get('is_llm')}")
        print(f"  Layers: {result.get('num_layers')}")
        if result.get('hidden_size'):
            print(f"  Hidden Size: {result.get('hidden_size')}")
        if result.get('num_heads'):
            print(f"  Attention Heads: {result.get('num_heads')}")
        if result.get('vocab_size'):
            print(f"  Vocab Size: {result.get('vocab_size'):,}")
        print(f"  Total Params: {result.get('total_params'):,}")
