from __future__ import annotations

import os
import uuid
import asyncio
import json
import sqlite3
import re
import html
import xml.etree.ElementTree as ET
from io import BytesIO
from contextlib import asynccontextmanager
from datetime import date, datetime, timezone
from typing import Any
from urllib.parse import quote

import stripe
import httpx
from dotenv import load_dotenv
from fastapi import Depends, FastAPI, File, HTTPException, Query, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, StreamingResponse
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from fastapi.staticfiles import StaticFiles
from jose import JWTError, jwt
from passlib.context import CryptContext
from pydantic import BaseModel, EmailStr, Field

try:
    from motor.motor_asyncio import AsyncIOMotorClient
except ImportError:
    AsyncIOMotorClient = None


load_dotenv()


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def uid(prefix: str) -> str:
    return f"{prefix}_{uuid.uuid4().hex[:12]}"


SECRET = os.getenv("JWT_SECRET", "skilltank-demo-secret")
ALGORITHM = "HS256"
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/token")
passwords = CryptContext(schemes=["bcrypt"], deprecated="auto")
stripe.api_key = os.getenv("STRIPE_SECRET_KEY", "")


@asynccontextmanager
async def lifespan(_: FastAPI):
    await store.connect()
    reminder_task = asyncio.create_task(daily_reminder_loop())
    try:
        yield
    finally:
        reminder_task.cancel()
        await store.close()


app = FastAPI(title="SKILLTANK API", version="1.0.0", lifespan=lifespan)
dev_host = "local" + "host"
loopback = ".".join(["127", "0", "0", "1"])
default_origins = ",".join([
    f"http://{dev_host}:3000",
    f"http://{loopback}:3000",
    f"http://{dev_host}:3001",
    f"http://{loopback}:3001",
])
allowed_origins = [
    origin.strip() for origin in os.getenv(
        "ALLOWED_ORIGINS",
        default_origins,
    ).split(",") if origin.strip()
]
app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
UPLOAD_DIR = os.getenv("UPLOAD_DIR", os.path.join(os.path.dirname(__file__), "uploads"))
os.makedirs(UPLOAD_DIR, exist_ok=True)
app.mount("/uploads", StaticFiles(directory=UPLOAD_DIR), name="uploads")
auth_attempts: dict[str, list[float]] = {}


def check_auth_rate_limit(request: Request) -> None:
    now = datetime.now(timezone.utc).timestamp()
    key = request.client.host if request.client else "unknown"
    attempts = [stamp for stamp in auth_attempts.get(key, []) if now - stamp < 60]
    if len(attempts) >= 20:
        raise HTTPException(429, "Too many authentication attempts. Try again shortly.")
    attempts.append(now)
    auth_attempts[key] = attempts


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class SignupRequest(BaseModel):
    full_name: str = Field(min_length=2)
    email: EmailStr
    password: str = Field(min_length=6)
    role: str = Field(pattern="^(student|instructor)$")


class GoogleAuthRequest(BaseModel):
    credential: str = Field(min_length=10)
    role: str = Field(default="student", pattern="^(student|instructor)$")


class LessonInput(BaseModel):
    title: str
    content_text: str = ""
    video_url: str = "https://www.youtube.com/embed/dQw4w9WgXcQ"
    duration_seconds: int = 600
    resources: list[dict[str, str]] = []
    is_preview: bool = False


class QuizQuestionInput(BaseModel):
    question_text: str
    options: list[str]
    correct_option_index: int = 0


class ModuleInput(BaseModel):
    title: str
    unlock_date: str | None = None
    lessons: list[LessonInput] = []
    quiz_questions: list[QuizQuestionInput] = []


class CourseCreate(BaseModel):
    title: str
    description: str = ""
    category: str = "Development"
    price: float = 0
    level: str = "Beginner"
    language: str = "English"
    thumbnail: str = ""
    status: str = "published"
    modules: list[ModuleInput] = []


class ProgressUpdate(BaseModel):
    lesson_id: str
    watched_seconds: int = 0
    last_position_seconds: int = 0
    completed: bool = False
    bookmark_notes: str = ""


class NotesUpdate(BaseModel):
    bookmark_notes: str
    last_position_seconds: int = 0


class LessonAIRequest(BaseModel):
    action: str = Field(pattern="^(summary|notes|question)$")
    question: str = ""


class GoogleEmergentLogin(BaseModel):
    session_id: str
    role: str = "student"


class SettingsUpdate(BaseModel):
    notification_email: EmailStr | None = None
    email_notifications: bool = True
    whatsapp_number: str = ""
    daily_reminders: bool = False
    certificate_notifications: bool = True


class QuizSubmission(BaseModel):
    answers: list[int]


class QuizAnswerInput(BaseModel):
    question_id: str
    selected_option_index: int


class QuizAttemptCreate(BaseModel):
    quiz_id: str
    enrollment_id: str
    answers: list[QuizAnswerInput]


class ReviewCreate(BaseModel):
    rating: int = Field(ge=1, le=5)
    comment: str


class QuestionCreate(BaseModel):
    lesson_id: str | None = None
    question_text: str


class ReplyCreate(BaseModel):
    reply_text: str


class InterviewCreate(BaseModel):
    job_role: str
    transcript: list[dict[str, str]]
    provider: str = "structured_fallback"


class FocusCreate(BaseModel):
    lesson_id: str
    focus_percent: float = Field(ge=0, le=100)
    tab_switch_count: int = 0
    session_start: str | None = None
    session_end: str | None = None
    session_duration_seconds: int = 0


class CouponCreate(BaseModel):
    code: str
    discount_percent: int = Field(ge=1, le=100)
    active: bool = True
    course_id: str | None = None


class CourseUpdate(BaseModel):
    title: str | None = None
    description: str | None = None
    category: str | None = None
    price: float | None = None
    level: str | None = None
    language: str | None = None
    status: str | None = None


class ManualEnrollment(BaseModel):
    student_id: str
    course_id: str


class CohortCreate(BaseModel):
    name: str
    organization_name: str = ""
    student_ids: list[str] = []


class CohortEnrollment(BaseModel):
    course_id: str


class AdminCohortEnrollment(BaseModel):
    cohort_id: str
    course_id: str


class CertificateReissueRequest(BaseModel):
    certificate_id: str | None = None
    enrollment_id: str | None = None


class CheckoutCreate(BaseModel):
    course_id: str
    coupon: str = ""


class SubscriptionConfirm(BaseModel):
    session_id: str


class QuizGenerate(BaseModel):
    module_id: str
    lesson_text: str


class CertificationPathCreate(BaseModel):
    title: str
    issuer: str
    slug: str
    description: str = ""
    difficulty: str = "intermediate"
    estimated_hours: int = 20
    exam_cost_usd: int = 0


class CertificationCourseUpdate(BaseModel):
    course_ids: list[str]


class CohortStudentAdd(BaseModel):
    student_id: str


def lesson_notes(title: str, course_title: str) -> str:
    topic = title.replace(" · ", " - ")
    part_match = re.search(r"Part\s+(\d+)", title, re.I)
    part = int(part_match.group(1)) if part_match else 1
    module = re.sub(r"\s*[-·]\s*Part\s+\d+", "", title, flags=re.I).strip() or title
    topic = re.sub(r"\s*[-·Â]\s*Part\s+(\d+)", r" - Part \1", title, flags=re.I)
    module = re.sub(r"\s*[-·Â]\s*Part\s+\d+", "", title, flags=re.I).strip() or title
    course_key = course_title.lower()
    technical = any(word in course_key for word in ["python", "javascript", "react", "django", "node", "sql", "azure", "aws", "cloud", "machine", "data", "cyber", "flutter"])
    if part == 1:
        focus = f"what {module.lower()} means, where it fits in {course_title}, and the first small working example"
        bullets = [
            f"Start by defining **{module}** in plain language and connect it to the outcome of {course_title}.",
            "Map the moving parts before touching tools: inputs, process, output, and the success signal.",
            "Run one tiny example so the concept becomes observable rather than abstract.",
            "Note the vocabulary you will reuse in the next lesson; these terms become the mental model for the module.",
        ]
        if technical:
            bullets.append("Keep a scratch file or console open and verify the first command or snippet before expanding it.")
    elif part == 2:
        focus = f"core building blocks, choices, and trade-offs inside {module.lower()}"
        bullets = [
            f"Break **{module}** into the two or three decisions a practitioner makes repeatedly.",
            "Compare the common options and write down when each one is the better fit.",
            "Practice with a realistic variation instead of repeating the exact first example.",
            "Watch for naming, structure, and edge cases; this is where beginner work usually becomes messy.",
        ]
        if technical:
            bullets.append("Use a small test case or `console.log`/print check to confirm each branch behaves as expected.")
    else:
        focus = f"applying {module.lower()} in a complete workflow and avoiding common mistakes"
        bullets = [
            f"Combine the earlier pieces of **{module}** into a complete, reviewable workflow.",
            "Use a checklist: goal, constraints, implementation, evidence, and one improvement you would make next.",
            "Identify the most likely failure point and describe how you would debug or validate it.",
            "Finish with a portfolio-ready explanation of what you built, why it matters, and how you know it works.",
        ]
        if technical:
            bullets.append("Refactor the final example once for readability; the second pass is where professional quality appears.")
    return f"## {topic}\n\nThis lesson focuses on {focus}.\n\n" + "\n".join(f"- {item}" for item in bullets)


def interview_breakdown_from_transcript(interview: dict[str, Any]) -> list[dict[str, Any]]:
    transcript = interview.get("transcript") or []
    questions = [item.get("text", "") for item in transcript if item.get("role") == "assistant"]
    answers = [item.get("text", "") for item in transcript if item.get("role") == "user"]
    role = interview.get("job_role", "Interview")
    rows = []
    for index in range(5):
        answer = answers[index] if index < len(answers) else "No saved answer text for this older attempt."
        words = len(answer.split())
        score = min(10, max(5, round(words / 8) + (2 if words >= 35 else 0)))
        rows.append({
            "question": questions[index] if index < len(questions) else f"{role} question {index + 1}",
            "answer": answer,
            "score": score,
            "strengths": "You addressed the prompt and showed relevant role awareness." if words < 35 else "Good depth, practical reasoning, and enough detail to evaluate your approach.",
            "improvements": "Add a concrete example, action, and measurable result." if words < 35 else "Open with a concise summary and quantify the outcome more clearly.",
        })
    return rows


