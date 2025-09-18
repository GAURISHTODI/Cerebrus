# CerebrusProject/backend/main.py (Final HTTP Long Polling Version)

import os
import time
import asyncio
from collections import defaultdict
import uvicorn
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from google.cloud import firestore
import random

# --- Configuration ---
# This line tells the script where to find your Google Cloud credentials file.
os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = "gcp_credentials.json"

# --- Database Setup ---
try:
    db = firestore.Client()
    print("Firestore connection successful.")
except Exception as e:
    db = None
    print(f"Error connecting to Firestore: {e}")

# --- Server Setup ---
app = FastAPI()

# Add CORS middleware to allow all origins, methods, and headers.
# This is important for allowing the mobile app to connect without issues.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- In-Memory State Management ---
# This will act as a temporary message queue for each room.
# The key is the room_id, the value is a list of messages (dictionaries).
message_queues = defaultdict(list)

# --- HTTP Endpoints ---

@app.post("/draw/{room_id}")
async def receive_draw_data(room_id: str, data: dict):
    """
    Receives drawing data from a client via a POST request
    and adds it to the appropriate room's message queue.
    """
    if not data or 'path' not in data:
        raise HTTPException(status_code=400, detail="Invalid draw data")
    
    # Create the message object, accepting color and thickness from the client.
    message = {
        "id": int(time.time() * 1000), # Use a millisecond timestamp as a unique ID.
        "path": data.get("path"),
        "color": data.get("color", "white"),
        "thickness": data.get("thickness", 3)
    }
    
    # Add the new message to the queue for the specified room.
    message_queues[room_id].append(message)
    
    # To prevent using infinite memory, we'll keep only the last 50 messages per room.
    if len(message_queues[room_id]) > 50:
        message_queues[room_id].pop(0)

    return {"status": "success", "message_id": message.get("id")}


@app.get("/poll/{room_id}/{last_message_id}")
async def poll_for_updates(room_id: str, last_message_id: int):
    """
    A client calls this GET endpoint to wait for new messages.
    This is the "long poll" part of the architecture. The server holds the connection
    open until a new message arrives or a timeout is reached.
    """
    start_time = time.time()
    
    # Poll for a maximum of 25 seconds.
    while time.time() - start_time < 25:
        room_queue = message_queues.get(room_id, [])
        # Find all messages in the queue that are newer than the last one the client saw.
        new_messages = [msg for msg in room_queue if msg["id"] > last_message_id]
        
        if new_messages:
            # If new messages are found, return them immediately.
            return {
                "status": "new_messages", 
                "messages": new_messages,
                "server_timestamp": int(time.time() * 1000)
            }
        
        # If no new messages, wait for half a second and check again.
        await asyncio.sleep(0.5)
        
    # If 25 seconds pass with no new messages, return an empty response.
    # The client will then immediately start a new poll request.
    return {"status": "no_new_messages", "messages": [], "server_timestamp": int(time.time() * 1000)}

# --- Main Entry Point ---
if __name__ == "__main__":
    print("Starting Cerebrus server with HTTP Long Polling...")
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)