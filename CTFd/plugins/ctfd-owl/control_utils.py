import time

from flask import session
from sqlalchemy.sql import and_

from CTFd.models import Challenges, Users
from .db_utils import DBUtils
from .docker_utils import DockerUtils
from .extensions import log


class ControlUtil:
    @staticmethod
    def new_container(user_id, challenge_id, prefix):
        rq = DockerUtils.up_docker_compose(user_id=user_id, challenge_id=challenge_id)
        if isinstance(rq, tuple):
            for container in rq[1]:
                log(
                    "owl",
                    "[{date}] {msg}",
                    msg=f'Container name: {prefix.lower()}_user{user_id}_{rq[4]}_{container["service"]}_1',
                )
                DBUtils.new_container(user_id, challenge_id, flag=rq[2], port=container["port"], docker_id=rq[0],
                                      ip=rq[3], name=f'{prefix.lower()}_user{user_id}_{rq[4]}_{container["service"]}_1',
                                      conntype=container["conntype"], comment=container["comment"],
                                      contport=container["cont_port"])
            return True
        else:
            return rq

    @staticmethod
    def destroy_container(user_id):
        try:
            docker_result = DockerUtils.remove_current_docker_container(user_id)
            return True
        except Exception as e:
            import traceback
            print(traceback.format_exc())
            return False

    @staticmethod
    def expired_container(user_id):
        DBUtils.renew_current_container(user_id=user_id)

    @staticmethod
    def get_container(user_id):
        return DBUtils.get_current_containers(user_id=user_id)

    @staticmethod
    def check_challenge(challenge_id, user_id):
        user = Users.query.filter_by(id=user_id).first()

        if user.type == "admin":
            Challenges.query.filter(
                Challenges.id == challenge_id
            ).first_or_404()
        else:
            Challenges.query.filter(
                Challenges.id == challenge_id,
                and_(Challenges.state != "hidden", Challenges.state != "locked"),
            ).first_or_404()

    @staticmethod
    def frequency_limit():
        if "limit" not in session:
            session["limit"] = int(time.time())
            return False

        if int(time.time()) - session["limit"] < 1:
            return True

        session["limit"] = int(time.time())
        return False