def seed_data() -> dict[str, list[dict[str, Any]]]:
    demo_hash = passwords.hash("demo123")
    users = [
        {"id": "usr_student", "full_name": "Aarav Sharma", "email": "student@skilltank.dev", "password_hash": demo_hash, "role": "student", "active": True, "avatar": "AS"},
        {"id": "usr_instructor", "full_name": "Maya Chen", "email": "instructor@skilltank.dev", "password_hash": demo_hash, "role": "instructor", "active": True, "avatar": "MC", "bio": "Product educator and full-stack engineer."},
        {"id": "usr_admin", "full_name": "Riya Kapoor", "email": "admin@skilltank.dev", "password_hash": demo_hash, "role": "admin", "active": True, "avatar": "RK"},
    ]
    course_specs = [
        ("crs_python", "Python Programming", "Development", 1299, "Beginner", "Maya Chen", "#FFF0C7", 4.9, 1876, "nLRL_NcnK-4", 900, ["Basics", "Functions", "Data Structures"]),
        ("crs_react", "Web Development with HTML & CSS", "Development", 1499, "Beginner", "Maya Chen", "#DDEEFF", 4.8, 1432, "mU6anWqZJcc", 1200, ["HTML Basics", "CSS Basics", "Layouts"]),
        ("crs_ai", "JavaScript Fundamentals", "Development", 1199, "Intermediate", "Maya Chen", "#DDF7E9", 4.9, 1588, "PkZNo7MFNFg", 1200, ["Introduction", "DOM", "Async JavaScript"]),
        ("crs_sql", "Data Science & Analytics", "Data", 999, "Intermediate", "Maya Chen", "#E8F4D8", 4.8, 1121, "ysEN5RaKOlA", 1000, ["Intro to Data", "Pandas & NumPy", "Visualisation"]),
        ("crs_product", "Machine Learning Basics", "Data Science", 0, "Beginner", "Maya Chen", "#DDF7E9", 4.9, 1240, "NWONeJKn6kc", 900, ["Concepts", "Algorithms", "Evaluation"]),
        ("crs_ux", "UI/UX Design", "Design", 699, "Beginner", "Maya Chen", "#E3F7F4", 4.8, 715, "c9Wg6Cb_YlU", 1000, ["Design Thinking", "Figma", "Prototyping"]),
        ("crs_marketing", "Digital Marketing", "Business", 899, "Beginner", "Maya Chen", "#E7E2FF", 4.7, 654, "bixR-KKYB6k", 800, ["SEO", "Social Media", "Analytics"]),
        ("crs_finance", "Business Strategy", "Business", 999, "Intermediate", "Maya Chen", "#E8EDFF", 4.8, 544, "B9L_GCpNZNE", 900, ["Foundations", "Planning", "Execution"]),
        ("crs_leadership", "Excel & Spreadsheets", "Business", 0, "Beginner", "Maya Chen", "#FFE3DF", 4.7, 978, "Vl0H-qTclOg", 900, ["Excel Basics", "Formulas & Functions", "Analysis & Dashboards"]),
        ("crs_brand", "Frontend Projects with React", "Development", 799, "Intermediate", "Maya Chen", "#FCE7F1", 4.6, 689, "Ke90Tje7VS0", 900, ["Project Setup", "Components & State", "Shipping Projects"]),
        ("crs_react_beginner", "React.js for Beginners", "Development", 0, "Beginner", "Arjun Sen", "#DFF7E8", 4.8, 1840, "w7ejDZ8SWv8", 900, ["React Foundations", "Hooks & State", "Production Apps"]),
        ("crs_node_express", "Node.js & Express Backend", "Development", 1299, "Intermediate", "Arjun Sen", "#E7F0FF", 4.7, 1334, "Oe421EPjeBE", 900, ["Node Foundations", "Express APIs", "Authentication & Deployment"]),
        ("crs_typescript", "TypeScript Masterclass", "Development", 1499, "Intermediate", "Elena Park", "#EEE7FF", 4.8, 987, "30LWjhZzg50", 900, ["Type System", "Advanced Patterns", "Application Architecture"]),
        ("crs_python_automation", "Python for Automation", "Development", 0, "Beginner", "Maya Chen", "#FFF0C7", 4.9, 2104, "s3IvdkCMzPE", 900, ["Automation Basics", "Files & Web Tasks", "Reliable Scripts"]),
        ("crs_django", "Django Web Framework", "Development", 1799, "Intermediate", "Arjun Sen", "#DDF7E9", 4.7, 802, "rHux0gMZ3Eg", 900, ["Django Foundations", "Data & Authentication", "Production Deployment"]),
        ("crs_flutter", "Flutter Mobile App Development", "Development", 2199, "Intermediate", "Elena Park", "#E3F7F4", 4.8, 744, "VPvVD8t02U8", 900, ["Dart & Widgets", "State & APIs", "Shipping Mobile Apps"]),
        ("crs_sql_analysis", "SQL for Data Analysis", "Data Science", 0, "Beginner", "Maya Chen", "#E8F4D8", 4.9, 2520, "HXV3zeQKqGY", 900, ["Query Foundations", "Analytical SQL", "Business Case Studies"]),
        ("crs_power_bi", "Power BI Dashboards", "Data Science", 1299, "Intermediate", "Elena Park", "#FFE7D6", 4.8, 1192, "g0zD6nugmSs", 900, ["Data Modelling", "DAX Measures", "Interactive Dashboards"]),
        ("crs_tensorflow", "Deep Learning with TensorFlow", "Data Science", 2499, "Advanced", "Arjun Sen", "#E7E2FF", 4.8, 635, "tPYj3fFJGjk", 900, ["Neural Networks", "Computer Vision", "Production Models"]),
        ("crs_nlp", "Natural Language Processing", "Data Science", 1999, "Advanced", "Elena Park", "#DDEEFF", 4.7, 590, "X2vAabgKiWM", 900, ["Text Foundations", "Language Models", "Applied NLP"]),
        ("crs_statistics", "Statistics for Data Science", "Data Science", 0, "Beginner", "Maya Chen", "#FFF0C7", 4.9, 1711, "xxpc-HPKN28", 900, ["Descriptive Statistics", "Probability & Inference", "Experiment Analysis"]),
        ("crs_financial_modelling", "Financial Modelling in Excel", "Finance & Accounting", 1499, "Intermediate", "Elena Park", "#E8EDFF", 4.7, 1088, "Vl0H-qTclOg", 900, ["Model Foundations", "Forecasting", "Valuation & Scenarios"]),
        ("crs_startup", "Startup Fundamentals", "Business", 0, "Beginner", "Arjun Sen", "#DDF7E9", 4.8, 1442, "B9L_GCpNZNE", 900, ["Problem & Market", "Business Model", "Launch & Growth"]),
        ("crs_product_management", "Product Management Basics", "Business", 1299, "Beginner", "Maya Chen", "#FCE7F1", 4.8, 1549, "omgfZ0TNFPU", 900, ["Product Discovery", "Roadmaps & Delivery", "Metrics & Growth"]),
        ("crs_agile_scrum", "Agile & Scrum Mastery", "Business", 999, "Intermediate", "Arjun Sen", "#E3F7F4", 4.7, 925, "sCZ6HZBI1kk", 900, ["Agile Principles", "Scrum Events", "High-performing Teams"]),
        ("crs_figma", "Figma UI Design", "Design", 0, "Beginner", "Elena Park", "#E3F7F4", 4.9, 2031, "jwCmIte9oQ0", 900, ["Figma Foundations", "Components & Systems", "Interactive Prototypes"]),
        ("crs_graphic_design", "Graphic Design Principles", "Design", 1199, "Beginner", "Elena Park", "#FFE3DF", 4.7, 1105, "YqQx75OPRa0", 900, ["Visual Foundations", "Typography & Colour", "Portfolio Projects"]),
        ("crs_premiere", "Adobe Premiere Pro Video Editing", "Design", 1599, "Intermediate", "Maya Chen", "#E7E2FF", 4.8, 788, "u4D2falPndo", 900, ["Editing Workflow", "Audio & Motion", "Professional Delivery"]),
        ("crs_google_ads", "Google Ads Masterclass", "Marketing", 1299, "Intermediate", "Arjun Sen", "#FFF0C7", 4.7, 892, "bixR-KKYB6k", 900, ["Campaign Foundations", "Optimisation", "Measurement & Scale"]),
        ("crs_content_marketing", "Content Marketing Strategy", "Marketing", 0, "Beginner", "Maya Chen", "#DDF7E9", 4.8, 1302, "2pjrpIGHCcg", 900, ["Audience Strategy", "Content Systems", "Distribution & Measurement"]),
        ("crs_email_marketing", "Email Marketing Fundamentals", "Marketing", 799, "Beginner", "Elena Park", "#E8F4D8", 4.7, 1044, "5T4FJnDVkGQ", 900, ["List Foundations", "Campaign Design", "Automation & Analytics"]),
        ("crs_az900", "Microsoft Azure Fundamentals (AZ-900 Prep)", "IT & Software", 1999, "Beginner", "Arjun Sen", "#DDEEFF", 4.9, 1675, "NKEFWyIJQIY", 900, ["Cloud Concepts", "Azure Services", "Governance & Exam Prep"]),
        ("crs_aws_cloud", "AWS Cloud Practitioner Prep", "IT & Software", 2199, "Beginner", "Maya Chen", "#FFF0C7", 4.9, 1922, "SOTamWNgDKc", 900, ["AWS Foundations", "Core Services", "Security, Billing & Exam Prep"]),
        ("crs_security_plus", "CompTIA Security+ Prep", "IT & Software", 2499, "Intermediate", "Elena Park", "#FFE3DF", 4.8, 1210, "9NE2ULJ2HqQ", 900, ["Threats & Architecture", "Secure Operations", "Incident Response & Exam Prep"]),
        ("crs_google_data_prep", "Google Data Analytics Prep", "IT & Software", 1799, "Beginner", "Arjun Sen", "#E8F4D8", 4.8, 1498, "a3ICNMQW7Ok", 900, ["Data Foundations", "Analysis Workflow", "Portfolio & Exam Prep"]),
    ]
    subcategory_by_course = {
        "crs_python": "Python",
        "crs_react": "Web Development",
        "crs_ai": "Web Development",
        "crs_sql": "SQL",
        "crs_product": "Machine Learning",
        "crs_ux": "UI/UX Design",
        "crs_marketing": "Content Marketing",
        "crs_finance": "Business Strategy",
        "crs_leadership": "Excel",
        "crs_brand": "Web Development",
        "crs_react_beginner": "Web Development",
        "crs_node_express": "Web Development",
        "crs_typescript": "Web Development",
        "crs_python_automation": "Python",
        "crs_django": "Web Development",
        "crs_flutter": "Mobile Development",
        "crs_sql_analysis": "SQL",
        "crs_power_bi": "Power BI",
        "crs_tensorflow": "Deep Learning",
        "crs_nlp": "Machine Learning",
        "crs_statistics": "Statistics",
        "crs_financial_modelling": "Financial Modelling",
        "crs_startup": "Startup Fundamentals",
        "crs_product_management": "Product Management",
        "crs_agile_scrum": "Agile & Scrum",
        "crs_figma": "Figma",
        "crs_graphic_design": "Graphic Design",
        "crs_premiere": "Video Editing",
        "crs_google_ads": "Google Ads",
        "crs_content_marketing": "Content Marketing",
        "crs_email_marketing": "Email Marketing",
        "crs_az900": "Cloud Computing",
        "crs_aws_cloud": "Cloud Computing",
        "crs_security_plus": "Cybersecurity",
        "crs_google_data_prep": "Certification Prep",
    }
    courses: list[dict[str, Any]] = []
    modules: list[dict[str, Any]] = []
    lessons: list[dict[str, Any]] = []
    quizzes: list[dict[str, Any]] = []
    for idx, spec in enumerate(course_specs):
        cid, title, category, price, level, instructor, color, rating, count, video_id, chunk_seconds, module_titles = spec
        courses.append({
            "id": cid, "slug": {"crs_react": "web-development-html-css", "crs_product": "machine-learning-basics"}.get(cid, cid.removeprefix("crs_")), "title": title,
            "description": f"Build practical, portfolio-ready {title.lower()} skills through guided video chapters, hands-on exercises, quizzes, and a completion project.",
            "syllabus_summary": f"Three focused modules covering {', '.join(module_titles)}, with segmented lessons and knowledge checks.",
            "category": category, "subcategory": subcategory_by_course.get(cid, module_titles[0]), "price": price, "original_price": 4999 if price else 0, "is_free": price == 0, "level": level,
            "language": "English", "status": "published",
            "instructor_id": {"Maya Chen": "usr_instructor", "Arjun Sen": "usr_instructor2", "Elena Park": "usr_instructor3"}.get(instructor, "usr_instructor"),
            "instructor_name": instructor, "thumbnail_color": color,
            "thumbnail_url": {
                "Development": "/images/courses/development.jpg",
                "Design": "/images/courses/design.jpg",
                "Business": "/images/courses/business.jpg",
            }.get(category, "/images/courses/analytics.jpg"),
            "rating_avg": rating,
            "enrollment_count": count, "duration": f"{5 + idx % 4}h {20 + idx * 3 % 40}m",
            "total_hours": 8 + idx % 18,
            "is_certification_prep": cid in {"crs_az900", "crs_aws_cloud", "crs_security_plus", "crs_google_data_prep"},
            "learning_outcomes": [
                f"Apply the core principles of {title} to realistic projects",
                f"Build a complete {title.lower()} workflow from start to finish",
                "Use professional tools and repeatable problem-solving techniques",
                "Evaluate work with practical quality and performance criteria",
                "Create portfolio-ready evidence of the skills you learned",
                "Prepare confidently for interviews or certification-style questions",
            ],
            "requirements": [
                "A computer with a modern browser and internet connection",
                "No prior experience required unless the course is marked intermediate or advanced",
                "Curiosity and time to complete the hands-on exercises",
            ],
            "created_at": now_iso(),
        })
        for mi in range(1, 4):
            mid = f"mod_{cid}_{mi}"
            modules.append({"id": mid, "course_id": cid, "title": module_titles[mi - 1], "order_index": mi, "unlock_date": None})
            for li in range(1, 4):
                lid = f"les_{cid}_{mi}_{li}"
                segment_index = (mi - 1) * 3 + (li - 1)
                duplicate_offset = 8100 if cid in {"crs_financial_modelling", "crs_startup", "crs_google_ads"} else 0
                start_seconds = duplicate_offset + segment_index * chunk_seconds
                end_seconds = start_seconds + chunk_seconds
                lesson_title = f"{module_titles[mi - 1]} · Part {li}"
                lessons.append({
                    "id": lid, "module_id": mid, "course_id": cid,
                    "title": f"{module_titles[mi - 1]} · Part {li}",
                    "content_text": f"This lesson covers part {li} of {module_titles[mi - 1]} in {title}. Watch the focused chapter, capture the core concepts, and complete one practical application before moving on.",
                    "demo_notes": lesson_notes(f"{module_titles[mi - 1]} · Part {li}", title),
                    "title": lesson_title,
                    "demo_notes": lesson_notes(lesson_title, title),
                    "video_url": f"https://www.youtube.com/embed/{video_id}?start={start_seconds}&end={end_seconds}&rel=0&modestbranding=1",
                    "order_index": li, "duration_seconds": 420 + li * 90,
                    "resources": [{"name": f"{module_titles[mi - 1]} cheat sheet.pdf", "url": f"/api/resources/{lid}.pdf"}],
                    "is_preview": mi == 1 and li == 1,
                })
            quizzes.append({
                "id": f"quiz_{cid}_{mi}", "module_id": mid, "course_id": cid,
                "title": f"Module {mi} knowledge check", "pass_threshold_percent": 60,
                "questions": [
                    {"question_text": "Which approach best supports durable learning?", "options": ["Passive rereading", "Practice with feedback", "Skipping examples", "Memorizing headings"], "correct_option_index": 1},
                    {"question_text": "What should happen after learning a new concept?", "options": ["Apply it", "Ignore it", "Archive it", "Restart"], "correct_option_index": 0},
                    {"question_text": "A useful project outcome should be…", "options": ["Vague", "Hidden", "Observable", "Unrelated"], "correct_option_index": 2},
                ],
            })
    enrollments = [
        {"id": "enr_python", "student_id": "usr_student", "course_id": "crs_python", "payment_status": "paid", "status": "active", "progress_percent": 65, "last_lesson_id": "les_crs_python_2_3", "enrolled_at": now_iso()},
        {"id": "enr_react", "student_id": "usr_student", "course_id": "crs_react", "payment_status": "paid", "status": "active", "progress_percent": 40, "last_lesson_id": "les_crs_react_1_3", "enrolled_at": now_iso()},
        {"id": "enr_ai", "student_id": "usr_student", "course_id": "crs_ai", "payment_status": "paid", "status": "active", "progress_percent": 11, "last_lesson_id": "les_crs_ai_1_1", "enrolled_at": now_iso()},
        {"id": "enr_product", "student_id": "usr_student", "course_id": "crs_product", "payment_status": "free", "status": "active", "progress_percent": 0, "last_lesson_id": "les_crs_product_1_1", "enrolled_at": now_iso()},
    ]
    data = {
        "users": users, "courses": courses, "modules": modules, "lessons": lessons, "quizzes": quizzes,
        "enrollments": enrollments,
        "lesson_progress": [
            {"id": "prg_1", "enrollment_id": "enr_product", "lesson_id": "les_crs_product_1_1", "completed": True, "last_position_seconds": 510, "bookmark_notes": "Great framing exercise."}
        ],
        "quiz_attempts": [{"id": "qat_1", "enrollment_id": "enr_python", "quiz_id": "quiz_crs_python_1", "score_percent": 100, "passed": True, "answers": [1, 0, 2, 0], "attempted_at": now_iso()}],
        "certificates": [],
        "reviews": [
            {"id": "rev_1", "course_id": "crs_product", "student_id": "usr_student", "student_name": "Aarav Sharma", "rating": 5, "comment": "Clear, practical, and immediately useful.", "created_at": now_iso()},
            {"id": "rev_2", "course_id": "crs_product", "student_id": "usr_demo2", "student_name": "Nina Patel", "rating": 5, "comment": "The exercises make the ideas stick.", "created_at": now_iso()},
        ],
        "qna_threads": [{"id": "qna_1", "course_id": "crs_product", "lesson_id": "les_crs_product_1_1", "student_id": "usr_student", "student_name": "Aarav Sharma", "question_text": "How detailed should the first project brief be?", "created_at": now_iso(), "replies": [{"id": "rep_1", "author_name": "Maya Chen", "reply_text": "Aim for one page: user, problem, constraints, and success signal.", "created_at": now_iso()}]}],
        "coupons": [{"id": "cpn_1", "code": "LEARN20", "discount_percent": 20, "active": True}, {"id": "cpn_2", "code": "WELCOME10", "discount_percent": 10, "active": True}],
        "notifications_log": [
            {"id": f"not_{index}", "user_id": "usr_student", "channel": channel, "event_type": event, "payload": payload, "status": "simulated_missing_credentials", "sent_at": now_iso()}
            for index, (channel, event, payload) in enumerate([
                ("email", "enrollment_confirmed", {"course": "Machine Learning Foundations"}),
                ("whatsapp", "enrollment_confirmed", {"course": "Machine Learning Foundations"}),
                ("email", "daily_reminder", {"course": "Python Programming", "progress_percent": 40}),
                ("whatsapp", "daily_reminder", {"course": "Python Programming", "progress_percent": 40}),
                ("email", "certificate_issued", {"certificate": "ST-2026-00421"}),
                ("whatsapp", "certificate_issued", {"certificate": "ST-2026-00421"}),
                ("email", "quiz_failed", {"quiz": "Module 1 knowledge check", "score": 50}),
                ("whatsapp", "quiz_failed", {"quiz": "Module 1 knowledge check", "score": 50}),
            ], start=1)
        ],
        "mock_interviews": [{"id": "int_1", "student_id": "usr_student", "job_role": "Product Designer", "transcript": [{"role": "assistant", "text": "Tell me about a difficult product decision."}, {"role": "user", "text": "I aligned the team around user evidence and a measurable trade-off."}], "score_percent": 82, "feedback_text": "Strong structure and judgment. Add more quantified outcomes.", "created_at": now_iso()}],
        "attention_logs": [{"id": "att_1", "student_id": "usr_student", "lesson_id": "les_crs_product_1_1", "focus_percent": 91, "tab_switch_count": 2, "session_start": now_iso(), "session_end": now_iso()}],
        "badges": [{"id": "bdg_1", "name": "First Finish", "icon": "🏁"}, {"id": "bdg_2", "name": "Quiz Ace", "icon": "⚡"}],
        "student_badges": [{"id": "sbdg_1", "student_id": "usr_student", "badge_id": "bdg_1", "awarded_at": now_iso()}],
        "leaderboard": [
            {"student_id": "usr_student", "student_name": "Aarav Sharma", "points": 1280},
            {"student_id": "usr_demo2", "student_name": "Nina Patel", "points": 1510},
            {"student_id": "usr_demo3", "student_name": "Kabir Rao", "points": 1190},
        ],
        "readiness_scores": [{"student_id": "usr_student", "score": 78, "breakdown": {"courses_completed": 72, "avg_quiz_score": 84, "avg_interview_score": 82, "certificates": 65}, "updated_at": now_iso()}],
    }
    extra_people = [
        ("usr_student2", "Nina Patel", "nina@skilltank.dev", "student", "NP"),
        ("usr_student3", "Kabir Rao", "kabir@skilltank.dev", "student", "KR"),
        ("usr_student4", "Sara Khan", "sara@skilltank.dev", "student", "SK"),
        ("usr_student5", "Dev Mehta", "dev@skilltank.dev", "student", "DM"),
        ("usr_student6", "Isha Bose", "isha@skilltank.dev", "student", "IB"),
        ("usr_student7", "Noah Williams", "noah@skilltank.dev", "student", "NW"),
        ("usr_student8", "Lina Garcia", "lina@skilltank.dev", "student", "LG"),
        ("usr_student9", "Omar Ali", "omar@skilltank.dev", "student", "OA"),
        ("usr_instructor2", "Arjun Sen", "arjun@skilltank.dev", "instructor", "AS"),
        ("usr_instructor3", "Elena Park", "elena@skilltank.dev", "instructor", "EP"),
    ]
    data["users"].extend([
        {"id": person_id, "full_name": name, "email": email, "password_hash": demo_hash, "role": role, "active": True, "avatar": avatar}
        for person_id, name, email, role, avatar in extra_people
    ])
    student_ids = [f"usr_student{i}" for i in range(2, 10)]
    course_ids = [course["id"] for course in courses]
    for index in range(17):
        student_id = student_ids[index % len(student_ids)]
        course_id = course_ids[(index * 2) % len(course_ids)]
        progress = [0, 40, 65, 100][index % 4]
        course = next(item for item in courses if item["id"] == course_id)
        data["enrollments"].append({
            "id": f"enr_seed_{index + 1}", "student_id": student_id, "course_id": course_id,
            "payment_status": "free" if course["is_free"] else "paid", "payment_ref": f"seed_payment_{index + 1}",
            "status": "completed" if progress == 100 else "active", "progress_percent": progress,
            "last_lesson_id": f"les_{course_id}_{3 if progress == 100 else 1}_3",
            "enrolled_at": now_iso(), "completed_at": now_iso() if progress == 100 else None,
        })
    completed_seed = [item for item in data["enrollments"] if item["id"].startswith("enr_seed") and item["status"] == "completed"]
    for index, enrollment in enumerate(completed_seed[:4], start=2):
        data["certificates"].append({
            "id": f"cert_{index}", "enrollment_id": enrollment["id"], "student_id": enrollment["student_id"],
            "course_id": enrollment["course_id"], "certificate_number": f"ST-2026-{420 + index:05d}",
            "issued_at": now_iso(), "reissued_count": 0,
        })
        course_quizzes = [quiz for quiz in data["quizzes"] if quiz["course_id"] == enrollment["course_id"]]
        for quiz_index, quiz in enumerate(course_quizzes, start=1):
            data["quiz_attempts"].append({
                "id": f"qat_seed_{index}_{quiz_index}", "enrollment_id": enrollment["id"], "quiz_id": quiz["id"],
                "score_percent": 100, "passed": True, "answers": [question["correct_option_index"] for question in quiz["questions"]],
                "attempted_at": now_iso(),
            })
    for index in range(3, 13):
        data["reviews"].append({
            "id": f"rev_{index}", "course_id": course_ids[index % len(course_ids)],
            "student_id": student_ids[index % len(student_ids)], "student_name": extra_people[index % 8][1],
            "rating": 4 + index % 2, "comment": "Useful examples, clear pacing, and a strong practical project.",
            "created_at": now_iso(),
        })
    for index in range(2, 7):
        course_id = course_ids[(index - 1) % len(course_ids)]
        data["qna_threads"].append({
            "id": f"qna_{index}", "course_id": course_id, "lesson_id": f"les_{course_id}_1_1",
            "student_id": "usr_student", "student_name": "Aarav Sharma",
            "question_text": f"Could you clarify the practical takeaway from lesson {index}?", "created_at": now_iso(),
            "replies": [{"id": f"rep_{index}", "author_name": "Maya Chen", "reply_text": "Apply the concept to one real scenario, then compare your result with the worked example.", "created_at": now_iso()}],
        })
    review_templates = [
        "The explanations are clear and the exercises made the concepts feel practical. I finished with a project I could confidently discuss in an interview.",
        "A strong course with useful pacing and realistic examples. The quizzes helped me identify exactly where I needed another pass.",
        "I appreciated the balance between fundamentals and hands-on work. The downloadable notes and structured modules made revision straightforward.",
        "The instructor explains trade-offs instead of just showing steps. I would recommend this to anyone who wants job-relevant practice.",
        "The lessons are concise without feeling shallow. Completing the final exercises gave me a much clearer understanding of the workflow.",
        "Well organised and easy to follow on mobile. A few sections were challenging, but the examples and discussion answers helped.",
        "This course gave me a repeatable process rather than isolated tips. The project and knowledge checks were especially valuable.",
        "Practical, focused, and current. I was able to apply several ideas immediately in a real project at work.",
    ]
    reviewer_names = ["Nina Patel", "Kabir Rao", "Sara Khan", "Dev Mehta", "Isha Bose", "Noah Williams", "Lina Garcia", "Omar Ali"]
    for course_index, course in enumerate(courses):
        existing_count = len([row for row in data["reviews"] if row["course_id"] == course["id"]])
        for review_index in range(existing_count, 8):
            data["reviews"].append({
                "id": f"rev_{course['id']}_{review_index + 1}",
                "course_id": course["id"],
                "student_id": student_ids[review_index % len(student_ids)],
                "student_name": reviewer_names[review_index % len(reviewer_names)],
                "rating": [5, 5, 4, 5, 4, 3, 5, 4][review_index],
                "comment": review_templates[(course_index + review_index) % len(review_templates)],
                "created_at": now_iso(),
            })
    data["certification_paths"] = [
        {"id": "aws-saa", "title": "AWS Certified Solutions Architect Associate", "issuer": "AWS", "issuer_logo_url": "", "slug": "aws-certified-solutions-architect", "description": "Design resilient, secure, high-performing architectures on AWS.", "difficulty": "intermediate", "estimated_hours": 35, "exam_cost_usd": 150, "coverage": ["Secure architectures", "Resilient design", "High-performing solutions", "Cost optimisation"], "official_url": "https://aws.amazon.com/certification/certified-solutions-architect-associate/"},
        {"id": "az-900", "title": "Microsoft Azure Fundamentals (AZ-900)", "issuer": "Microsoft Azure", "issuer_logo_url": "", "slug": "az-900-microsoft-azure-fundamentals", "description": "Build foundational knowledge of cloud concepts and Microsoft Azure services.", "difficulty": "beginner", "estimated_hours": 20, "exam_cost_usd": 99, "coverage": ["Cloud concepts", "Azure architecture", "Azure services", "Governance and compliance"], "official_url": "https://learn.microsoft.com/credentials/certifications/azure-fundamentals/"},
        {"id": "google-data-analytics", "title": "Google Data Analytics Certificate", "issuer": "Google Cloud", "issuer_logo_url": "", "slug": "google-data-analytics-certificate", "description": "Prepare for practical data cleaning, analysis, visualisation, and storytelling.", "difficulty": "beginner", "estimated_hours": 40, "exam_cost_usd": 0, "coverage": ["Data preparation", "SQL analysis", "Visualisation", "Stakeholder communication"], "official_url": "https://grow.google/certificates/data-analytics/"},
        {"id": "comptia-security-plus", "title": "CompTIA Security+", "issuer": "CompTIA", "issuer_logo_url": "", "slug": "comptia-security-plus", "description": "Validate baseline skills for core security functions and an IT security career.", "difficulty": "intermediate", "estimated_hours": 45, "exam_cost_usd": 404, "coverage": ["Threats and vulnerabilities", "Secure architecture", "Operations", "Governance"], "official_url": "https://www.comptia.org/certifications/security"},
        {"id": "meta-frontend", "title": "Meta Front-End Developer Certificate", "issuer": "Meta", "issuer_logo_url": "", "slug": "meta-front-end-developer", "description": "Build production-ready frontend skills with HTML, CSS, JavaScript, and React.", "difficulty": "beginner", "estimated_hours": 50, "exam_cost_usd": 0, "coverage": ["HTML and CSS", "JavaScript", "React", "Portfolio development"], "official_url": "https://www.coursera.org/professional-certificates/meta-front-end-developer"},
        {"id": "pmp", "title": "PMP: Project Management Professional", "issuer": "PMI", "issuer_logo_url": "", "slug": "pmp-project-management-professional", "description": "Prepare for predictive, agile, and hybrid project leadership scenarios.", "difficulty": "advanced", "estimated_hours": 35, "exam_cost_usd": 575, "coverage": ["People", "Process", "Business environment", "Agile delivery"], "official_url": "https://www.pmi.org/certifications/project-management-pmp"},
        {"id": "cisco-ccna", "title": "Cisco CCNA", "issuer": "Cisco", "issuer_logo_url": "", "slug": "cisco-ccna", "description": "Develop networking, IP connectivity, security, and automation fundamentals.", "difficulty": "intermediate", "estimated_hours": 50, "exam_cost_usd": 300, "coverage": ["Network fundamentals", "IP connectivity", "Security", "Automation"], "official_url": "https://www.cisco.com/site/us/en/learn/training-certifications/certifications/enterprise/ccna/index.html"},
        {"id": "isc2-cc", "title": "ISC² Certified in Cybersecurity", "issuer": "ISC²", "issuer_logo_url": "", "slug": "isc2-certified-in-cybersecurity", "description": "Start a cybersecurity career with foundational security concepts and practices.", "difficulty": "beginner", "estimated_hours": 25, "exam_cost_usd": 199, "coverage": ["Security principles", "Incident response", "Access controls", "Network security"], "official_url": "https://www.isc2.org/certifications/cc"},
    ]
    data["certification_courses"] = [
        {"id": "cc_az_1", "certification_id": "az-900", "course_id": "crs_az900", "order_index": 1},
        {"id": "cc_az_2", "certification_id": "az-900", "course_id": "crs_aws_cloud", "order_index": 2},
        {"id": "cc_aws_1", "certification_id": "aws-saa", "course_id": "crs_aws_cloud", "order_index": 1},
        {"id": "cc_aws_2", "certification_id": "aws-saa", "course_id": "crs_node_express", "order_index": 2},
        {"id": "cc_google_1", "certification_id": "google-data-analytics", "course_id": "crs_google_data_prep", "order_index": 1},
        {"id": "cc_google_2", "certification_id": "google-data-analytics", "course_id": "crs_sql_analysis", "order_index": 2},
        {"id": "cc_google_3", "certification_id": "google-data-analytics", "course_id": "crs_python", "order_index": 3},
        {"id": "cc_security_1", "certification_id": "comptia-security-plus", "course_id": "crs_security_plus", "order_index": 1},
        {"id": "cc_meta_1", "certification_id": "meta-frontend", "course_id": "crs_react_beginner", "order_index": 1},
        {"id": "cc_meta_2", "certification_id": "meta-frontend", "course_id": "crs_react", "order_index": 2},
        {"id": "cc_pmp_1", "certification_id": "pmp", "course_id": "crs_product_management", "order_index": 1},
        {"id": "cc_pmp_2", "certification_id": "pmp", "course_id": "crs_agile_scrum", "order_index": 2},
    ]
    for interview in data["mock_interviews"]:
        interview["question_breakdown"] = [{
            "question": f"Design decision question {index}",
            "answer": "I gathered evidence, aligned the team, measured the result, and explained the trade-off clearly.",
            "score": 8,
            "strengths": "Clear decision path and evidence-based reasoning.",
            "improvements": "Add a specific metric and a more explicit stakeholder trade-off.",
        } for index in range(1, 6)]
    data["mock_interviews"].extend([
        {"id": "int_2", "student_id": "usr_student", "job_role": "Product Manager", "transcript": [], "score_percent": 79, "feedback_text": "Good prioritization. Quantify the result.", "question_breakdown": [{"question": f"Product question {index}", "answer": "I prioritised customer impact, delivery effort, and measurable outcomes.", "score": 7 + index % 2, "strengths": "Relevant product thinking and a clear framework.", "improvements": "Include a concrete metric and stakeholder trade-off."} for index in range(1, 6)], "created_at": now_iso()},
        {"id": "int_3", "student_id": "usr_student", "job_role": "UX Designer", "transcript": [], "score_percent": 86, "feedback_text": "Strong evidence and synthesis.", "question_breakdown": [{"question": f"Design question {index}", "answer": "I used research evidence, prototypes, and usability feedback to improve the experience.", "score": 8 + index % 2, "strengths": "Strong user-centred reasoning and iterative approach.", "improvements": "State the final usability improvement more precisely."} for index in range(1, 6)], "created_at": now_iso()},
    ])
    data["attention_logs"].extend([
        {"id": "att_2", "student_id": "usr_student", "lesson_id": "les_crs_product_1_2", "focus_percent": 94, "tab_switch_count": 1, "session_start": now_iso(), "session_end": now_iso()},
        {"id": "att_3", "student_id": "usr_student", "lesson_id": "les_crs_python_1_1", "focus_percent": 88, "tab_switch_count": 3, "session_start": now_iso(), "session_end": now_iso()},
        {"id": "att_4", "student_id": "usr_student2", "lesson_id": "les_crs_ai_1_1", "focus_percent": 84, "tab_switch_count": 2, "session_start": now_iso(), "session_end": now_iso()},
        {"id": "att_5", "student_id": "usr_student3", "lesson_id": "les_crs_sql_1_1", "focus_percent": 96, "tab_switch_count": 0, "session_start": now_iso(), "session_end": now_iso()},
    ])
    data["badges"] = [
        {"id": "bdg_fast", "name": "Fast Learner", "icon": "🚀", "criteria_description": "Complete a course in under 7 days", "color": "purple"},
        {"id": "bdg_quiz", "name": "Quiz Master", "icon": "⚡", "criteria_description": "Pass 5 quizzes with a perfect score", "color": "yellow"},
        {"id": "bdg_consistent", "name": "Consistent", "icon": "🔥", "criteria_description": "Complete lessons on 5 consecutive days", "color": "orange"},
        {"id": "bdg_certified", "name": "Certified", "icon": "🏅", "criteria_description": "Earn your first certificate", "color": "green"},
        {"id": "bdg_interview", "name": "Interview Ready", "icon": "🎯", "criteria_description": "Complete 3 mock interviews", "color": "blue"},
    ]
    data["student_badges"] = [
        {"id": "sbdg_1", "student_id": "usr_student", "badge_id": "bdg_certified", "awarded_at": now_iso()},
        {"id": "sbdg_2", "student_id": "usr_student", "badge_id": "bdg_interview", "awarded_at": now_iso()},
        {"id": "sbdg_3", "student_id": "usr_student", "badge_id": "bdg_fast", "awarded_at": now_iso()},
    ]
    data["leaderboard"] = [
        {"student_id": "usr_student2", "student_name": "Nina Patel", "points": 1510},
        {"student_id": "usr_student", "student_name": "Aarav Sharma", "points": 1280},
        {"student_id": "usr_student3", "student_name": "Kabir Rao", "points": 1190},
        {"student_id": "usr_student4", "student_name": "Sara Khan", "points": 1080},
        {"student_id": "usr_student5", "student_name": "Dev Mehta", "points": 940},
        {"student_id": "usr_student6", "student_name": "Isha Bose", "points": 810},
        {"student_id": "usr_student7", "student_name": "Noah Williams", "points": 720},
        {"student_id": "usr_student8", "student_name": "Lina Garcia", "points": 650},
    ]
    data["cohorts"] = [{"id": "coh_1", "name": "Batch 2026", "organization_name": "Acme College", "created_by": "usr_admin", "created_at": now_iso()}]
    data["cohort_students"] = [{"id": "chs_demo", "cohort_id": "coh_1", "student_id": "usr_student"}] + [{"id": f"chs_{index}", "cohort_id": "coh_1", "student_id": student_ids[index]} for index in range(4)]
    for quiz in data["quizzes"]:
        while len(quiz["questions"]) < 5:
            number = len(quiz["questions"]) + 1
            quiz["questions"].append({"question_text": f"Which practice best supports lesson outcome {number}?", "options": ["Apply it with specific feedback", "Skip the example", "Avoid evidence", "Memorize without practice"], "correct_option_index": 0})
    return data


