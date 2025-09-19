import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.api.endpoints import drawing

app = FastAPI(title="Cerebrus Protocol Server")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include the API router from our endpoints file
app.include_router(drawing.router, prefix="/api", tags=["drawing"])

@app.get("/")
def read_root():
    return {"status": "Cerebrus Server is running"}

if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)