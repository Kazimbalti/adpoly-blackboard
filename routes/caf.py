from flask import Blueprint, request, jsonify, g
from middleware.auth_middleware import login_required, faculty_required
from services.file_service import save_file, delete_file
from utils.db import query, query_one, execute
from utils.validators import sanitize_html
import json

caf_bp = Blueprint('caf', __name__)

# CAF Section definitions for COURSES type
CAF_COURSE_SECTIONS = [
    ('course_info', 'Course Information', 1),
    ('students', 'Students Names and ID', 2),
    ('homework', 'Homework', 3),
    ('quizzes', 'Quizzes', 4),
    ('laboratory', 'Laboratory', 5),
    ('lab_final', 'Laboratory Final', 6),
    ('midterm1', 'Midterm 1', 7),
    ('midterm2', 'Midterm 2', 8),
    ('project', 'Project', 9),
    ('final_exam', 'Final Exam', 10),
    ('overall_grades', 'Overall Grades', 11),
    ('curved_grades', 'Curved Overall Grades', 12),
    ('student_survey', 'Students Survey', 13),
    ('course_analysis', 'Course Analysis', 14),
    ('course_report', 'Course Report', 15),
    ('syllabus', 'Course Syllabus', 16),
    ('grading_policy', 'Grading Policy', 17),
    ('abet_analysis', 'ABET SO Analysis', 18),
    ('improvement_report', 'PI Improvement Report', 19),
    ('so_clo_summary', 'SO-CLO Summary', 20),
    ('bb_extraction', 'Blackboard Extraction', 21),
    ('lecture_notes', 'Lecture Notes', 22),
    ('attendance', 'Students Attendance', 23),
    ('supporting', 'Supporting Materials', 24),
]

# CAF Section definitions for OCT type
CAF_OCT_SECTIONS = [
    ('course_info', 'Course Information', 1),
    ('students', 'Students Names and ID', 2),
    ('quizzes', 'Quizzes', 3),
    ('lab_reports', 'Lab Reports', 4),
    ('final_report', 'Final Report', 5),
    ('presentation', 'Presentation', 6),
    ('lab_final', 'Laboratory Final', 7),
    ('project', 'Project', 8),
    ('midterm2', 'Midterm 2', 9),
    ('final_exam', 'Final Exam', 10),
    ('overall_grades', 'Overall Grades', 11),
    ('curved_grades', 'Curved Overall Grades', 12),
    ('student_survey', 'Students Survey', 13),
    ('course_analysis', 'Course Analysis', 14),
    ('course_report', 'Course Report', 15),
    ('syllabus', 'Course Syllabus', 16),
    ('grading_policy', 'Grading Policy', 17),
    ('abet_analysis', 'ABET SO Analysis', 18),
    ('improvement_report', 'PI Improvement Report', 19),
    ('so_clo_summary', 'SO-CLO Summary', 20),
    ('bb_extraction', 'Blackboard Extraction', 21),
    ('oct_manual', 'OCT Manual', 22),
    ('attendance', 'Students Attendance', 23),
    ('supporting', 'Supporting Materials', 24),
]

# CAF Folder structure for COURSES CD
CAF_COURSE_FOLDERS = [
    '01_CAF Sheets', '02_BlackBoard Extraction', '03_Lecture Notes',
    '04_Projects and HWs', '05_Quizzes', '06_Labs and Reports',
    '07_Midterm exam', '08_Final Exam', '09_Syllabus',
    '10_Student Course Survey', '11_Improvement Report',
    '12_Supporting Materials', '13_Students Attendance'
]

# CAF Folder structure for OCT CD
CAF_OCT_FOLDERS = [
    '01_CAF SHEETS', '02_BLACKBOARD EXTRACTION', '03_LAB REPORTS',
    '04_QUIZZES', '05_PROJECT', '06_FINAL PRACTICAL TEST',
    '07_SYLLABUS', '08_STUDENT COURSE SURVEY', '09_IMPROVEMENT REPORT',
    '10_SUPPORTING MATERIAL', '11_STUDENTS ATTENDANCE'
]


@caf_bp.route('/course/<int:course_id>', methods=['GET'])
@login_required
def list_cafs(course_id):
    cafs = query(
        """SELECT cf.*, u.first_name, u.last_name
           FROM caf_files cf JOIN users u ON u.id = cf.instructor_id
           WHERE cf.course_id = ? ORDER BY cf.created_at DESC""",
        (course_id,)
    )
    for c in cafs:
        total = query_one("SELECT COUNT(*) as cnt FROM caf_sections WHERE caf_id = ?", (c['id'],))['cnt']
        completed = query_one("SELECT COUNT(*) as cnt FROM caf_sections WHERE caf_id = ? AND status = 'completed'", (c['id'],))['cnt']
        c['total_sections'] = total
        c['completed_sections'] = completed
        c['progress'] = round((completed / total * 100) if total > 0 else 0, 1)
    return jsonify({"cafs": cafs})