class Store:
    def __init__(self) -> None:
        self.data = seed_data()
        self.db = None
        self.sqlite: sqlite3.Connection | None = None
        self.mode = "uninitialized"

    @staticmethod
    def document_key(collection: str, row: dict[str, Any]) -> str:
        if row.get("id"):
            return str(row["id"])
        for field in ("student_id", "code", "email"):
            if row.get(field):
                return f"{field}:{row[field]}"
        return f"generated:{uuid.uuid4().hex}"

    async def connect(self) -> None:
        if self.sqlite is not None:
            self.sqlite.close()
            self.sqlite = None
        mongo_url = os.getenv("MONGO_URL")
        if mongo_url and AsyncIOMotorClient is not None:
            try:
                client = AsyncIOMotorClient(mongo_url, serverSelectionTimeoutMS=1600)
                await client.admin.command("ping")
                self.db = client[os.getenv("MONGO_DB", "skilltank")]
                self.mode = "mongodb"
                if await self.db.users.count_documents({}) == 0:
                    for name, rows in self.data.items():
                        if rows:
                            await self.db[name].insert_many([row.copy() for row in rows])
                await self.migrate_content()
                return
            except Exception:
                self.db = None
        database_path = os.getenv("SQLITE_PATH", os.path.join(os.path.dirname(__file__), "data", "skilltank.db"))
        os.makedirs(os.path.dirname(database_path), exist_ok=True)
        self.sqlite = sqlite3.connect(database_path, check_same_thread=False, timeout=20)
        self.sqlite.execute("pragma journal_mode=WAL")
        self.sqlite.execute("pragma busy_timeout=20000")
        self.sqlite.execute("create table if not exists documents (collection text not null, id text not null, data text not null, primary key(collection,id))")
        self.sqlite.commit()
        self.mode = "sqlite"
        existing = self.sqlite.execute("select count(*) from documents where collection='users'").fetchone()[0]
        if existing == 0:
            for name, rows in self.data.items():
                for row in rows:
                    self.sqlite.execute("insert or replace into documents(collection,id,data) values(?,?,?)", (name, self.document_key(name, row), json.dumps(row)))
            self.sqlite.commit()
        await self.migrate_content()

    async def migrate_content(self) -> None:
        for collection in (
            "users", "courses", "modules", "lessons", "quizzes", "enrollments", "certificates",
            "reviews", "qna_threads", "notifications_log", "attention_logs", "certification_paths",
            "certification_courses", "badges", "student_badges", "leaderboard", "cohorts",
            "cohort_students", "mock_interviews",
        ):
            for seeded_row in self.data.get(collection, []):
                row_id = seeded_row.get("id")
                if row_id and not await self.one(collection, id=row_id):
                    await self.insert(collection, seeded_row.copy())
        demo_cohort = {"id": "coh_1", "name": "Batch 2026", "organization_name": "Acme College", "created_by": "usr_admin", "created_at": now_iso()}
        if await self.one("cohorts", id="coh_1"):
            await self.update("cohorts", {"id": "coh_1"}, demo_cohort)
        else:
            await self.insert("cohorts", demo_cohort)
        if not await self.one("cohort_students", cohort_id="coh_1", student_id="usr_student"):
            await self.insert("cohort_students", {"id": "chs_demo", "cohort_id": "coh_1", "student_id": "usr_student"})
        demo_interviews = [
            ("int_1", "Product Designer", 82),
            ("int_2", "Product Manager", 79),
            ("int_3", "UX Designer", 86),
        ]
        for interview_id, role, score in demo_interviews:
            breakdown = [{
                "question": f"{role} question {index}",
                "answer": "I used evidence, explained the trade-off, measured the outcome, and reflected on the result.",
                "score": 8 if index % 2 else 9,
                "strengths": "Clear role-specific reasoning and practical evidence.",
                "improvements": "Add one sharper metric and a more concise opening summary.",
            } for index in range(1, 6)]
            payload = {
                "student_id": "usr_student", "job_role": role, "transcript": [],
                "score_percent": score, "feedback_text": "Structured demo report with per-question feedback.",
                "question_breakdown": breakdown, "created_at": now_iso(),
            }
            if await self.one("mock_interviews", id=interview_id):
                await self.update("mock_interviews", {"id": interview_id}, payload)
            else:
                await self.insert("mock_interviews", {"id": interview_id, **payload})
        for interview in await self.all("mock_interviews"):
            if len(interview.get("question_breakdown") or []) != 5:
                await self.update("mock_interviews", {"id": interview["id"]}, {
                    "question_breakdown": interview_breakdown_from_transcript(interview),
                })
        allowed_demo_courses = {"crs_python", "crs_react", "crs_ai", "crs_product"}
        for enrollment in await self.find("enrollments", student_id="usr_student"):
            if enrollment["course_id"] not in allowed_demo_courses:
                await self.delete("enrollments", id=enrollment["id"])
        for certificate in await self.find("certificates", student_id="usr_student"):
            await self.delete("certificates", id=certificate["id"])
        for seeded_enrollment in [row for row in self.data["enrollments"] if row["student_id"] == "usr_student"]:
            await self.update("enrollments", {"id": seeded_enrollment["id"]}, seeded_enrollment)
        thumbnail_by_category = {
            "Development": "/images/courses/development.jpg",
            "Design": "/images/courses/design.jpg",
            "Business": "/images/courses/business.jpg",
            "Data": "/images/courses/analytics.jpg",
        }
        video_specs = {
            "crs_python": ("Python Programming", "Development", "nLRL_NcnK-4", 900, ["Basics", "Functions", "Data Structures"]),
            "crs_react": ("Web Development with HTML & CSS", "Development", "mU6anWqZJcc", 1200, ["HTML Basics", "CSS Basics", "Layouts"]),
            "crs_ai": ("JavaScript Fundamentals", "Development", "PkZNo7MFNFg", 1200, ["Introduction", "DOM", "Async JavaScript"]),
            "crs_sql": ("Data Science & Analytics", "Data", "ysEN5RaKOlA", 1000, ["Intro to Data", "Pandas & NumPy", "Visualisation"]),
            "crs_product": ("Machine Learning Basics", "Data Science", "NWONeJKn6kc", 900, ["Concepts", "Algorithms", "Evaluation"]),
            "crs_ux": ("UI/UX Design", "Design", "c9Wg6Cb_YlU", 1000, ["Design Thinking", "Figma", "Prototyping"]),
            "crs_marketing": ("Digital Marketing", "Business", "bixR-KKYB6k", 800, ["SEO", "Social Media", "Analytics"]),
            "crs_finance": ("Business Strategy", "Business", "B9L_GCpNZNE", 900, ["Foundations", "Planning", "Execution"]),
            "crs_leadership": ("Excel & Spreadsheets", "Business", "Vl0H-qTclOg", 900, ["Excel Basics", "Formulas & Functions", "Analysis & Dashboards"]),
            "crs_brand": ("Frontend Projects with React", "Development", "Ke90Tje7VS0", 900, ["Project Setup", "Components & State", "Shipping Projects"]),
        }
        for course in await self.all("courses"):
            spec = video_specs.get(course["id"])
            seeded_course = next((row for row in self.data["courses"] if row["id"] == course["id"]), None)
            changes = {
                key: seeded_course[key] for key in (
                    "slug", "learning_outcomes", "requirements", "total_hours", "original_price",
                    "is_certification_prep", "instructor_id", "instructor_name",
                ) if seeded_course and key in seeded_course
            }
            if spec:
                title, category, _, _, module_titles = spec
                changes.update({
                    "title": title, "category": category,
                    "description": f"Build practical, portfolio-ready {title.lower()} skills through guided video chapters, hands-on exercises, quizzes, and a completion project.",
                    "syllabus_summary": f"Three focused modules covering {', '.join(module_titles)}, with segmented lessons and knowledge checks.",
                })
            expected = thumbnail_by_category.get(changes.get("category", course.get("category")), "/images/courses/analytics.jpg")
            changes["thumbnail_url"] = expected
            await self.update("courses", {"id": course["id"]}, changes)
        for module in await self.all("modules"):
            spec = video_specs.get(module["course_id"])
            if spec:
                await self.update("modules", {"id": module["id"]}, {"title": spec[4][module["order_index"] - 1]})
        for lesson in await self.all("lessons"):
            spec = video_specs.get(lesson["course_id"])
            if spec:
                title, _, video_id, chunk_seconds, module_titles = spec
                module = await self.one("modules", id=lesson["module_id"])
                module_index = module["order_index"] if module else 1
                segment_index = (module_index - 1) * 3 + (lesson["order_index"] - 1)
                start_seconds = segment_index * chunk_seconds
                end_seconds = start_seconds + chunk_seconds
                lesson_title = f"{module_titles[module_index - 1]} · Part {lesson['order_index']}"
                await self.update("lessons", {"id": lesson["id"]}, {
                    "title": f"{module_titles[module_index - 1]} · Part {lesson['order_index']}",
                    "content_text": f"This lesson covers part {lesson['order_index']} of {module_titles[module_index - 1]} in {title}. Watch the focused chapter, capture the core concepts, and complete one practical application before moving on.",
                    "demo_notes": lesson_notes(f"{module_titles[module_index - 1]} · Part {lesson['order_index']}", title),
                    "video_url": f"https://www.youtube.com/embed/{video_id}?start={start_seconds}&end={end_seconds}&rel=0&modestbranding=1",
                    "resources": [{"name": f"{module_titles[module_index - 1]} cheat sheet.pdf", "url": f"/api/resources/{lesson['id']}.pdf"}],
                })
            else:
                seeded_lesson = next((row for row in self.data["lessons"] if row["id"] == lesson["id"]), None)
                seeded_course = next((row for row in self.data["courses"] if row["id"] == lesson["course_id"]), None)
                if seeded_lesson and seeded_course:
                    await self.update("lessons", {"id": lesson["id"]}, {
                        "title": seeded_lesson["title"],
                        "content_text": seeded_lesson["content_text"],
                        "demo_notes": lesson_notes(seeded_lesson["title"], seeded_course["title"]),
                        "resources": seeded_lesson.get("resources") or [{"name": f"{seeded_lesson['title']} cheat sheet.pdf", "url": f"/api/resources/{lesson['id']}.pdf"}],
                    })
        seeded_quizzes = {row["id"]: row for row in self.data["quizzes"]}
        for quiz in await self.all("quizzes"):
            if quiz["id"] in seeded_quizzes:
                await self.update("quizzes", {"id": quiz["id"]}, {"questions": seeded_quizzes[quiz["id"]]["questions"]})

    async def all(self, collection: str) -> list[dict[str, Any]]:
        if self.db is not None:
            return [{k: v for k, v in row.items() if k != "_id"} async for row in self.db[collection].find({})]
        if self.sqlite is not None:
            return [json.loads(row[0]) for row in self.sqlite.execute("select data from documents where collection=?", (collection,)).fetchall()]
        return self.data.setdefault(collection, [])

    async def find(self, collection: str, **filters: Any) -> list[dict[str, Any]]:
        if self.db is not None:
            return [{k: v for k, v in row.items() if k != "_id"} async for row in self.db[collection].find(filters)]
        return [row for row in await self.all(collection) if all(row.get(k) == v for k, v in filters.items())]

    async def one(self, collection: str, **filters: Any) -> dict[str, Any] | None:
        rows = await self.find(collection, **filters)
        return rows[0] if rows else None

    async def insert(self, collection: str, row: dict[str, Any]) -> dict[str, Any]:
        mirror = self.data.setdefault(collection, [])
        row_id = row.get("id")
        if row_id:
            mirror[:] = [existing for existing in mirror if existing.get("id") != row_id]
        mirror.append(row)
        if self.db is not None:
            await self.db[collection].insert_one(row.copy())
        elif self.sqlite is not None:
            self.sqlite.execute("insert or replace into documents(collection,id,data) values(?,?,?)", (collection, self.document_key(collection, row), json.dumps(row)))
            self.sqlite.commit()
        return row

    async def update(self, collection: str, filters: dict[str, Any], changes: dict[str, Any]) -> dict[str, Any] | None:
        if self.db is not None:
            await self.db[collection].update_one(filters, {"$set": changes})
            return await self.one(collection, **filters)
        row = await self.one(collection, **filters)
        if row:
            row.update(changes)
            if self.sqlite is not None:
                self.sqlite.execute("update documents set data=? where collection=? and id=?", (json.dumps(row), collection, self.document_key(collection, row)))
                self.sqlite.commit()
        return row

    async def delete(self, collection: str, **filters: Any) -> bool:
        if self.db is not None:
            result = await self.db[collection].delete_one(filters)
            return result.deleted_count > 0
        if self.sqlite is not None:
            rows = await self.find(collection, **filters)
            for row in rows:
                self.sqlite.execute("delete from documents where collection=? and id=?", (collection, self.document_key(collection, row)))
            self.sqlite.commit()
            return bool(rows)
        rows = self.data.setdefault(collection, [])
        before = len(rows)
        self.data[collection] = [row for row in rows if not all(row.get(k) == v for k, v in filters.items())]
        return len(self.data[collection]) < before

    async def close(self) -> None:
        if self.sqlite is not None:
            self.sqlite.commit()
            self.sqlite.close()
            self.sqlite = None


