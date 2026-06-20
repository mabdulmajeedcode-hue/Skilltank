from fastapi.testclient import TestClient
from uuid import uuid4

from main import app, store


def auth(client: TestClient, email: str) -> dict[str, str]:
    response = client.post("/api/auth/login", json={"email": email, "password": "demo123"})
    assert response.status_code == 200, response.text
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


def test_seed_and_role_dashboards():
    with TestClient(app) as client:
        assert store.mode in ("sqlite", "mongodb")
        assert len(store.data["users"]) >= 12
        assert len(store.data["courses"]) >= 10
        assert len(store.data["enrollments"]) >= 20
        for email, route in [
            ("student@skilltank.dev", "/api/dashboard"),
            ("instructor@skilltank.dev", "/api/instructor/dashboard"),
            ("admin@skilltank.dev", "/api/admin/dashboard"),
        ]:
            response = client.get(route, headers=auth(client, email))
            assert response.status_code == 200, response.text
        catalog = client.get("/api/catalog").json()
        assert all(course.get("thumbnail_url") for course in catalog)
        expected_videos = {
            "crs_python": ("nLRL_NcnK-4", 900),
            "crs_react": ("mU6anWqZJcc", 1200),
            "crs_ai": ("PkZNo7MFNFg", 1200),
            "crs_sql": ("ysEN5RaKOlA", 1000),
            "crs_product": ("NWONeJKn6kc", 900),
            "crs_ux": ("c9Wg6Cb_YlU", 1000),
            "crs_marketing": ("bixR-KKYB6k", 800),
            "crs_finance": ("B9L_GCpNZNE", 900),
            "crs_leadership": ("Vl0H-qTclOg", 900),
        }
        for course_id, (video_id, chunk) in expected_videos.items():
            detail = client.get(f"/api/courses/{course_id}").json()
            urls = [lesson["video_url"] for module in detail["modules"] for lesson in module["lessons"]]
            assert len(urls) == 9 and len(set(urls)) == 9
            assert urls[0] == f"https://www.youtube.com/embed/{video_id}?start=0&end={chunk}&rel=0&modestbranding=1"
            assert urls[-1] == f"https://www.youtube.com/embed/{video_id}?start={chunk * 8}&end={chunk * 9}&rel=0&modestbranding=1"


def test_full_completion_issues_certificate():
    with TestClient(app) as client:
        signup = client.post("/api/auth/signup", json={
            "full_name": "Acceptance Student", "email": f"acceptance-{uuid4().hex[:8]}@skilltank.dev",
            "password": "demo123", "role": "student",
        })
        headers = {"Authorization": f"Bearer {signup.json()['access_token']}"}
        enrollment = client.post("/api/enroll/crs_leadership", headers=headers).json()
        course = client.get("/api/courses/crs_leadership").json()
        for module in course["modules"]:
            for lesson in module["lessons"]:
                response = client.put(f"/api/progress/{enrollment['id']}", headers=headers, json={
                    "lesson_id": lesson["id"], "watched_seconds": 600,
                    "last_position_seconds": 600, "completed": True, "bookmark_notes": "Acceptance",
                })
                assert response.status_code == 200, response.text
            source_quiz = next(item for item in store.data["quizzes"] if item["id"] == module["quiz"]["id"])
            answers = [question["correct_option_index"] for question in source_quiz["questions"]]
            response = client.post(f"/api/quizzes/{module['quiz']['id']}/submit", headers=headers, json={"answers": answers})
            assert response.status_code == 200, response.text
        assert client.get("/api/dashboard", headers=headers).json()["certificates"]


def test_quiz_contract_and_attempt_status():
    with TestClient(app) as client:
        headers = auth(client, "student@skilltank.dev")
        dashboard = client.get("/api/dashboard", headers=headers).json()
        enrollment = next(item for item in dashboard["enrollments"] if item["course_id"] == "crs_product")
        quiz_id = enrollment["quizzes"][0]["id"]
        meta = client.get(f"/api/quizzes/{quiz_id}", headers=headers)
        questions = client.get(f"/api/quizzes/{quiz_id}/questions", headers=headers)
        assert meta.status_code == 200 and "questions" not in meta.json()
        assert questions.status_code == 200 and len(questions.json()) >= 4
        assert all("correct_option_index" not in question for question in questions.json())
        source = next(item for item in store.data["quizzes"] if item["id"] == quiz_id)
        response = client.post("/api/quiz-attempts", headers=headers, json={
            "quiz_id": quiz_id, "enrollment_id": enrollment["id"],
            "answers": [
                {"question_id": question["id"], "selected_option_index": source["questions"][index]["correct_option_index"]}
                for index, question in enumerate(questions.json())
            ],
        })
        assert response.status_code == 200 and response.json()["passed"]
        assert len(response.json()["question_results"]) == len(questions.json())
        latest = client.get(f"/api/quiz-attempts?enrollment_id={enrollment['id']}&quiz_id={quiz_id}", headers=headers)
        assert latest.status_code == 200 and latest.json()["passed"]


