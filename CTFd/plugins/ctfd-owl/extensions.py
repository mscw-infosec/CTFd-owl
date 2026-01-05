import logging
import logging.handlers
import time

from CTFd.models import Users
from CTFd.utils import get_config
from CTFd.utils import user as current_user
from .utils.db_utils import DBUtils

USERS_MODE = "users"
TEAMS_MODE = "teams"


def get_effective_competition_mode() -> str:
    """Return the effective competition mode for instance ownership.

    The plugin supports an override via `owl_competition_mode`:
    - `auto`: follow the CTFd `user_mode` setting.
    - `users`: one container per user.
    - `teams`: one container per team.
    - `team_members`: one container per member (maps to `users` at runtime).
    """

    try:
        configs = DBUtils.get_all_configs()
        override = configs.get("owl_competition_mode", "auto")
    except Exception:
        override = "auto"

    ctfd_mode = get_config("user_mode")

    if override == "auto":
        return TEAMS_MODE if ctfd_mode == TEAMS_MODE else USERS_MODE

    if override == "teams":
        return TEAMS_MODE

    return USERS_MODE


def get_mode():
    """Return the user_id used as the container owner key.

    In `users` mode, this is the current user's id.
    In `teams` mode, the plugin stores a single shared instance per team under a
    specific member's user_id (first member with an active container, otherwise
    the current user).
    """
    effective_mode = get_effective_competition_mode()
    user = current_user.get_current_user()

    if effective_mode == USERS_MODE:
        return user.id

    # Team mode: keep legacy behavior (instances stored under a single team member's user_id) so the whole team shares the same container.
    team_id = user.team_id
    if not team_id:
        return user.id

    owner_user_id = user.id
    members = Users.query.filter_by(team_id=team_id)
    for member in members:
        if DBUtils.get_current_containers(user_id=member.id):
            owner_user_id = member.id
            break
    return owner_user_id


def log(logger, logformat, **kwargs):
    logger = logging.getLogger(logger)
    props = {
        "date": time.strftime("%m/%d/%Y %X"),
    }
    props.update(kwargs)
    msg = logformat.format(**props)
    print(msg)
    logger.info(msg)
