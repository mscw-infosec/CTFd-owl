import logging
import logging.handlers
import time

from CTFd.utils import get_config
from .utils.db_utils import DBUtils

USERS_MODE = "users"
TEAMS_MODE = "teams"


def get_mode() -> str:
    """Return the effective competition mode for instance visibility/management.

    Supported config values for `instances_visibility`:
    - `launcher_only`: only the launcher can access/manage their instance
    - `team_members`: any team member can access/manage teammate instances (CTFd team mode only)
    """

    try:
        configs = DBUtils.get_all_configs()
        override = str(configs.get("instances_visibility", "launcher_only") or "launcher_only").strip().lower()
    except Exception:
        override = "launcher_only"

    ctfd_mode = get_config("user_mode")

    # If CTFd is in users mode, teams are not applicable.
    if ctfd_mode != TEAMS_MODE:
        return USERS_MODE

    if override == "team_members":
        return TEAMS_MODE

    return USERS_MODE


def log(logger, logformat, **kwargs):
    logger = logging.getLogger(logger)
    props = {
        "date": time.strftime("%m/%d/%Y %X"),
    }
    props.update(kwargs)
    msg = logformat.format(**props)
    print(msg)
    logger.info(msg)
