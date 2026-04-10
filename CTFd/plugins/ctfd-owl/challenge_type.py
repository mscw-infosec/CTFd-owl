import math

from flask import Blueprint, current_app, Request
from sqlalchemy import inspect as sa_inspect

from CTFd.models import (
    db,
    Solves,
    Fails,
    Flags,
    Challenges,
    ChallengeFiles,
    Tags,
    Hints,
    Users,
    Notifications,
)
from CTFd.plugins.challenges import BaseChallenge
from CTFd.plugins.flags import get_flag_class, FlagException
from CTFd.utils.user import get_current_user as ctfd_get_current_user
from CTFd.utils import get_config
from CTFd.utils.modes import get_model
from CTFd.utils.uploads import delete_file
from CTFd.utils.user import get_ip
from .utils.control_utils import ControlUtil
from .utils.db_utils import DBUtils
from .models import DynamicCheckChallenge, OwlContainers, OwlSharedSessions, SharedDynamicCheckChallenge


SHARED_CHALLENGE_TYPE_ID = "dynamic_check_docker_shared"


class BaseDynamicCheckValueChallenge(BaseChallenge):
    blueprint = Blueprint(
        "ctfd-owl-challenge",
        __name__,
        template_folder="templates",
        static_folder="assets",
        url_prefix="/plugins/ctfd-owl"
    )
    challenge_model = DynamicCheckChallenge
    instance_mode = "personal"

    @classmethod
    def _normalize_target_type(cls, raw_type):
        target_type = str(raw_type or "").strip()
        if target_type == SHARED_CHALLENGE_TYPE_ID:
            return SHARED_CHALLENGE_TYPE_ID
        return DynamicCheckValueChallenge.id

    @classmethod
    def _instance_mode_for_type(cls, target_type):
        return "shared" if target_type == SHARED_CHALLENGE_TYPE_ID else "personal"

    @classmethod
    def _challenge_class_for_type(cls, challenge_type):
        normalized_type = cls._normalize_target_type(challenge_type)
        if normalized_type == SHARED_CHALLENGE_TYPE_ID:
            return SharedDynamicCheckValueChallenge
        return DynamicCheckValueChallenge

    @classmethod
    def _extract_challenge_id(cls, challenge):
        try:
            return int(sa_inspect(challenge).identity[0])
        except Exception:
            return int(challenge.id)

    @classmethod
    def _cleanup_instances_for_challenge(cls, challenge_id):
        rows = OwlContainers.query.filter_by(challenge_id=challenge_id).all()
        owner_ids = []
        seen = set()

        for row in rows:
            marker = row.user_id
            if marker in seen:
                continue
            seen.add(marker)
            owner_ids.append(marker)

        for owner_id in owner_ids:
            try:
                ControlUtil.destroy_container_for_challenge(user_id=owner_id, challenge_id=challenge_id)
            except Exception:
                pass

        DBUtils.remove_shared_sessions_for_challenge(challenge_id=challenge_id)

    @classmethod
    def read(cls, challenge):
        challenge_id = cls._extract_challenge_id(challenge)
        challenge = DynamicCheckChallenge.query.filter_by(id=challenge_id).first_or_404()
        effective_class = cls._challenge_class_for_type(getattr(challenge, "type", cls.id))
        data = {
            "id": challenge.id,
            "name": challenge.name,
            "value": challenge.value,
            "initial": challenge.initial,
            "decay": challenge.decay,
            "minimum": challenge.minimum,
            "description": challenge.description,
            "category": challenge.category,
            "state": challenge.state,
            "max_attempts": challenge.max_attempts,
            "type": challenge.type,
            "instance_mode": effective_class.instance_mode,
            "type_data": {
                "id": effective_class.id,
                "name": effective_class.name,
                "templates": effective_class.templates,
                "scripts": effective_class.scripts,
            },
        }
        return data

    @classmethod
    def update(cls, challenge: challenge_model, request: Request):
        data = request.form or request.get_json() or {}
        challenge_id = int(challenge.id)
        current_type = str(getattr(challenge, "type", "") or "").strip()
        target_type = cls._normalize_target_type(data.get("type", current_type))
        target_instance_mode = cls._instance_mode_for_type(target_type)
        should_cleanup_instances = (
            current_type != target_type
            or str(getattr(challenge, "instance_mode", "personal") or "personal").strip().lower() != target_instance_mode
        )

        if should_cleanup_instances:
            cls._cleanup_instances_for_challenge(challenge_id=challenge_id)
            challenge = DynamicCheckChallenge.query.filter_by(id=challenge_id).first_or_404()

        for attr, value in data.items():
            if attr in ("type", "instance_mode", "reload_on_update_success"):
                continue
            if attr in ("initial", "minimum", "decay"):
                value = float(value)
            setattr(challenge, attr, value)

        challenge.instance_mode = target_instance_mode
        challenge.type = target_type

        model = get_model()

        solve_count = (
            Solves.query.join(model, Solves.account_id == model.id)
            .filter(
                Solves.challenge_id == challenge_id,
                model.hidden is False,
                model.banned is False,
            )
            .count()
        )

        value = (
            ((challenge.minimum - challenge.initial) / (challenge.decay ** 2))
            * (solve_count ** 2)
        ) + challenge.initial

        value = math.ceil(value)

        if value < challenge.minimum:
            value = challenge.minimum

        challenge.value = value

        db.session.commit()
        return DynamicCheckChallenge.query.filter_by(id=challenge_id).first_or_404()

    @classmethod
    def delete(cls, challenge):
        Fails.query.filter_by(challenge_id=challenge.id).delete()
        Solves.query.filter_by(challenge_id=challenge.id).delete()
        Flags.query.filter_by(challenge_id=challenge.id).delete()
        OwlContainers.query.filter_by(challenge_id=challenge.id).delete()
        OwlSharedSessions.query.filter_by(challenge_id=challenge.id).delete()
        files = ChallengeFiles.query.filter_by(challenge_id=challenge.id).all()
        for f in files:
            delete_file(f.id)
        ChallengeFiles.query.filter_by(challenge_id=challenge.id).delete()
        Tags.query.filter_by(challenge_id=challenge.id).delete()
        Hints.query.filter_by(challenge_id=challenge.id).delete()
        cls.challenge_model.query.filter_by(id=challenge.id).delete()
        Challenges.query.filter_by(id=challenge.id).delete()
        db.session.commit()

    @classmethod
    def attempt(cls, challenge, request):
        chal = cls.challenge_model.query.filter_by(id=challenge.id).first()
        data = request.form or request.get_json()
        submission = data["submission"].strip()
        user = ctfd_get_current_user()
        user_id = user.id

        if chal.flag_type == 'static':
            flags: list[Flags] = Flags.query.filter_by(challenge_id=challenge.id).all()
            for flag in flags:
                try:
                    if get_flag_class(flag.type).compare(flag, submission):
                        return True, "Correct"
                except FlagException as e:
                    return False, str(e)
            return False, "Incorrect"

        if cls.instance_mode == "shared":
            shared_rows = DBUtils.get_shared_container_rows(challenge_id=challenge.id)
            shared_flag_row = shared_rows[0] if shared_rows else None

            has_access = DBUtils.has_active_shared_session(user_id=user_id, challenge_id=challenge.id)
            if shared_flag_row and submission == shared_flag_row.flag:
                if has_access and DBUtils.is_container_alive(shared_flag_row):
                    return True, "Correct"
                return False, "Please solve it during the shared instance is running"

            if has_access and shared_flag_row and DBUtils.is_container_alive(shared_flag_row):
                return False, "Incorrect"
            return False, "Please solve it during the shared instance is running"

        container = OwlContainers.query.filter_by(user_id=user_id, challenge_id=challenge.id).first()
        subflag = OwlContainers.query.filter_by(flag=submission).first()

        if subflag:
            if int(subflag.challenge_id) != int(challenge.id):
                return False, "Incorrect Challenge"
            try:
                fflag = container.flag
            except Exception:
                fflag = ""
            if fflag == submission:
                return True, "Correct"
            else:
                flaguser = Users.query.filter_by(id=user_id).first()
                subuser = Users.query.filter_by(id=subflag.user_id).first()

                if (get_config("user_mode") == "teams" and flaguser and subuser
                    and getattr(flaguser, "team_id", None) and flaguser.team_id == getattr(subuser, "team_id", None)):
                    return True, "Correct"

                if flaguser.name == subuser.name:
                    return False, "Incorrect Challenge"
                else:
                    if flaguser.type == "admin":
                        return False, "Admin Test Other's Flag"
                    message = flaguser.name + " Submitted " + subuser.name + "'s Flag."
                    db.session.add(Notifications(title="Cheat Found", content=message))
                    flaguser.banned = True
                    db.session.commit()
                    messages = {"title": "Cheat Found", "content": message, "type": "background", "sound": True}
                    current_app.events_manager.publish(data=messages, type="notification")
                    return False, "Cheated"
        elif container:
            return False, "Incorrect"
        else:
            return False, "Please solve it during the container is running"

    @classmethod
    def solve(cls, user, team, challenge, request):
        chal = cls.challenge_model.query.filter_by(id=challenge.id).first()
        data = request.form or request.get_json()
        submission = data["submission"].strip()

        model = get_model()

        solve = Solves(
            user_id=user.id,
            team_id=team.id if team else None,
            challenge_id=challenge.id,
            ip=get_ip(req=request),
            provided=submission,
        )
        db.session.add(solve)

        solve_count = (
            Solves.query.join(model, Solves.account_id == model.id)
            .filter(
                Solves.challenge_id == challenge.id,
                model.hidden is False,
                model.banned is False,
            )
            .count()
        )

        solve_count -= 1

        value = (
            ((chal.minimum - chal.initial) / (chal.decay ** 2)) * (solve_count ** 2)
        ) + chal.initial

        value = math.ceil(value)

        if value < chal.minimum:
            value = chal.minimum
        chal.value = value

        db.session.commit()


class DynamicCheckValueChallenge(BaseDynamicCheckValueChallenge):
    id = "dynamic_check_docker"
    name = "dynamic_check_docker"
    challenge_model = DynamicCheckChallenge
    instance_mode = "personal"


class SharedDynamicCheckValueChallenge(BaseDynamicCheckValueChallenge):
    id = SHARED_CHALLENGE_TYPE_ID
    name = SHARED_CHALLENGE_TYPE_ID
    challenge_model = SharedDynamicCheckChallenge
    instance_mode = "shared"
