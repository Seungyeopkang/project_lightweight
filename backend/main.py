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
    """ .onnx 모델 파일을 업로드받아 구조를 분석하고 JSON으로 반환합니다. """

    if not model_file.filename.endswith('.onnx'):
        raise HTTPException(status_code=400, detail="잘못된 파일 형식입니다. .onnx 파일을 업로드해주세요.")

    try:
        contents = await model_file.read()
        onnx_model = onnx.load_from_string(contents)

        nodes = []
        edges = []
        
        # --- 여기가 수정된 부분 ---
        
        # 1. 먼저, 가중치/편향 등 '부품'(Initializer)의 이름 목록을 만들어 둡니다.
        initializer_names = {initializer.name for initializer in onnx_model.graph.initializer}

        # 2. 그래프의 실제 입력(Input)을 노드 목록에 추가합니다.
        for input_node in onnx_model.graph.input:
            # 부품 목록에 있는 입력은 건너뜁니다 (실제 데이터 입력만 추가).
            if input_node.name not in initializer_names:
                nodes.append({'data': {'id': input_node.name, 'label': f"Input\n{input_node.name}"}})

        # 3. 중간 노드(레이어)들과 그 연결 관계(엣지)를 추가합니다.
        for node in onnx_model.graph.node:
            # 각 노드의 대표 ID는 첫 번째 출력(output) 이름을 사용합니다.
            node_id = node.output[0]
            node_label = node.op_type  # 'Conv', 'Relu' 등
            
            nodes.append({'data': {'id': node_id, 'label': node_label}})
            
            # 이 노드로 들어오는 입력들을 순회하며 엣지를 만듭니다.
            for input_name in node.input:
                # 입력이 '부품' 목록에 포함되어 있지 않은 경우에만 엣지를 생성합니다.
                if input_name and input_name not in initializer_names:
                    edges.append({'data': {'source': input_name, 'target': node_id}})
        
        # --- 수정 끝 ---
        
        return {"nodes": nodes, "edges": edges}

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"ONNX 모델 분석 중 오류 발생: {e}")