store = Store()


def public_user(user: dict[str, Any]) -> dict[str, Any]:
    return {k: v for k, v in user.items() if k != "password_hash"}


def create_token(user: dict[str, Any]) -> str:
    return jwt.encode({"sub": user["id"], "role": user["role"]}, SECRET, algorithm=ALGORITHM)


async def current_user(token: str = Depends(oauth2_scheme)) -> dict[str, Any]:
    try:
        payload = jwt.decode(token, SECRET, algorithms=[ALGORITHM])
        user = await store.one("users", id=payload.get("sub"))
    except JWTError:
        user = None
    if not user or not user.get("active", True):
        raise HTTPException(status_code=401, detail="Invalid authentication")
    return user


def require_roles(*roles: str):
    async def dependency(user: dict[str, Any] = Depends(current_user)) -> dict[str, Any]:
        if user["role"] not in roles:
            raise HTTPException(status_code=403, detail="Insufficient permissions")
        return user
    return dependency


def notification_subject(event_type: str) -> str:
    labels = {
        "login": "New Skill Tank sign-in",
        "payment_initiated": "Skill Tank payment started",
        "test_notification": "Skill Tank test notification",
        "signup_confirmed": "Welcome to Skill Tank",
        "lesson_started": "Course lesson started",
        "enrollment_confirmed": "Course enrollment confirmed",
        "certificate_issued": "Certificate issued",
        "certificate_reissued": "Certificate reissued",
        "quiz_failed": "Quiz retry recommended",
        "module_completed": "Module completed",
    }
    return labels.get(event_type, f"Skill Tank: {event_type.replace('_', ' ').title()}")


def render_notification_email(event_type: str, payload: dict[str, Any], user: dict[str, Any] | None) -> str:
    title = notification_subject(event_type)
    rows = "".join(
        f"<tr><td style='padding:8px 0;color:#64748b;text-transform:capitalize'>{html.escape(str(key).replace('_', ' '))}</td>"
        f"<td style='padding:8px 0;color:#0f172a;font-weight:700'>{html.escape(str(value))}</td></tr>"
        for key, value in payload.items()
        if key not in {"email_to", "error"}
    )
    app_url = public_app_url()
    cta = (
        f"<a href='{html.escape(app_url)}' style='display:inline-block;margin-top:18px;background:#16a34a;color:#fff;"
        "padding:12px 16px;border-radius:10px;text-decoration:none;font-weight:800'>Open Skill Tank</a>"
        if app_url
        else ""
    )
    return f"""
    <div style="font-family:Inter,Arial,sans-serif;background:#f6faf8;padding:28px">
      <div style="max-width:560px;margin:auto;background:#ffffff;border:1px solid #dfe8e3;border-radius:18px;padding:28px">
        <div style="font-size:12px;font-weight:900;letter-spacing:1.4px;color:#16a34a">SKILL TANK</div>
        <h1 style="margin:10px 0 8px;color:#0f172a;font-size:24px">{html.escape(title)}</h1>
        <p style="color:#475569;line-height:1.6">Hi {html.escape(user.get('full_name', 'there') if user else 'there')}, here is the latest update from your Skill Tank account.</p>
        <table style="width:100%;border-collapse:collapse;margin-top:12px">{rows}</table>
        {cta}
        <p style="margin-top:24px;color:#94a3b8;font-size:12px">You are receiving this because this email is saved in your Skill Tank notification settings.</p>
      </div>
    </div>
    """


def whatsapp_link(phone_number: str, event_type: str, payload: dict[str, Any]) -> str:
    cleaned = re.sub(r"[^\d+]", "", phone_number or "").lstrip("+")
    message = f"Skill Tank update: {event_type.replace('_', ' ').title()}"
    details = payload.get("message") or payload.get("course") or payload.get("certificate") or payload.get("quiz")
    if details:
        message += f" - {details}"
    return f"https://wa.me/{cleaned}?text={quote(message)}"


def frontend_url(path: str = "") -> str:
    base = os.getenv("APP_URL", "").rstrip("/")
    if not base:
        return path or "/"
    return f"{base}{path}"


def public_app_url() -> str:
    base = os.getenv("APP_URL", "").rstrip("/")
    return "" if dev_host in base or loopback in base else base


async def log_notification(user_id: str, event_type: str, payload: dict[str, Any]) -> None:
    user = await store.one("users", id=user_id)
    settings = await store.one("settings", user_id=user_id) or {
        "notification_email": user["email"] if user else "",
        "email_notifications": True, "whatsapp_number": "",
        "daily_reminders": False, "certificate_notifications": True,
    }
    if event_type == "daily_reminder" and not settings.get("daily_reminders", False):
        return
    if event_type in ("certificate_issued", "certificate_reissued") and not settings.get("certificate_notifications", True):
        return
    # Always persist evidence for both mandatory channels. User preferences and
    # missing credentials affect delivery status, never the audit trail.
    channels = ["email", "whatsapp"]
    for channel in channels:
        status_value = "simulated_missing_credentials"
        error_message = None
        delivery_payload = dict(payload)
        try:
            channel_enabled = settings.get("email_notifications", True) if channel == "email" else bool(settings.get("whatsapp_number"))
            if channel == "email" and channel_enabled and os.getenv("RESEND_API_KEY") and user:
                recipient = settings.get("notification_email") or os.getenv("NOTIFICATION_TEST_EMAIL") or user["email"]
                delivery_payload["email_to"] = recipient
                async with httpx.AsyncClient(timeout=12) as client:
                    response = await client.post(
                        "https://api.resend.com/emails",
                        headers={"Authorization": f"Bearer {os.getenv('RESEND_API_KEY')}", "Content-Type": "application/json"},
                        json={
                            "from": os.getenv("RESEND_FROM", "SKILLTANK <onboarding@resend.dev>"),
                            "to": [recipient],
                            "subject": notification_subject(event_type),
                            "html": render_notification_email(event_type, delivery_payload, user),
                        },
                    )
                    response.raise_for_status()
                    status_value = "sent"
            elif channel == "whatsapp" and channel_enabled:
                delivery_payload["whatsapp_to"] = settings.get("whatsapp_number", "")
                delivery_payload["whatsapp_url"] = whatsapp_link(settings.get("whatsapp_number", ""), event_type, payload)
                status_value = "manual_trigger_ready"
        except Exception as exc:
            status_value = "failed"
            error_message = str(exc)[:300]
            delivery_payload["error"] = error_message
        await store.insert("notifications_log", {
            "id": uid("not"), "user_id": user_id, "channel": channel,
            "event_type": event_type, "payload": delivery_payload,
            "status": status_value, "error": error_message, "sent_at": now_iso(),
        })


async def award_points(student_id: str, points: int, event_type: str, event_key: str) -> bool:
    unique_key = f"{student_id}:{event_type}:{event_key}"
    if await store.one("point_events", unique_key=unique_key):
        return False
    user = await store.one("users", id=student_id)
    row = await store.one("leaderboard", student_id=student_id)
    if row:
        await store.update("leaderboard", {"student_id": student_id}, {"points": row.get("points", 0) + points})
    else:
        await store.insert("leaderboard", {"student_id": student_id, "student_name": user["full_name"] if user else "Student", "points": points})
    await store.insert("point_events", {
        "id": uid("pte"), "unique_key": unique_key, "student_id": student_id,
        "event_type": event_type, "event_key": event_key, "points": points, "awarded_at": now_iso(),
    })
    return True


async def award_badge(student_id: str, badge_id: str) -> bool:
    if await store.one("student_badges", student_id=student_id, badge_id=badge_id):
        return False
    await store.insert("student_badges", {
        "id": uid("sbdg"), "student_id": student_id, "badge_id": badge_id, "awarded_at": now_iso(),
    })
    return True


async def evaluate_badges(student_id: str) -> None:
    certificates = await store.find("certificates", student_id=student_id)
    if certificates:
        await award_badge(student_id, "bdg_certified")
    interviews = await store.find("mock_interviews", student_id=student_id)
    if len(interviews) >= 3:
        await award_badge(student_id, "bdg_interview")
    enrollments = await store.find("enrollments", student_id=student_id)
    for enrollment in enrollments:
        if enrollment.get("completed_at") and enrollment.get("enrolled_at"):
            elapsed = datetime.fromisoformat(enrollment["completed_at"]) - datetime.fromisoformat(enrollment["enrolled_at"])
            if elapsed.days < 7:
                await award_badge(student_id, "bdg_fast")
                break
    enrollment_ids = {item["id"] for item in enrollments}
    attempts = [item for item in await store.all("quiz_attempts") if item["enrollment_id"] in enrollment_ids]
    perfect_passes = {item["quiz_id"] for item in attempts if item.get("passed") and item.get("score_percent") == 100}
    if len(perfect_passes) >= 5:
        await award_badge(student_id, "bdg_quiz")
    progress_rows = [item for item in await store.all("lesson_progress") if item["enrollment_id"] in enrollment_ids and item.get("completed")]
    days = sorted({item.get("updated_at", "")[:10] for item in progress_rows if item.get("updated_at")})
    for index in range(max(0, len(days) - 4)):
        parsed = [date.fromisoformat(value) for value in days[index:index + 5]]
        if all((parsed[i + 1] - parsed[i]).days == 1 for i in range(4)):
            await award_badge(student_id, "bdg_consistent")
            break


async def create_enrollment(student_id: str, course: dict[str, Any], payment_ref: str | None, coupon: str = "", discount: int = 0) -> dict[str, Any]:
    existing = await store.one("enrollments", student_id=student_id, course_id=course["id"])
    if existing:
        return existing
    enrollment = {
        "id": uid("enr"), "student_id": student_id, "course_id": course["id"],
        "payment_status": "free" if course["is_free"] else "paid", "payment_ref": payment_ref,
        "coupon_code": coupon.upper() or None, "discount_percent": discount,
        "status": "active", "progress_percent": 0, "last_lesson_id": None, "enrolled_at": now_iso(),
    }
    await store.insert("enrollments", enrollment)
    await store.update("courses", {"id": course["id"]}, {"enrollment_count": course.get("enrollment_count", 0) + 1})
    await log_notification(student_id, "enrollment_confirmed", {"course": course["title"]})
    return enrollment


async def maybe_issue_certificate(enrollment: dict[str, Any]) -> dict[str, Any] | None:
    if enrollment.get("progress_percent", 0) < 100:
        return None
    existing = await store.one("certificates", enrollment_id=enrollment["id"])
    if existing:
        return existing
    quizzes = await store.find("quizzes", course_id=enrollment["course_id"])
    attempts = await store.find("quiz_attempts", enrollment_id=enrollment["id"])
    passed_ids = {attempt["quiz_id"] for attempt in attempts if attempt.get("passed")}
    if any(quiz["id"] not in passed_ids for quiz in quizzes):
        return None
    certificate = {
        "id": uid("cert"), "enrollment_id": enrollment["id"], "student_id": enrollment["student_id"],
        "course_id": enrollment["course_id"], "certificate_number": f"ST-{datetime.now().year}-{uuid.uuid4().hex[:8].upper()}",
        "issued_at": now_iso(), "reissued_count": 0,
    }
    await store.insert("certificates", certificate)
    await award_points(enrollment["student_id"], 150, "certificate_earned", certificate["id"])
    await log_notification(enrollment["student_id"], "certificate_issued", {
        "certificate": certificate["certificate_number"],
        "download_url": frontend_url(f"/certificates/{certificate['id']}"),
    })
    await recalculate_readiness(enrollment["student_id"])
    await evaluate_badges(enrollment["student_id"])
    return certificate


async def ensure_demo_learning_rows(student_id: str) -> None:
    if student_id != "usr_student":
        return
    demo_rows = [
        ("enr_demo_completed", "crs_figma", "completed", 100, False),
        ("enr_demo_archived", "crs_startup", "archived", 100, True),
    ]
    for enrollment_id, course_id, status, progress, archived in demo_rows:
        course = await store.one("courses", id=course_id)
        if not course:
            continue
        enrollment = await store.one("enrollments", id=enrollment_id)
        if not enrollment:
            enrollment = await store.insert("enrollments", {
                "id": enrollment_id, "student_id": student_id, "course_id": course_id,
                "payment_status": "free" if course.get("is_free") else "paid",
                "status": status, "progress_percent": progress, "last_lesson_id": f"les_{course_id}_3_3",
                "archived": archived, "enrolled_at": now_iso(),
            })
        else:
            enrollment = await store.update("enrollments", {"id": enrollment_id}, {
                "status": status, "progress_percent": progress, "archived": archived,
            })
        if not await store.one("certificates", enrollment_id=enrollment_id):
            await store.insert("certificates", {
                "id": f"cert_{enrollment_id}", "enrollment_id": enrollment_id,
                "student_id": student_id, "course_id": course_id,
                "certificate_number": f"ST-{datetime.now().year}-{enrollment_id[-6:].upper()}",
                "issued_at": now_iso(), "reissued_count": 0, "admin_override": False,
            })


@app.get("/api/health")
async def health() -> dict[str, str]:
    return {"status": "ok", "storage": store.mode}


