"""Seed the database with demo data including all ACTVET faculty members."""
import json
import os
from app import create_app
from utils.db import execute, query_one, query
from services.auth_service import hash_password

app = create_app()

with app.app_context():
    print("=" * 60)
    print("  BB ADPOLY LMS - Database Seeder")
    print("=" * 60)

    # Check if already seeded - NEVER delete existing data
    existing = query_one("SELECT COUNT(*) as cnt FROM users")
    if existing['cnt'] > 0:
        print("\n  Database already has data. Keeping all existing courses, materials, and enrollments.")
        print("  To re-seed from scratch, delete the database file first: rm database/bb_adpoly.db")
        exit(0)

    # ===== LOAD ACTVET FACULTY FROM EXCEL =====
    faculty_contacts = []
    xlsx_path = os.path.join(os.path.dirname(__file__), 'data', 'actvet_contacts.xlsx')

    try:
        import openpyxl
        if os.path.exists(xlsx_path):
            wb = openpyxl.load_workbook(xlsx_path)
            ws = wb['Contacts']
            for row in ws.iter_rows(min_row=2, values_only=True):
                name, email = row[0], row[1]
                if name and email:
                    name = name.strip()
                    email = email.strip()
                    parts = name.split()
                    first_name = parts[0]
                    last_name = ' '.join(parts[1:]) if len(parts) > 1 else ''
                    faculty_contacts.append({
                        'email': email,
                        'first_name': first_name,
                        'last_name': last_name,
                        'full_name': name
                    })
            print(f"  Loaded {len(faculty_contacts)} faculty from actvet_contacts.xlsx")
        else:
            print(f"  WARNING: {xlsx_path} not found!")
    except ImportError:
        print("  WARNING: openpyxl not installed. Run: pip install openpyxl")
    except Exception as e:
        print(f"  WARNING: Error loading Excel: {e}")

    # Fallback if no Excel data
    if not faculty_contacts:
        faculty_contacts = [
            {'email': 'dr.ahmed@adpoly.ac.ae', 'first_name': 'Ahmed', 'last_name': 'Al Mansouri', 'full_name': 'Ahmed Al Mansouri'},
            {'email': 'dr.fatima@adpoly.ac.ae', 'first_name': 'Fatima', 'last_name': 'Hassan', 'full_name': 'Fatima Hassan'},
            {'email': 'dr.omar@adpoly.ac.ae', 'first_name': 'Omar', 'last_name': 'Khalil', 'full_name': 'Omar Khalil'},
        ]

    # ===== CREATE ADMIN =====
    admin_id = execute(
        "INSERT INTO users (email, password_hash, first_name, last_name, role) VALUES (?, ?, ?, ?, ?)",
        ('admin@adpoly.ac.ae', hash_password('Admin@123'), 'System', 'Administrator', 'admin')
    )
    print(f"\n  [ADMIN] admin@adpoly.ac.ae / Admin@123")

    # ===== CREATE ALL FACULTY =====
    print(f"\n  Registering {len(faculty_contacts)} faculty members...")
    faculty_ids = []
    pw_hash = hash_password('Faculty@123')  # Hash once, reuse for speed

    for i, fc in enumerate(faculty_contacts):
        fid = execute(
            "INSERT INTO users (email, password_hash, first_name, last_name, role) VALUES (?, ?, ?, ?, ?)",
            (fc['email'], pw_hash, fc['first_name'], fc['last_name'], 'faculty')
        )
        faculty_ids.append(fid)
        print(f"    {i+1:2d}. {fc['full_name']:<45s} | {fc['email']}")

    print(f"\n  All {len(faculty_ids)} faculty registered with password: Faculty@123")

    # ===== CREATE STUDENTS =====
    students = [
        ('student1@adpoly.ac.ae', 'Mohammed', 'Ali'),
        ('student2@adpoly.ac.ae', 'Sara', 'Nasser'),
        ('student3@adpoly.ac.ae', 'Khalid', 'Ibrahim'),
        ('student4@adpoly.ac.ae', 'Aisha', 'Mohammed'),
        ('student5@adpoly.ac.ae', 'Rashid', 'Salem'),
        ('student6@adpoly.ac.ae', 'Mariam', 'Yousef'),
        ('student7@adpoly.ac.ae', 'Hassan', 'Abdulla'),
        ('student8@adpoly.ac.ae', 'Noura', 'Ahmad'),
        ('student9@adpoly.ac.ae', 'Omar', 'Khalid'),
        ('student10@adpoly.ac.ae', 'Fatima', 'Ali'),
        ('student11@adpoly.ac.ae', 'Yousef', 'Ibrahim'),
        ('student12@adpoly.ac.ae', 'Layla', 'Hassan'),
    ]
    pw_hash_student = hash_password('Student@123')
    student_ids = []
    for email, first, last in students:
        sid = execute(
            "INSERT INTO users (email, password_hash, first_name, last_name, role) VALUES (?, ?, ?, ?, ?)",
            (email, pw_hash_student, first, last, 'student')
        )
        student_ids.append(sid)

    print(f"  Created {len(student_ids)} student accounts (Student@123)")

    # ===== CREATE COURSES (assigned to different faculty) =====
    def fid(idx):
        return faculty_ids[idx % len(faculty_ids)]

    courses_data = [
        ('CS101', 'Introduction to Computer Science', 'Fundamentals of programming and computational thinking.', fid(0), '#4A90D9'),
        ('CS201', 'Data Structures & Algorithms', 'Advanced data structures and algorithm design.', fid(1), '#7B68EE'),
        ('CS301', 'Software Engineering', 'Software development lifecycle, methodologies, and project management.', fid(2), '#6C5CE7'),
        ('MATH101', 'Calculus I', 'Limits, derivatives, and integrals.', fid(3), '#E74C3C'),
        ('MATH201', 'Linear Algebra', 'Vectors, matrices, and linear transformations.', fid(4), '#FD79A8'),
        ('ENG101', 'Technical Writing', 'Professional communication and documentation skills.', fid(5), '#2ECC71'),
        ('ENG201', 'Business Communication', 'Workplace communication, presentations, and report writing.', fid(6), '#00B894'),
        ('IT101', 'Introduction to IT', 'Overview of information technology concepts and applications.', fid(7), '#00CEC9'),
        ('IT201', 'Database Management Systems', 'Relational databases, SQL, and database design.', fid(8), '#F39C12'),
        ('IT301', 'Web Development', 'Full-stack web development with modern technologies.', fid(9), '#9B59B6'),
        ('IT401', 'Cloud Computing', 'Cloud platforms, services, and deployment strategies.', fid(10), '#0984E3'),
        ('NET101', 'Network Fundamentals', 'Networking basics, protocols, and architecture.', fid(11), '#E67E22'),
        ('NET201', 'Network Administration', 'Network management, security, and troubleshooting.', fid(12), '#D63031'),
        ('SEC101', 'Cybersecurity Fundamentals', 'Information security principles and best practices.', fid(13), '#636E72'),
        ('EMT101', 'Electro-Mechanical Engineering', 'Introduction to electro-mechanical systems.', fid(14), '#1ABC9C'),
        ('EMT201', 'Control Systems', 'Feedback control, PID controllers, and automation.', fid(15), '#FDA7DF'),
        ('PHY101', 'Physics I', 'Mechanics, thermodynamics, and waves.', fid(16), '#A29BFE'),
        ('BUS101', 'Introduction to Business', 'Business fundamentals, management, and entrepreneurship.', fid(17), '#FDCB6E'),
    ]

    course_ids = []
    print(f"\n  Creating {len(courses_data)} courses...")
    for code, title, desc, faculty_id, color in courses_data:
        cid = execute(
            "INSERT INTO courses (code, title, description, faculty_id, semester, is_published, color) VALUES (?, ?, ?, ?, ?, 1, ?)",
            (code, title, desc, faculty_id, 'Spring 2026', color)
        )
        course_ids.append(cid)
        # Grade categories
        for name, weight, order in [('Assignments', 40, 1), ('Exams', 40, 2), ('Participation', 20, 3)]:
            execute("INSERT INTO grade_categories (course_id, name, weight, sort_order) VALUES (?, ?, ?, ?)",
                    (cid, name, weight, order))
        # Get faculty name
        f = query_one("SELECT first_name, last_name FROM users WHERE id = ?", (faculty_id,))
        print(f"    {code:<10s} {title:<45s} | {f['first_name']} {f['last_name']}")

    # ===== ENROLL STUDENTS =====
    for i, sid in enumerate(student_ids):
        # Each student gets 4-6 courses
        start = (i * 2) % len(course_ids)
        enrolled = [course_ids[(start + j) % len(course_ids)] for j in range(5)]
        for cid in enrolled:
            execute("INSERT INTO enrollments (course_id, student_id) VALUES (?, ?)", (cid, sid))

    print(f"\n  Enrolled {len(student_ids)} students (5 courses each)")

    # ===== ANNOUNCEMENTS =====
    announcements = [
        (course_ids[0], fid(0), 'Welcome to CS101!', 'Welcome to Introduction to Computer Science. Please review the syllabus.', 1),
        (course_ids[0], fid(0), 'Lab Hours Extended', 'Lab hours now run until 6 PM on weekdays.', 0),
        (course_ids[3], fid(3), 'MATH101 Quiz Next Week', 'First quiz on limits next Tuesday. Review chapters 1-3.', 0),
        (course_ids[8], fid(8), 'Database Project Teams', 'Form teams of 3. Submit team details by Friday.', 1),
        (course_ids[9], fid(9), 'Web Dev - Portfolio Due', 'Your portfolio websites are due April 20th.', 0),
        (course_ids[13], fid(13), 'Cybersecurity Lab Access', 'Lab VMs are now available. Check your email for credentials.', 1),
    ]
    for cid, aid, title, body, pinned in announcements:
        execute("INSERT INTO announcements (course_id, author_id, title, body, is_pinned) VALUES (?, ?, ?, ?, ?)",
                (cid, aid, title, body, pinned))
    print(f"  Created {len(announcements)} announcements")

    # ===== ASSIGNMENTS =====
    assignments_data = [
        (course_ids[0], 'Hello World Program', 'Write your first Python program.', '2026-04-01 23:59:00', 50, 'both'),
        (course_ids[0], 'Variables & Data Types', 'Exercises on Python variables.', '2026-04-15 23:59:00', 100, 'file'),
        (course_ids[1], 'Linked List Implementation', 'Implement a doubly linked list.', '2026-04-10 23:59:00', 150, 'file'),
        (course_ids[3], 'Limits Problem Set', 'Solve problems 1-20 from Chapter 2.', '2026-04-05 23:59:00', 80, 'file'),
        (course_ids[8], 'ER Diagram Design', 'Design an ER diagram for a library system.', '2026-04-08 23:59:00', 100, 'file'),
        (course_ids[9], 'Portfolio Website', 'Build a responsive portfolio website.', '2026-04-20 23:59:00', 200, 'both'),
        (course_ids[13], 'Network Security Audit', 'Perform a security audit on the test network.', '2026-04-12 23:59:00', 120, 'file'),
        (course_ids[14], 'Circuit Design Project', 'Design a basic motor control circuit.', '2026-04-18 23:59:00', 150, 'file'),
    ]
    for cid, title, desc, due, pts, atype in assignments_data:
        aid = execute(
            "INSERT INTO assignments (course_id, title, description, due_date, points, assignment_type, is_visible) VALUES (?, ?, ?, ?, ?, ?, 1)",
            (cid, title, desc, due, pts, atype))
        cat = query_one("SELECT id FROM grade_categories WHERE course_id = ? AND name = 'Assignments'", (cid,))
        if cat:
            execute("INSERT INTO grade_items (course_id, category_id, title, points_possible, source_type, source_id) VALUES (?, ?, ?, ?, 'assignment', ?)",
                    (cid, cat['id'], title, pts, aid))
    print(f"  Created {len(assignments_data)} assignments")

    # ===== EXAMS =====
    exams_data = [
        (course_ids[0], 'Midterm Exam - CS101', 'Covers weeks 1-7.', 'midterm', 60, 100, '2026-04-15 09:00:00', '2026-04-15 12:00:00', 1, 1, 1, 5),
        (course_ids[0], 'Quiz 1 - Python Basics', 'Python fundamentals quiz.', 'quiz', 20, 30, '2026-03-25 00:00:00', '2026-03-28 23:59:00', 1, 0, 1, 3),
        (course_ids[3], 'Calculus Quiz 1', 'Limits and continuity.', 'quiz', 30, 50, '2026-03-30 00:00:00', '2026-04-02 23:59:00', 1, 0, 1, 3),
        (course_ids[8], 'Database Midterm', 'SQL and ER modeling.', 'midterm', 90, 100, '2026-04-20 09:00:00', '2026-04-20 12:00:00', 1, 1, 1, 5),
        (course_ids[13], 'Security Fundamentals Quiz', 'CIA triad, encryption basics.', 'quiz', 25, 40, '2026-04-05 00:00:00', '2026-04-08 23:59:00', 1, 0, 1, 3),
    ]
    for cid, title, desc, etype, dur, pts, start, end, shuffle, webcam, tab, maxv in exams_data:
        eid = execute(
            """INSERT INTO exams (course_id, title, description, exam_type, duration_minutes,
               total_points, start_window, end_window, shuffle_questions, require_webcam,
               detect_tab_switch, max_violations, is_published, proctor_enabled) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 1)""",
            (cid, title, desc, etype, dur, pts, start, end, shuffle, webcam, tab, maxv))
        cat = query_one("SELECT id FROM grade_categories WHERE course_id = ? AND name = 'Exams'", (cid,))
        if cat:
            execute("INSERT INTO grade_items (course_id, category_id, title, points_possible, source_type, source_id) VALUES (?, ?, ?, ?, 'exam', ?)",
                    (cid, cat['id'], title, pts, eid))
    print(f"  Created {len(exams_data)} exams")

    # ===== QUIZ QUESTIONS =====
    quiz_id = query_one("SELECT id FROM exams WHERE title = 'Quiz 1 - Python Basics'")['id']
    questions = [
        ('mcq', 'What is the output of print(type(5))?', 5, json.dumps(["<class 'int'>", "<class 'str'>", "<class 'float'>", "<class 'number'>"]), "<class 'int'>"),
        ('mcq', 'Which keyword defines a function in Python?', 5, json.dumps(['function', 'def', 'func', 'define']), 'def'),
        ('mcq', 'What does len() return?', 5, json.dumps(['The last element', 'The data type', 'The number of items', 'The first element']), 'The number of items'),
        ('true_false', 'Python is a compiled language.', 5, json.dumps(['True', 'False']), 'False'),
        ('true_false', 'Lists in Python are mutable.', 5, json.dumps(['True', 'False']), 'True'),
        ('short_answer', 'What is the Python operator for exponentiation?', 5, None, '**'),
    ]
    for i, (qtype, text, pts, opts, correct) in enumerate(questions):
        execute("INSERT INTO exam_questions (exam_id, question_type, question_text, points, sort_order, options, correct_answer) VALUES (?, ?, ?, ?, ?, ?, ?)",
                (quiz_id, qtype, text, pts, i, opts, correct))
    print("  Added quiz questions")

    # ===== FORUMS =====
    forums_data = [
        (course_ids[0], student_ids[0], 'Help with Python installation', 'Having trouble installing Python on Windows. Can someone help?'),
        (course_ids[0], student_ids[1], 'Study group for midterm', 'Anyone interested in a study group? We can meet at the library.'),
        (course_ids[8], student_ids[2], 'ER Diagram tools', 'What tools do you recommend for creating ER diagrams?'),
        (course_ids[9], student_ids[3], 'CSS Grid vs Flexbox', 'When should we use Grid vs Flexbox for layout?'),
    ]
    for cid, aid, title, body in forums_data:
        tid = execute("INSERT INTO forum_threads (course_id, author_id, title, body) VALUES (?, ?, ?, ?)", (cid, aid, title, body))
        # Faculty reply
        fc_id = query_one("SELECT faculty_id FROM courses WHERE id = ?", (cid,))['faculty_id']
        execute("INSERT INTO forum_posts (thread_id, author_id, body) VALUES (?, ?, ?)",
                (tid, fc_id, 'Great question! Check the course resources section for detailed guides.'))
    print(f"  Created {len(forums_data)} forum threads")

    # ===== SUMMARY =====
    total_users = query_one("SELECT COUNT(*) as cnt FROM users")['cnt']
    total_faculty = query_one("SELECT COUNT(*) as cnt FROM users WHERE role = 'faculty'")['cnt']
    total_students = query_one("SELECT COUNT(*) as cnt FROM users WHERE role = 'student'")['cnt']
    total_courses = query_one("SELECT COUNT(*) as cnt FROM courses")['cnt']

    print("\n" + "=" * 60)
    print("  SEED COMPLETE!")
    print("=" * 60)
    print(f"\n  Total users:    {total_users}")
    print(f"  Faculty:        {total_faculty}")
    print(f"  Students:       {total_students}")
    print(f"  Courses:        {total_courses}")
    print(f"\n  Login credentials:")
    print(f"  {'=' * 50}")
    print(f"  Admin:    admin@adpoly.ac.ae / Admin@123")
    print(f"  Faculty:  (any ACTVET email)  / Faculty@123")
    print(f"  Student:  student1@adpoly.ac.ae / Student@123")
    print(f"\n  All {total_faculty} faculty members can login with: Faculty@123")
    print(f"  All {total_students} students can login with: Student@123")
