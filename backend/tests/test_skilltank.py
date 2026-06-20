"""Skill Tank LMS - Backend API Tests"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://7a64f86c-bbda-4081-8a83-f98fc0b5b62f.preview.emergentagent.com').rstrip('/')

# Test credentials
STUDENT = {"email": "student@skilltank.dev", "password": "demo123"}
INSTRUCTOR = {"email": "instructor@skilltank.dev", "password": "demo123"}
ADMIN = {"email": "admin@skilltank.dev", "password": "demo123"}

@pytest.fixture(scope="session")
def student_token():
    r = requests.post(f"{BASE_URL}/api/auth/login", json=STUDENT)
    assert r.status_code == 200
    data = r.json()
    return data.get("access_token") or data.get("token")

@pytest.fixture(scope="session")
def admin_token():
    r = requests.post(f"{BASE_URL}/api/auth/login", json=ADMIN)
    assert r.status_code == 200
    data = r.json()
    return data.get("access_token") or data.get("token")

# Health
def test_health():
    r = requests.get(f"{BASE_URL}/api/health")
    assert r.status_code == 200
    assert r.json()["status"] == "ok"

# Auth endpoints
def test_login_student():
    r = requests.post(f"{BASE_URL}/api/auth/login", json=STUDENT)
    assert r.status_code == 200
    data = r.json()
    assert "access_token" in data or "token" in data
    assert "user" in data
    assert data["user"]["email"] == STUDENT["email"]

def test_login_instructor():
    r = requests.post(f"{BASE_URL}/api/auth/login", json=INSTRUCTOR)
    assert r.status_code == 200
    data = r.json()
    assert "access_token" in data or "token" in data

def test_login_admin():
    r = requests.post(f"{BASE_URL}/api/auth/login", json=ADMIN)
    assert r.status_code == 200
    data = r.json()
    assert "access_token" in data or "token" in data

def test_login_invalid():
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": "x@x.com", "password": "wrong"})
    assert r.status_code in [400, 401, 404]

# Auth callback route
def test_auth_callback_exists():
    r = requests.get(f"{BASE_URL}/api/auth/callback", params={"code": "test_code"})
    # Should not 404 - may return 400 or redirect
    assert r.status_code != 404

# Courses
def test_get_courses(student_token):
    r = requests.get(f"{BASE_URL}/api/courses", headers={"Authorization": f"Bearer {student_token}"})
    assert r.status_code == 200
    data = r.json()
    assert isinstance(data, list)
    print(f"Found {len(data)} courses")

def test_get_courses_no_auth():
    r = requests.get(f"{BASE_URL}/api/courses")
    assert r.status_code == 200

def test_get_courses_by_category(student_token):
    r = requests.get(f"{BASE_URL}/api/courses?category=Development", headers={"Authorization": f"Bearer {student_token}"})
    assert r.status_code == 200

# Dashboard / enrollments
def test_student_enrollments(student_token):
    r = requests.get(f"{BASE_URL}/api/enrollments", headers={"Authorization": f"Bearer {student_token}"})
    assert r.status_code == 200

# Certifications
def test_certifications(student_token):
    r = requests.get(f"{BASE_URL}/api/certifications", headers={"Authorization": f"Bearer {student_token}"})
    assert r.status_code in [200, 404]

# Lessons - get first course then its lessons
def test_lessons_exist(student_token):
    r = requests.get(f"{BASE_URL}/api/courses")
    assert r.status_code == 200
    courses = r.json()
    if courses:
        course_id = courses[0]["id"]
        r2 = requests.get(f"{BASE_URL}/api/courses/{course_id}", headers={"Authorization": f"Bearer {student_token}"})
        assert r2.status_code == 200
        print(f"Course: {r2.json().get('title')}")