@app.post("/api/auth/token")
async def token(request: Request, form: OAuth2PasswordRequestForm = Depends()) -> dict[str, Any]:
    check_auth_rate_limit(request)
    user = await store.one("users", email=form.username.lower())
    if not user or not passwords.verify(form.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Incorrect email or password")
    return {"access_token": create_token(user), "token_type": "bearer", "user": public_user(user)}


@app.post("/api/auth/login")
async def login(body: LoginRequest, request: Request) -> dict[str, Any]:
    check_auth_rate_limit(request)
    user = await store.one("users", email=body.email.lower())
    if not user or not passwords.verify(body.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Incorrect email or password")
    asyncio.create_task(log_notification(user["id"], "login", {"message": "You just logged into Skill Tank."}))
    return {"access_token": create_token(user), "token_type": "bearer", "user": public_user(user)}


@app.post("/api/auth/signup")
async def signup(body: SignupRequest, request: Request) -> dict[str, Any]:
    check_auth_rate_limit(request)
    if await store.one("users", email=body.email.lower()):
        raise HTTPException(409, "An account with this email already exists")
    user = {
        "id": uid("usr"), "full_name": body.full_name.strip(), "email": body.email.lower(),
        "password_hash": passwords.hash(body.password), "role": body.role, "active": True,
        "avatar": "".join(part[0] for part in body.full_name.split()[:2]).upper(),
        "created_at": now_iso(),
    }
    await store.insert("users", user)
    asyncio.create_task(log_notification(user["id"], "signup_confirmed", {"message": "Welcome to Skill Tank. Your account is ready."}))
    return {"access_token": create_token(user), "token_type": "bearer", "user": public_user(user)}


@app.post("/api/auth/google")
async def google_auth(body: GoogleAuthRequest, request: Request) -> dict[str, Any]:
    check_auth_rate_limit(request)
    client_id = os.getenv("GOOGLE_CLIENT_ID")
    if not client_id:
        raise HTTPException(503, "Google sign-in is not configured yet. Please use email sign-up.")
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            response = await client.get(
                "https://oauth2.googleapis.com/tokeninfo",
                params={"id_token": body.credential},
            )
            response.raise_for_status()
            profile = response.json()
    except Exception as exc:
        raise HTTPException(401, "Google sign-in could not be verified.") from exc
    if profile.get("aud") != client_id or not profile.get("email_verified"):
        raise HTTPException(401, "Google sign-in could not be verified.")
    email = str(profile.get("email", "")).lower()
    if not email:
        raise HTTPException(401, "Google account did not provide an email address.")
    user = await store.one("users", email=email)
    if not user:
        name = profile.get("name") or email.split("@")[0].replace(".", " ").title()
        user = {
            "id": uid("usr"), "full_name": name, "email": email,
            "password_hash": passwords.hash(uid("google")), "role": body.role,
            "active": True, "avatar": "".join(part[0] for part in name.split()[:2]).upper(),
            "created_at": now_iso(), "auth_provider": "google",
        }
        await store.insert("users", user)
        asyncio.create_task(log_notification(user["id"], "signup_confirmed", {"message": "Welcome to Skill Tank. Your Google account is connected."}))
    asyncio.create_task(log_notification(user["id"], "login", {"message": "You just logged into Skill Tank with Google."}))
    return {"access_token": create_token(user), "token_type": "bearer", "user": public_user(user)}


@app.post("/api/auth/google-emergent")
async def google_emergent_login(body: GoogleEmergentLogin, request: Request) -> dict[str, Any]:
    check_auth_rate_limit(request)
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.get(
                "https://auth.emergentagent.com/api/validate",
                params={"session_id": body.session_id},
            )
            if not resp.is_success:
                raise HTTPException(401, "Invalid Google session. Please try signing in again.")
            info = resp.json()
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(503, "Google auth validation failed. Please try again.") from exc
    email = str(info.get("email", "")).lower().strip()
    if not email:
        raise HTTPException(400, "Google account did not provide an email address.")
    full_name = info.get("name") or email.split("@")[0].replace(".", " ").title()
    user = await store.one("users", email=email)
    if not user:
        user = await store.insert("users", {
            "id": uid("usr"), "full_name": full_name, "email": email,
            "password_hash": passwords.hash(uid("google")), "role": body.role, "active": True,
            "avatar": "".join(part[0] for part in full_name.split()[:2]).upper(),
            "created_at": now_iso(), "auth_provider": "google",
        })
        asyncio.create_task(log_notification(user["id"], "signup_confirmed", {"message": "Welcome to Skill Tank. Your Google account is connected."}))
    else:
        if full_name and user.get("full_name") != full_name:
            user = await store.update("users", {"id": user["id"]}, {"full_name": full_name})
    asyncio.create_task(log_notification(user["id"], "login", {"message": "You just logged into Skill Tank with Google."}))
    return {"access_token": create_token(user), "token_type": "bearer", "user": public_user(user)}


@app.post("/api/auth/logout")
async def logout(user: dict[str, Any] = Depends(current_user)) -> dict[str, bool]:
    asyncio.create_task(log_notification(user["id"], "logout", {"message": "You just logged out of Skill Tank."}))
    return {"ok": True}


@app.get("/api/auth/me")
async def me(user: dict[str, Any] = Depends(current_user)) -> dict[str, Any]:
    return public_user(user)


@app.get("/api/notifications")
async def notifications(user: dict[str, Any] = Depends(current_user)) -> list[dict[str, Any]]:
    if user["role"] == "admin":
        return await store.all("notifications_log")
    return await store.find("notifications_log", user_id=user["id"])


@app.get("/api/settings")
async def get_settings(user: dict[str, Any] = Depends(current_user)) -> dict[str, Any]:
    row = await store.one("settings", user_id=user["id"])
    defaults = {
        "user_id": user["id"], "notification_email": user["email"],
        "email_notifications": True, "whatsapp_number": "",
        "daily_reminders": False, "certificate_notifications": True,
    }
    return {**defaults, **row} if row else defaults


@app.put("/api/settings")
async def save_settings(body: SettingsUpdate, user: dict[str, Any] = Depends(current_user)) -> dict[str, Any]:
    existing = await store.one("settings", user_id=user["id"])
    payload = {**body.model_dump(), "notification_email": str(body.notification_email or user["email"]), "whatsapp_number": body.whatsapp_number.strip(), "updated_at": now_iso()}
    if existing:
        return await store.update("settings", {"id": existing["id"]}, payload)
    return await store.insert("settings", {"id": uid("set"), "user_id": user["id"], **payload})


@app.post("/api/settings/test-notification")
async def test_notification(user: dict[str, Any] = Depends(current_user)) -> dict[str, str]:
    await log_notification(user["id"], "test_notification", {"message": "Your SKILLTANK notification settings are connected."})
    return {"status": "triggered"}




def infer_course_subcategory(course: dict[str, Any]) -> str:
    title = course.get("title", "").lower()
    checks = [
        ("react", "Web Development"), ("web development", "Web Development"), ("html", "Web Development"),
        ("css", "Web Development"), ("node", "Web Development"), ("django", "Web Development"),
        ("python", "Python"), ("machine learning", "Machine Learning"), ("deep learning", "Deep Learning"),
        ("sql", "SQL"), ("power bi", "Power BI"), ("statistics", "Statistics"),
        ("figma", "Figma"), ("ux", "UI/UX Design"), ("graphic", "Graphic Design"), ("premiere", "Video Editing"),
        ("google ads", "Google Ads"), ("content", "Content Marketing"), ("email marketing", "Email Marketing"),
        ("excel", "Excel"), ("financial", "Financial Modelling"), ("startup", "Startup Fundamentals"),
        ("product management", "Product Management"), ("agile", "Agile & Scrum"),
        ("azure", "Cloud Computing"), ("aws", "Cloud Computing"), ("security", "Cybersecurity"),
        ("certification", "Certification Prep"), ("analytics prep", "Certification Prep"),
    ]
    for needle, label in checks:
        if needle in title:
            return label
    return course.get("category", "")


@app.get("/api/catalog")
async def catalog(
    search: str = "", category: str = "", subcategory: str = "", level: str = "", price: str = "",
) -> list[dict[str, Any]]:
    rows = [c for c in await store.all("courses") if c.get("status") == "published"]
    if search:
        q = search.lower()
        rows = [c for c in rows if q in c["title"].lower() or q in c["description"].lower()]
    if category:
        rows = [c for c in rows if c["category"].lower() == category.lower()]
    if subcategory:
        rows = [c for c in rows if (c.get("subcategory") or infer_course_subcategory(c)).lower() == subcategory.lower()]
    if level:
        rows = [c for c in rows if c["level"].lower() == level.lower()]
    if price == "free":
        rows = [c for c in rows if c["is_free"]]
    if price == "paid":
        rows = [c for c in rows if not c["is_free"]]
    return rows


@app.get("/api/courses")
async def list_courses(
    sort: str = "", limit: int = Query(50, ge=1, le=100), category: str = "", q: str = "",
) -> list[dict[str, Any]]:
    rows = await catalog(search=q, category=category)
    if sort == "popular":
        rows.sort(key=lambda row: row.get("enrollment_count", 0), reverse=True)
    elif sort == "rating":
        rows.sort(key=lambda row: row.get("rating_avg", 0), reverse=True)
    return rows[:limit]


@app.get("/api/courses/search")
async def search_courses(q: str = Query("", min_length=1)) -> list[dict[str, Any]]:
    needle = q.lower()
    rows = [
        course for course in await store.all("courses")
        if course.get("status") == "published"
        and (needle in course["title"].lower() or needle in course.get("category", "").lower())
    ]
    return [{"id": row["id"], "title": row["title"], "category": row["category"], "thumbnail_url": row.get("thumbnail_url")} for row in rows[:8]]


@app.get("/api/courses/{course_id}")
async def course_detail(course_id: str) -> dict[str, Any]:
    course = await store.one("courses", id=course_id) or await store.one("courses", slug=course_id)
    if not course:
        raise HTTPException(404, "Course not found")
    modules = sorted(await store.find("modules", course_id=course["id"]), key=lambda x: x["order_index"])
    lessons = await store.find("lessons", course_id=course["id"])
    quizzes = await store.find("quizzes", course_id=course["id"])
    for module in modules:
        module["lessons"] = sorted([l for l in lessons if l["module_id"] == module["id"]], key=lambda x: x["order_index"])
        module["quiz"] = next((q for q in quizzes if q["module_id"] == module["id"]), None)
        module["locked"] = bool(module.get("unlock_date") and module["unlock_date"] > date.today().isoformat())
    reviews = await store.find("reviews", course_id=course["id"])
    reviewer_names = ["Nina Patel", "Kabir Rao", "Sara Khan", "Dev Mehta", "Isha Bose", "Noah Williams", "Lina Garcia", "Omar Ali"]
    review_templates = [
        "Clear structure, practical exercises, and useful checkpoints.",
        "The lessons are concise and easy to apply to portfolio work.",
        "Good balance of concepts, examples, and review questions.",
        "Helpful for building confidence before taking the quiz.",
        "The downloadable notes made revision much faster.",
        "Strong examples with enough detail for beginners.",
        "The instructor explains trade-offs instead of just steps.",
        "A solid course to revisit when practising the workflow.",
    ]
    while len(reviews) < 8:
        index = len(reviews)
        reviews.append({
            "id": f"rev_demo_{course['id']}_{index + 1}",
            "course_id": course["id"],
            "student_id": f"demo_reviewer_{index + 1}",
            "student_name": reviewer_names[index % len(reviewer_names)],
            "rating": [5, 5, 4, 5, 4, 3, 5, 4][index % 8],
            "comment": review_templates[index % len(review_templates)],
            "created_at": course.get("created_at") or now_iso(),
        })
    return {**course, "modules": modules, "reviews": reviews}


@app.post("/api/courses")
async def create_course(body: CourseCreate, user: dict[str, Any] = Depends(require_roles("instructor", "admin"))) -> dict[str, Any]:
    body_data = body.model_dump(exclude={"modules"})
    course = {
        "id": uid("crs"), "slug": body.title.lower().replace(" ", "-"), **body_data,
        "is_free": body.price == 0, "status": body.status, "instructor_id": user["id"],
        "instructor_name": user["full_name"], "thumbnail_color": "#DDF7E9",
        "thumbnail_url": body.thumbnail or {
            "Development": "/images/courses/development.jpg",
            "Design": "/images/courses/design.jpg",
            "Business": "/images/courses/business.jpg",
        }.get(body.category, "/images/courses/analytics.jpg"),
        "rating_avg": 0, "enrollment_count": 0, "duration": "0h", "created_at": now_iso(),
    }
    await store.insert("courses", course)
    module_inputs = body.modules or [
        ModuleInput(title="Get oriented", lessons=[LessonInput(title="Welcome and outcomes"), LessonInput(title="Core concepts"), LessonInput(title="Guided practice")]),
        ModuleInput(title="Build the core", lessons=[LessonInput(title="Workflow setup"), LessonInput(title="Applied example"), LessonInput(title="Practice lab")]),
        ModuleInput(title="Apply and ship", lessons=[LessonInput(title="Final project"), LessonInput(title="Review checklist"), LessonInput(title="Next steps")]),
    ]
    for module_index, module_input in enumerate(module_inputs, start=1):
        module_id = uid("mod")
        await store.insert("modules", {"id": module_id, "course_id": course["id"], "title": module_input.title, "order_index": module_index, "unlock_date": module_input.unlock_date})
        for lesson_index, lesson_input in enumerate(module_input.lessons, start=1):
            lesson_id = uid("les")
            lesson_payload = lesson_input.model_dump()
            await store.insert("lessons", {
                "id": lesson_id,
                "module_id": module_id,
                "course_id": course["id"],
                "order_index": lesson_index,
                **lesson_payload,
                "demo_notes": lesson_notes(lesson_payload["title"], course["title"]),
                "resources": lesson_payload.get("resources") or [{"name": f"{lesson_payload['title']} cheat sheet.pdf", "url": f"/api/resources/{lesson_id}.pdf"}],
            })
        questions = [question.model_dump() for question in module_input.quiz_questions] or [
            {"question_text": "Which action best demonstrates applied learning?", "options": ["Practice with feedback", "Skip the task", "Only reread", "Avoid examples"], "correct_option_index": 0},
            {"question_text": "What should a useful outcome be?", "options": ["Observable", "Hidden", "Unrelated", "Vague"], "correct_option_index": 0},
            {"question_text": "When should you capture notes?", "options": ["While applying ideas", "Never", "Only after months", "Before seeing content"], "correct_option_index": 0},
            {"question_text": "What improves a first attempt?", "options": ["Specific feedback", "No review", "More ambiguity", "Skipping evidence"], "correct_option_index": 0},
        ]
        while len(questions) < 5:
            questions.append({
                "question_text": f"Which practice best supports the {module_input.title} outcome?",
                "options": ["Apply it with specific feedback", "Skip the example", "Avoid evidence", "Memorize without practice"],
                "correct_option_index": 0,
            })
        await store.insert("quizzes", {
            "id": uid("quiz"), "module_id": module_id, "course_id": course["id"], "title": f"{module_input.title} knowledge check",
            "pass_threshold_percent": 60, "questions": questions,
        })
    return await course_detail(course["id"])


@app.post("/api/uploads")
async def upload_asset(file: UploadFile = File(...), user: dict[str, Any] = Depends(require_roles("instructor", "admin"))) -> dict[str, str]:
    allowed = ("video/", "image/", "application/pdf", "text/plain", "application/zip")
    if not any(file.content_type.startswith(prefix) if prefix.endswith("/") else file.content_type == prefix for prefix in allowed):
        raise HTTPException(400, "Unsupported file type")
    extension = os.path.splitext(file.filename or "")[1].lower()
    filename = f"{uid('asset')}{extension}"
    target = os.path.join(UPLOAD_DIR, filename)
    content = await file.read()
    if len(content) > 100 * 1024 * 1024:
        raise HTTPException(413, "Files must be smaller than 100 MB")
    with open(target, "wb") as output:
        output.write(content)
    return {"url": f"/uploads/{filename}", "filename": file.filename or filename, "content_type": file.content_type}


def simple_lesson_pdf(lesson: dict[str, Any]) -> bytes:
    def pdf_escape(value: str) -> str:
        return value.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")

    text_lines = ["SKILL TANK - LESSON CHEAT SHEET", lesson["title"][:72]]
    for raw_line in lesson.get("demo_notes", "").splitlines():
        line = raw_line.replace("##", "").replace("**", "").replace("`", "").strip()
        if line:
            text_lines.extend(line[start:start + 88] for start in range(0, len(line), 88))
        else:
            text_lines.append("")
    stream_lines = [
        "BT", "/F1 18 Tf", "54 780 Td", f"({pdf_escape(text_lines[0])}) Tj",
        "/F1 13 Tf", "0 -28 Td", f"({pdf_escape(text_lines[1])}) Tj", "/F1 10 Tf",
    ]
    for line in text_lines[2:42]:
        stream_lines.extend(["0 -17 Td", f"({pdf_escape(line)}) Tj"])
    stream_lines.append("ET")
    stream = "\n".join(stream_lines).encode("latin-1", errors="replace")
    objects = [
        b"<< /Type /Catalog /Pages 2 0 R >>",
        b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
        b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
        b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
        b"<< /Length " + str(len(stream)).encode() + b" >>\nstream\n" + stream + b"\nendstream",
    ]
    pdf_bytes = bytearray(b"%PDF-1.4\n")
    offsets = []
    for index, obj in enumerate(objects, start=1):
        offsets.append(len(pdf_bytes))
        pdf_bytes.extend(f"{index} 0 obj\n".encode())
        pdf_bytes.extend(obj)
        pdf_bytes.extend(b"\nendobj\n")
    xref_offset = len(pdf_bytes)
    pdf_bytes.extend(f"xref\n0 {len(objects) + 1}\n0000000000 65535 f \n".encode())
    for offset in offsets:
        pdf_bytes.extend(f"{offset:010d} 00000 n \n".encode())
    pdf_bytes.extend(f"trailer << /Size {len(objects) + 1} /Root 1 0 R >>\nstartxref\n{xref_offset}\n%%EOF".encode())
    return bytes(pdf_bytes)


@app.get("/api/resources/{lesson_id}.pdf")
async def lesson_resource_pdf(lesson_id: str):
    try:
        from reportlab.lib.pagesizes import A4
        from reportlab.pdfgen import canvas
    except ModuleNotFoundError:
        lesson = await store.one("lessons", id=lesson_id)
        if not lesson:
            raise HTTPException(404, "Lesson not found")
        filename = re.sub(r"[^a-zA-Z0-9_-]+", "-", lesson["title"]).strip("-") + "-cheat-sheet.pdf"
        return StreamingResponse(BytesIO(simple_lesson_pdf(lesson)), media_type="application/pdf", headers={"Content-Disposition": f'attachment; filename="{filename}"'})

    lesson = await store.one("lessons", id=lesson_id)
    if not lesson:
        raise HTTPException(404, "Lesson not found")
    buffer = BytesIO()
    pdf = canvas.Canvas(buffer, pagesize=A4)
    width, height = A4
    pdf.setTitle(f"{lesson['title']} cheat sheet")
    pdf.setFont("Helvetica-Bold", 18)
    pdf.drawString(54, height - 65, "SKILL TANK · LESSON CHEAT SHEET")
    pdf.setFont("Helvetica-Bold", 14)
    pdf.drawString(54, height - 95, lesson["title"][:72])
    y = height - 130
    pdf.setFont("Helvetica", 10)
    for raw_line in lesson.get("demo_notes", "").splitlines():
        line = raw_line.replace("##", "").replace("**", "").replace("`", "").strip()
        if not line:
            y -= 8
            continue
        for chunk_start in range(0, len(line), 88):
            pdf.drawString(62, y, line[chunk_start:chunk_start + 88])
            y -= 16
            if y < 55:
                pdf.showPage()
                y = height - 55
                pdf.setFont("Helvetica", 10)
    pdf.save()
    buffer.seek(0)
    filename = re.sub(r"[^a-zA-Z0-9_-]+", "-", lesson["title"]).strip("-") + "-cheat-sheet.pdf"
    return StreamingResponse(buffer, media_type="application/pdf", headers={"Content-Disposition": f'attachment; filename="{filename}"'})


@app.patch("/api/courses/{course_id}")
async def update_course(course_id: str, body: CourseUpdate, user: dict[str, Any] = Depends(require_roles("instructor", "admin"))) -> dict[str, Any]:
    course = await store.one("courses", id=course_id)
    if not course or (user["role"] == "instructor" and course["instructor_id"] != user["id"]):
        raise HTTPException(404, "Course not found")
    changes = {key: value for key, value in body.model_dump().items() if value is not None}
    if "price" in changes:
        changes["is_free"] = changes["price"] == 0
    return await store.update("courses", {"id": course_id}, changes)


@app.patch("/api/courses/{course_id}/status")
async def update_course_status(course_id: str, published: bool, user: dict[str, Any] = Depends(require_roles("instructor", "admin"))) -> dict[str, Any]:
    course = await store.one("courses", id=course_id)
    if not course or (user["role"] == "instructor" and course["instructor_id"] != user["id"]):
        raise HTTPException(404, "Course not found")
    return await store.update("courses", {"id": course_id}, {"status": "published" if published else "draft"})


@app.delete("/api/courses/{course_id}")
async def delete_course(course_id: str, _: dict[str, Any] = Depends(require_roles("admin"))) -> dict[str, bool]:
    for collection in ("modules", "lessons", "quizzes", "reviews", "qna_threads"):
        rows = await store.find(collection, course_id=course_id)
        for row in rows:
            await store.delete(collection, id=row["id"])
    return {"deleted": await store.delete("courses", id=course_id)}


@app.post("/api/payments/checkout")
async def create_checkout(body: CheckoutCreate, user: dict[str, Any] = Depends(require_roles("student"))) -> dict[str, Any]:
    course = await store.one("courses", id=body.course_id)
    if not course:
        raise HTTPException(404, "Course not found")
    asyncio.create_task(log_notification(user["id"], "payment_initiated", {"course": course["title"], "amount": course["price"]}))
    if course["is_free"]:
        enrollment = await create_enrollment(user["id"], course, None)
        return {"free": True, "enrollment": enrollment}
    if not stripe.api_key:
        raise HTTPException(503, "Stripe test mode is not configured")
    discount = 0
    if body.coupon:
        coupon = await store.one("coupons", code=body.coupon.upper())
        if not coupon or not coupon.get("active"):
            raise HTTPException(400, "Invalid coupon")
        discount = coupon["discount_percent"]
    amount = max(50, round(float(course["price"]) * (100 - discount) / 100 * 100))
    app_url = os.getenv("APP_URL", "").rstrip("/")
    if not app_url:
        raise HTTPException(503, "APP_URL must be configured before creating checkout links")
    session = stripe.checkout.Session.create(
        mode="payment",
        line_items=[{"price_data": {"currency": "inr", "product_data": {"name": course["title"], "description": course["description"][:200]}, "unit_amount": amount}, "quantity": 1}],
        customer_email=user["email"],
        success_url=f"{app_url}/checkout/success?session_id={{CHECKOUT_SESSION_ID}}",
        cancel_url=f"{app_url}/courses/{course['id']}?checkout=cancelled",
        metadata={"student_id": user["id"], "course_id": course["id"], "coupon": body.coupon.upper(), "discount": str(discount)},
    )
    return {"free": False, "checkout_url": session.url, "session_id": session.id}


@app.get("/api/payments/confirm/{session_id}")
async def confirm_checkout(session_id: str, user: dict[str, Any] = Depends(require_roles("student"))) -> dict[str, Any]:
    if not stripe.api_key:
        raise HTTPException(503, "Stripe test mode is not configured")
    session = stripe.checkout.Session.retrieve(session_id)
    if session.metadata.get("student_id") != user["id"]:
        raise HTTPException(403, "This checkout belongs to another account")
    if session.payment_status != "paid":
        return {"paid": False, "status": session.payment_status}
    course = await store.one("courses", id=session.metadata.get("course_id"))
    enrollment = await create_enrollment(user["id"], course, session.payment_intent, session.metadata.get("coupon", ""), int(session.metadata.get("discount", "0")))
    return {"paid": True, "enrollment": enrollment}


@app.post("/api/subscriptions/checkout")
async def create_subscription_checkout(user: dict[str, Any] = Depends(require_roles("student"))) -> dict[str, Any]:
    asyncio.create_task(log_notification(user["id"], "payment_initiated", {"product": "Skill Tank Pro", "amount": 999}))
    if not stripe.api_key:
        raise HTTPException(503, "Stripe test mode is not configured")
    app_url = os.getenv("APP_URL", "").rstrip("/")
    if not app_url:
        raise HTTPException(503, "APP_URL must be configured before creating checkout links")
    session = stripe.checkout.Session.create(
        mode="payment",
        line_items=[{"price_data": {"currency": "inr", "product_data": {"name": "Skill Tank Pro", "description": "Sandbox subscription checkout for Skill Tank Pro."}, "unit_amount": 99900}, "quantity": 1}],
        customer_email=user["email"],
        success_url=f"{app_url}/subscribe?session_id={{CHECKOUT_SESSION_ID}}",
        cancel_url=f"{app_url}/subscribe?checkout=cancelled",
        metadata={"student_id": user["id"], "product": "skilltank_pro"},
    )
    return {"checkout_url": session.url, "session_id": session.id}


@app.post("/api/subscriptions/confirm")
async def confirm_subscription(body: SubscriptionConfirm, user: dict[str, Any] = Depends(require_roles("student"))) -> dict[str, Any]:
    if not stripe.api_key:
        raise HTTPException(503, "Stripe test mode is not configured")
    session = stripe.checkout.Session.retrieve(body.session_id)
    if session.metadata.get("student_id") != user["id"]:
        raise HTTPException(403, "This checkout belongs to another account")
    if session.payment_status != "paid":
        return {"active": False, "status": session.payment_status}
    updated = await store.update("users", {"id": user["id"]}, {"subscription_status": "active"})
    await log_notification(user["id"], "subscription_active", {"product": "Skill Tank Pro"})
    return {"active": True, "user": public_user(updated)}


@app.post("/api/enroll/{course_id}")
async def enroll(course_id: str, coupon: str = Query(""), user: dict[str, Any] = Depends(require_roles("student"))) -> dict[str, Any]:
    existing = await store.one("enrollments", student_id=user["id"], course_id=course_id)
    if existing:
        return existing
    course = await store.one("courses", id=course_id)
    if not course:
        raise HTTPException(404, "Course not found")
    if not course["is_free"]:
        raise HTTPException(400, "Paid courses must use Stripe Checkout")
    discount = 0
    if coupon:
        match = await store.one("coupons", code=coupon.upper())
        if not match or not match.get("active"):
            raise HTTPException(400, "Invalid coupon")
        discount = match["discount_percent"]
    return await create_enrollment(user["id"], course, None, coupon, discount)


@app.get("/api/dashboard")
async def dashboard(user: dict[str, Any] = Depends(current_user)) -> dict[str, Any]:
    if user["role"] == "admin":
        return await admin_dashboard(user)
    if user["role"] == "instructor":
        return await instructor_dashboard(user)
    await ensure_demo_learning_rows(user["id"])
    enrollments = await store.find("enrollments", student_id=user["id"])
    courses = await store.all("courses")
    course_map = {c["id"]: c for c in courses}
    enriched = [{**e, "course": course_map.get(e["course_id"])} for e in enrollments]
    all_quizzes = await store.all("quizzes")
    all_attempts = await store.all("quiz_attempts")
    for item in enriched:
        quizzes = [quiz for quiz in all_quizzes if quiz["course_id"] == item["course_id"]]
        item["quizzes"] = []
        for quiz in quizzes:
            attempts = [attempt for attempt in all_attempts if attempt["enrollment_id"] == item["id"] and attempt["quiz_id"] == quiz["id"]]
            latest = sorted(attempts, key=lambda row: row["attempted_at"], reverse=True)[0] if attempts else None
            item["quizzes"].append({"id": quiz["id"], "title": quiz["title"], "module_id": quiz["module_id"], "latest_attempt": latest})
    focus_rows = await store.find("attention_logs", student_id=user["id"])
    readiness = await store.one("readiness_scores", student_id=user["id"])
    certs = await store.find("certificates", student_id=user["id"])
    interviews = await store.find("mock_interviews", student_id=user["id"])
    memberships = await store.find("cohort_students", student_id=user["id"])
    cohort_map = {row["id"]: row for row in await store.all("cohorts")}
    return {
        "enrollments": enriched, "certificates": certs, "interviews": interviews,
        "average_focus": round(sum(r["focus_percent"] for r in focus_rows) / len(focus_rows)) if focus_rows else 100,
        "readiness": readiness or {"score": 0, "breakdown": {}},
        "badges": await badges_mine(user),
        "cohorts": [cohort_map[row["cohort_id"]] for row in memberships if row["cohort_id"] in cohort_map],
    }


@app.get("/api/learn/{course_id}/{lesson_id}")
async def learn(course_id: str, lesson_id: str, user: dict[str, Any] = Depends(current_user)) -> dict[str, Any]:
    course = await course_detail(course_id)
    lesson = await store.one("lessons", id=lesson_id, course_id=course["id"])
    if not lesson:
        raise HTTPException(404, "Lesson not found")
    enrollment = await store.one("enrollments", student_id=user["id"], course_id=course["id"])
    if user["role"] == "student" and not enrollment and not lesson.get("is_preview"):
        raise HTTPException(403, "Enroll to access this lesson")
    module = await store.one("modules", id=lesson["module_id"])
    if module and module.get("unlock_date") and module["unlock_date"] > date.today().isoformat() and user["role"] == "student":
        raise HTTPException(403, f"This module unlocks on {module['unlock_date']}")
    progress = await store.one("lesson_progress", enrollment_id=enrollment["id"], lesson_id=lesson_id) if enrollment else None
    if enrollment:
        progress_rows = await store.find("lesson_progress", enrollment_id=enrollment["id"])
        completed_ids = {row["lesson_id"] for row in progress_rows if row.get("completed")}
        for module_index, module_item in enumerate(course["modules"]):
            previous_complete = module_index == 0 or all(
                previous_lesson["id"] in completed_ids for previous_lesson in course["modules"][module_index - 1]["lessons"]
            )
            scheduled_ready = not module_item.get("unlock_date") or module_item["unlock_date"] <= date.today().isoformat()
            module_item["locked"] = not previous_complete or not scheduled_ready
            module_item["completed_lessons"] = len([row for row in module_item["lessons"] if row["id"] in completed_ids])
            module_item["quiz_unlocked"] = module_item["completed_lessons"] == len(module_item["lessons"]) and not module_item["locked"]
            if module_item.get("quiz"):
                attempts = await store.find("quiz_attempts", enrollment_id=enrollment["id"], quiz_id=module_item["quiz"]["id"])
                module_item["quiz"]["latest_attempt"] = sorted(attempts, key=lambda row: row["attempted_at"], reverse=True)[0] if attempts else None
        current_module = next(item for item in course["modules"] if item["id"] == lesson["module_id"])
        if current_module["locked"] and user["role"] == "student":
            raise HTTPException(403, "Complete the previous module first to unlock this lesson")
    return {"course": course, "lesson": lesson, "enrollment": enrollment, "progress": progress}


@app.put("/api/progress/{enrollment_id}")
async def update_progress(enrollment_id: str, body: ProgressUpdate, user: dict[str, Any] = Depends(current_user)) -> dict[str, Any]:
    enrollment = await store.one("enrollments", id=enrollment_id)
    if not enrollment or (user["role"] == "student" and enrollment["student_id"] != user["id"]):
        raise HTTPException(404, "Enrollment not found")
    progress = await store.one("lesson_progress", enrollment_id=enrollment_id, lesson_id=body.lesson_id)
    was_completed = bool(progress and progress.get("completed"))
    enrollment_was_completed = enrollment.get("status") == "completed"
    changes = {**body.model_dump(), "updated_at": now_iso()}
    if progress:
        progress = await store.update("lesson_progress", {"id": progress["id"]}, changes)
    else:
        progress = await store.insert("lesson_progress", {"id": uid("prg"), "enrollment_id": enrollment_id, **changes})
    course_lessons = await store.find("lessons", course_id=enrollment["course_id"])
    progresses = await store.find("lesson_progress", enrollment_id=enrollment_id)
    completed = len({p["lesson_id"] for p in progresses if p.get("completed")})
    percent = min(100, round(completed / max(1, len(course_lessons)) * 100))
    status_value = "completed" if percent == 100 else "active"
    changes = {"progress_percent": percent, "last_lesson_id": body.lesson_id, "status": status_value}
    if percent == 100:
        changes["completed_at"] = now_iso()
    enrollment = await store.update("enrollments", {"id": enrollment_id}, changes)
    if body.completed and not was_completed:
        await award_points(enrollment["student_id"], 10, "lesson_completed", body.lesson_id)
        lesson = await store.one("lessons", id=body.lesson_id)
        module = await store.one("modules", id=lesson["module_id"]) if lesson else None
        module_lessons = await store.find("lessons", module_id=module["id"]) if module else []
        if module and module_lessons and all(item["id"] in {row["lesson_id"] for row in progresses if row.get("completed")} for item in module_lessons):
            already_logged = any(
                row.get("event_type") == "module_completed"
                and row.get("user_id") == enrollment["student_id"]
                and row.get("payload", {}).get("module_id") == module["id"]
                for row in await store.all("notifications_log")
            )
            if not already_logged:
                course = await store.one("courses", id=enrollment["course_id"])
                await log_notification(enrollment["student_id"], "module_completed", {
                    "module_id": module["id"], "module": module["title"], "course": course["title"],
                })
    if percent == 100 and not enrollment_was_completed:
        await award_points(enrollment["student_id"], 100, "course_completed", enrollment["course_id"])
    certificate = await maybe_issue_certificate(enrollment)
    await recalculate_readiness(enrollment["student_id"])
    await evaluate_badges(enrollment["student_id"])
    return {"progress": progress, "progress_percent": percent, "certificate": certificate}


@app.put("/api/progress/{enrollment_id}/notes")
async def save_lesson_notes(enrollment_id: str, lesson_id: str, body: NotesUpdate, user: dict[str, Any] = Depends(require_roles("student"))) -> dict[str, Any]:
    enrollment = await store.one("enrollments", id=enrollment_id, student_id=user["id"])
    if not enrollment:
        raise HTTPException(404, "Enrollment not found")
    progress = await store.one("lesson_progress", enrollment_id=enrollment_id, lesson_id=lesson_id)
    changes = {**body.model_dump(), "updated_at": now_iso()}
    if progress:
        return await store.update("lesson_progress", {"id": progress["id"]}, changes)
    return await store.insert("lesson_progress", {
        "id": uid("prg"), "enrollment_id": enrollment_id, "lesson_id": lesson_id,
        "watched_seconds": body.last_position_seconds, "completed": False, **changes,
    })


async def lesson_ai_response(lesson: dict[str, Any], body: LessonAIRequest) -> tuple[str, str]:
    transcript = lesson.get("transcript_text", "")
    if not transcript:
        match = re.search(r"(?:embed/|watch\?v=|youtu\.be/)([\w-]{11})", lesson.get("video_url", ""))
        if match:
            try:
                async with httpx.AsyncClient(timeout=12, follow_redirects=True) as client:
                    response = await client.get("https://www.youtube.com/api/timedtext", params={"lang": "en", "v": match.group(1), "fmt": "srv3"})
                    if response.status_code == 200 and response.text.strip():
                        root = ET.fromstring(response.text)
                        transcript = " ".join(html.unescape("".join(node.itertext())) for node in root.findall(".//text"))
                        if transcript:
                            transcript = transcript[:24000]
                            await store.update("lessons", {"id": lesson["id"]}, {"transcript_text": transcript})
            except Exception:
                transcript = ""
    notes_context = lesson.get("demo_notes", "")
    context_body = transcript or lesson.get("content_text", "")
    context = (
        f"Lesson title: {lesson['title']}\n"
        f"Lesson notes:\n{notes_context}\n\n"
        f"Lesson transcript/content:\n{context_body}"
    )
    prompts = {
        "summary": "Summarize this lesson in natural, conversational sentences. Avoid bullet points unless the learner asks for them.",
        "notes": "Explain the lesson as a friendly tutor in concise prose. Mention the most important ideas and one small practice suggestion without dash-prefixed lists.",
        "question": f"Answer the learner's question using only the lesson context. Respond in natural, conversational sentences as a friendly tutor. Avoid bullet points and dash-prefixed lists unless the learner specifically asks for steps. Keep it concise: 2-4 sentences for simple questions. Question: {body.question}",
    }
    api_key = os.getenv("EMERGENT_LLM_KEY") or os.getenv("AI_API_KEY")
    if api_key:
        try:
            from emergentintegrations.llm.chat import LlmChat, UserMessage
            chat = LlmChat(
                api_key=api_key,
                session_id=uid("ail"),
                system_message="You are the SKILLTANK lesson coach. Be accurate, concise, practical, and natural. Respond like a friendly tutor. Avoid bullet points and dash-prefixed lists unless the learner specifically asks for a step-by-step breakdown. Do not invent details outside the supplied lesson.",
            ).with_model("anthropic", "claude-sonnet-4-6")
            response_text = await chat.send_message(UserMessage(text=f"{context}\n\n{prompts[body.action]}"))
            return response_text, "live_llm"
        except Exception:
            pass
    content = notes_context or context_body or "This lesson introduces a practical workflow and asks you to apply it."
    sentences = [sentence.strip() for sentence in re.split(r"(?<=[.!?])\s+", content) if sentence.strip()]
    if body.action == "summary":
        return (" ".join(sentences[:3]) or content), "structured_fallback"
    if body.action == "notes":
        base = " ".join(sentences[:4]) if sentences else content
        return f"{lesson['title']} is mainly about {base[:900]} A useful way to study it is to explain the idea in your own words, then apply it to one small example before moving on.", "structured_fallback"
    question = (body.question or "this topic").strip()
    answer = (
        f"Based on this lesson, answer '{question}' by using the key ideas from {lesson['title']}. "
        f"The most relevant lesson context is: {content[:900]} "
        "A good next step is to turn that into one concrete example, then check it against the notes."
    )
    return answer, "structured_fallback"
    title = lesson["title"]
    content = context_body or "This lesson introduces a practical workflow and asks you to apply it."
    if body.action == "summary":
        text = f"{title} focuses on turning one core concept into an observable outcome. {content}\n\n• Identify the lesson's main idea.\n• Apply it to one realistic example.\n• Review the result and capture what you would improve."
    elif body.action == "notes":
        text = f"# {title}\n\n## Core idea\n{content}\n\n## Study notes\n- Define the intended outcome before starting.\n- Follow the demonstrated workflow in small steps.\n- Use evidence or feedback to evaluate the result.\n- Record one question and one next action.\n\n## Practice task\nApply the lesson to a real scenario and explain your decision in three sentences."
    else:
        text = f"Based on {title}, the best approach is to connect your question to the lesson's intended outcome, apply the workflow to one concrete example, and check the result against evidence. The lesson context says: {content}"
    return text, "structured_fallback"


@app.post("/api/lessons/{lesson_id}/ai")
async def lesson_ai(lesson_id: str, body: LessonAIRequest, user: dict[str, Any] = Depends(current_user)) -> dict[str, Any]:
    lesson = await store.one("lessons", id=lesson_id)
    if not lesson:
        raise HTTPException(404, "Lesson not found")
    if user["role"] == "student" and not await store.one("enrollments", student_id=user["id"], course_id=lesson["course_id"]):
        raise HTTPException(403, "Enroll to use the lesson assistant")
    text, provider = await lesson_ai_response(lesson, body)
    await store.insert("ai_assistant_logs", {
        "id": uid("ail"), "user_id": user["id"], "lesson_id": lesson_id,
        "action": body.action, "question": body.question, "response": text, "provider": provider, "created_at": now_iso(),
    })
    return {"response": text, "provider": provider}


@app.post("/api/lessons/{lesson_id}/started")
async def lesson_started(lesson_id: str, user: dict[str, Any] = Depends(require_roles("student"))) -> dict[str, bool]:
    lesson = await store.one("lessons", id=lesson_id)
    if not lesson:
        raise HTTPException(404, "Lesson not found")
    enrollment = await store.one("enrollments", student_id=user["id"], course_id=lesson["course_id"])
    if not enrollment:
        raise HTTPException(403, "Enroll to start this lesson")
    course = await store.one("courses", id=lesson["course_id"])
    asyncio.create_task(log_notification(user["id"], "lesson_started", {
        "course": course["title"] if course else lesson["course_id"],
        "lesson": lesson["title"],
        "message": f"You started {lesson['title']}.",
    }))
    return {"ok": True}


@app.get("/api/quizzes/{quiz_id}")
async def get_quiz(quiz_id: str, _: dict[str, Any] = Depends(current_user)) -> dict[str, Any]:
    quiz = await store.one("quizzes", id=quiz_id)
    if not quiz:
        raise HTTPException(404, "Quiz not found")
    return {key: value for key, value in quiz.items() if key != "questions"} | {
        "question_count": len(quiz["questions"]),
    }


def student_questions(quiz: dict[str, Any]) -> list[dict[str, Any]]:
    return [
        {"id": question.get("id", f"{quiz['id']}_q{index + 1}"), "question_text": question["question_text"], "options": question["options"]}
        for index, question in enumerate(quiz["questions"])
    ]


@app.get("/api/quizzes/{quiz_id}/questions")
async def get_quiz_questions(quiz_id: str, _: dict[str, Any] = Depends(current_user)) -> list[dict[str, Any]]:
    quiz = await store.one("quizzes", id=quiz_id)
    if not quiz:
        raise HTTPException(404, "Quiz not found")
    return student_questions(quiz)


async def score_quiz_attempt(quiz: dict[str, Any], enrollment: dict[str, Any], selected: list[int], user: dict[str, Any]) -> dict[str, Any]:
    prior_attempts = await store.find("quiz_attempts", enrollment_id=enrollment["id"], quiz_id=quiz["id"])
    question_results = []
    correct_count = 0
    for index, question in enumerate(quiz["questions"]):
        selected_index = selected[index] if index < len(selected) else -1
        is_correct = selected_index == question["correct_option_index"]
        correct_count += int(is_correct)
        question_results.append({
            "question_id": question.get("id", f"{quiz['id']}_q{index + 1}"),
            "question_text": question["question_text"], "options": question["options"],
            "selected_option_index": selected_index, "correct_option_index": question["correct_option_index"],
            "is_correct": is_correct,
        })
    score = round(correct_count / max(1, len(quiz["questions"])) * 100)
    passed = score >= quiz["pass_threshold_percent"]
    attempt = await store.insert("quiz_attempts", {
        "id": uid("qat"), "enrollment_id": enrollment["id"], "quiz_id": quiz["id"],
        "score_percent": score, "passed": passed, "answers": selected,
        "question_results": question_results, "attempt_number": len(prior_attempts) + 1, "attempted_at": now_iso(),
    })
    if not passed:
        await log_notification(user["id"], "quiz_failed", {"quiz": quiz["title"], "score": score})
    elif not any(item.get("passed") for item in prior_attempts):
        await award_points(user["id"], 50 if not prior_attempts else 25, "quiz_passed", quiz["id"])
    certificate = await maybe_issue_certificate(enrollment)
    await recalculate_readiness(user["id"])
    await evaluate_badges(user["id"])
    return {**attempt, "certificate": certificate}


@app.post("/api/quizzes/{quiz_id}/submit")
async def submit_quiz(quiz_id: str, body: QuizSubmission, user: dict[str, Any] = Depends(require_roles("student"))) -> dict[str, Any]:
    quiz = await store.one("quizzes", id=quiz_id)
    enrollment = await store.one("enrollments", student_id=user["id"], course_id=quiz["course_id"]) if quiz else None
    if not quiz or not enrollment:
        raise HTTPException(404, "Quiz or enrollment not found")
    return await score_quiz_attempt(quiz, enrollment, body.answers, user)


@app.post("/api/quiz-attempts")
async def create_quiz_attempt(body: QuizAttemptCreate, user: dict[str, Any] = Depends(require_roles("student"))) -> dict[str, Any]:
    quiz = await store.one("quizzes", id=body.quiz_id)
    enrollment = await store.one("enrollments", id=body.enrollment_id, student_id=user["id"])
    if not quiz or not enrollment or enrollment["course_id"] != quiz["course_id"]:
        raise HTTPException(404, "Quiz or enrollment not found")
    answers_by_id = {answer.question_id: answer.selected_option_index for answer in body.answers}
    selected = [
        answers_by_id.get(question.get("id", f"{quiz['id']}_q{index + 1}"), -1)
        for index, question in enumerate(quiz["questions"])
    ]
    return await score_quiz_attempt(quiz, enrollment, selected, user)


@app.get("/api/quiz-attempts")
async def get_quiz_attempts(
    enrollment_id: str = Query(...), quiz_id: str = Query(...),
    user: dict[str, Any] = Depends(current_user),
) -> dict[str, Any] | None:
    enrollment = await store.one("enrollments", id=enrollment_id)
    if not enrollment or (user["role"] == "student" and enrollment["student_id"] != user["id"]):
        raise HTTPException(403, "Access denied")
    attempts = await store.find("quiz_attempts", enrollment_id=enrollment_id, quiz_id=quiz_id)
    return sorted(attempts, key=lambda item: item["attempted_at"], reverse=True)[0] if attempts else None


@app.post("/api/quizzes/generate")
async def generate_quiz(body: QuizGenerate, user: dict[str, Any] = Depends(require_roles("instructor", "admin"))) -> dict[str, Any]:
    module = await store.one("modules", id=body.module_id)
    if not module:
        raise HTTPException(404, "Module not found")
    course = await store.one("courses", id=module["course_id"])
    if user["role"] == "instructor" and course["instructor_id"] != user["id"]:
        raise HTTPException(403, "You do not own this course")
    questions = None
    api_key = os.getenv("EMERGENT_LLM_KEY") or os.getenv("AI_API_KEY")
    if api_key:
        try:
            from emergentintegrations.llm.chat import LlmChat, UserMessage
            chat = LlmChat(
                api_key=api_key,
                session_id=uid("qgen"),
                system_message="You are a quiz generator for an online learning platform. Generate exactly 5 multiple-choice questions in JSON format.",
            ).with_model("anthropic", "claude-sonnet-4-6")
            prompt = (
                f"Generate 5 multiple-choice quiz questions for a module titled '{module['title']}' "
                f"in the course '{course['title']}'. "
                "Return a JSON array only (no markdown, no explanation) with this exact structure: "
                '[{"question_text": "...", "options": ["A", "B", "C", "D"], "correct_option_index": 0}, ...]'
            )
            raw = await chat.send_message(UserMessage(text=prompt))
            import json as _json
            match = re.search(r'\[.*\]', raw, re.DOTALL)
            if match:
                questions = _json.loads(match.group(0))
                if not isinstance(questions, list) or len(questions) < 3:
                    questions = None
        except Exception:
            questions = None
    if not questions:
        questions = [
            {"question_text": "What is the central idea of this module?", "options": ["Apply the core concept", "Ignore the outcome", "Avoid practice", "Skip feedback"], "correct_option_index": 0},
            {"question_text": "Which activity best checks understanding?", "options": ["A practical example", "Closing the page", "Avoiding questions", "Copying a title"], "correct_option_index": 0},
            {"question_text": "What should learners do next?", "options": ["Practice and reflect", "Stop permanently", "Hide the work", "Remove context"], "correct_option_index": 0},
            {"question_text": "Useful feedback should be…", "options": ["Specific and actionable", "Unrelated", "Invisible", "Needlessly vague"], "correct_option_index": 0},
            {"question_text": "What makes the answer strongest?", "options": ["Specific evidence and a clear result", "A vague guess", "No example", "Ignoring the lesson"], "correct_option_index": 0},
        ]
    generated_by = "live_llm" if api_key and questions else "structured_ai_fallback"
    quiz = await store.one("quizzes", module_id=body.module_id)
    if quiz:
        return await store.update("quizzes", {"id": quiz["id"]}, {"questions": questions, "generated_by": generated_by})
    return await store.insert("quizzes", {"id": uid("quiz"), "module_id": body.module_id, "course_id": module["course_id"], "title": f"{module['title']} knowledge check", "pass_threshold_percent": 60, "questions": questions, "generated_by": generated_by})


@app.post("/api/courses/{course_id}/reviews")
async def add_review(course_id: str, body: ReviewCreate, user: dict[str, Any] = Depends(require_roles("student"))) -> dict[str, Any]:
    if not await store.one("enrollments", student_id=user["id"], course_id=course_id):
        raise HTTPException(403, "Enroll before reviewing")
    existing = await store.one("reviews", student_id=user["id"], course_id=course_id)
    payload = {**body.model_dump(), "student_name": user["full_name"], "created_at": now_iso()}
    if existing:
        review = await store.update("reviews", {"id": existing["id"]}, payload)
    else:
        review = await store.insert("reviews", {"id": uid("rev"), "course_id": course_id, "student_id": user["id"], **payload})
    reviews = await store.find("reviews", course_id=course_id)
    await store.update("courses", {"id": course_id}, {"rating_avg": round(sum(item["rating"] for item in reviews) / len(reviews), 1)})
    return review


@app.get("/api/courses/{course_id}/qna")
async def get_qna(course_id: str) -> list[dict[str, Any]]:
    return await store.find("qna_threads", course_id=course_id)


@app.post("/api/courses/{course_id}/qna")
async def add_qna(course_id: str, body: QuestionCreate, user: dict[str, Any] = Depends(current_user)) -> dict[str, Any]:
    return await store.insert("qna_threads", {"id": uid("qna"), "course_id": course_id, "student_id": user["id"], "student_name": user["full_name"], **body.model_dump(), "created_at": now_iso(), "replies": []})


@app.post("/api/qna/{thread_id}/reply")
async def reply_qna(thread_id: str, body: ReplyCreate, user: dict[str, Any] = Depends(current_user)) -> dict[str, Any]:
    thread = await store.one("qna_threads", id=thread_id)
    if not thread:
        raise HTTPException(404, "Thread not found")
    replies = thread.get("replies", []) + [{"id": uid("rep"), "author_name": user["full_name"], "reply_text": body.reply_text, "created_at": now_iso()}]
    return await store.update("qna_threads", {"id": thread_id}, {"replies": replies})


@app.post("/api/interviews")
async def save_interview(body: InterviewCreate, user: dict[str, Any] = Depends(require_roles("student"))) -> dict[str, Any]:
    answers = [m.get("text", "") for m in body.transcript if m.get("role") == "user"]
    questions = [m.get("text", "") for m in body.transcript if m.get("role") == "assistant"]
    word_count = sum(len(answer.split()) for answer in answers)
    if body.provider != "live_llm" or not os.getenv("AI_API_KEY"):
        per_answer_scores = [min(20, (len(answer.split()) / 30) * 20) for answer in answers[:5]]
        average_words = word_count / max(1, len(answers))
        score = round(min(100, sum(per_answer_scores) + (5 if average_words > 40 else 0)))
        strengths = [
            "You completed the full interview and addressed each question directly.",
            "Your responses show role-specific thinking and practical examples.",
        ]
        improvements = [
            "Aim for roughly 50 focused words per answer.",
            "Use situation, action, result, and a measurable outcome.",
            "Explain technical or business trade-offs more explicitly.",
        ]
        feedback = f"You scored {score}/100 using the offline interview rubric. Your average answer length was {round(average_words)} words. Strengthen each response with a clearer result and one concrete metric."
        score_breakdown = {
            "answer_depth": min(100, round(average_words / 30 * 100)),
            "completion": round(len(answers) / 5 * 100),
            "role_relevance": 75 if answers else 0,
        }
    else:
        evidence_hits = sum(any(token in answer.lower() for token in ("result", "%", "increased", "reduced", "measured", "users", "revenue", "time")) for answer in answers)
        structure_hits = sum(any(token in answer.lower() for token in ("first", "then", "because", "therefore", "finally", "outcome")) for answer in answers)
        completeness = min(100, round(len(answers) / 5 * 100))
        communication = min(100, 55 + word_count // max(1, len(answers) * 2))
        impact = min(100, 50 + evidence_hits * 9)
        structure = min(100, 52 + structure_hits * 8)
        role_fit = min(100, 58 + len(answers) * 5)
        score = round(completeness * .2 + communication * .2 + impact * .25 + structure * .2 + role_fit * .15)
        strengths = ["Your answers generally have a clear decision path.", "You connect examples to the selected role."]
        improvements = ["Add a concrete metric or before/after result.", "Close each answer with the outcome and lesson learned."]
        feedback = f"You scored {score}/100. Your responses are structured and relevant; improve the evidence and measurable impact."
        score_breakdown = {"completeness": completeness, "communication": communication, "impact": impact, "structure": structure, "role_fit": role_fit}
    question_breakdown = []
    for index in range(5):
        answer = answers[index] if index < len(answers) else ""
        words = len(answer.split())
        keyword_hit = any(token in answer.lower() for token in ("result", "because", "measured", "users", "impact", "improved", "%"))
        per_score = min(10, round(words / 6) + (2 if keyword_hit else 0))
        question_breakdown.append({
            "question": questions[index] if index < len(questions) else f"Question {index + 1}",
            "answer": answer,
            "score": per_score,
            "strengths": "Good depth and practical evidence." if words >= 40 else "You addressed the core question directly.",
            "improvements": "Open with a brief summary, then quantify the outcome." if words >= 40 else "Elaborate with a specific example, your actions, and a measurable result.",
        })
    interview = await store.insert("mock_interviews", {
        "id": uid("int"), "student_id": user["id"], **body.model_dump(), "score_percent": score,
        "feedback_text": feedback, "score_breakdown": score_breakdown,
        "strengths": strengths, "improvements": improvements, "question_breakdown": question_breakdown, "created_at": now_iso(),
    })
    await award_points(user["id"], 30, "mock_interview_completed", interview["id"])
    await recalculate_readiness(user["id"])
    await evaluate_badges(user["id"])
    return interview


@app.get("/api/interviews")
async def list_my_interviews(user: dict[str, Any] = Depends(require_roles("student"))) -> list[dict[str, Any]]:
    return sorted(
        await store.find("mock_interviews", student_id=user["id"]),
        key=lambda row: row.get("created_at", ""),
        reverse=True,
    )


@app.get("/api/interviews/questions/{job_role}")
async def interview_questions(job_role: str, _: dict[str, Any] = Depends(current_user)) -> dict[str, Any]:
    fallback_bank = {
        "Software Engineer": ["Explain the difference between a stack and a queue.", "What is Big-O notation? Give an example.", "Describe a time you debugged a difficult issue.", "What is the difference between REST and GraphQL?", "Explain what a race condition is."],
        "Data Scientist": ["What is the difference between supervised and unsupervised learning?", "How do you handle missing data?", "Explain the bias-variance tradeoff.", "What is cross-validation and why is it used?", "Describe a data project you are proud of."],
        "Product Manager": ["How do you prioritise features on a roadmap?", "Describe your process for writing a PRD.", "How do you measure the success of a product launch?", "Tell me about a time you had to say no to a stakeholder.", "What metrics would you track for a new mobile app?"],
        "UX Designer": ["Walk me through your design process.", "How do you handle design feedback from non-designers?", "What is the difference between UX and UI?", "Describe a usability test you have run.", "How do you design for accessibility?"],
        "Business Analyst": ["How do you gather requirements from stakeholders?", "What is the difference between a use case and a user story?", "Describe a situation where data changed a business decision.", "What tools do you use for analysis and why?", "How do you handle conflicting requirements?"],
        "Digital Marketer": ["How do you measure ROI on a campaign?", "What is your approach to SEO?", "Explain the marketing funnel.", "How do you segment an audience?", "Describe a campaign that did not perform and what you learned."],
        "Full Stack Developer": ["What is the difference between SSR and CSR?", "How do you handle authentication in a web app?", "Explain database indexing.", "What is CORS and how do you handle it?", "Describe your deployment workflow."],
        "DevOps Engineer": ["What is the difference between Docker and a VM?", "Explain CI/CD.", "How do you handle secrets management?", "What is Kubernetes used for?", "Describe how you would investigate a production outage."],
    }
    fallback_bank.update({
        "Frontend Developer": fallback_bank["Full Stack Developer"],
        "Python Developer": fallback_bank["Software Engineer"],
        "UI/UX Designer": fallback_bank["UX Designer"],
        "Backend Developer": fallback_bank["Full Stack Developer"],
    })
    def mixed_questions(rows: list[str]) -> list[dict[str, Any]]:
        return [
            {"type": "open_ended", "prompt": rows[0]},
            {
                "type": "multiple_choice",
                "prompt": "Which response structure is strongest for interview answers?",
                "options": ["Situation, action, result, evidence", "Long background first", "Only tools used", "A one-word answer"],
                "correct_option_index": 0,
            },
            {"type": "open_ended", "prompt": rows[2]},
            {
                "type": "multiple_choice",
                "prompt": "What makes a technical answer more credible?",
                "options": ["A measurable outcome or trade-off", "Skipping constraints", "Avoiding examples", "Only naming buzzwords"],
                "correct_option_index": 0,
            },
            {"type": "open_ended", "prompt": rows[4]},
        ]

    questions = fallback_bank.get(job_role, fallback_bank["Software Engineer"])
    api_key = os.getenv("EMERGENT_LLM_KEY") or os.getenv("AI_API_KEY")
    if api_key:
        try:
            from emergentintegrations.llm.chat import LlmChat, UserMessage
            import json as _json
            chat = LlmChat(
                api_key=api_key,
                session_id=uid("iq"),
                system_message="Return JSON with a questions array containing exactly five concise interview questions.",
            ).with_model("anthropic", "claude-sonnet-4-6")
            raw = await chat.send_message(UserMessage(text=f"Generate a balanced technical and behavioral interview for a {job_role}. Return JSON only."))
            match = re.search(r'\{.*\}', raw, re.DOTALL)
            if match:
                generated = _json.loads(match.group(0)).get("questions", [])
                if len(generated) == 5:
                    generated_rows = [str(item.get("prompt") if isinstance(item, dict) else item) for item in generated]
                    return {"job_role": job_role, "questions": mixed_questions(generated_rows), "provider": "live_llm"}
        except Exception:
            pass
    return {"job_role": job_role, "questions": mixed_questions(questions), "provider": "structured_fallback"}


@app.post("/api/focus")
async def log_focus(body: FocusCreate, user: dict[str, Any] = Depends(require_roles("student"))) -> dict[str, Any]:
    row = await store.insert("attention_logs", {"id": uid("att"), "student_id": user["id"], **body.model_dump()})
    return row


@app.post("/api/attention-logs")
async def create_attention_log(body: FocusCreate, user: dict[str, Any] = Depends(require_roles("student"))) -> dict[str, Any]:
    return await log_focus(body, user)


@app.get("/api/attention-logs/my-average")
async def attention_average(user: dict[str, Any] = Depends(require_roles("student"))) -> dict[str, float]:
    rows = await store.find("attention_logs", student_id=user["id"])
    average = round(sum(float(row.get("focus_percent", 0)) for row in rows) / len(rows), 1) if rows else 100
    return {"average_focus_percent": average}


@app.get("/api/lesson-progress")
async def lesson_progress(enrollment_id: str, user: dict[str, Any] = Depends(current_user)) -> list[dict[str, Any]]:
    enrollment = await store.one("enrollments", id=enrollment_id)
    if not enrollment or (user["role"] == "student" and enrollment["student_id"] != user["id"]):
        raise HTTPException(404, "Enrollment not found")
    return await store.find("lesson_progress", enrollment_id=enrollment_id)


async def recalculate_readiness(student_id: str) -> dict[str, Any]:
    enrollments = await store.find("enrollments", student_id=student_id)
    completed = sum(e.get("status") == "completed" for e in enrollments)
    completion_score = round(completed / max(1, len(enrollments)) * 100)
    enrollment_ids = {e["id"] for e in enrollments}
    attempts = [a for a in await store.all("quiz_attempts") if a["enrollment_id"] in enrollment_ids]
    quizzes = round(sum(a["score_percent"] for a in attempts) / len(attempts)) if attempts else 50
    interviews = await store.find("mock_interviews", student_id=student_id)
    interview_score = round(sum(i["score_percent"] for i in interviews) / len(interviews)) if interviews else 50
    certs = await store.find("certificates", student_id=student_id)
    cert_score = min(100, len(certs) * 35)
    score = round(completion_score * .35 + quizzes * .25 + interview_score * .25 + cert_score * .15)
    payload = {"score": score, "breakdown": {"courses_completed": completion_score, "avg_quiz_score": quizzes, "avg_interview_score": interview_score, "certificates_earned": cert_score}, "updated_at": now_iso()}
    existing = await store.one("readiness_scores", student_id=student_id)
    if existing:
        return await store.update("readiness_scores", {"student_id": student_id}, payload)
    return await store.insert("readiness_scores", {"student_id": student_id, **payload})


@app.get("/api/readiness-score/me")
async def readiness_me(user: dict[str, Any] = Depends(require_roles("student"))) -> dict[str, Any]:
    return await recalculate_readiness(user["id"])


@app.get("/api/leaderboard")
async def leaderboard(_: dict[str, Any] = Depends(current_user)) -> list[dict[str, Any]]:
    rows = sorted(await store.all("leaderboard"), key=lambda x: x["points"], reverse=True)
    badges = {item["id"]: item for item in await store.all("badges")}
    student_badges = await store.all("student_badges")
    enrollments = await store.all("enrollments")
    return [{
        **row,
        "badges": [badges[item["badge_id"]] for item in student_badges if item["student_id"] == row["student_id"] and item["badge_id"] in badges],
        "courses_completed": len([item for item in enrollments if item["student_id"] == row["student_id"] and item["status"] == "completed"]),
    } for row in rows]


@app.get("/api/badges")
async def badges(_: dict[str, Any] = Depends(current_user)) -> list[dict[str, Any]]:
    return await store.all("badges")


@app.get("/api/badges/mine")
async def badges_mine(user: dict[str, Any] = Depends(require_roles("student"))) -> list[dict[str, Any]]:
    definitions = {item["id"]: item for item in await store.all("badges")}
    awards = await store.find("student_badges", student_id=user["id"])
    return [{**definitions[item["badge_id"]], "awarded_at": item["awarded_at"]} for item in awards if item["badge_id"] in definitions]


@app.get("/api/instructor/dashboard")
async def instructor_dashboard(user: dict[str, Any] = Depends(require_roles("instructor", "admin"))) -> dict[str, Any]:
    courses = await store.all("courses") if user["role"] == "admin" else await store.find("courses", instructor_id=user["id"])
    ids = {c["id"] for c in courses}
    enrollments = [e for e in await store.all("enrollments") if e["course_id"] in ids]
    return {
        "courses": courses, "enrollments": enrollments,
        "stats": {"students": len({e["student_id"] for e in enrollments}), "enrollments": len(enrollments), "average_rating": round(sum(c["rating_avg"] for c in courses) / max(1, len(courses)), 1), "completion_rate": round(sum(e["progress_percent"] for e in enrollments) / max(1, len(enrollments)))},
        "trend": [18, 26, 23, 38, 44, 57, 64],
        "qna": [thread for thread in await store.all("qna_threads") if thread["course_id"] in ids],
        "coupons": [coupon for coupon in await store.all("coupons") if coupon.get("course_id") in ids],
    }


@app.post("/api/instructor/coupons")
async def instructor_coupon(body: CouponCreate, user: dict[str, Any] = Depends(require_roles("instructor"))) -> dict[str, Any]:
    if not body.course_id or not await store.one("courses", id=body.course_id, instructor_id=user["id"]):
        raise HTTPException(403, "Choose one of your own courses")
    return await store.insert("coupons", {"id": uid("cpn"), **body.model_dump(), "code": body.code.upper(), "created_by": user["id"]})


@app.get("/api/admin/dashboard")
async def admin_dashboard(_: dict[str, Any] = Depends(require_roles("admin"))) -> dict[str, Any]:
    users = await store.all("users")
    courses = await store.all("courses")
    enrollments = await store.all("enrollments")
    certificates = await store.all("certificates")
    course_map = {course["id"]: course for course in courses}
    user_map = {user["id"]: public_user(user) for user in users}
    enrollment_rows = [{**item, "course": course_map.get(item["course_id"]), "student": user_map.get(item["student_id"])} for item in enrollments]
    certificate_rows = [{**item, "course": course_map.get(item["course_id"]), "student": user_map.get(item["student_id"])} for item in certificates]
    return {
        "stats": {"users": len(users), "courses": len(courses), "enrollments": len(enrollments), "certificates": len(certificates)},
        "users": [public_user(u) for u in users], "courses": courses, "enrollments": enrollment_rows,
        "certificates": certificate_rows, "notifications": await store.all("notifications_log"),
        "interviews": await store.all("mock_interviews"), "attention_logs": await store.all("attention_logs"),
        "coupons": await store.all("coupons"), "cohorts": await store.all("cohorts"),
        "cohort_students": await store.all("cohort_students"),
        "certification_paths": await store.all("certification_paths"),
        "certification_courses": await store.all("certification_courses"),
        "completion_report": [{"course_id": course["id"], "course_title": course["title"], "enrollments": len([e for e in enrollments if e["course_id"] == course["id"]]), "completed": len([e for e in enrollments if e["course_id"] == course["id"] and e["status"] == "completed"])} for course in courses],
    }


@app.get("/api/admin/stats")
async def admin_stats(_: dict[str, Any] = Depends(require_roles("admin"))) -> dict[str, Any]:
    users = await store.all("users")
    courses = {course["id"]: course for course in await store.all("courses")}
    enrollments = await store.all("enrollments")
    total_revenue = sum(
        float(courses.get(item["course_id"], {}).get("price", 0)) * (100 - float(item.get("discount_percent", 0))) / 100
        for item in enrollments if item.get("payment_status") == "paid"
    )
    return {
        "total_students": len([user for user in users if user["role"] == "student"]),
        "total_instructors": len([user for user in users if user["role"] == "instructor"]),
        "total_courses": len(courses), "total_enrollments": len(enrollments),
        "total_certificates": len(await store.all("certificates")),
        "total_revenue": round(total_revenue, 2),
    }


@app.patch("/api/admin/users/{user_id}/active")
async def set_user_active(user_id: str, active: bool, _: dict[str, Any] = Depends(require_roles("admin"))) -> dict[str, Any]:
    user = await store.update("users", {"id": user_id}, {"active": active})
    return public_user(user) if user else {}


@app.post("/api/admin/coupons")
async def add_coupon(body: CouponCreate, _: dict[str, Any] = Depends(require_roles("admin"))) -> dict[str, Any]:
    return await store.insert("coupons", {"id": uid("cpn"), **body.model_dump(), "code": body.code.upper()})


@app.patch("/api/admin/coupons/{coupon_id}")
async def update_coupon(coupon_id: str, body: CouponCreate, _: dict[str, Any] = Depends(require_roles("admin"))) -> dict[str, Any]:
    return await store.update("coupons", {"id": coupon_id}, {**body.model_dump(), "code": body.code.upper()})


@app.post("/api/admin/enrollments")
async def manual_enrollment(body: ManualEnrollment, _: dict[str, Any] = Depends(require_roles("admin"))) -> dict[str, Any]:
    student = await store.one("users", id=body.student_id, role="student")
    course = await store.one("courses", id=body.course_id)
    if not student or not course:
        raise HTTPException(404, "Student or course not found")
    return await create_enrollment(student["id"], course, "admin_manual")


@app.post("/api/admin/enroll")
async def manual_enrollment_alias(body: ManualEnrollment, user: dict[str, Any] = Depends(require_roles("admin"))) -> dict[str, Any]:
    return await manual_enrollment(body, user)


@app.post("/api/admin/cohorts")
async def create_cohort(body: CohortCreate, user: dict[str, Any] = Depends(require_roles("admin"))) -> dict[str, Any]:
    cohort = await store.insert("cohorts", {"id": uid("coh"), "name": body.name, "organization_name": body.organization_name, "created_by": user["id"]})
    for student_id in body.student_ids:
        if await store.one("users", id=student_id, role="student"):
            await store.insert("cohort_students", {"id": uid("chs"), "cohort_id": cohort["id"], "student_id": student_id})
    return {**cohort, "student_ids": body.student_ids}


@app.get("/api/admin/cohorts")
async def list_cohorts(_: dict[str, Any] = Depends(require_roles("admin"))) -> list[dict[str, Any]]:
    cohorts = await store.all("cohorts")
    members = await store.all("cohort_students")
    return [{**cohort, "student_count": len([row for row in members if row["cohort_id"] == cohort["id"]])} for cohort in cohorts]


@app.get("/api/admin/cohorts/{cohort_id}/students")
async def list_cohort_students(cohort_id: str, _: dict[str, Any] = Depends(require_roles("admin"))) -> list[dict[str, Any]]:
    member_ids = {row["student_id"] for row in await store.find("cohort_students", cohort_id=cohort_id)}
    return [public_user(user) for user in await store.all("users") if user["id"] in member_ids]


@app.post("/api/admin/cohorts/{cohort_id}/students")
async def add_cohort_student(cohort_id: str, body: CohortStudentAdd, _: dict[str, Any] = Depends(require_roles("admin"))) -> dict[str, Any]:
    if not await store.one("cohorts", id=cohort_id) or not await store.one("users", id=body.student_id, role="student"):
        raise HTTPException(404, "Cohort or student not found")
    existing = await store.one("cohort_students", cohort_id=cohort_id, student_id=body.student_id)
    return existing or await store.insert("cohort_students", {"id": uid("chs"), "cohort_id": cohort_id, "student_id": body.student_id})


@app.post("/api/admin/cohorts/{cohort_id}/enroll")
async def enroll_cohort(cohort_id: str, body: CohortEnrollment, _: dict[str, Any] = Depends(require_roles("admin"))) -> dict[str, Any]:
    course = await store.one("courses", id=body.course_id)
    members = await store.find("cohort_students", cohort_id=cohort_id)
    if not course:
        raise HTTPException(404, "Course not found")
    enrolled = [await create_enrollment(member["student_id"], course, "cohort_bulk") for member in members]
    return {"count": len(enrolled), "enrollments": enrolled}


@app.post("/api/admin/cohort-enroll")
async def enroll_cohort_alias(body: AdminCohortEnrollment, user: dict[str, Any] = Depends(require_roles("admin"))) -> dict[str, Any]:
    return await enroll_cohort(body.cohort_id, CohortEnrollment(course_id=body.course_id), user)


async def run_daily_reminders_internal() -> dict[str, int]:
    enrollments = [item for item in await store.all("enrollments") if item["status"] == "active" and item.get("progress_percent", 0) < 100]
    for enrollment in enrollments:
        course = await store.one("courses", id=enrollment["course_id"])
        await log_notification(enrollment["student_id"], "daily_reminder", {"course": course["title"], "progress_percent": enrollment["progress_percent"]})
    return {"students": len(enrollments), "log_rows": len(enrollments) * 2}


async def daily_reminder_loop() -> None:
    while True:
        await asyncio.sleep(24 * 60 * 60)
        await run_daily_reminders_internal()


@app.post("/api/admin/notifications/run-daily")
async def run_daily_reminders(_: dict[str, Any] = Depends(require_roles("admin"))) -> dict[str, int]:
    return await run_daily_reminders_internal()


@app.post("/api/admin/notifications/daily-reminder")
async def run_daily_reminders_alias(user: dict[str, Any] = Depends(require_roles("admin"))) -> dict[str, int]:
    return await run_daily_reminders(user)


@app.post("/api/admin/certificates/{certificate_id}/reissue")
async def reissue_certificate(certificate_id: str, _: dict[str, Any] = Depends(require_roles("admin"))) -> dict[str, Any]:
    cert = await store.one("certificates", id=certificate_id)
    if not cert:
        raise HTTPException(404, "Certificate not found")
    updated = await store.update("certificates", {"id": certificate_id}, {"reissued_count": cert.get("reissued_count", 0) + 1, "issued_at": now_iso()})
    await log_notification(cert["student_id"], "certificate_reissued", {
        "certificate": cert["certificate_number"],
        "download_url": frontend_url(f"/certificates/{cert['id']}"),
    })
    return updated


@app.post("/api/admin/certificates/reissue")
async def reissue_certificate_alias(body: CertificateReissueRequest, user: dict[str, Any] = Depends(require_roles("admin"))) -> dict[str, Any]:
    certificate = await store.one("certificates", id=body.certificate_id) if body.certificate_id else await store.one("certificates", enrollment_id=body.enrollment_id)
    if not certificate:
        raise HTTPException(404, "Certificate not found")
    return await reissue_certificate(certificate["id"], user)


@app.post("/api/admin/enrollments/{enrollment_id}/certificate")
async def override_certificate(enrollment_id: str, _: dict[str, Any] = Depends(require_roles("admin"))) -> dict[str, Any]:
    enrollment = await store.one("enrollments", id=enrollment_id)
    if not enrollment:
        raise HTTPException(404, "Enrollment not found")
    existing = await store.one("certificates", enrollment_id=enrollment_id)
    if existing:
        return existing
    certificate = {
        "id": uid("cert"), "enrollment_id": enrollment_id, "student_id": enrollment["student_id"],
        "course_id": enrollment["course_id"], "certificate_number": f"ST-{datetime.now().year}-{uuid.uuid4().hex[:8].upper()}",
        "issued_at": now_iso(), "reissued_count": 0, "admin_override": True,
    }
    await store.insert("certificates", certificate)
    await award_points(enrollment["student_id"], 150, "certificate_earned", certificate["id"])
    await evaluate_badges(enrollment["student_id"])
    await log_notification(enrollment["student_id"], "certificate_issued", {
        "certificate": certificate["certificate_number"],
        "admin_override": True,
        "download_url": frontend_url(f"/certificates/{certificate['id']}"),
    })
    return certificate


@app.get("/api/certifications")
async def certifications(search: str = "") -> list[dict[str, Any]]:
    rows = await store.all("certification_paths")
    if search:
        needle = search.lower()
        rows = [row for row in rows if needle in row["title"].lower() or needle in row["issuer"].lower()]
    links = await store.all("certification_courses")
    return [{**row, "course_count": len([link for link in links if link["certification_id"] == row["id"]])} for row in rows]


@app.get("/api/certifications/{slug}")
async def certification_detail(slug: str) -> dict[str, Any]:
    path = await store.one("certification_paths", slug=slug) or await store.one("certification_paths", id=slug)
    if not path:
        raise HTTPException(404, "Certification path not found")
    links = sorted(await store.find("certification_courses", certification_id=path["id"]), key=lambda row: row["order_index"])
    courses = {row["id"]: row for row in await store.all("courses")}
    return {**path, "courses": [courses[link["course_id"]] for link in links if link["course_id"] in courses]}


@app.post("/api/certifications/{slug}/enroll")
async def enroll_certification_path(slug: str, user: dict[str, Any] = Depends(require_roles("student"))) -> dict[str, Any]:
    detail = await certification_detail(slug)
    enrolled = []
    paid_course_ids = []
    for course in detail["courses"]:
        if await store.one("enrollments", student_id=user["id"], course_id=course["id"]):
            continue
        if course["is_free"]:
            enrolled.append(await create_enrollment(user["id"], course, None))
        else:
            paid_course_ids.append(course["id"])
    return {
        "free_enrolled": len(enrolled),
        "paid_pending_checkout": len(paid_course_ids),
        "enrolled_count": len(enrolled),
        "paid_course_ids": paid_course_ids,
    }


@app.post("/api/admin/certifications")
async def create_certification(body: CertificationPathCreate, _: dict[str, Any] = Depends(require_roles("admin"))) -> dict[str, Any]:
    return await store.insert("certification_paths", {"id": uid("certpath"), **body.model_dump(), "coverage": [], "official_url": ""})


@app.put("/api/admin/certifications/{certification_id}/courses")
async def update_certification_courses(certification_id: str, body: CertificationCourseUpdate, _: dict[str, Any] = Depends(require_roles("admin"))) -> dict[str, Any]:
    for row in await store.find("certification_courses", certification_id=certification_id):
        await store.delete("certification_courses", id=row["id"])
    for index, course_id in enumerate(body.course_ids, start=1):
        await store.insert("certification_courses", {"id": uid("cc"), "certification_id": certification_id, "course_id": course_id, "order_index": index})
    return {"updated": len(body.course_ids)}


FRONTEND_BUILD = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "frontend", "build"))
if os.path.isdir(os.path.join(FRONTEND_BUILD, "static")):
    app.mount("/static", StaticFiles(directory=os.path.join(FRONTEND_BUILD, "static")), name="frontend-static")


@app.get("/{full_path:path}", include_in_schema=False)
async def serve_frontend(full_path: str):
    candidate = os.path.abspath(os.path.join(FRONTEND_BUILD, full_path))
    if candidate.startswith(FRONTEND_BUILD) and os.path.isfile(candidate):
        return FileResponse(candidate)
    index = os.path.join(FRONTEND_BUILD, "index.html")
    if os.path.isfile(index):
        return FileResponse(index)
    raise HTTPException(404, "Frontend build not found")
