import time
from collections import defaultdict
from app.schemas.message import DrawPayload, Message

message_queues = defaultdict(list)
MAX_QUEUE_LENGTH = 50

def add_message_to_room(room_id: str, payload: DrawPayload) -> Message:
    message = Message(
        id=int(time.time() * 1000),
        path=payload.path,
        color=payload.color,
        thickness=payload.thickness
    )
    queue = message_queues[room_id]
    queue.append(message)
    if len(queue) > MAX_QUEUE_LENGTH:
        queue.pop(0)
    return message

def get_new_messages(room_id: str, last_message_id: int) -> list[Message]:
    room_queue = message_queues.get(room_id, [])
    return [msg for msg in room_queue if msg.id > last_message_id]