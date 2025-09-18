from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware # 1. CORSMiddleware 임포트

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