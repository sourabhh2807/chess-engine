from flask import Flask, request, jsonify
from flask_cors import CORS
from engine import get_best_move

app = Flask(__name__)
CORS(app, resources={r"/*": {"origins": "*"}})

@app.route("/")
def home():
    return "Chess Engine Backend is running"

@app.route("/move", methods=["POST"])
def move():
    data = request.get_json(force=True)
    fen = data.get("fen")
    if not fen:
        return jsonify({"error": "missing_fen"}), 400

    # Optional depth parameter for difficulty (default 3). Increase for harder AI.
    depth = int(data.get("depth", 3)) if data.get("depth") is not None else 3
    ai_move = get_best_move(fen, depth=depth)

    return jsonify({
        "move": ai_move
    })


if __name__ == "__main__":
    app.run()




