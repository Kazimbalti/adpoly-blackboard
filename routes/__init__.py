from routes.auth import auth_bp
from routes.dashboard import dashboard_bp
from routes.courses import courses_bp
from routes.materials import materials_bp
from routes.assignments import assignments_bp
from routes.exams import exams_bp
from routes.messages import messages_bp
from routes.forums import forums_bp
from routes.grades import grades_bp
from routes.admin import admin_bp
from routes.onedrive import onedrive_bp
from routes.attendance import attendance_bp
from routes.caf import caf_bp
from routes.projects import projects_bp
from routes.labs import labs_bp


def register_blueprints(app):
    app.register_blueprint(auth_bp, url_prefix='/api/auth')
    app.register_blueprint(dashboard_bp, url_prefix='/api/dashboard')
    app.register_blueprint(courses_bp, url_prefix='/api/courses')
    app.register_blueprint(materials_bp, url_prefix='/api/materials')
    app.register_blueprint(assignments_bp, url_prefix='/api/assignments')
    app.register_blueprint(exams_bp, url_prefix='/api/exams')
    app.register_blueprint(messages_bp, url_prefix='/api/messages')
    app.register_blueprint(forums_bp, url_prefix='/api/forums')
    app.register_blueprint(grades_bp, url_prefix='/api/grades')
    app.register_blueprint(admin_bp, url_prefix='/api/admin')
    app.register_blueprint(onedrive_bp, url_prefix='/api/onedrive')
    app.register_blueprint(attendance_bp, url_prefix='/api/attendance')
    app.register_blueprint(caf_bp, url_prefix='/api/caf')
    app.register_blueprint(projects_bp, url_prefix='/api/projects')
    app.register_blueprint(labs_bp, url_prefix='/api/labs')