def test_stripe_checkout_session_and_admin_triggers():
    with TestClient(app) as client:
        student_headers = auth(client, "student@skilltank.dev")
        checkout = client.post("/api/payments/checkout", headers=student_headers, json={"course_id": "crs_react", "coupon": "LEARN20"})
        assert checkout.status_code == 200, checkout.text
        assert checkout.json()["checkout_url"].startswith("https://checkout.stripe.com/")
        admin_headers = auth(client, "admin@skilltank.dev")
        reminders = client.post("/api/admin/notifications/run-daily", headers=admin_headers)
        assert reminders.status_code == 200
        cohort = client.post("/api/admin/cohorts/coh_1/enroll", headers=admin_headers, json={"course_id": "crs_ai"})
        assert cohort.status_code == 200


def test_access_notes_ai_and_settings_persist():
    with TestClient(app) as client:
        signup = client.post("/api/auth/signup", json={
            "full_name": "Persistence Student", "email": f"persist-{uuid4().hex[:8]}@skilltank.dev",
            "password": "demo123", "role": "student",
        }).json()
        headers = {"Authorization": f"Bearer {signup['access_token']}"}
        detail = client.get("/api/courses/crs_react").json()
        blocked_lesson = detail["modules"][0]["lessons"][1]
        assert client.get(f"/api/learn/crs_react/{blocked_lesson['id']}", headers=headers).status_code == 403
        enrollment = client.post("/api/payments/checkout", headers=headers, json={"course_id": "crs_react"}).json()
        assert enrollment["checkout_url"].startswith("https://checkout.stripe.com/")

        free_enrollment = client.post("/api/enroll/crs_leadership", headers=headers).json()
        free_detail = client.get("/api/courses/crs_leadership").json()
        lesson = free_detail["modules"][0]["lessons"][0]
        saved = client.put(
            f"/api/progress/{free_enrollment['id']}/notes?lesson_id={lesson['id']}",
            headers=headers, json={"bookmark_notes": "Persistent note", "last_position_seconds": 42},
        )
        assert saved.status_code == 200
        learned = client.get(f"/api/learn/crs_leadership/{lesson['id']}", headers=headers).json()
        assert learned["progress"]["bookmark_notes"] == "Persistent note"
        ai = client.post(f"/api/lessons/{lesson['id']}/ai", headers=headers, json={"action": "summary", "question": ""})
        assert ai.status_code == 200 and ai.json()["response"]
        settings = client.put("/api/settings", headers=headers, json={
            "email_notifications": True, "whatsapp_number": "+911234567890",
            "daily_reminders": False, "certificate_notifications": True,
        })
        assert settings.status_code == 200
        assert client.get("/api/settings", headers=headers).json()["whatsapp_number"] == "+911234567890"


def test_leaderboard_points_and_badges():
    with TestClient(app) as client:
        headers = auth(client, "student@skilltank.dev")
        leaderboard = client.get("/api/leaderboard", headers=headers)
        assert leaderboard.status_code == 200 and len(leaderboard.json()) >= 6
        current = next(item for item in leaderboard.json() if item["student_id"] == "usr_student")
        assert "badges" in current and "courses_completed" in current
        mine = client.get("/api/badges/mine", headers=headers)
        assert mine.status_code == 200 and len(mine.json()) >= 3
        all_badges = client.get("/api/badges", headers=headers)
        assert all_badges.status_code == 200 and len(all_badges.json()) == 5

        signup = client.post("/api/auth/signup", json={
            "full_name": "Points Student", "email": f"points-{uuid4().hex[:8]}@skilltank.dev",
            "password": "demo123", "role": "student",
        }).json()
        points_headers = {"Authorization": f"Bearer {signup['access_token']}"}
        enrollment = client.post("/api/enroll/crs_leadership", headers=points_headers).json()
        lesson = client.get("/api/courses/crs_leadership").json()["modules"][0]["lessons"][0]
        client.put(f"/api/progress/{enrollment['id']}", headers=points_headers, json={
            "lesson_id": lesson["id"], "watched_seconds": 600, "last_position_seconds": 600,
            "completed": True, "bookmark_notes": "",
        })
        row = next(item for item in client.get("/api/leaderboard", headers=points_headers).json() if item["student_id"] == signup["user"]["id"])
        assert row["points"] == 10


