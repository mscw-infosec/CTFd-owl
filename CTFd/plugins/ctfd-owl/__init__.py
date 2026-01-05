from __future__ import division  # Use floating point for math calculations

import datetime
import fcntl
import logging
import os
import sys

from flask import render_template, request, jsonify, Blueprint
from flask_apscheduler import APScheduler

from CTFd import utils
from CTFd.plugins import register_plugin_assets_directory
from CTFd.plugins.challenges import CHALLENGE_CLASSES
from CTFd.utils.decorators import admins_only, authed_only
from .challenge_type import DynamicCheckValueChallenge
from .utils.control_utils import ControlUtil
from .utils.db_utils import DBUtils
from .extensions import get_mode, get_effective_competition_mode
from .utils.frp_utils import FrpUtils
from .models import DynamicCheckChallenge, OwlContainers


def load(app):
    plugin_name = __name__.split('.')[-1]
    app.db.create_all()
    register_plugin_assets_directory(
        app, base_path=f"/plugins/{plugin_name}/assets",
        endpoint=f'plugins.{plugin_name}.assets'
    )

    DynamicCheckValueChallenge.templates = {
        "create": f"/plugins/{plugin_name}/assets/html/create.html",
        "update": f"/plugins/{plugin_name}/assets/html/update.html",
        "view": f"/plugins/{plugin_name}/assets/html/view.html",
    }
    DynamicCheckValueChallenge.scripts = {
        "create": f"/plugins/{plugin_name}/assets/js/create.js",
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
        return render_template('configs.html', configs=configs)

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
        mode = get_effective_competition_mode()
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
        user_id = request.args.get('user_id')
        ControlUtil.expired_container(user_id=user_id)
        return jsonify({'success': True})

    @owl_blueprint.route("/admin/containers", methods=['DELETE'])
    @admins_only
    def admin_delete_container():
        user_id = request.args.get('user_id')
        ControlUtil.destroy_container(user_id)
        return jsonify({'success': True})

    @owl_blueprint.route('/container', methods=['GET'])
    @authed_only
    def list_container():
        try:
            user_id = get_mode()
            challenge_id = request.args.get('challenge_id')
            ControlUtil.check_challenge(challenge_id, user_id)
            data: list[OwlContainers] = ControlUtil.get_container(user_id=user_id)
            configs = DBUtils.get_all_configs()
            timeout = int(configs.get("docker_timeout", "3600"))

            containers_data = []
            if data is not None:
                for container in data:
                    if int(container.challenge_id) != int(challenge_id):
                        return jsonify({})

                    lan_domain = str(user_id) + "-" + container.docker_id
                    containers_data.append({
                        "port": container.port,
                        "remaining_time": timeout - (datetime.datetime.now(datetime.timezone.utc).replace(tzinfo=None) - container.start_time).seconds,
                        "lan_domain": lan_domain,
                        "conntype": container.conntype,
                        "comment": container.comment,
                    })
                return jsonify({'success': True, 'type': 'redirect', 'ip': configs.get('frp_direct_ip_address', ""),
                                'containers_data': containers_data})
            else:
                return jsonify({'success': True})
        except Exception as e:
            import traceback
            return jsonify({'success': False, 'msg': str(e) + traceback.format_exc()})

    @owl_blueprint.route('/container', methods=['POST'])
    @authed_only
    def new_container():
        try:
            user_id = get_mode()

            if ControlUtil.frequency_limit():
                return jsonify({'success': False, 'msg': 'Frequency limit, You should wait at least 1 min.'})
            # check whether exist container before
            existContainers = ControlUtil.get_container(user_id)
            if existContainers:
                return jsonify(
                    {'success': False, 'msg': 'You have boot {} before.'.format(existContainers[0].challenge.name)})
            else:
                challenge_id = request.args.get('challenge_id')
                ControlUtil.check_challenge(challenge_id, user_id)
                configs = DBUtils.get_all_configs()
                current_count = DBUtils.get_all_alive_container_count()
                # print(configs.get("docker_max_container_count"))
                if configs.get("docker_max_container_count") != "None":
                    if int(configs.get("docker_max_container_count")) <= int(current_count):
                        return jsonify({'success': False, 'msg': 'Max container count exceed.'})

                dynamic_docker_challenge = DynamicCheckChallenge.query \
                    .filter(DynamicCheckChallenge.id == challenge_id) \
                    .first_or_404()
                try:
                    result = ControlUtil.new_container(user_id=user_id, challenge_id=challenge_id,
                                                       prefix=configs.get("docker_flag_prefix"))
                    if isinstance(result, bool):
                        return jsonify({'success': True})
                    else:
                        return jsonify({'success': False, 'msg': str(result)})
                except Exception as e:
                    return jsonify({'success': True,
                                    'msg': 'Failed when launch instance, please contact with the admin. Error Type:{} Error msg:{}'.format(
                                        e.__class__.__name__, e)})
        except Exception as e:
            return jsonify({'success': False, 'msg': str(e)})

    @owl_blueprint.route('/container', methods=['DELETE'])
    @authed_only
    def destroy_container():
        user_id = get_mode()

        if ControlUtil.frequency_limit():
            return jsonify({'success': False, 'msg': 'Frequency limit, You should wait at least 1 min.'})

        if ControlUtil.destroy_container(user_id):
            return jsonify({'success': True})
        else:
            return jsonify({'success': False, 'msg': 'Failed when destroy instance, please contact with the admin!'})

    @owl_blueprint.route('/container', methods=['PATCH'])
    @authed_only
    def renew_container():
        user_id = get_mode()
        if ControlUtil.frequency_limit():
            return jsonify({'success': False, 'msg': 'Frequency limit, You should wait at least 1 min.'})

        configs = DBUtils.get_all_configs()
        challenge_id = request.args.get('challenge_id')
        ControlUtil.check_challenge(challenge_id, user_id)
        docker_max_renew_count = int(configs.get("docker_max_renew_count"))
        containers: list[OwlContainers] = DBUtils.get_current_containers(user_id)
        if containers is None:
            return jsonify({'success': False, 'msg': 'Instance not found.'})
        if containers[0].renew_count >= docker_max_renew_count:
            return jsonify({'success': False, 'msg': 'Max renewal times exceed.'})

        ControlUtil.expired_container(user_id=user_id)

        return jsonify({'success': True})

    def auto_clean_container():
        with app.app_context():
            results = DBUtils.get_all_expired_container()
            for r in results:
                ControlUtil.destroy_container(r.user_id)
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