@caf_bp.route('/course/<int:course_id>', methods=['POST'])
@faculty_required
def create_caf(course_id):
    course = query_one("SELECT * FROM courses WHERE id = ?", (course_id,))
    if not course:
        return jsonify({"error": "Course not found"}), 404

    data = request.get_json() or {}
    caf_type = data.get('caf_type', 'course')
    if caf_type not in ('course', 'oct'):
        return jsonify({"error": "caf_type must be 'course' or 'oct'"}), 400

    caf_id = execute(
        """INSERT INTO caf_files (course_id, caf_type, semester, academic_year, instructor_id, crn)
           VALUES (?, ?, ?, ?, ?, ?)""",
        (course_id, caf_type, data.get('semester', course.get('semester', '')),
         data.get('academic_year', '2025-2026'), g.current_user['id'], data.get('crn', ''))
    )

    sections = CAF_COURSE_SECTIONS if caf_type == 'course' else CAF_OCT_SECTIONS
    for key, name, order in sections:
        execute(
            "INSERT INTO caf_sections (caf_id, section_key, section_name, section_order) VALUES (?, ?, ?, ?)",
            (caf_id, key, name, order)
        )

    caf = query_one("SELECT * FROM caf_files WHERE id = ?", (caf_id,))
    return jsonify({"message": "CAF created", "caf": caf}), 201


@caf_bp.route('/<int:caf_id>', methods=['GET'])
@login_required
def get_caf(caf_id):
    caf = query_one(
        """SELECT cf.*, c.code as course_code, c.title as course_title,
                  u.first_name, u.last_name
           FROM caf_files cf
           JOIN courses c ON c.id = cf.course_id
           JOIN users u ON u.id = cf.instructor_id
           WHERE cf.id = ?""",
        (caf_id,)
    )
    if not caf:
        return jsonify({"error": "CAF not found"}), 404

    sections = query(
        "SELECT * FROM caf_sections WHERE caf_id = ? ORDER BY section_order",
        (caf_id,)
    )

    documents = query(
        "SELECT * FROM caf_documents WHERE caf_id = ? ORDER BY section_key, created_at",
        (caf_id,)
    )

    folder_structure = CAF_COURSE_FOLDERS if caf['caf_type'] == 'course' else CAF_OCT_FOLDERS

    return jsonify({
        "caf": caf,
        "sections": sections,
        "documents": documents,
        "folder_structure": folder_structure
    })


@caf_bp.route('/<int:caf_id>/sections/<section_key>', methods=['PUT'])
@faculty_required
def update_section(caf_id, section_key):
    section = query_one(
        "SELECT * FROM caf_sections WHERE caf_id = ? AND section_key = ?",
        (caf_id, section_key)
    )
    if not section:
        return jsonify({"error": "Section not found"}), 404

    data = request.get_json() or {}
    new_status = data.get('status', section['status'])
    new_data = json.dumps(data.get('data')) if data.get('data') else section['data']

    execute(
        "UPDATE caf_sections SET status = ?, data = ?, updated_at = datetime('now') WHERE id = ?",
        (new_status, new_data, section['id'])
    )

    # Update CAF status
    total = query_one("SELECT COUNT(*) as cnt FROM caf_sections WHERE caf_id = ?", (caf_id,))['cnt']
    completed = query_one("SELECT COUNT(*) as cnt FROM caf_sections WHERE caf_id = ? AND status = 'completed'", (caf_id,))['cnt']
    in_progress = query_one("SELECT COUNT(*) as cnt FROM caf_sections WHERE caf_id = ? AND status = 'in_progress'", (caf_id,))['cnt']

    caf_status = 'draft'
    if completed == total:
        caf_status = 'completed'
    elif completed > 0 or in_progress > 0:
        caf_status = 'in_progress'

    execute("UPDATE caf_files SET status = ?, updated_at = datetime('now') WHERE id = ?", (caf_status, caf_id))

    return jsonify({"message": "Section updated"})