def test_complete_admin_contract():
    with TestClient(app) as client:
        headers = auth(client, "admin@skilltank.dev")
        stats = client.get("/api/admin/stats", headers=headers)
        assert stats.status_code == 200
        assert all(stats.json()[key] > 0 for key in ("total_students", "total_instructors", "total_courses", "total_enrollments", "total_certificates"))
        manual = client.post("/api/admin/enroll", headers=headers, json={"student_id": "usr_student9", "course_id": "crs_python"})
        assert manual.status_code == 200
        cohort = client.post("/api/admin/cohort-enroll", headers=headers, json={"cohort_id": "coh_1", "course_id": "crs_ux"})
        assert cohort.status_code == 200 and cohort.json()["count"] > 0
        reminders = client.post("/api/admin/notifications/daily-reminder", headers=headers)
        assert reminders.status_code == 200 and reminders.json()["log_rows"] > 0
        dashboard = client.get("/api/admin/dashboard", headers=headers).json()
        certificate = dashboard["certificates"][0]
        reissue = client.post("/api/admin/certificates/reissue", headers=headers, json={"certificate_id": certificate["id"]})
        assert reissue.status_code == 200 and reissue.json()["reissued_count"] >= 1


def test_ai_interview_fallback_and_lesson_coach_contract():
    with TestClient(app) as client:
        headers = auth(client, "student@skilltank.dev")
        roles = [
            "Software Engineer", "Data Scientist", "Product Manager", "UX Designer",
            "Business Analyst", "Digital Marketer", "Full Stack Developer", "DevOps Engineer",
        ]
        for role in roles:
            response = client.get(f"/api/interviews/questions/{role}", headers=headers)
            assert response.status_code == 200
            assert len(response.json()["questions"]) == 5

        answer = " ".join(["evidence"] * 50)
        questions = client.get("/api/interviews/questions/Software%20Engineer", headers=headers).json()
        transcript = []
        for question in questions["questions"]:
            transcript.extend([
                {"role": "assistant", "text": question["prompt"]},
                {"role": "user", "text": answer},
            ])
        report = client.post("/api/interviews", headers=headers, json={
            "job_role": "Software Engineer",
            "transcript": transcript,
            "provider": "structured_fallback",
        })
        assert report.status_code == 200
        assert report.json()["score_percent"] == 100
        assert report.json()["score_breakdown"]

        lesson = client.get("/api/courses/crs_product").json()["modules"][0]["lessons"][0]
        coached = client.post(
            f"/api/lessons/{lesson['id']}/ai",
            headers=headers,
            json={"action": "question", "question": "What is the key concept?"},
        )
        assert coached.status_code == 200
        assert "Based on this lesson" in coached.json()["response"]
        assert "AI coaching is available" not in coached.json()["response"]
        if store.sqlite is not None:
            logs = [
                __import__("json").loads(row[0])
                for row in store.sqlite.execute(
                    "select data from documents where collection='ai_assistant_logs'"
                ).fetchall()
            ]
            assert any(row["lesson_id"] == lesson["id"] and row["user_id"] == "usr_student" for row in logs)


def test_round_three_catalog_certifications_and_student_cleanup():
    with TestClient(app) as client:
        catalog = client.get("/api/courses?sort=popular&limit=100")
        assert catalog.status_code == 200 and len(catalog.json()) >= 35
        details = [client.get(f"/api/courses/{course['id']}").json() for course in catalog.json()]
        urls = [lesson["video_url"] for course in details for module in course["modules"] for lesson in module["lessons"]]
        assert len(urls) == 315 and len(set(urls)) == 315
        assert all(len(course.get("learning_outcomes", [])) >= 5 for course in catalog.json())
        assert all(len(course.get("requirements", [])) >= 2 for course in catalog.json())
        assert all(len(course["reviews"]) >= 8 for course in details)

        search = client.get("/api/courses/search?q=azure")
        assert search.status_code == 200 and any("Azure" in row["title"] for row in search.json())
        certifications = client.get("/api/certifications")
        assert certifications.status_code == 200 and len(certifications.json()) >= 8
        path = client.get("/api/certifications/az-900-microsoft-azure-fundamentals")
        assert path.status_code == 200 and len(path.json()["courses"]) >= 2

        headers = auth(client, "student@skilltank.dev")
        dashboard = client.get("/api/dashboard", headers=headers).json()
        expected = {
            "crs_python": 65, "crs_react": 40, "crs_ai": 11, "crs_product": 0,
        }
        progress_by_course = {row["course_id"]: row["progress_percent"] for row in dashboard["enrollments"]}
        for course_id, progress in expected.items():
            assert progress_by_course[course_id] == progress
        assert progress_by_course["crs_figma"] == 100
        assert progress_by_course["crs_startup"] == 100
        readiness = client.get("/api/readiness-score/me", headers=headers)
        assert readiness.status_code == 200
        assert set(readiness.json()["breakdown"]) == {
            "courses_completed", "avg_quiz_score", "avg_interview_score", "certificates_earned",
        }
        focus = client.get("/api/attention-logs/my-average", headers=headers)
        assert focus.status_code == 200 and focus.json()["average_focus_percent"] > 0


