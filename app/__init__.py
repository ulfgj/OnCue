import os
from typing import Optional
from flask import Flask
from app.database import close_db, init_db

def create_app(test_config: Optional[dict] = None) -> Flask:
    app = Flask(__name__, instance_relative_config=True)
    app.config.from_mapping(
        SECRET_KEY=os.environ.get("SECRET_KEY", "dev-secret-key"),
        DATABASE_PATH=os.environ.get("DATABASE_PATH", "alarm.db"),
    )

    if test_config:
        app.config.update(test_config)

    # Initialize DB schema
    with app.app_context():
        init_db(app.config.get("DATABASE_PATH"))

    app.teardown_appcontext(close_db)

    from app.routes import bp
    app.register_blueprint(bp)

    return app
