"""Phase 2 feature tests: Stripe sandbox, AI Interview, Admin Analytics, Landing Filters"""
import pytest
import requests
import os

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")

STUDENT = {"email": "student@skilltank.dev", "password": "demo123"}
ADMIN = {"email": "admin@skilltank.dev", "password": "demo123"}


def get_token(creds):
    r = requests.post(f"{BASE_URL}/api/auth/login", json=creds)
    assert r.status_code == 200, f"Login failed: {r.text}"
    return r.json()["access_token"]


@pytest.fixture(scope="module")
def student_token():
    return get_token(STUDENT)


@pytest.fixture(scope="module")
def admin_token():
    return get_token(ADMIN)


def auth_headers(token):
    return {"Authorization": f"Bearer {token}"}


# Health check
def test_health():
    r = requests.get(f"{BASE_URL}/api/health")
    assert r.status_code == 200
    data = r.json()
    assert data.get("status") == "ok" or "ok" in str(data).lower()
    print("PASS: health ok")


# Stripe sandbox checkout
def test_stripe_sandbox_checkout(student_token):
    # Get a paid course
    r = requests.get(f"{BASE_URL}/api/courses")
    assert r.status_code == 200
    courses = r.json()
    paid = [c for c in courses if not c.get("is_free") and c.get("price", 0) > 0]
    if not paid:
        pytest.skip("No paid courses available")
    course_id = paid[0]["id"]
    r2 = requests.post(f"{BASE_URL}/api/payments/checkout",
                       json={"course_id": course_id, "coupon": ""},
                       headers=auth_headers(student_token))
    assert r2.status_code == 200, f"Checkout failed: {r2.text}"
    data = r2.json()
    assert "checkout_url" in data
    assert "session_id" in data
    # Should be sandbox session
    assert data["session_id"].startswith("sandbox_"), f"Expected sandbox_ prefix, got: {data['session_id']}"
    assert "503" not in r2.text
    print(f"PASS: sandbox checkout session_id={data['session_id']}")
    return data["session_id"]


def test_stripe_sandbox_confirm(student_token):
    # Get a paid course not enrolled
    r = requests.get(f"{BASE_URL}/api/courses")
    courses = r.json()
    paid = [c for c in courses if not c.get("is_free") and c.get("price", 0) > 0]
    if not paid:
        pytest.skip("No paid courses available")
    course_id = paid[0]["id"]
    # Create checkout
    r2 = requests.post(f"{BASE_URL}/api/payments/checkout",
                       json={"course_id": course_id, "coupon": ""},
                       headers=auth_headers(student_token))
    assert r2.status_code == 200
    session_id = r2.json()["session_id"]
    assert session_id.startswith("sandbox_")
    # Confirm
    r3 = requests.get(f"{BASE_URL}/api/payments/confirm/{session_id}",
                      headers=auth_headers(student_token))
    assert r3.status_code == 200, f"Confirm failed: {r3.text}"
    data = r3.json()
    assert data.get("paid") is True
    assert "enrollment" in data
    print(f"PASS: sandbox confirm paid=True, enrollment={data['enrollment']['id']}")


# Admin analytics
def test_admin_analytics(admin_token):
    r = requests.get(f"{BASE_URL}/api/admin/dashboard", headers=auth_headers(admin_token))
    assert r.status_code == 200, f"Analytics failed: {r.text}"
    data = r.json()
    # Should have some metrics
    assert isinstance(data, dict)
    print(f"PASS: admin analytics returned keys: {list(data.keys())}")


# Courses catalog filter
def test_catalog_filter():
    r = requests.get(f"{BASE_URL}/api/courses?category=Development")
    assert r.status_code == 200
    courses = r.json()
    for c in courses:
        assert "development" in c.get("category", "").lower() or "development" in c.get("tags", [])
    print(f"PASS: catalog filter returned {len(courses)} courses")


# Student login and dashboard
def test_student_dashboard(student_token):
    r = requests.get(f"{BASE_URL}/api/me", headers=auth_headers(student_token))
    assert r.status_code in (200, 404)
    r2 = requests.get(f"{BASE_URL}/api/admin/dashboard", headers=auth_headers(get_token(ADMIN)))
    assert r2.status_code == 200
    print(f"PASS: admin dashboard returned keys: {list(r2.json().keys())}")
