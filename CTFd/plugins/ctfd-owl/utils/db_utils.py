import datetime

from CTFd.models import db
from sqlalchemy import distinct
from sqlalchemy.exc import IntegrityError
from sqlalchemy import inspect, text

from ..models import OwlConfigs, OwlContainers, OwlLaunchLocks


class DBUtils:
    @staticmethod
    def ensure_schema():
        """Ensure plugin tables have expected columns.

        Note: `db.create_all()` does not add new columns to existing tables.
        This performs a small, best-effort migration for backward compatibility.
        """
        try:
            inspector = inspect(db.engine)
            cols = {c["name"] for c in inspector.get_columns("owl_containers")}
            if "labels" not in cols:
                ddl = "ALTER TABLE owl_containers ADD COLUMN labels VARCHAR(2048) DEFAULT '{}'"
                with db.engine.begin() as conn:
                    conn.execute(text(ddl))
        except Exception:
            pass
    @staticmethod
    def get_all_configs():
        configs = OwlConfigs.query.all()
        result = {}

        for c in configs:
            result[str(c.key)] = str(c.value)

        return result

    @staticmethod
    def save_all_configs(configs):
        for c in configs:
            q = db.session.query(OwlConfigs)
            q = q.filter(OwlConfigs.key == c[0])
            record = q.one_or_none()

            if record:
                record.value = c[1]
                db.session.commit()
            else:
                config = OwlConfigs(key=c[0], value=c[1])
                db.session.add(config)
                db.session.commit()
        db.session.close()

    @staticmethod
    def new_container(
        user_id,
        challenge_id,
        flag,
        docker_id,
        port=0,
        ip="",
        name="",
        labels="{}",
    ):
        """Create a new container DB record."""
        container = OwlContainers(user_id=user_id, challenge_id=challenge_id, flag=flag, docker_id=docker_id, port=port,
                                  ip=ip, name=name,
                                  labels=labels,
                                  start_time=datetime.datetime.now(datetime.timezone.utc))
        db.session.add(container)
        db.session.commit()
        db.session.close()
        return str(docker_id)

    @staticmethod
    def get_current_containers(user_id):
        """Get all containers for a owner user_id."""
        q = db.session.query(OwlContainers)
        q = q.filter(OwlContainers.user_id == user_id)
        records = q.all()
        if len(records) == 0:
            return None

        return records

    @staticmethod
    def get_current_containers_for_challenge(user_id, challenge_id):
        """Get all containers (service rows) for a given owner and challenge."""
        q = db.session.query(OwlContainers)
        q = q.filter(OwlContainers.user_id == user_id)
        q = q.filter(OwlContainers.challenge_id == challenge_id)
        records = q.all()
        if len(records) == 0:
            return None
        return records

    @staticmethod
    def get_container_by_port(port):
        """Get container for a port."""
        q = db.session.query(OwlContainers)
        q = q.filter(OwlContainers.port == port)
        records = q.all()
        if len(records) == 0:
            return None

        return records[0]

    @staticmethod
    def remove_current_container(user_id):
        """Remove container for a owner user_id."""
        q = db.session.query(OwlContainers)
        q = q.filter(OwlContainers.user_id == user_id)
        # records = q.all()
        # for r in records:
        #     pass

        q.delete()
        db.session.commit()
        db.session.close()

    @staticmethod
    def remove_current_container_for_challenge(user_id, challenge_id):
        """Remove container rows for a given owner and challenge."""
        q = db.session.query(OwlContainers)
        q = q.filter(OwlContainers.user_id == user_id)
        q = q.filter(OwlContainers.challenge_id == challenge_id)
        q.delete()
        db.session.commit()
        db.session.close()

    @staticmethod
    def renew_current_container(user_id):
        """Extend container lifetime and increment renew_count."""
        q = db.session.query(OwlContainers)
        q = q.filter(OwlContainers.user_id == user_id)
        # q = q.filter(OwlContainers.challenge_id == challenge_id)
        records = q.all()
        if len(records) == 0:
            return

        configs = DBUtils.get_all_configs()
        timeout = int(configs.get("docker_timeout", "3600"))

        for r in records:
            r.start_time = r.start_time + datetime.timedelta(seconds=timeout)

            if r.start_time > datetime.datetime.now(datetime.timezone.utc).replace(tzinfo=None):
                r.start_time = datetime.datetime.now(datetime.timezone.utc).replace(tzinfo=None)

            r.renew_count += 1
        db.session.commit()
        db.session.close()

    @staticmethod
    def renew_current_container_for_challenge(user_id, challenge_id):
        """Extend container lifetime for a specific challenge and increment renew_count."""
        q = db.session.query(OwlContainers)
        q = q.filter(OwlContainers.user_id == user_id)
        q = q.filter(OwlContainers.challenge_id == challenge_id)
        records = q.all()
        if len(records) == 0:
            return

        configs = DBUtils.get_all_configs()
        timeout = int(configs.get("docker_timeout", "3600"))

        for r in records:
            r.start_time = r.start_time + datetime.timedelta(seconds=timeout)

            if r.start_time > datetime.datetime.now(datetime.timezone.utc).replace(tzinfo=None):
                r.start_time = datetime.datetime.now(datetime.timezone.utc).replace(tzinfo=None)

            r.renew_count += 1
        db.session.commit()
        db.session.close()

    @staticmethod
    def get_alive_instance_count_for_user(user_id):
        """Count alive instances for an owner, by distinct challenge_id."""
        configs = DBUtils.get_all_configs()
        timeout = int(configs.get("docker_timeout", "3600"))
        threshold = datetime.datetime.now(datetime.timezone.utc).replace(tzinfo=None) - datetime.timedelta(seconds=timeout)

        q = db.session.query(distinct(OwlContainers.challenge_id))
        q = q.filter(OwlContainers.user_id == user_id)
        q = q.filter(OwlContainers.start_time >= threshold)
        # SQLAlchemy emits SELECT DISTINCT; count() works across backends.
        return q.count()

    @staticmethod
    def get_alive_instance_count_for_team(user_ids: list[int]):
        """Count alive instances for a team, by distinct (user_id, challenge_id)."""
        if not user_ids:
            return 0

        configs = DBUtils.get_all_configs()
        timeout = int(configs.get("docker_timeout", "3600"))
        threshold = datetime.datetime.now(datetime.timezone.utc).replace(tzinfo=None) - datetime.timedelta(seconds=timeout)

        q = db.session.query(OwlContainers.user_id, OwlContainers.challenge_id).distinct()
        q = q.filter(OwlContainers.user_id.in_(user_ids))
        q = q.filter(OwlContainers.start_time >= threshold)
        return q.count()

    @staticmethod
    def acquire_launch_lock(user_id, challenge_id=None, ttl_seconds=120):
        """Acquire a best-effort launch lock for a given owner."""
        now = datetime.datetime.now(datetime.timezone.utc).replace(tzinfo=None)
        threshold = now - datetime.timedelta(seconds=int(ttl_seconds))

        try:
            # Remove expired lock if any.
            db.session.query(OwlLaunchLocks).filter(OwlLaunchLocks.start_time < threshold).delete()
            db.session.commit()

            lock = OwlLaunchLocks(user_id=user_id, challenge_id=challenge_id, start_time=now)
            db.session.add(lock)
            db.session.commit()
            return True
        except IntegrityError:
            db.session.rollback()
            return False
        finally:
            db.session.close()

    @staticmethod
    def release_launch_lock(user_id):
        try:
            db.session.query(OwlLaunchLocks).filter(OwlLaunchLocks.user_id == user_id).delete()
            db.session.commit()
        finally:
            db.session.close()

    @staticmethod
    def get_all_expired_container():
        """Get all expired containers."""
        configs = DBUtils.get_all_configs()
        timeout = int(configs.get("docker_timeout", "3600"))

        q = db.session.query(OwlContainers)
        q = q.filter(OwlContainers.start_time < datetime.datetime.now(datetime.timezone.utc).replace(tzinfo=None) - datetime.timedelta(seconds=timeout))
        return q.all()

    @staticmethod
    def get_all_alive_container():
        """Get all alive containers."""
        configs = DBUtils.get_all_configs()
        timeout = int(configs.get("docker_timeout", "3600"))

        q = db.session.query(OwlContainers)
        q = q.filter(OwlContainers.start_time >= datetime.datetime.now(datetime.timezone.utc).replace(tzinfo=None) - datetime.timedelta(seconds=timeout))
        return q.all()

    @staticmethod
    def get_all_container():
        q = db.session.query(OwlContainers)
        return q.all()

    @staticmethod
    def get_all_container_count():
        q = db.session.query(OwlContainers)
        return q.count()

    @staticmethod
    def get_all_alive_container_page(page_start, page_end):
        configs = DBUtils.get_all_configs()
        timeout = int(configs.get("docker_timeout", "3600"))

        q = db.session.query(OwlContainers)
        q = q.filter(OwlContainers.start_time >= datetime.datetime.now(datetime.timezone.utc).replace(tzinfo=None) - datetime.timedelta(seconds=timeout))
        q = q.slice(page_start, page_end)
        return q.all()

    @staticmethod
    def get_all_alive_container_count():
        configs = DBUtils.get_all_configs()
        timeout = int(configs.get("docker_timeout", "3600"))

        q = db.session.query(OwlContainers)
        q = q.filter(OwlContainers.start_time >= datetime.datetime.now(datetime.timezone.utc).replace(tzinfo=None) - datetime.timedelta(seconds=timeout))
        return q.count()
