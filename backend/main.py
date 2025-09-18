from fastapi import FastAPI

# FastAPI 앱 인스턴스 생성
app = FastAPI()

# 루트 경로 ("/")로 GET 요청이 올 때 실행될 함수 정의
@app.get("/")
def read_root():
    return {"message": "Hello World"}