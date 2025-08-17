from flask import request

import flask

app = flask.Flask(__name__)


@app.route("/")
def index():
    return "Send POST request to /flag to solve this!", 200


@app.route("/flag", methods=["GET", "POST"])
def flag():
    if request.method == "GET":
        return "Wrong method!", 400
    else:
        return open("./flag", "r", encoding="utf-8").read(), 200
