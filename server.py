import json
import random
import string
import threading
import time
import uuid
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse


BASE_DIR = Path(__file__).resolve().parent
QUESTION_DURATION_SECONDS = 20
rooms = {}
lock = threading.Lock()


def now_seconds():
    return time.time()


def make_room_code():
    while True:
        code = "".join(random.choices(string.ascii_uppercase + string.digits, k=6))
        if code not in rooms:
            return code


def sorted_players(room):
    players = list(room["players"].values())
    return sorted(players, key=lambda p: (-p["score"], p["name"].lower()))


def remaining_seconds(room):
    if room["status"] != "question" or room["currentIndex"] < 0:
        return 0
    elapsed = now_seconds() - room["questionStart"]
    return max(0, int(QUESTION_DURATION_SECONDS - elapsed))


def ensure_question_advance(room):
    if room["status"] == "question" and remaining_seconds(room) <= 0:
        room["status"] = "lobby"


class Handler(BaseHTTPRequestHandler):
    def send_json(self, data, status=200):
        body = json.dumps(data).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def read_json(self):
        length = int(self.headers.get("Content-Length", "0"))
        if not length:
            return {}
        raw = self.rfile.read(length)
        return json.loads(raw.decode("utf-8"))

    def serve_file(self, filename):
        path = BASE_DIR / filename
        if not path.exists() or not path.is_file():
            self.send_json({"error": "Not found"}, 404)
            return
        content_type = "text/plain"
        if filename.endswith(".html"):
            content_type = "text/html; charset=utf-8"
        elif filename.endswith(".css"):
            content_type = "text/css; charset=utf-8"
        elif filename.endswith(".js"):
            content_type = "application/javascript; charset=utf-8"

        data = path.read_bytes()
        self.send_response(200)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        parsed = urlparse(self.path)
        path = parsed.path

        if path == "/":
            self.serve_file("index.html")
            return

        if path in {"/index.html", "/styles.css", "/host.html", "/player.html", "/host.js", "/player.js"}:
            self.serve_file(path.lstrip("/"))
            return

        if path.startswith("/api/room/") and path.endswith("/state"):
            room_code = path.split("/")[3].upper()
            query = parse_qs(parsed.query)
            role = query.get("role", [""])[0]
            host_token = query.get("hostToken", [""])[0]
            player_id = query.get("playerId", [""])[0]
            with lock:
                room = rooms.get(room_code)
                if not room:
                    self.send_json({"error": "Room not found"}, 404)
                    return
                ensure_question_advance(room)

                if role == "host":
                    if room["hostToken"] != host_token:
                        self.send_json({"error": "Unauthorized"}, 401)
                        return
                    players = sorted_players(room)
                    current_question_text = ""
                    if room["status"] == "question" and room["currentIndex"] >= 0:
                        current_question_text = room["questions"][room["currentIndex"]]["text"]
                    self.send_json(
                        {
                            "status": room["status"],
                            "remainingSeconds": remaining_seconds(room),
                            "players": [{"name": p["name"], "score": p["score"]} for p in players],
                            "currentQuestionText": current_question_text,
                        }
                    )
                    return

                if role == "player":
                    player = room["players"].get(player_id)
                    if not player:
                        self.send_json({"error": "Player not found"}, 404)
                        return

                    payload = {
                        "status": room["status"],
                        "remainingSeconds": remaining_seconds(room),
                        "playerScore": player["score"],
                        "players": [{"name": p["name"], "score": p["score"]} for p in sorted_players(room)],
                        "currentQuestion": None,
                    }

                    if room["status"] == "question" and room["currentIndex"] >= 0:
                        q = room["questions"][room["currentIndex"]]
                        payload["currentQuestion"] = {
                            "index": room["currentIndex"],
                            "text": q["text"],
                            "answers": q["answers"],
                        }

                    self.send_json(payload)
                    return

                self.send_json({"error": "Invalid role"}, 400)
                return

        self.send_json({"error": "Not found"}, 404)

    def do_POST(self):
        parsed = urlparse(self.path)
        path = parsed.path
        body = self.read_json()

        if path == "/api/create-room":
            with lock:
                room_code = make_room_code()
                host_token = uuid.uuid4().hex
                rooms[room_code] = {
                    "hostToken": host_token,
                    "status": "lobby",
                    "questions": [],
                    "currentIndex": -1,
                    "questionStart": 0,
                    "players": {},
                    "answersByQuestion": {},
                }
            self.send_json({"roomCode": room_code, "hostToken": host_token})
            return

        if path == "/api/join":
            room_code = str(body.get("roomCode", "")).upper()
            name = str(body.get("name", "")).strip()
            if not room_code or not name:
                self.send_json({"error": "roomCode and name required"}, 400)
                return
            with lock:
                room = rooms.get(room_code)
                if not room:
                    self.send_json({"error": "Room not found"}, 404)
                    return
                player_id = uuid.uuid4().hex
                room["players"][player_id] = {"id": player_id, "name": name[:24], "score": 0}
            self.send_json({"playerId": player_id})
            return

        if path.startswith("/api/room/") and path.endswith("/start"):
            room_code = path.split("/")[3].upper()
            host_token = body.get("hostToken", "")
            with lock:
                room = rooms.get(room_code)
                if not room:
                    self.send_json({"error": "Room not found"}, 404)
                    return
                if room["hostToken"] != host_token:
                    self.send_json({"error": "Unauthorized"}, 401)
                    return
                if not room["questions"]:
                    self.send_json({"error": "No questions saved"}, 400)
                    return
                room["status"] = "question"
                room["currentIndex"] = 0
                room["questionStart"] = now_seconds()
                room["answersByQuestion"][0] = {}
            self.send_json({"ok": True})
            return

        if path.startswith("/api/room/") and path.endswith("/next"):
            room_code = path.split("/")[3].upper()
            host_token = body.get("hostToken", "")
            with lock:
                room = rooms.get(room_code)
                if not room:
                    self.send_json({"error": "Room not found"}, 404)
                    return
                if room["hostToken"] != host_token:
                    self.send_json({"error": "Unauthorized"}, 401)
                    return

                next_index = room["currentIndex"] + 1
                if next_index >= len(room["questions"]):
                    room["status"] = "ended"
                    room["currentIndex"] = -1
                else:
                    room["status"] = "question"
                    room["currentIndex"] = next_index
                    room["questionStart"] = now_seconds()
                    room["answersByQuestion"][next_index] = {}
            self.send_json({"ok": True})
            return

        if path == "/api/answer":
            room_code = str(body.get("roomCode", "")).upper()
            player_id = str(body.get("playerId", ""))
            answer_index = body.get("answerIndex")
            with lock:
                room = rooms.get(room_code)
                if not room:
                    self.send_json({"error": "Room not found"}, 404)
                    return
                if room["status"] != "question" or room["currentIndex"] < 0:
                    self.send_json({"error": "No active question"}, 400)
                    return
                player = room["players"].get(player_id)
                if not player:
                    self.send_json({"error": "Player not found"}, 404)
                    return
                q_index = room["currentIndex"]
                ensure_question_advance(room)
                if room["status"] != "question":
                    self.send_json({"error": "Question time ended"}, 400)
                    return
                q_answers = room["answersByQuestion"].setdefault(q_index, {})
                if player_id in q_answers:
                    self.send_json({"error": "Already answered"}, 400)
                    return

                q_answers[player_id] = answer_index
                q = room["questions"][q_index]
                if int(answer_index) == int(q["correctIndex"]):
                    points = 500 + remaining_seconds(room) * 20
                    player["score"] += points
            self.send_json({"ok": True})
            return

        self.send_json({"error": "Not found"}, 404)

    def do_PUT(self):
        parsed = urlparse(self.path)
        path = parsed.path
        body = self.read_json()

        if path.startswith("/api/room/") and path.endswith("/questions"):
            room_code = path.split("/")[3].upper()
            host_token = body.get("hostToken", "")
            questions = body.get("questions", [])
            if not isinstance(questions, list):
                self.send_json({"error": "questions must be a list"}, 400)
                return

            normalized = []
            for question in questions:
                text = str(question.get("text", "")).strip()
                answers = question.get("answers", [])
                correct_index = int(question.get("correctIndex", 0))
                if not text or not isinstance(answers, list) or len(answers) != 4:
                    self.send_json({"error": "Invalid question format"}, 400)
                    return
                cleaned_answers = [str(answer).strip() for answer in answers]
                if any(not answer for answer in cleaned_answers):
                    self.send_json({"error": "All answers are required"}, 400)
                    return
                if correct_index < 0 or correct_index > 3:
                    self.send_json({"error": "correctIndex must be 0-3"}, 400)
                    return
                normalized.append({"text": text, "answers": cleaned_answers, "correctIndex": correct_index})

            with lock:
                room = rooms.get(room_code)
                if not room:
                    self.send_json({"error": "Room not found"}, 404)
                    return
                if room["hostToken"] != host_token:
                    self.send_json({"error": "Unauthorized"}, 401)
                    return
                room["questions"] = normalized
                room["status"] = "lobby"
                room["currentIndex"] = -1
                room["answersByQuestion"] = {}
            self.send_json({"ok": True, "questionCount": len(normalized)})
            return

        self.send_json({"error": "Not found"}, 404)


if __name__ == "__main__":
    server = ThreadingHTTPServer(("0.0.0.0", 8080), Handler)
    print("NOT KAHOOT running on http://0.0.0.0:8080")
    server.serve_forever()
