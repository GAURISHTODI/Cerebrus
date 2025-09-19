import time
import asyncio
from fastapi import APIRouter
from app.services import room_manager
from app.schemas.message import DrawPayload

router = APIRouter()

@router.post("/draw/{room_id}", status_code=201)
async def receive_draw_data(room_id: str, payload: DrawPayload):
    # NEW: Log when this endpoint is hit
    print(f"Received draw data for room: {room_id}")
    
    message = room_manager.add_message_to_room(room_id, payload)
    return {"status": "success", "message_id": message.id}

@router.get("/poll/{room_id}/{last_message_id}")
async def poll_for_updates(room_id: str, last_message_id: int):
    # NEW: Log when a client starts polling
    print(f"Client polling for room '{room_id}' (last message id: {last_message_id})")

    start_time = time.time()
    while time.time() - start_time < 25:
        new_messages = room_manager.get_new_messages(room_id, last_message_id)
        if new_messages:
            print(f"--> Found {len(new_messages)} new message(s) for room '{room_id}'. Responding.")
            return {
                "status": "new_messages", 
                "messages": new_messages,
                "server_timestamp": int(time.time() * 1000)
            }
        await asyncio.sleep(0.5)
    
    print(f"--> No new messages for room '{room_id}'. Poll timed out.")
    return {"status": "no_new_messages", "messages": [], "server_timestamp": int(time.time() * 1000)}