def test_round_four_workspace_resources_cohort_and_security():
    with TestClient(app) as client:
        student_headers = auth(client, "student@skilltank.dev")
        dashboard = client.get("/api/dashboard", headers=student_headers)
        assert dashboard.status_code == 200
        assert any(row["name"] == "Batch 2026" and row["organization_name"] == "Acme College" for row in dashboard.json()["cohorts"])

        course = client.get("/api/courses/crs_python").json()
        first_module = course["modules"][0]
        first_lesson = first_module["lessons"][0]
        assert first_lesson["demo_notes"].startswith("##")
        assert first_lesson["resources"][0]["url"].endswith(".pdf")
        pdf = client.get(first_lesson["resources"][0]["url"])
        assert pdf.status_code == 200
        assert pdf.headers["content-type"].startswith("application/pdf")
        assert "attachment" in pdf.headers["content-disposition"]

        quiz_questions = client.get(f"/api/quizzes/{first_module['quiz']['id']}/questions", headers=student_headers)
        assert quiz_questions.status_code == 200 and len(quiz_questions.json()) == 5

        forbidden = client.get("/api/admin/dashboard", headers=student_headers)
        assert forbidden.status_code == 403

        whatsapp = client.post("/api/notifications/whatsapp-demo", headers=student_headers, json={"phone_number": "+15555550123"})
        assert whatsapp.status_code in (404, 405)


def test_notification_email_prefers_settings_recipient_and_no_default_reminder_noise():
    with TestClient(app) as client:
        headers = auth(client, "student@skilltank.dev")
        update = client.put("/api/settings", headers=headers, json={
            "notification_email": "qa-recipient@example.com",
            "email_notifications": True,
            "whatsapp_number": "+911234567890",
            "daily_reminders": False,
            "certificate_notifications": True,
        })
        assert update.status_code == 200
        assert update.json()["notification_email"] == "qa-recipient@example.com"

        triggered = client.post("/api/settings/test-notification", headers=headers)
        assert triggered.status_code == 200
        notification_rows = client.get("/api/notifications", headers=headers).json()
        email_rows = [
            row for row in notification_rows
            if row.get("user_id") == "usr_student"
            and row.get("event_type") == "test_notification"
            and row.get("channel") == "email"
        ]
        assert email_rows[-1]["payload"]["email_to"] == "qa-recipient@example.com"
        whatsapp_rows = [
            row for row in notification_rows
            if row.get("user_id") == "usr_student"
            and row.get("event_type") == "test_notification"
            and row.get("channel") == "whatsapp"
        ]
        assert whatsapp_rows[-1]["status"] == "manual_trigger_ready"
        assert whatsapp_rows[-1]["payload"]["whatsapp_url"].startswith("https://wa.me/")

        before_rows = client.get("/api/notifications", headers=headers).json()
        before = {row["id"] for row in before_rows}
        reminders = client.post("/api/admin/notifications/daily-reminder", headers=auth(client, "admin@skilltank.dev"))
        assert reminders.status_code == 200
        after_rows = client.get("/api/notifications", headers=headers).json()
        student_reminders = [
            row for row in after_rows
            if row["id"] not in before
            if row.get("user_id") == "usr_student" and row.get("event_type") == "daily_reminder"
        ]
        assert student_reminders == []


def test_round_five_catalog_subcategory_and_subscription_contracts():
    with TestClient(app) as client:
        web = client.get("/api/catalog?category=Development&subcategory=Web%20Development")
        assert web.status_code == 200
        assert len(web.json()) > 0
        assert all(row["category"] == "Development" for row in web.json())

        ml = client.get("/api/catalog?category=Data%20Science&subcategory=Machine%20Learning")
        assert ml.status_code == 200
        assert any("Machine Learning" in row["title"] for row in ml.json())

        headers = auth(client, "student@skilltank.dev")
        sub = client.post("/api/subscriptions/checkout", headers=headers)
        assert sub.status_code in (200, 503)
        if sub.status_code == 200:
            assert sub.json()["checkout_url"].startswith("http")

        questions = client.get("/api/interviews/questions/Software%20Engineer", headers=headers)
        assert questions.status_code == 200
        payload = questions.json()
        assert len(payload["questions"]) == 5
        assert any(row.get("type") == "multiple_choice" for row in payload["questions"])

        google = client.post("/api/auth/google", json={"credential": "not-a-real-google-token", "role": "student"})
        assert google.status_code in (401, 503)
