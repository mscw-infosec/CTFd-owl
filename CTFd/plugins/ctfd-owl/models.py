import datetime

from CTFd.models import db, Challenges


class DynamicCheckChallenge(Challenges):
    __mapper_args__ = {"polymorphic_identity": "dynamic_check_docker"}
    id = db.Column(None, db.ForeignKey("challenges.id",
                                       ondelete="CASCADE"), primary_key=True)

    # deployments settings
    deployment = db.Column(db.String(32))
    dirname = db.Column(db.String(80))
    flag_type = db.Column(db.Text, default="dynamic")

    initial = db.Column(db.Integer, default=0)
    minimum = db.Column(db.Integer, default=0)
    decay = db.Column(db.Integer, default=0)

    # frp settings
    redirect_type = db.Column(db.Text, default="DIRECT")
    redirect_port = db.Column(db.Integer, default=80)

    def __init__(self, *args, **kwargs):
        super(DynamicCheckChallenge, self).__init__(**kwargs)
        self.initial = kwargs["value"]


class OwlConfigs(db.Model):
    key = db.Column(db.String(length=128), primary_key=True)
    value = db.Column(db.Text)

    def __init__(self, key, value):
        self.key = key
        self.value = value


class OwlContainers(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(128), default="")
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"))
    challenge_id = db.Column(db.Integer, db.ForeignKey("challenges.id"))
    docker_id = db.Column(db.String(32))
    ip = db.Column(db.String(32))
    port = db.Column(db.Integer)
    start_time = db.Column(db.DateTime, nullable=False, default=datetime.datetime.now(datetime.timezone.utc))
    renew_count = db.Column(db.Integer, nullable=False, default=0)
    flag = db.Column(db.String(128), nullable=False)

    # Extra owl.label.* values for forward-compatible UI/logic (stored as JSON string).
    # Kept as VARCHAR for portable defaults across SQLite/MySQL/Postgres.
    labels = db.Column(db.String(2048), default="{}")

    # Relationships
    user = db.relationship("Users", foreign_keys="OwlContainers.user_id", lazy="select")
    challenge = db.relationship(
        "Challenges", foreign_keys="OwlContainers.challenge_id", lazy="select"
    )

    def __init__(self, *args, **kwargs):
        super(OwlContainers, self).__init__(**kwargs)
