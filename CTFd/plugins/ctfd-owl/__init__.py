from __future__ import division  # Use floating point for math calculations

import datetime
import fcntl
import logging
import os
import sys

from flask import render_template, request, jsonify, Blueprint, url_for
from flask_apscheduler import APScheduler

from CTFd.utils import get_config
from CTFd.utils.user import get_current_user as ctfd_get_current_user
from CTFd.models import Users
from CTFd.plugins import register_plugin_assets_directory, register_plugin_script
from CTFd.plugins.challenges import CHALLENGE_CLASSES
from CTFd.utils.decorators import admins_only, authed_only
from .challenge_type import DynamicCheckValueChallenge
from .utils.control_utils import ControlUtil
from .utils.db_utils import DBUtils
from .extensions import get_mode
from .utils.frp_utils import FrpUtils
from .utils.labels_utils import LabelsUtils
from .models import DynamicCheckChallenge, OwlContainers


def load(app):
    plugin_name = __name__.split('.')[-1]
    app.db.create_all()

    # Best-effort schema sync for existing installs.
    DBUtils.ensure_schema()
    
    register_plugin_assets_directory(
        app, base_path=f"/plugins/{plugin_name}/assets",
        endpoint=f'plugins.{plugin_name}.assets'
    )

    # Load instances UI globally via Plugins.scripts (do not hardcode into themes).
    if register_plugin_script:
        script_path = f"/plugins/{plugin_name}/assets/js/instances.js"
        try:
            register_plugin_script(script_path)
        except TypeError:
            # Some versions include `app` as the first arg.
            register_plugin_script(app, script_path)

    DynamicCheckValueChallenge.templates = {
        "create": f"/plugins/{plugin_name}/assets/html/create.html",
        "update": f"/plugins/{plugin_name}/assets/html/update.html",
        "view": f"/plugins/{plugin_name}/assets/html/view.html",
    }
    DynamicCheckValueChallenge.scripts = {
        "create": f"/plugins/{plugin_name}/assets/js/create.js",
        "update": f"/plugins/{plugin_name}/assets/js/update.js",
        "view": f"/plugins/{plugin_name}/assets/js/view.js",
    }
    CHALLENGE_CLASSES["dynamic_check_docker"] = DynamicCheckValueChallenge

    owl_blueprint = Blueprint(
        "ctfd-owl",
        __name__,
        template_folder="templates",
        static_folder="assets",
        url_prefix="/plugins/ctfd-owl"
    )

    log_dir = app.config["LOG_FOLDER"]
    logger_owl = logging.getLogger("owl")
    logger_owl.setLevel(logging.INFO)
    logs = {
        "owl": os.path.join(log_dir, "owl.log"),
    }
    try:
        for log in logs.values():
            if not os.path.exists(log):
                open(log, "a").close()
        container_log = logging.handlers.RotatingFileHandler(
            logs["owl"], maxBytes=10000
        )
        logger_owl.addHandler(container_log)
    except IOError:
        pass

    stdout = logging.StreamHandler(stream=sys.stdout)
    logger_owl.addHandler(stdout)
    logger_owl.propagate = 0

    @owl_blueprint.route('/admin/settings', methods=['GET'])
    @admins_only
    def admin_list_configs():
        configs = DBUtils.get_all_configs()
        ctfd_user_mode = get_config("user_mode")
        return render_template('configs.html', configs=configs, ctfd_user_mode=ctfd_user_mode)

    @owl_blueprint.route('/admin/settings', methods=['PATCH'])
    @admins_only
    def admin_save_configs():
        req = request.get_json()
        DBUtils.save_all_configs(req.items())
        return jsonify({'success': True})

    @owl_blueprint.route('/notifications/settings', methods=['GET'])
    def notifications_settings():
        configs = DBUtils.get_all_configs()
        notifications_mode = configs.get('owl_notifications_mode', 'toast')
        toast_strategy = configs.get('owl_toast_strategy', 'auto')
        return jsonify({
            'notifications_mode': notifications_mode,
            'toast_strategy': toast_strategy,
        })

    @owl_blueprint.route('/ui/settings', methods=['GET'])
    def ui_settings():
        configs = DBUtils.get_all_configs()
        raw = configs.get('instances_menu_enabled', 'true')
        if isinstance(raw, bool):
            enabled = raw
        else:
            s = str(raw).strip().lower()
            if s in ('1', 'true', 'yes', 'on'):
                enabled = True
            elif s in ('0', 'false', 'no', 'off', ''):
                enabled = False
            else:
                # Backward/edge compatibility: handle serialized arrays like "['false', 'true']".
                enabled = 'true' in s and 'false' not in s
                if 'true' in s and 'false' in s:
                    enabled = True
        return jsonify({'instances_menu_enabled': enabled})

    @owl_blueprint.route('/admin/containers/count', methods=['GET'])
    @admins_only
    def admin_list_containers_json():
        alive_count = DBUtils.get_all_alive_container_count()
        count = DBUtils.get_all_container_count()
        return {"alive_count": alive_count, "count": count}

    @owl_blueprint.route("/admin/containers", methods=['GET'])
    @admins_only
    # list alive containers
    def admin_list_containers():
        mode = get_mode()
        configs = DBUtils.get_all_configs()
        page = abs(request.args.get("page", 1, type=int))
        results_per_page = 50
        page_start = results_per_page * (page - 1)
        page_end = results_per_page * (page - 1) + results_per_page

        count = DBUtils.get_all_alive_container_count()
        containers = DBUtils.get_all_alive_container_page(page_start, page_end)

        pages = int(count / results_per_page) + (count % results_per_page > 0)
        return render_template("containers.html", containers=containers, pages=pages, curr_page=page,
                               curr_page_start=page_start, configs=configs, mode=mode)

    @owl_blueprint.route("/admin/containers", methods=['PATCH'])
    @admins_only
    def admin_expired_container():
        container_id = request.args.get('container_id', type=int)
        user_id = request.args.get('user_id', type=int)
        if container_id:
            c = OwlContainers.query.filter_by(id=container_id).first()
            if not c:
                return jsonify({'success': False, 'msg': 'Container not found'})
            ControlUtil.expired_container_for_challenge(user_id=c.user_id, challenge_id=c.challenge_id)
        elif user_id:
            ControlUtil.expired_container(user_id=user_id)
        else:
            return jsonify({'success': False, 'msg': 'Missing user_id or container_id'})
        return jsonify({'success': True})

    @owl_blueprint.route("/admin/containers", methods=['DELETE'])
    @admins_only
    def admin_delete_container():
        container_id = request.args.get('container_id', type=int)
        user_id = request.args.get('user_id', type=int)
        if container_id:
            c = OwlContainers.query.filter_by(id=container_id).first()
            if not c:
                return jsonify({'success': False, 'msg': 'Container not found'})
            ControlUtil.destroy_container_for_challenge(user_id=c.user_id, challenge_id=c.challenge_id)
        elif user_id:
            ControlUtil.destroy_container(user_id)
        else:
            return jsonify({'success': False, 'msg': 'Missing user_id or container_id'})
        return jsonify({'success': True})

    @owl_blueprint.route('/container', methods=['GET'])
    @authed_only
    def list_container():
        try:
            viewer = ctfd_get_current_user()
            viewer_id = int(viewer.id)
            viewer_team_id = getattr(viewer, 'team_id', None)
            challenge_id = request.args.get('challenge_id', type=int)
            ControlUtil.check_challenge(challenge_id, viewer_id)
            configs = DBUtils.get_all_configs()
            ctfd_user_mode = get_config('user_mode')
            effective_mode = get_mode()

            # Visibility semantics:
            # - users: only show current user's instance
            # - teams: allow access to any teammate instance (still owned per-user)
            requested_owner_user_id = request.args.get('owner_user_id', type=int)

            manage_owner_user_id = viewer_id
            data: list[OwlContainers] = ControlUtil.get_container_for_challenge(user_id=viewer_id, challenge_id=challenge_id)

            if effective_mode == 'teams' and ctfd_user_mode == 'teams' and viewer_team_id:
                # Optional explicit selection.
                if requested_owner_user_id and int(requested_owner_user_id) != int(viewer_id):
                    target = Users.query.filter_by(id=requested_owner_user_id).first()
                    if target and target.team_id == viewer_team_id:
                        cand = ControlUtil.get_container_for_challenge(user_id=int(requested_owner_user_id), challenge_id=challenge_id)
                        if cand:
                            manage_owner_user_id = int(requested_owner_user_id)
                            data = cand

                # If user has no own instance, fall back to the newest teammate instance for display.
                if not data:
                    timeout = int(configs.get("docker_timeout", "3600"))
                    threshold = datetime.datetime.now(datetime.timezone.utc).replace(tzinfo=None) - datetime.timedelta(seconds=timeout)
                    member_ids = [m.id for m in Users.query.filter_by(team_id=viewer_team_id).all()]
                    if member_ids:
                        candidate = OwlContainers.query.filter(
                            OwlContainers.challenge_id == challenge_id,
                            OwlContainers.user_id.in_(member_ids),
                            OwlContainers.start_time >= threshold,
                        ).order_by(OwlContainers.start_time.desc()).first()
                        if candidate:
                            manage_owner_user_id = int(candidate.user_id)
                            data = ControlUtil.get_container_for_challenge(user_id=manage_owner_user_id, challenge_id=challenge_id)

            timeout = int(configs.get("docker_timeout", "3600"))

            containers_data = []
            if data is not None:
                owners_map = {}
                for container in data:
                    if manage_owner_user_id is not None and int(container.user_id) != int(manage_owner_user_id):
                        continue
                    labels_obj = LabelsUtils.loads_labels(getattr(container, "labels", "{}") or "{}")
                    if container.user_id not in owners_map:
                        owners_map[int(container.user_id)] = {
                            'id': int(container.user_id),
                            'name': container.user.name if getattr(container, 'user', None) else str(container.user_id),
                            'url': url_for('users.public', user_id=container.user_id),
                        }
                    containers_data.append({
                        "port": container.port,
                        "remaining_time": timeout - (datetime.datetime.now(datetime.timezone.utc).replace(tzinfo=None) - container.start_time).seconds,
                        "labels": labels_obj,
                    })

                owner_obj = owners_map.get(int(manage_owner_user_id)) if manage_owner_user_id is not None else None
                return jsonify({'success': True, 'ip': configs.get('frp_direct_ip_address', ""),
                                'containers_data': containers_data,
                                'manage_owner_user_id': manage_owner_user_id,
                                'owners': list(owners_map.values()),
                                'owner': owner_obj,
                                'effective_mode': effective_mode})
            else:
                return jsonify({'success': True})
        except Exception as e:
            import traceback
            return jsonify({'success': False, 'msg': str(e) + traceback.format_exc()})

    @owl_blueprint.route('/container', methods=['POST'])
    @authed_only
    def new_container():
        try:
            viewer = ctfd_get_current_user()
            viewer_id = int(viewer.id)
            viewer_team_id = getattr(viewer, 'team_id', None)
            effective_mode = get_mode()
            owner_user_id = viewer_id

            if ControlUtil.frequency_limit():
                return jsonify({'success': False, 'msg': 'Frequency limit, You should wait at least 1 min.'})

            challenge_id = request.args.get('challenge_id', type=int)
            ControlUtil.check_challenge(challenge_id, viewer_id)

            configs = DBUtils.get_all_configs()

            # Prevent concurrent launches per owner.
            if not DBUtils.acquire_launch_lock(user_id=owner_user_id, challenge_id=challenge_id, ttl_seconds=120):
                return jsonify({'success': False, 'msg': 'Instance launch already in progress. Please wait.'})

            try:
                # Disallow duplicate instance for the same challenge.
                exist_for_chal = ControlUtil.get_container_for_challenge(user_id=owner_user_id, challenge_id=challenge_id)
                if exist_for_chal:
                    return jsonify({'success': False, 'msg': 'You already have an instance for this challenge.'})

                ctfd_user_mode = get_config('user_mode')

                # Enforce per-user max instances (alive), counted by distinct challenge_id.
                # Applies per actual user, even when visibility is team.
                max_per_user = int(configs.get('instances_max_per_user', '1') or '1')
                if max_per_user > 0:
                    alive_for_user = DBUtils.get_alive_instance_count_for_user(user_id=owner_user_id)
                    if alive_for_user >= max_per_user:
                        return jsonify({'success': False, 'msg': f'Max instances per user exceed ({max_per_user}).'})

                # Enforce per-team max instances (alive) when user is in a team.
                # Default is "auto" = team size.
                if ctfd_user_mode == 'teams':
                    if viewer_team_id:
                        members = Users.query.filter_by(team_id=viewer_team_id).all()
                        member_ids = [m.id for m in members]
                        team_size = len(member_ids)
                        raw_team_max = (configs.get('instances_max_per_team', 'auto') or 'auto')
                        if str(raw_team_max).lower() == 'auto':
                            max_per_team = team_size
                        else:
                            max_per_team = int(raw_team_max)
                        if max_per_team > 0:
                            alive_for_team = DBUtils.get_alive_instance_count_for_team(member_ids)
                            if alive_for_team >= max_per_team:
                                return jsonify({'success': False, 'msg': f'Max instances per team exceed ({max_per_team}).'})

                current_count = DBUtils.get_all_alive_container_count()
                # print(configs.get("docker_max_container_count"))
                if configs.get("docker_max_container_count") != "None":
                    if int(configs.get("docker_max_container_count")) <= int(current_count):
                        return jsonify({'success': False, 'msg': 'Max container count exceed.'})

                dynamic_docker_challenge = DynamicCheckChallenge.query \
                    .filter(DynamicCheckChallenge.id == challenge_id) \
                    .first_or_404()
                try:
                    result = ControlUtil.new_container(user_id=owner_user_id, challenge_id=challenge_id,
                                                       prefix=configs.get("docker_flag_prefix"))
                    if isinstance(result, bool):
                        return jsonify({'success': True})
                    else:
                        return jsonify({'success': False, 'msg': str(result)})
                except Exception as e:
                    return jsonify({'success': True,
                                    'msg': 'Failed when launch instance, please contact with the admin. Error Type:{} Error msg:{}'.format(
                                        e.__class__.__name__, e)})
            finally:
                DBUtils.release_launch_lock(user_id=owner_user_id)
        except Exception as e:
            return jsonify({'success': False, 'msg': str(e)})

    @owl_blueprint.route('/container', methods=['DELETE'])
    @authed_only
    def destroy_container():
        viewer = ctfd_get_current_user()
        viewer_id = int(viewer.id)
        viewer_team_id = getattr(viewer, 'team_id', None)
        effective_mode = get_mode()
        base_owner_user_id = viewer_id
        challenge_id = request.args.get('challenge_id', type=int)

        if ControlUtil.frequency_limit():
            return jsonify({'success': False, 'msg': 'Frequency limit, You should wait at least 1 min.'})

        configs = DBUtils.get_all_configs()
        ctfd_user_mode = get_config('user_mode')

        owner_user_id = request.args.get('owner_user_id', type=int) or base_owner_user_id
        if effective_mode == 'teams' and ctfd_user_mode == 'teams' and viewer_team_id and int(owner_user_id) != int(viewer_id):
            target = Users.query.filter_by(id=owner_user_id).first()
            if not target or target.team_id != viewer_team_id:
                return jsonify({'success': False, 'msg': 'Invalid instance owner.'})
        else:
            owner_user_id = base_owner_user_id

        if ControlUtil.destroy_container_for_challenge(user_id=owner_user_id, challenge_id=challenge_id):
            return jsonify({'success': True})
        return jsonify({'success': False, 'msg': 'Failed when destroy instance, please contact with the admin!'})

    @owl_blueprint.route('/container', methods=['PATCH'])
    @authed_only
    def renew_container():
        viewer = ctfd_get_current_user()
        viewer_id = int(viewer.id)
        viewer_team_id = getattr(viewer, 'team_id', None)
        effective_mode = get_mode()
        base_owner_user_id = viewer_id
        if ControlUtil.frequency_limit():
            return jsonify({'success': False, 'msg': 'Frequency limit, You should wait at least 1 min.'})

        configs = DBUtils.get_all_configs()
        challenge_id = request.args.get('challenge_id', type=int)
        ControlUtil.check_challenge(challenge_id, viewer_id)
        docker_max_renew_count = int(configs.get("docker_max_renew_count"))
        ctfd_user_mode = get_config('user_mode')

        owner_user_id = request.args.get('owner_user_id', type=int) or base_owner_user_id
        if effective_mode == 'teams' and ctfd_user_mode == 'teams' and viewer_team_id and int(owner_user_id) != int(viewer_id):
            target = Users.query.filter_by(id=owner_user_id).first()
            if not target or target.team_id != viewer_team_id:
                return jsonify({'success': False, 'msg': 'Invalid instance owner.'})
        else:
            owner_user_id = base_owner_user_id

        containers: list[OwlContainers] = DBUtils.get_current_containers_for_challenge(user_id=owner_user_id, challenge_id=challenge_id)
        if containers is None:
            return jsonify({'success': False, 'msg': 'Instance not found.'})
        if containers[0].renew_count >= docker_max_renew_count:
            return jsonify({'success': False, 'msg': 'Max renewal times exceed.'})

        ControlUtil.expired_container_for_challenge(user_id=owner_user_id, challenge_id=challenge_id)

        return jsonify({'success': True})

    @owl_blueprint.route('/instances', methods=['GET'])
    @authed_only
    def list_instances():
        """List all alive instances for the current user or their team."""
        viewer = ctfd_get_current_user()
        viewer_id = int(viewer.id)
        viewer_team_id = getattr(viewer, 'team_id', None)
        configs = DBUtils.get_all_configs()
        frp_ip = configs.get('frp_direct_ip_address', "")
        timeout = int(configs.get("docker_timeout", "3600"))
        threshold = datetime.datetime.now(datetime.timezone.utc).replace(tzinfo=None) - datetime.timedelta(seconds=timeout)

        ctfd_user_mode = get_config('user_mode')
        effective_mode = get_mode()

        user_ids = [viewer_id]
        if ctfd_user_mode == 'teams' and viewer_team_id and effective_mode == 'teams':
            members = Users.query.filter_by(team_id=viewer_team_id).all()
            user_ids = [m.id for m in members]

        rows: list[OwlContainers] = OwlContainers.query.filter(
            OwlContainers.user_id.in_(user_ids),
            OwlContainers.start_time >= threshold,
        ).all()

        instances = {}
        for r in rows:
            key = (int(r.user_id), int(r.challenge_id), str(r.docker_id))
            if key not in instances:
                remaining = timeout - (datetime.datetime.now(datetime.timezone.utc).replace(tzinfo=None) - r.start_time).seconds
                instances[key] = {
                    'challenge_id': int(r.challenge_id),
                    'challenge_name': r.challenge.name if getattr(r, 'challenge', None) else str(r.challenge_id),
                    'owner_user_id': int(r.user_id),
                    'owner_name': r.user.name if getattr(r, 'user', None) else str(r.user_id),
                    'owner_url': url_for('users.public', user_id=r.user_id),
                    'remaining_time': remaining,
                    'services': [],
                }

            labels_obj = LabelsUtils.loads_labels(getattr(r, 'labels', '{}') or '{}')
            instances[key]['services'].append({
                'port': int(r.port),
                'labels': labels_obj,
            })

        result = list(instances.values())

        # Sort: own first, then by challenge name.
        result.sort(key=lambda x: (0 if int(x['owner_user_id']) == int(viewer.id) else 1, x.get('challenge_name', '')))
        return jsonify({'success': True, 'instances': result, 'ip': frp_ip})

    def auto_clean_container():
        with app.app_context():
            results = DBUtils.get_all_expired_container()
            for (uid, cid) in {(r.user_id, r.challenge_id) for r in results}:
                ControlUtil.destroy_container_for_challenge(uid, cid)
            FrpUtils.update_frp_redirect()

    app.register_blueprint(owl_blueprint)

    try:
        lock_file = open("/tmp/ctfd_owl.lock", "w")
        lock_fd = lock_file.fileno()
        fcntl.lockf(lock_fd, fcntl.LOCK_EX | fcntl.LOCK_NB)

        scheduler = APScheduler()
        scheduler.init_app(app)
        scheduler.start()
        scheduler.add_job(id='owl-auto-clean', func=auto_clean_container, trigger="interval", seconds=10)

        print("[CTFd Owl] Started successfully")
    except IOError:
        pass
