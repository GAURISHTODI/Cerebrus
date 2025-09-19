from pydantic import BaseModel
from typing import Optional

class DrawPayload(BaseModel):
    path: str
    color: Optional[str] = "white"
    thickness: Optional[int] = 3

class Message(BaseModel):
    id: int
    path: str
    color: str
    thickness: int