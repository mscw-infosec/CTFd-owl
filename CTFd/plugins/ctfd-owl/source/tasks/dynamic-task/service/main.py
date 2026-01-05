from flask import Flask, request
import os

app = Flask(__name__)

FLAG = os.getenv("FLAG")

@app.route("/")
def index():
    return "Send POST request to /flag to solve this!", 200


@app.route("/flag", methods=["GET", "POST"])
def flag():
    if request.method == "GET":
        return "Wrong method!", 400
    else:
        return FLAG, 200
