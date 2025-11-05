from fastapi import FastAPI, File, UploadFile, HTTPException
from fastapi.middleware.cors import CORSMiddleware # 1. CORSMiddleware 임포트
import torch
import torch.fx as fx
import io
import onnx



# FastAPI 앱 인스턴스 생성
app = FastAPI()

# 2. 허용할 출처 목록 정의
# 지금은 리액트 개발 서버 주소만 추가합니다.
origins = [
    "http://localhost:5173",
    "http://127.0.0.1:5173", # Vite 개발 서버의 IP 주소 직접 접속 허용
]

# 3. CORS 미들웨어 추가
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,  # origins에 지정된 출처의 요청만 허용
    allow_credentials=True, # 쿠키 등 자격 증명 허용 여부
    allow_methods=["*"],    # 모든 HTTP 메소드 허용 (GET, POST 등)
    allow_headers=["*"],    # 모든 HTTP 헤더 허용
)

# 루트 경로 ("/")로 GET 요청이 올 때 실행될 함수 정의
@app.get("/")
def read_root():
    return {"message": "Hello World"}


# --- 여기에 새로운 API 두 개를 추가합니다 ---

# 1. 헬스 체크 API
@app.get("/api/health")
def health_check():
    """서버가 정상적으로 작동하는지 확인하는 API"""
    return {"status": "ok"}

# 2. 가짜 그래프 데이터 API
@app.get("/api/dummy-graph")
def get_dummy_graph():
    """프론트엔드 그래프 시각화 테스트를 위한 가짜 데이터"""
    dummy_graph_data = {
        "nodes": [
            {"data": {"id": "input_layer", "label": "Input"}},
            {"data": {"id": "conv1", "label": "Conv2d"}},
            {"data": {"id": "relu1", "label": "ReLU"}},
            {"data": {"id": "output_layer", "label": "Linear"}},
        ],
        "edges": [
            {"data": {"id": "e1", "source": "input_layer", "target": "conv1"}},
            {"data": {"id": "e2", "source": "conv1", "target": "relu1"}},
            {"data": {"id": "e3", "source": "relu1", "target": "output_layer"}},
        ]
    }
    return dummy_graph_data

@app.post("/api/upload-model")
async def upload_model(model_file: UploadFile = File(...)):
    """ .onnx 모델 파일을 업로드받아 '해상도 기반 계층 구조'로 분석하고 JSON으로 반환합니다. """

    if not model_file.filename.endswith('.onnx'):
        raise HTTPException(status_code=400, detail="잘못된 파일 형식입니다. .onnx 파일을 업로드해주세요.")

    try:
        contents = await model_file.read()
        onnx_model = onnx.load_from_string(contents)
        graph = onnx_model.graph

        nodes = []
        edges = []
        
        # --- 1단계: 해상도(Stage) 경계 식별 ---
        
        # { 'node_output_name': 'stage_id' }
        node_to_stage_map = {}
        # { 'node_output_name': 'node_op_type' }
        node_type_map = {}
        # 해상도를 변경하는 경계 연산자들
        BOUNDARY_OPS = {'MaxPool', 'AveragePool', 'Upsample', 'Resize'}
        
        stage_count = 0
        current_stage_id = f"Stage_{stage_count}"
        
        initializer_names = {init.name for init in graph.initializer}
        
        # 1-1. Input 노드 -> Stage_0 (Input)
        current_stage_id = "Stage_Input"
        nodes.append({'data': {'id': current_stage_id, 'label': 'Input', 'type': 'Input'}})
        for input_node in graph.input:
            if input_node.name not in initializer_names:
                node_to_stage_map[input_node.name] = current_stage_id
                node_type_map[input_node.name] = 'Input'

        stage_count += 1
        current_stage_id = f"Stage_{stage_count}" # Stage_1 부터 시작

        # 1-2. 그래프 노드 순회하며 Stage 할당
        parent_nodes_created = {"Stage_Input"}

        for node in graph.node:
            node_id = node.output[0]
            
            # 이 노드가 경계 연산자인지 확인
            is_boundary = False
            if node.op_type in BOUNDARY_OPS:
                is_boundary = True
            elif node.op_type == 'Conv':
                # 'strides' 속성을 확인
                for attr in node.attribute:
                    if attr.name == 'strides' and any(s > 1 for s in attr.ints):
                        is_boundary = True
                        break
            
            # 현재 노드에 스테이지 할당
            # 경계 노드 자신은 '이전' 스테이지의 마지막 노드로 간주합니다.
            if current_stage_id not in parent_nodes_created:
                nodes.append({'data': {'id': current_stage_id, 'label': current_stage_id, 'type': 'Stage'}})
                parent_nodes_created.add(current_stage_id)
            
            node_to_stage_map[node_id] = current_stage_id
            node_type_map[node_id] = node.op_type
            
            # 자식 노드도 생성 (부모 지정)
            nodes.append({'data': {'id': node_id, 'label': node.op_type, 'type': node.op_type, 'parent': current_stage_id}})
            
            # 경계 노드였다면, 다음 노드를 위해 새 스테이지로 이동
            if is_boundary:
                stage_count += 1
                current_stage_id = f"Stage_{stage_count}"

        # 1-3. Output 노드 -> Stage_Output
        output_stage_id = "Stage_Output"
        nodes.append({'data': {'id': output_stage_id, 'label': 'Output', 'type': 'Output'}})
        for output_node in graph.output:
            node_to_stage_map[output_node.name] = output_stage_id
            node_type_map[output_node.name] = 'Output'


        # --- 2단계: 엣지 생성 (부모 간 / 자식 간) ---
        parent_edges = set() # 부모 간 중복 엣지 방지

        for node in graph.node:
            target_node_id = node.output[0]
            if target_node_id not in node_to_stage_map: continue
            
            target_parent = node_to_stage_map[target_node_id]

            for input_name in node.input:
                if input_name in initializer_names or input_name not in node_to_stage_map:
                    continue
                
                source_node_id = input_name
                source_parent = node_to_stage_map[source_node_id]

                if source_parent == target_parent:
                    # [자식 간 엣지] (같은 Stage 내부 연결)
                    edges.append({'data': {'source': source_node_id, 'target': target_node_id}})
                else:
                    # [부모 간 엣지] (다른 Stage 간 연결)
                    edge_tuple = (source_parent, target_parent)
                    if edge_tuple not in parent_edges:
                        edges.append({'data': {'source': source_parent, 'target': target_parent}})
                        parent_edges.add(edge_tuple)
        
        # 마지막으로, Output 노드와 연결되는 부모 엣지 추가
        for output_node in graph.output:
            for node in graph.node:
                if output_node.name in node.output:
                    source_parent = node_to_stage_map[node.output[0]]
                    target_parent = output_stage_id
                    
                    edge_tuple = (source_parent, target_parent)
                    if edge_tuple not in parent_edges:
                        edges.append({'data': {'source': source_parent, 'target': target_parent}})
                        parent_edges.add(edge_tuple)

        return {"nodes": nodes, "edges": edges}

    except Exception as e:
        import traceback
        print(traceback.format_exc())
        raise HTTPException(status_code=500, detail=f"ONNX 모델 분석 중 오류 발생: {e}")