@caf_bp.route('/<int:caf_id>/upload', methods=['POST'])
@faculty_required
def upload_document(caf_id):
    if 'file' not in request.files:
        return jsonify({"error": "No file uploaded"}), 400

    file = request.files['file']
    section_key = request.form.get('section_key', 'general')
    title = request.form.get('title', file.filename)
    doc_type = request.form.get('doc_type', 'general')

    relative_path, original_name, file_size, mime_type = save_file(
        file, subfolder=f"caf/{caf_id}/{section_key}"
    )
    if not relative_path:
        return jsonify({"error": mime_type or "Upload failed"}), 400

    doc_id = execute(
        """INSERT INTO caf_documents (caf_id, section_key, title, file_path, file_name,
           file_size, mime_type, doc_type, uploaded_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        (caf_id, section_key, title, relative_path, original_name,
         file_size, mime_type, doc_type, g.current_user['id'])
    )

    doc = query_one("SELECT * FROM caf_documents WHERE id = ?", (doc_id,))
    return jsonify({"message": "Document uploaded", "document": doc}), 201


@caf_bp.route('/documents/<int:doc_id>', methods=['DELETE'])
@faculty_required
def delete_document(doc_id):
    doc = query_one("SELECT * FROM caf_documents WHERE id = ?", (doc_id,))
    if not doc:
        return jsonify({"error": "Document not found"}), 404
    if doc['file_path']:
        delete_file(doc['file_path'])
    execute("DELETE FROM caf_documents WHERE id = ?", (doc_id,))
    return jsonify({"message": "Document deleted"})


@caf_bp.route('/<int:caf_id>/grades', methods=['POST'])
@faculty_required
def save_grades(caf_id):
    data = request.get_json()
    if not data or not data.get('grades'):
        return jsonify({"error": "grades array required"}), 400

    for g_item in data['grades']:
        existing = query_one(
            """SELECT id FROM caf_student_grades WHERE caf_id = ? AND student_id = ?
               AND component = ? AND item_name = ?""",
            (caf_id, g_item['student_id'], g_item['component'], g_item.get('item_name', ''))
        )
        if existing:
            execute(
                "UPDATE caf_student_grades SET score = ?, max_score = ?, clo_number = ?, updated_at = datetime('now') WHERE id = ?",
                (g_item.get('score'), g_item.get('max_score'), g_item.get('clo_number'), existing['id'])
            )
        else:
            execute(
                """INSERT INTO caf_student_grades (caf_id, student_id, component, item_name, score, max_score, clo_number)
                   VALUES (?, ?, ?, ?, ?, ?, ?)""",
                (caf_id, g_item['student_id'], g_item['component'], g_item.get('item_name', ''),
                 g_item.get('score'), g_item.get('max_score'), g_item.get('clo_number'))
            )

    return jsonify({"message": f"{len(data['grades'])} grades saved"})


@caf_bp.route('/<int:caf_id>/grades/<component>', methods=['GET'])
@login_required
def get_grades(caf_id, component):
    grades = query(
        """SELECT csg.*, u.first_name, u.last_name
           FROM caf_student_grades csg JOIN users u ON u.id = csg.student_id
           WHERE csg.caf_id = ? AND csg.component = ?
           ORDER BY u.last_name, u.first_name, csg.item_name""",
        (caf_id, component)
    )
    return jsonify({"grades": grades})


@caf_bp.route('/<int:caf_id>/status', methods=['PUT'])
@faculty_required
def update_caf_status(caf_id):
    data = request.get_json()
    if not data or not data.get('status'):
        return jsonify({"error": "status required"}), 400
    if data['status'] not in ('draft', 'in_progress', 'completed', 'submitted', 'approved'):
        return jsonify({"error": "Invalid status"}), 400

    execute("UPDATE caf_files SET status = ?, updated_at = datetime('now') WHERE id = ?",
            (data['status'], caf_id))
    return jsonify({"message": f"CAF status updated to {data['status']}"})


@caf_bp.route('/<int:caf_id>', methods=['DELETE'])
@faculty_required
def delete_caf(caf_id):
    execute("DELETE FROM caf_files WHERE id = ?", (caf_id,))
    return jsonify({"message": "CAF deleted"})


@caf_bp.route('/templates', methods=['GET'])
@login_required
def get_caf_templates():
    return jsonify({
        "course_sections": [{"key": k, "name": n, "order": o} for k, n, o in CAF_COURSE_SECTIONS],
        "oct_sections": [{"key": k, "name": n, "order": o} for k, n, o in CAF_OCT_SECTIONS],
        "course_folders": CAF_COURSE_FOLDERS,
        "oct_folders": CAF_OCT_FOLDERS
    })
