from flask import request

import flask

app = flask.Flask(__name__)


@app.route("/")
def index():
    return "This is the second service!", 200
