import React, {
  Component,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  Navigate,
  NavLink,
  Route,
  Routes,
  useLocation,
  useNavigate,
  useParams,
  useSearchParams,
} from "react-router-dom";
import {
  Award,
  BarChart3,
  Bell,
  BookOpen,
  Bot,
  BrainCircuit,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleDollarSign,
  Clock3,
  CreditCard,
  Download,
  FileQuestion,
  Flame,
  Gauge,
  Code,
  Terminal,
  Palette,
  Database,
  Megaphone,
  Briefcase,
  GraduationCap,
  Home,
  LayoutDashboard,
  Library,
  LogOut,
  Menu,
  MessageCircle,
  Mic,
  Pencil,
  Play,
  Plus,
  Save,
  Search,
  Send,
  Settings,
  ShieldCheck,
  Sparkles,
  Star,
  Target,
  RotateCcw,
  Trash2,
  Trophy,
  Users,
  UsersRound,
  X,
  Zap,
} from "lucide-react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
} from "recharts";
import { useFocusTracker } from "./hooks/useFocusTracker";

const API = process.env.REACT_APP_API_URL || "/api";
const API_ORIGIN = API.replace(/\/api\/?$/, "");
const ENABLE_EXTERNAL_VIDEO =
  process.env.REACT_APP_ENABLE_EXTERNAL_VIDEO !== "false";
const AuthContext = createContext(null);
const courseCategories = {
  Development: [
    "Web Development",
    "Mobile Development",
    "Game Development",
    "Data Structures & Algorithms",
    "Software Testing",
    "DevOps",
    "Cybersecurity",
  ],
  "Data Science": [
    "Python",
    "Machine Learning",
    "Deep Learning",
    "SQL",
    "Power BI",
    "Statistics",
  ],
  Business: [
    "Product Management",
    "Startup Fundamentals",
    "Agile & Scrum",
    "Business Strategy",
  ],
  "Finance & Accounting": [
    "Financial Modelling",
    "Excel",
    "Investing",
    "Accounting",
  ],
  "IT & Software": [
    "Cloud Computing",
    "Cybersecurity",
    "Networking",
    "DevOps",
    "Certification Prep",
  ],
  Design: ["UI/UX Design", "Figma", "Graphic Design", "Video Editing"],
  Marketing: ["Google Ads", "Content Marketing", "Email Marketing", "SEO"],
  "Personal Development": ["Leadership", "Communication", "Productivity"],
  "Office Productivity": ["Excel", "Spreadsheets", "Presentations"],
};
const certificationMenu = {
  "AWS Certifications": ["AWS Certified Solutions Architect"],
  "Microsoft Certifications": [
    "AZ-900: Microsoft Azure Fundamentals",
    "AZ-104: Azure Administrator",
    "PL-300: Power BI Data Analyst",
    "AI-900: Azure AI Fundamentals",
  ],
  "Google Cloud Certifications": ["Google Data Analytics Certificate"],
  "CompTIA Certifications": ["CompTIA Security+"],
  "PMI Certifications": ["PMP: Project Management Professional"],
  "Cisco Certifications": ["Cisco CCNA"],
  "Meta Certifications": ["Meta Front-End Developer Certificate"],
  "Exam Vouchers": ["Certification exam resources"],
};
const certSlugs = {
  "AWS Certified Solutions Architect": "aws-certified-solutions-architect",
  "AZ-900: Microsoft Azure Fundamentals": "az-900-microsoft-azure-fundamentals",
  "Google Data Analytics Certificate": "google-data-analytics-certificate",
  "CompTIA Security+": "comptia-security-plus",
  "PMP: Project Management Professional": "pmp-project-management-professional",
  "Cisco CCNA": "cisco-ccna",
  "Meta Front-End Developer Certificate": "meta-front-end-developer",
};

function mediaUrl(url) {
  if (!url) return "";
  if (url.startsWith("/uploads/")) return `${API_ORIGIN}${url}`;
  return url;
}

function usePageMeta(title, description) {
  useEffect(() => {
    const fullTitle = title ? `${title} | Skill Tank` : "Skill Tank LMS";
    document.title = fullTitle;
    let meta = document.querySelector('meta[name="description"]');
    if (!meta) {
      meta = document.createElement("meta");
      meta.setAttribute("name", "description");
      document.head.appendChild(meta);
    }
    meta.setAttribute(
      "content",
      description ||
        "Skill Tank is a production-ready LMS for courses, quizzes, certificates, AI interviews, and learning reminders.",
    );
  }, [title, description]);
}

function youtubeEmbedUrl(url, resumeSeconds = 0) {
  if (!url) return "";
  let result = url;
  if (url.includes("youtube.com/watch")) {
    const parsed = new URL(url);
    result = `https://www.youtube.com/embed/${parsed.searchParams.get("v") || ""}`;
    parsed.searchParams.forEach((value, key) => {
      if (key !== "v")
        result += `${result.includes("?") ? "&" : "?"}${key}=${encodeURIComponent(value)}`;
    });
  } else if (url.includes("youtu.be/")) {
    const parsed = new URL(url);
    result = `https://www.youtube.com/embed/${parsed.pathname.replace("/", "")}${parsed.search}`;
  }
  if (!result.includes("youtube.com/embed/")) return result;
  const separator = result.includes("?") ? "&" : "?";
  result += `${separator}enablejsapi=1&playsinline=1&rel=0&modestbranding=1&origin=${encodeURIComponent(window.location.origin)}`;
  if (resumeSeconds > 0 && !/[?&]start=/.test(result))
    result += `&start=${Math.floor(resumeSeconds)}`;
  return result;
}

async function request(path, options = {}) {
  const token = localStorage.getItem("skilltank_token");
  const headers = {
    "Content-Type": "application/json",
    ...(options.headers || {}),
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  const response = await fetch(`${API}${path}`, { ...options, headers });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.detail || "Something went wrong");
  }
  return response.json();
}

async function uploadFile(file) {
  const token = localStorage.getItem("skilltank_token");
  const form = new FormData();
  form.append("file", file);
  const response = await fetch(`${API}/uploads`, {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: form,
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.detail || "Upload failed");
  }
  return response.json();
}


function AuthProvider({ children }) {
  const [user, setUser] = useState(() =>
    JSON.parse(localStorage.getItem("skilltank_user") || "null"),
  );
  const [loading, setLoading] = useState(false);
  const login = async (email, password) => {
    setLoading(true);
    try {
      const data = await request("/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });
      localStorage.setItem("skilltank_token", data.access_token);
      localStorage.setItem("skilltank_user", JSON.stringify(data.user));
      setUser(data.user);
      return data.user;
    } finally {
      setLoading(false);
    }
  };
  const signup = async (form) => {
    setLoading(true);
    try {
      const data = await request("/auth/signup", {
        method: "POST",
        body: JSON.stringify(form),
      });
      localStorage.setItem("skilltank_token", data.access_token);
      localStorage.setItem("skilltank_user", JSON.stringify(data.user));
      setUser(data.user);
      return data.user;
    } finally {
      setLoading(false);
    }
  };
  const googleEmergentLogin = async (session_id, role = "student") => {
    setLoading(true);
    try {
      const data = await request("/auth/google-emergent", {
        method: "POST",
        body: JSON.stringify({ session_id, role }),
      });
      localStorage.setItem("skilltank_token", data.access_token);
      localStorage.setItem("skilltank_user", JSON.stringify(data.user));
      setUser(data.user);
      return data.user;
    } finally {
      setLoading(false);
    }
  };
  const logout = () => {
    request("/auth/logout", { method: "POST" }).catch(() => {});
    localStorage.removeItem("skilltank_token");
    localStorage.removeItem("skilltank_user");
    setUser(null);
  };
  return (
    <AuthContext.Provider value={{ user, login, signup, googleEmergentLogin, logout, loading }}>
      {children}
    </AuthContext.Provider>
  );
}

function useAuth() {
  return useContext(AuthContext);
}

function AuthCallback() {
  const { googleEmergentLogin } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState("");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const hashParams = new URLSearchParams(window.location.hash.replace(/^#\/?/, ""));
    const session_id = params.get("session_id") || hashParams.get("session_id");
    const returnTo = params.get("returnTo") || hashParams.get("returnTo") || "";

    if (!session_id) {
      setError("No authentication session found. Please try again.");
      return;
    }
    googleEmergentLogin(session_id)
      .then((u) => {
        const defaultPath =
          u.role === "admin" ? "/admin" : u.role === "instructor" ? "/instructor" : "/dashboard";
        navigate(returnTo || defaultPath, { replace: true });
      })
      .catch((err) => setError(err.message || "Sign in failed. Please try again."));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (error) {
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "100vh", gap: 16 }}>
        <p style={{ color: "#e53e3e" }}>{error}</p>
        <button className="button primary" onClick={() => navigate("/login")}>
          Back to login
        </button>
      </div>
    );
  }
  return <Loading />;
}

function Button({ children, variant = "primary", className = "", ...props }) {
  return (
    <button className={`button ${variant} ${className}`} {...props}>
      {children}
    </button>
  );
}

function BackButton({ to, label = "Back", onBeforeBack }) {
  const navigate = useNavigate();
  return (
    <button
      className="back-button"
      onClick={() => {
        if (onBeforeBack && onBeforeBack() === false) return;
        if (to) navigate(to);
        else navigate(-1);
      }}
    >
      <ChevronLeft size={18} /> {label}
    </button>
  );
}

class CourseErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  componentDidUpdate(previousProps) {
    if (previousProps.resetKey !== this.props.resetKey && this.state.hasError) {
      this.setState({ hasError: false });
    }
  }
  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <PublicPage>
        <main className="friendly-error">
          <BookOpen size={40} />
          <h1>Something went wrong loading this course.</h1>
          <p>The course data could not be rendered safely. Please go back and try another course while we fix it.</p>
          <NavLink className="button primary" to="/courses">Back to courses</NavLink>
        </main>
      </PublicPage>
    );
  }
}

function CourseEditModal({ course, onClose, onSave }) {
  const [form, setForm] = useState(() => ({
    title: course.title || "",
    description: course.description || "",
    category: course.category || "Development",
    price: course.price || 0,
    thumbnail_url: course.thumbnail_url || "",
    learning_outcomes: (course.learning_outcomes || []).join("\n"),
    requirements: (course.requirements || []).join("\n"),
    status: course.status || "draft",
  }));
  const update = (key, value) => setForm((current) => ({ ...current, [key]: value }));
  const submit = (event) => {
    event.preventDefault();
    onSave({
      ...form,
      price: Number(form.price) || 0,
      learning_outcomes: form.learning_outcomes.split("\n").map((item) => item.trim()).filter(Boolean),
      requirements: form.requirements.split("\n").map((item) => item.trim()).filter(Boolean),
    });
  };
  return (
    <div className="modal-backdrop">
      <form className="modal-card course-edit-modal" onSubmit={submit}>
        <header>
          <div>
            <span className="eyebrow">COURSE EDITOR</span>
            <h2>Edit course</h2>
          </div>
          <button type="button" className="icon-button" onClick={onClose}>
            <X size={18} />
          </button>
        </header>
        <label>
          Title
          <input value={form.title} onChange={(e) => update("title", e.target.value)} required />
        </label>
        <label>
          Description
          <textarea value={form.description} onChange={(e) => update("description", e.target.value)} />
        </label>
        <div className="modal-grid">
          <label>
            Category
            <select value={form.category} onChange={(e) => update("category", e.target.value)}>
              {Object.keys(courseCategories).map((category) => (
                <option value={category} key={category}>{category}</option>
              ))}
            </select>
          </label>
          <label>
            Price
            <input type="number" min="0" value={form.price} onChange={(e) => update("price", e.target.value)} />
          </label>
          <label>
            Status
            <select value={form.status} onChange={(e) => update("status", e.target.value)}>
              <option value="draft">Draft</option>
              <option value="published">Published</option>
            </select>
          </label>
        </div>
        <label>
          Thumbnail URL
          <input value={form.thumbnail_url} onChange={(e) => update("thumbnail_url", e.target.value)} />
        </label>
        <label>
          Learning outcomes
          <textarea value={form.learning_outcomes} onChange={(e) => update("learning_outcomes", e.target.value)} />
        </label>
        <label>
          Requirements
          <textarea value={form.requirements} onChange={(e) => update("requirements", e.target.value)} />
        </label>
        <footer>
          <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
          <Button>Save changes</Button>
        </footer>
      </form>
    </div>
  );
}

function ConfirmModal({ title, body, confirmLabel = "Confirm", onCancel, onConfirm }) {
  return (
    <div className="modal-backdrop">
      <div className="modal-card confirm-modal">
        <header>
          <div>
            <span className="eyebrow">CONFIRMATION</span>
            <h2>{title}</h2>
          </div>
        </header>
        <p>{body}</p>
        <footer>
          <Button type="button" variant="ghost" onClick={onCancel}>Cancel</Button>
          <Button type="button" className="danger-action" onClick={onConfirm}>{confirmLabel}</Button>
        </footer>
      </div>
    </div>
  );
}

function CouponEditModal({ coupon, onClose, onSave }) {
  const [discount, setDiscount] = useState(coupon.discount_percent || 10);
  return (
    <div className="modal-backdrop">
      <form
        className="modal-card confirm-modal"
        onSubmit={(event) => {
          event.preventDefault();
          onSave(Number(discount));
        }}
      >
        <header>
          <div>
            <span className="eyebrow">COUPON EDITOR</span>
            <h2>Edit {coupon.code}</h2>
          </div>
        </header>
        <label>
          Discount percent
          <input type="number" min="1" max="100" value={discount} onChange={(e) => setDiscount(e.target.value)} />
        </label>
        <footer>
          <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
          <Button>Save coupon</Button>
        </footer>
      </form>
    </div>
  );
}

function Logo({ compact = false }) {
  return (
    <div className="logo">
      <span className="logo-mark">
        <Zap size={20} fill="currentColor" />
      </span>
      {!compact && (
        <span>
          SKILL<span>TANK</span>
        </span>
      )}
    </div>
  );
}

const studentNav = [
  ["/dashboard", "Overview", Home],
  ["/courses", "Explore courses", Library],
  ["/my-learning", "My learning", BookOpen],
  ["/leaderboard", "Leaderboard", Trophy],
  ["/mock-interview", "AI interview", Bot],
];
const instructorNav = [
  ["/instructor", "Overview", LayoutDashboard],
  ["/instructor/courses", "Course catalog", Library],
  ["/instructor/courses/new", "Create course", Plus],
  ["/instructor/qna", "Learner Q&A", MessageCircle],
];
const adminNav = [
  ["/admin", "Dashboard", ShieldCheck],
  ["/admin/courses", "Courses", BookOpen],
  ["/admin/users", "Users", Users],
  ["/admin/enrollments", "Enrollments", GraduationCap],
  ["/admin/cohorts", "Cohorts", UsersRound],
  ["/admin/operations", "Operations", Settings],
  ["/admin/coupons", "Coupons", CreditCard],
  ["/admin/notifications", "Notifications Log", Bell],
  ["/admin/interviews", "Mock Interviews", Bot],
  ["/admin/attention", "Attention Logs", Target],
  ["/admin/certifications", "Certifications", Award],
];

function Shell({ children, title, eyebrow, action }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [accessMessage, setAccessMessage] = useState(
    () => sessionStorage.getItem("skilltank_access_message") || "",
  );
  useEffect(() => {
    if (accessMessage) {
      sessionStorage.removeItem("skilltank_access_message");
      const timer = setTimeout(() => setAccessMessage(""), 3200);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [accessMessage]);
  const nav =
    user?.role === "admin"
      ? adminNav
      : user?.role === "instructor"
        ? instructorNav
        : studentNav;
  return (
    <div className="app-shell">
      <aside className={`sidebar ${mobileOpen ? "open" : ""}`}>
        <div className="sidebar-head">
          <Logo />
          <button
            className="icon-button mobile-only"
            aria-label="Close navigation"
            onClick={() => setMobileOpen(false)}
          >
            <X size={20} />
          </button>
        </div>
        <div className="sidebar-label">Workspace</div>
        <nav>
          {nav.map(([to, label, Icon]) => (
            <NavLink
              key={to}
              to={to}
              end={
                to === "/dashboard" || to === "/admin" || to === "/instructor"
              }
              onClick={() => setMobileOpen(false)}
            >
              <Icon size={19} />
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-spacer" />
        <nav className="secondary-nav">
          {user?.role === "admin" && (
            <NavLink to="/" onClick={() => setMobileOpen(false)}>
              <ChevronLeft size={19} />
              <span>Back to site</span>
            </NavLink>
          )}
          <NavLink to="/notifications" onClick={() => setMobileOpen(false)}>
            <Bell size={19} />
            <span>Notifications</span>
            <i />
          </NavLink>
          <NavLink to="/settings" onClick={() => setMobileOpen(false)}>
            <Settings size={19} />
            <span>Settings</span>
          </NavLink>
          {user?.role === "admin" && (
            <button
              className="sidebar-logout"
              onClick={() => {
                logout();
                navigate("/login");
              }}
            >
              <LogOut size={19} />
              <span>Logout</span>
            </button>
          )}
        </nav>
        <div className="profile-mini">
          <span className="avatar">
            {user?.avatar ||
              user?.full_name
                ?.split(" ")
                .map((x) => x[0])
                .join("")
                .slice(0, 2)}
          </span>
          <span>
            <strong>{user?.full_name}</strong>
            <small>{user?.role}</small>
          </span>
          <button onClick={logout} title="Sign out">
            <LogOut size={17} />
          </button>
        </div>
      </aside>
      <main className="main">
        <header className="topbar">
          <button
            className="icon-button mobile-only"
            aria-label="Open navigation"
            onClick={() => setMobileOpen(true)}
          >
            <Menu size={21} />
          </button>
          <div>
            <small>{eyebrow}</small>
            <h1>{title}</h1>
          </div>
          <div className="topbar-actions">
            {action}
            {user?.role === "admin" && (
              <Button
                variant="ghost"
                className="admin-topbar-logout"
                onClick={() => {
                  logout();
                  navigate("/login");
                }}
              >
                <LogOut size={16} /> Logout
              </Button>
            )}
            <button
              className="icon-button"
              onClick={() => navigate("/notifications")}
              title="Notifications"
            >
              <Bell size={20} />
              <i />
            </button>
          </div>
        </header>
        <div className="page">{children}</div>
        {accessMessage && (
          <div className="toast">
            <ShieldCheck size={18} /> {accessMessage}
          </div>
        )}
      </main>
    </div>
  );
}

function Protected({ children, roles }) {
  const { user } = useAuth();
  const location = useLocation();
  if (!user) return <Navigate to="/login" state={{ from: location }} replace />;
  if (roles && !roles.includes(user.role)) {
    sessionStorage.setItem(
      "skilltank_access_message",
      "Access denied for this account role.",
    );
    return (
      <Navigate
        to={
          user.role === "admin"
            ? "/admin"
            : user.role === "instructor"
              ? "/instructor"
              : "/dashboard"
        }
        replace
      />
    );
  }
  return children;
}

function MegaMenu({ items, certification = false, close }) {
  const [active, setActive] = useState(Object.keys(items)[0]);
  return (
    <div className="mega-menu">
      <div>
        {Object.keys(items).map((item) => (
          <button
            key={item}
            onMouseEnter={() => setActive(item)}
            onFocus={() => setActive(item)}
          >
            {item}
            <ChevronRight />
          </button>
        ))}
      </div>
      <div>
        <strong>{active}</strong>
        {items[active].map((item) => (
          <NavLink
            key={item}
            onClick={close}
            to={
              certification
                ? `/certifications/${certSlugs[item] || "az-900-microsoft-azure-fundamentals"}`
                : `/courses?category=${encodeURIComponent(active)}&subcategory=${encodeURIComponent(item)}`
            }
          >
            {item}
          </NavLink>
        ))}
      </div>
    </div>
  );
}

function GlobalNav() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState("");
  const [mobile, setMobile] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  useEffect(() => {
    const timer = setTimeout(
      () =>
        query.trim()
          ? request(`/courses/search?q=${encodeURIComponent(query)}`)
              .then(setResults)
              .catch(() => setResults([]))
          : setResults([]),
      180,
    );
    return () => clearTimeout(timer);
  }, [query]);
  const search = (e) => {
    if (e.key === "Enter" && query.trim()) {
      navigate(`/courses?q=${encodeURIComponent(query)}`);
      setResults([]);
    }
  };
  return (
    <header className="global-nav">
      <Logo />
      <button className="mobile-nav-toggle" onClick={() => setMobile(!mobile)}>
        <Menu />
      </button>
      <nav className={mobile ? "open" : ""}>
        <div className="mega-trigger">
          <button onClick={() => setOpen(open === "courses" ? "" : "courses")}>
            Find Courses <ChevronDown />
          </button>
          {open === "courses" && (
            <MegaMenu
              items={courseCategories}
              close={() => {
                setOpen("");
                setMobile(false);
              }}
            />
          )}
        </div>
        <div className="mega-trigger">
          <button onClick={() => setOpen(open === "certs" ? "" : "certs")}>
            Get Certified <ChevronDown />
          </button>
          {open === "certs" && (
            <MegaMenu
              items={certificationMenu}
              certification
              close={() => {
                setOpen("");
                setMobile(false);
              }}
            />
          )}
        </div>
        <NavLink to="/subscribe" onClick={() => setMobile(false)}>
          Subscribe
        </NavLink>
        <div className="global-search">
          <Search />
          <input
            aria-label="Search anything"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={search}
            placeholder="Search anything"
          />
          {results.length > 0 && (
            <div>
              {results.map((row) => (
                <button
                  key={row.id}
                  onClick={() => {
                    navigate(`/courses/${row.id}`);
                    setResults([]);
                    setMobile(false);
                  }}
                >
                  <strong>{row.title}</strong>
                  <small>{row.category}</small>
                </button>
              ))}
            </div>
          )}
        </div>
        {user ? (
          <>
            <NavLink
              to={
                user.role === "admin"
                  ? "/admin"
                  : user.role === "instructor"
                    ? "/instructor"
                    : "/dashboard"
              }
              onClick={() => setMobile(false)}
            >
              Dashboard
            </NavLink>
            <NavLink to="/my-learning" onClick={() => setMobile(false)}>
              My Learning
            </NavLink>
            <NavLink className="nav-icon" to="/notifications">
              <Bell />
            </NavLink>
            <div className="account-menu">
              <button>
                <span className="avatar">{user.avatar}</span>
                <ChevronDown />
              </button>
              <div>
                <NavLink
                  to={
                    user.role === "admin"
                      ? "/admin"
                      : user.role === "instructor"
                        ? "/instructor"
                        : "/dashboard"
                  }
                >
                  Dashboard
                </NavLink>
                <NavLink to="/settings">Settings</NavLink>
                <button
                  onClick={() => {
                    logout();
                    navigate("/login");
                  }}
                >
                  Logout
                </button>
              </div>
            </div>
          </>
        ) : (
          <>
            <NavLink to="/login" onClick={() => setMobile(false)}>
              Login
            </NavLink>
            <Button
              onClick={() => {
                navigate("/signup");
                setMobile(false);
              }}
            >
              Sign Up
            </Button>
          </>
        )}
      </nav>
    </header>
  );
}

function PublicPage({ children }) {
  return (
    <div className="public-page">
      <GlobalNav />
      {children}
    </div>
  );
}

// MOBILE VERIFIED 375px
function Login({ initialMode = "login" }) {
  const { user, login, signup, loading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [form, setForm] = useState({
    email: "student@skilltank.dev",
    password: "demo123",
  });
  const [signupForm, setSignupForm] = useState({
    full_name: "",
    email: "",
    password: "",
    role: "student",
  });
  const [mode, setMode] = useState(initialMode);
  const [error, setError] = useState("");

  const defaultRedirect = (role) =>
    role === "admin" ? "/admin" : role === "instructor" ? "/instructor" : "/dashboard";

  if (user)
    return <Navigate to={location.state?.from?.pathname || defaultRedirect(user.role)} replace />;

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    try {
      const signedIn =
        mode === "login"
          ? await login(form.email, form.password)
          : await signup(signupForm);
      navigate(location.state?.from?.pathname || defaultRedirect(signedIn.role), { replace: true });
    } catch (err) {
      setError(err.message);
    }
  };
  const choose = (role) => {
    const emails = {
      student: "student@skilltank.dev",
      instructor: "instructor@skilltank.dev",
      admin: "admin@skilltank.dev",
    };
    setForm({ email: emails[role], password: "demo123" });
  };
  const continueWithGoogle = () => {
    setError("");
    const returnTo = location.state?.from?.pathname || "";
    const callbackUrl = `${window.location.origin}/auth/callback${returnTo ? `?returnTo=${encodeURIComponent(returnTo)}` : ""}`;
    window.location.href = `https://auth.emergentagent.com/?redirect=${encodeURIComponent(callbackUrl)}`;
  };
  return (
    <div className="login-page">
      <section className="login-story">
        <Logo />
        <div className="story-copy">
          <span className="pill dark">
            <Sparkles size={14} /> Learning that compounds
          </span>
          <h1>
            Turn curiosity into
            <br />
            <em>career momentum.</em>
          </h1>
          <p>
            Master practical skills, prove what you know, and see exactly how
            close you are to job-ready.
          </p>
        </div>
        <div className="story-metrics">
          <div>
            <strong>10k+</strong>
            <span>active learners</span>
          </div>
          <div>
            <strong>92%</strong>
            <span>completion uplift</span>
          </div>
          <div>
            <strong>4.9</strong>
            <span>learner rating</span>
          </div>
        </div>
      </section>
      <section className="login-panel">
        <button
          type="button"
          className="login-back-btn"
          data-testid="login-back-home-btn"
          onClick={() => navigate("/")}
        >
          <ChevronLeft size={18} /> Back to home
        </button>
        <form onSubmit={submit}>
          <span className="eyebrow">
            {mode === "login" ? "WELCOME BACK" : "CREATE YOUR ACCOUNT"}
          </span>
          <h2>
            {mode === "login"
              ? "Sign in to SKILLTANK"
              : "Start building momentum"}
          </h2>
          <p>
            {mode === "login"
              ? "Use a demo role or enter your account details."
              : "Students and instructors can create accounts. Admins are seeded only."}
          </p>
          {mode === "login" && (
            <div className="demo-switch">
              {["student", "instructor", "admin"].map((role) => (
                <button
                  type="button"
                  key={role}
                  onClick={() => choose(role)}
                  className={form.email.startsWith(role) ? "active" : ""}
                >
                  {role}
                </button>
              ))}
            </div>
          )}
          {mode === "signup" && (
            <label>
              Full name
              <input
                value={signupForm.full_name}
                onChange={(e) =>
                  setSignupForm({ ...signupForm, full_name: e.target.value })
                }
                required
              />
            </label>
          )}
          <label>
            Email
            <input
              value={mode === "login" ? form.email : signupForm.email}
              onChange={(e) =>
                mode === "login"
                  ? setForm({ ...form, email: e.target.value })
                  : setSignupForm({ ...signupForm, email: e.target.value })
              }
              type="email"
              required
            />
          </label>
          <label>
            Password
            <input
              value={mode === "login" ? form.password : signupForm.password}
              onChange={(e) =>
                mode === "login"
                  ? setForm({ ...form, password: e.target.value })
                  : setSignupForm({ ...signupForm, password: e.target.value })
              }
              type="password"
              required
            />
          </label>
          {mode === "signup" && (
            <label>
              Role
              <select
                value={signupForm.role}
                onChange={(e) =>
                  setSignupForm({ ...signupForm, role: e.target.value })
                }
              >
                <option value="student">Student</option>
                <option value="instructor">Instructor</option>
              </select>
            </label>
          )}
          {error && <div className="error">{error}</div>}
          <Button disabled={loading}>
            {loading
              ? "Please wait…"
              : mode === "login"
                ? "Enter your workspace"
                : "Create account"}{" "}
            <ChevronRight size={18} />
          </Button>
          <div className="oauth-divider"><span>or</span></div>
          <button type="button" className="google-auth-button" onClick={continueWithGoogle}>
            <span>G</span> Continue with Google
          </button>
          <button
            type="button"
            className="mode-link"
            onClick={() => {
              setMode(mode === "login" ? "signup" : "login");
              setError("");
            }}
          >
            {mode === "login"
              ? "Need an account? Sign up"
              : "Already have an account? Sign in"}
          </button>
          {mode === "login" && (
            <small className="form-note">
              All demo accounts use password <strong>demo123</strong>
            </small>
          )}
        </form>
      </section>
    </div>
  );
}

// MOBILE VERIFIED 375px
function Landing() {
  usePageMeta(
    "Online courses, certificates, and AI interview practice",
    "Browse Skill Tank courses, learn with video lessons, pass quizzes, earn certificates, and practice role-based AI mock interviews.",
  );
  const navigate = useNavigate();
  const [courses, setCourses] = useState([]);
  const [certs, setCerts] = useState([]);
  const [landingFilter, setLandingFilter] = useState({ category: "", price: "", rating: "" });
  useEffect(() => {
    Promise.all([
      request("/courses?sort=popular&limit=60"),
      request("/certifications"),
    ]).then(([courseRows, certRows]) => {
      setCourses(courseRows);
      setCerts(certRows);
    });
  }, []);
  const applyLandingFilter = () => {
    const params = new URLSearchParams();
    if (landingFilter.category) params.set("category", landingFilter.category);
    if (landingFilter.price) params.set("price", landingFilter.price);
    if (landingFilter.rating) params.set("rating", landingFilter.rating);
    navigate(`/courses?${params.toString()}`);
  };
  const filteredCourses = courses.filter((c) => {
    if (landingFilter.price === "free" && !c.is_free) return false;
    if (landingFilter.price === "paid" && c.is_free) return false;
    if (landingFilter.rating && c.rating_avg < parseFloat(landingFilter.rating)) return false;
    if (landingFilter.category && !c.category.toLowerCase().includes(landingFilter.category.toLowerCase())) return false;
    return true;
  });
  const rows = (category) =>
    filteredCourses
      .filter((course) =>
        course.category.toLowerCase().includes(category.toLowerCase()),
      )
      .slice(0, 6);
  return (
    <PublicPage>
      <main className="udemy-home">
        <section className="udemy-hero">
          <div>
            <span className="pill dark">
              <Sparkles /> Skills that move with you
            </span>
            <h1>Learn without limits</h1>
            <p>
              Start, switch, or advance your career with thousands of courses
              from expert instructors.
            </p>
            <div>
              <Button onClick={() => navigate("/courses")}>
                Explore Courses
              </Button>
              <Button variant="ghost" onClick={() => navigate("/subscribe")}>
                Try Skill Tank Pro
              </Button>
            </div>
          </div>
          <div className="hero-course-stack">
            {courses.slice(0, 3).map((course, index) => (
              <article key={course.id} style={{ "--index": index }}>
                <img src={course.thumbnail_url} alt="" />
                <span>
                  <strong>{course.title}</strong>
                  <small>
                    {course.rating_avg} ★ ·{" "}
                    {course.enrollment_count.toLocaleString()} students
                  </small>
                </span>
              </article>
            ))}
          </div>
        </section>
        <div className="landing-filter-bar">
          <select
            value={landingFilter.category}
            onChange={(e) => setLandingFilter((f) => ({ ...f, category: e.target.value }))}
            data-testid="landing-category-filter"
          >
            <option value="">All Categories</option>
            {["Development", "Data Science", "Design", "Business", "Marketing", "IT & Software", "Finance", "Personal Development"].map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
          <select
            value={landingFilter.price}
            onChange={(e) => setLandingFilter((f) => ({ ...f, price: e.target.value }))}
            data-testid="landing-price-filter"
          >
            <option value="">All Prices</option>
            <option value="free">Free</option>
            <option value="paid">Paid</option>
          </select>
          <select
            value={landingFilter.rating}
            onChange={(e) => setLandingFilter((f) => ({ ...f, rating: e.target.value }))}
            data-testid="landing-rating-filter"
          >
            <option value="">Any Rating</option>
            <option value="4.5">4.5+ stars</option>
            <option value="4">4+ stars</option>
            <option value="3.5">3.5+ stars</option>
          </select>
          <button className="button primary" onClick={applyLandingFilter} data-testid="landing-filter-apply">
            Find Courses
          </button>
        </div>
        <div className="category-strip">
          {[
            "Development",
            "Data Science",
            "Design",
            "Business",
            "Marketing",
            "IT & Software",
            "Finance",
            "Personal Development",
          ].map((category) => (
            <button
              key={category}
              onClick={() =>
                navigate(`/courses?category=${encodeURIComponent(category)}`)
              }
            >
              {category}
            </button>
          ))}
        </div>
        <section className="home-section">
          <SectionHead
            title="Prepare for top industry certifications"
            sub="Focused learning paths for the credentials employers recognise."
            action={
              <button onClick={() => navigate("/certifications")}>
                View all <ChevronRight />
              </button>
            }
          />
          <div className="horizontal-cards certification-strip">
            {certs.slice(0, 6).map((cert) => (
              <article key={cert.id}>
                <span className="issuer-mark">
                  {cert.issuer.slice(0, 2).toUpperCase()}
                </span>
                <small>{cert.issuer}</small>
                <h3>{cert.title}</h3>
                <p>
                  {cert.course_count} courses · {cert.estimated_hours} hours
                </p>
                <button
                  onClick={() => navigate(`/certifications/${cert.slug}`)}
                >
                  Prepare now <ChevronRight />
                </button>
              </article>
            ))}
          </div>
        </section>
        <CourseCarousel
          title="Most Popular Courses"
          courses={courses}
          navigate={navigate}
        />
        <CourseCarousel
          title="Top Rated in Development"
          courses={rows("Development")}
          navigate={navigate}
        />
        <CourseCarousel
          title="Popular in Data Science"
          courses={rows("Data")}
          navigate={navigate}
        />
        <CourseCarousel
          title="Build Business Skills"
          courses={rows("Business")}
          navigate={navigate}
        />
        <section className="social-proof">
          {[
            ["50,000+", "students"],
            ["200+", "courses"],
            ["50+", "expert instructors"],
            ["Industry-recognized", "certificates"],
          ].map(([value, label]) => (
            <div key={label}>
              <strong>{value}</strong>
              <span>{label}</span>
            </div>
          ))}
        </section>
        <section className="device-section">
          <div className="phone-mock">
            <div>
              <Zap />
              <strong>SKILL TANK</strong>
              <span>Focus: 94%</span>
              <i />
            </div>
          </div>
          <div>
            <span className="eyebrow">LEARN ON ANY DEVICE</span>
            <h2>Keep momentum wherever you are.</h2>
            <p>
              Responsive lessons, resume-from-last-position playback,
              downloadable resources, and focus tracking help every study
              session count.
            </p>
            <Button onClick={() => navigate("/courses")}>Start learning</Button>
          </div>
        </section>
      </main>
      <footer className="global-footer">
        <Logo />
        <div>
          {["About", "Careers", "Blog", "Help", "Privacy Policy", "Terms"].map(
            (item) => (
              <a
                href={`#${item.toLowerCase().replaceAll(" ", "-")}`}
                key={item}
              >
                {item}
              </a>
            ),
          )}
        </div>
        <span>© 2026 Skill Tank · English</span>
      </footer>
    </PublicPage>
  );
}

function CourseCarousel({ title, courses, navigate }) {
  return (
    <section className="home-section">
      <SectionHead
        title={title}
        sub="Learn from practical, project-led courses."
      />
      <div className="horizontal-cards popular-strip">
        {courses.map((course, index) => (
          <article
            key={course.id}
            onClick={() => navigate(`/courses/${course.id}`)}
          >
            <img src={course.thumbnail_url} alt="" />
            <div>
              {index < 3 && <b className="bestseller">Bestseller</b>}
              <h3>{course.title}</h3>
              <small>{course.instructor_name}</small>
              <span className="rating-stars">
                ★★★★★ <b>{course.rating_avg}</b>
              </span>
              <strong>{course.is_free ? "Free" : `₹${course.price}`}</strong>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function StatCard({ icon: Icon, label, value, note, color = "green" }) {
  return (
    <div className="stat-card">
      <span className={`stat-icon ${color}`}>
        <Icon size={21} />
      </span>
      <div>
        <small>{label}</small>
        <strong>{value}</strong>
        <span>{note}</span>
      </div>
    </div>
  );
}

function ProgressRing({ value, size = 150, label = "Job ready" }) {
  return (
    <div
      className="progress-ring"
      style={{ "--value": `${value * 3.6}deg`, width: size, height: size }}
    >
      <div>
        <strong>{value}</strong>
        <small>/100</small>
        <span>{label}</span>
      </div>
    </div>
  );
}

function CourseCard({ course, enrolled, onEnroll }) {
  const navigate = useNavigate();
  return (
    <article className="course-card">
      <div
        className="course-art has-image"
        style={{
          backgroundColor: course.thumbnail_color,
          backgroundImage: `linear-gradient(180deg, transparent 45%, rgba(7,18,24,.45)), url(${mediaUrl(course.thumbnail_url || "/images/courses/development.jpg")})`,
        }}
      >
        <span>{course.category}</span>
        <BookOpen size={42} strokeWidth={1.3} />
        <button
          aria-label={`View course details for ${course.title}`}
          onClick={() => navigate(`/courses/${course.id}`)}
        >
          <ChevronRight size={19} />
        </button>
      </div>
      <div className="course-body">
        <div className="course-meta">
          <span>{course.level}</span>
          <span>
            <Star size={14} fill="currentColor" /> {course.rating_avg}
          </span>
        </div>
        <h3>{course.title}</h3>
        <p>By {course.instructor_name}</p>
        <div className="course-footer">
          <span>
            <Clock3 size={15} /> {course.duration}
          </span>
          <strong>{course.is_free ? "Free" : `₹${course.price}`}</strong>
        </div>
        {onEnroll && (
          <Button
            variant={enrolled ? "soft" : "primary"}
            onClick={() =>
              enrolled ? navigate("/my-learning") : onEnroll(course)
            }
          >
            {enrolled ? "View learning" : "Enroll now"}
          </Button>
        )}
      </div>
    </article>
  );
}

// MOBILE VERIFIED 375px
function StudentDashboard() {
  usePageMeta(
    "Student dashboard",
    "Track enrolled courses, lesson progress, certificates, cohorts, badges, and learning reminders in Skill Tank.",
  );
  const { user } = useAuth();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  useEffect(() => {
    request("/dashboard").then(setData);
  }, []);
  if (!data) return <Loading />;
  const active = data.enrollments.filter((e) => e.status === "active");
  const completed = data.enrollments.filter((e) => e.status === "completed");
  const score = data.readiness?.score || 0;
  return (
    <Shell
      title={`Good ${new Date().getHours() < 12 ? "morning" : "afternoon"}, ${user.full_name.split(" ")[0]}`}
      eyebrow="STUDENT DASHBOARD"
      action={
        <Button onClick={() => navigate("/courses")}>
          <Plus size={17} /> Find a course
        </Button>
      }
    >
      {data.cohorts?.map((cohort) => (
        <div className="cohort-membership" key={cohort.id}>
          🎓{" "}
          <span>
            You're enrolled via: <strong>{cohort.name}</strong> —{" "}
            {cohort.organization_name}
          </span>
        </div>
      ))}
      <section className="hero-grid">
        <div className="readiness-card">
          <div>
            <span className="eyebrow">CAREER READINESS</span>
            <h2>Your skills are taking shape.</h2>
            <p>
              You're making strong progress. Complete one more course and
              sharpen your interview stories to reach the next tier.
            </p>
            <div className="inline-actions">
              <Button onClick={() => navigate("/mock-interview")}>
                Practice interview
              </Button>
              <Button
                variant="ghost"
                onClick={() =>
                  downloadCard("readiness-share", "skilltank-readiness.pdf")
                }
              >
                <Download size={17} /> Share card
              </Button>
            </div>
          </div>
          <div id="readiness-share" className="share-card">
            <ProgressRing
              value={score}
              label={
                score >= 80
                  ? "Job ready"
                  : score >= 60
                    ? "Almost there"
                    : "Building"
              }
            />
            <span>Top 18% this month</span>
          </div>
        </div>
        <div className="streak-card">
          <span className="flame">
            <Flame fill="currentColor" />
          </span>
          <strong>7 day streak</strong>
          <p>Keep showing up. Your longest streak is 12 days.</p>
          <div className="week">
            {["M", "T", "W", "T", "F", "S", "S"].map((x, i) => (
              <span className={i < 5 ? "done" : i === 5 ? "today" : ""} key={i}>
                {x}
              </span>
            ))}
          </div>
        </div>
      </section>
      <section className="stats-grid">
        <StatCard
          icon={BookOpen}
          label="Courses in progress"
          value={active.length}
          note="Keep the rhythm"
        />
        <StatCard
          icon={CheckCircle2}
          label="Completed"
          value={completed.length}
          note="Skills banked"
          color="purple"
        />
        <StatCard
          icon={Award}
          label="Certificates"
          value={data.certificates.length}
          note="Ready to share"
          color="yellow"
        />
        <StatCard
          icon={Target}
          label="Average focus"
          value={`${data.average_focus}%`}
          note="Across learning sessions"
          color="blue"
        />
      </section>
      <SectionHead
        title="Continue learning"
        sub="Pick up exactly where you left off."
        action={
          <button onClick={() => navigate("/my-learning")}>
            View all <ChevronRight size={16} />
          </button>
        }
      />
      <div className="continue-grid">
        {active.map((e) => (
          <ContinueCard key={e.id} enrollment={e} />
        ))}
      </div>
      <section className="two-column">
        <div className="panel">
          <SectionHead
            title="Readiness breakdown"
            sub="What shapes your score."
          />
          <div className="breakdown-list">
            {Object.entries(data.readiness.breakdown || {}).map(
              ([key, value]) => (
                <div key={key}>
                  <span>{key.replaceAll("_", " ")}</span>
                  <div>
                    <i style={{ width: `${value}%` }} />
                  </div>
                  <strong>{value}</strong>
                </div>
              ),
            )}
          </div>
        </div>
        <div className="panel">
          <SectionHead title="Recent achievements" sub="Small wins, visible." />
          <div className="achievement-list">
            {data.badges.map((b) => (
              <div className="earned" key={b.id}>
                <span>{b.icon}</span>
                <div>
                  <strong>{b.name}</strong>
                  <small>
                    Earned {b.awarded_at ? new Date(b.awarded_at).toLocaleDateString() : "recently"}
                  </small>
                </div>
                <CheckCircle2 size={18} />
              </div>
            ))}
          </div>
        </div>
      </section>
      <section className="panel interview-history">
        <SectionHead
          title="Mock interview history"
          sub="Your saved reports and scores."
          action={
            <button onClick={() => navigate("/mock-interview")}>
              Practice again <ChevronRight size={16} />
            </button>
          }
        />
        {data.interviews.length ? (
          data.interviews
            .slice()
            .reverse()
            .map((item) => (
              <div key={item.id}>
                <span>
                  <Bot />
                  <strong>{item.job_role}</strong>
                </span>
                <p>{item.feedback_text}</p>
                <b>{item.score_percent}%</b>
                <small>{new Date(item.created_at).toLocaleDateString()}</small>
              </div>
            ))
        ) : (
          <p className="empty">
            Complete your first mock interview to see a report here.
          </p>
        )}
      </section>
    </Shell>
  );
}

function ContinueCard({ enrollment }) {
  const navigate = useNavigate();
  const c = enrollment.course;
  if (!c) return null;
  return (
    <div className="continue-card">
      <div className="continue-art" style={{ background: c.thumbnail_color }}>
        <BookOpen size={28} />
      </div>
      <div>
        <span>{c.category}</span>
        <h3>{c.title}</h3>
        <div className="progress-line">
          <i style={{ width: `${enrollment.progress_percent}%` }} />
        </div>
        <small>{enrollment.progress_percent}% complete</small>
      </div>
      <button
        aria-label={`Continue ${c.title}`}
        onClick={() =>
          navigate(
            `/learn/${c.id}/${enrollment.last_lesson_id || `les_${c.id}_1_1`}`,
          )
        }
      >
        <Play size={18} fill="currentColor" />
      </button>
    </div>
  );
}

function SectionHead({ title, sub, action }) {
  return (
    <div className="section-head">
      <div>
        <h2>{title}</h2>
        {sub && <p>{sub}</p>}
      </div>
      {action}
    </div>
  );
}

// MOBILE VERIFIED 375px
function Catalog() {
  usePageMeta(
    "Course catalog",
    "Search Skill Tank courses by category, level, rating, price, and career outcome.",
  );
  const [searchParams] = useSearchParams();
  const [courses, setCourses] = useState([]);
  const [filters, setFilters] = useState({
    search: searchParams.get("q") || searchParams.get("search") || "",
    category: searchParams.get("category") || "",
    subcategory: searchParams.get("subcategory") || "",
    price: "",
    level: "",
  });
  const [enrolledIds, setEnrolledIds] = useState([]);
  const [checkoutCourse, setCheckoutCourse] = useState(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const { user } = useAuth();

  // Sync filters when URL params change (e.g. MegaMenu navigation)
  useEffect(() => {
    setFilters((prev) => ({
      ...prev,
      search: searchParams.get("q") || searchParams.get("search") || "",
      category: searchParams.get("category") || "",
      subcategory: searchParams.get("subcategory") || "",
    }));
  }, [searchParams]);
  useEffect(() => {
    request(
      `/catalog?search=${encodeURIComponent(filters.search)}&category=${encodeURIComponent(filters.category)}&subcategory=${encodeURIComponent(filters.subcategory)}&price=${filters.price}&level=${filters.level}`,
    ).then(setCourses);
  }, [filters]);
  useEffect(() => {
    if (user?.role === "student")
      request("/dashboard").then((d) =>
        setEnrolledIds(d.enrollments.map((e) => e.course_id)),
      );
  }, [user?.role]);
  const enroll = async (course) => {
    if (!course.is_free) {
      setCheckoutCourse(course);
      return;
    } else await request(`/enroll/${course.id}`, { method: "POST" });
    setEnrolledIds([...enrolledIds, course.id]);
  };
  return (
    <PublicPage>
      <main className="catalog-page">
        <div className="catalog-hero">
          <span className="eyebrow">BUILD WHAT'S NEXT</span>
          <h2>
            Skills for the work
            <br />
            you want to do.
          </h2>
          <p>Practical, guided learning from people who have done the work.</p>
        </div>
        <button
          className="mobile-filter-button"
          onClick={() => setFiltersOpen(true)}
        >
          <Search size={17} /> Search & filters
        </button>
        <div
          className={`filter-bar ${filtersOpen ? "mobile-filter-open" : ""}`}
        >
          <label>
            <Search size={18} />
            <input
              placeholder="Search courses, skills, topics…"
              value={filters.search}
              onChange={(e) =>
                setFilters({ ...filters, search: e.target.value })
              }
            />
          </label>
          <select
            value={filters.category}
            onChange={(e) =>
              setFilters({ ...filters, category: e.target.value, subcategory: "" })
            }
          >
            <option value="">All categories</option>
            {Object.keys(courseCategories).map((category) => (
              <option key={category}>{category}</option>
            ))}
          </select>
          <select
            value={filters.subcategory}
            onChange={(e) =>
              setFilters({ ...filters, subcategory: e.target.value })
            }
          >
            <option value="">All topics</option>
            {(courseCategories[filters.category] || []).map((item) => (
              <option key={item}>{item}</option>
            ))}
          </select>
          <select
            value={filters.price}
            onChange={(e) => setFilters({ ...filters, price: e.target.value })}
          >
            <option value="">Any price</option>
            <option value="free">Free</option>
            <option value="paid">Paid</option>
          </select>
          <select
            value={filters.level}
            onChange={(e) => setFilters({ ...filters, level: e.target.value })}
          >
            <option value="">Any level</option>
            <option>Beginner</option>
            <option>Intermediate</option>
            <option>Advanced</option>
          </select>
          <Button className="mobile-only" onClick={() => setFiltersOpen(false)}>
            Show courses
          </Button>
        </div>
        <SectionHead
          title={`${courses.length} courses`}
          sub="Curated for practical outcomes."
        />
        <div className="course-grid">
          {courses.map((c) => (
            <CourseCard
              key={c.id}
              course={c}
              enrolled={enrolledIds.includes(c.id)}
              onEnroll={user?.role === "student" ? enroll : null}
            />
          ))}
        </div>
        {checkoutCourse && (
          <CheckoutModal
            course={checkoutCourse}
            onClose={() => setCheckoutCourse(null)}
          />
        )}
      </main>
    </PublicPage>
  );
}

function CheckoutModal({ course, onClose }) {
  const [coupon, setCoupon] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const checkout = async () => {
    setLoading(true);
    setError("");
    try {
      const result = await request("/payments/checkout", {
        method: "POST",
        body: JSON.stringify({ course_id: course.id, coupon }),
      });
      window.location.assign(result.checkout_url);
    } catch (err) {
      setError(err.message);
      setLoading(false);
    }
  };
  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div className="checkout-modal" onMouseDown={(e) => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose}>
          <X />
        </button>
        <span className="checkout-icon">
          <CreditCard />
        </span>
        <span className="eyebrow">STRIPE TEST MODE</span>
        <h2>Complete your enrollment</h2>
        <p>{course.title}</p>
        <div className="checkout-price">
          <strong>₹{course.price}</strong>
          <span>One-time sandbox payment</span>
        </div>
        <label>
          Coupon code
          <input
            value={coupon}
            onChange={(e) => setCoupon(e.target.value.toUpperCase())}
            placeholder="Try LEARN20"
          />
        </label>
        {error && <div className="error">{error}</div>}
        <Button onClick={checkout} disabled={loading}>
          {loading ? "Opening Stripe…" : "Continue to Stripe Checkout"}{" "}
          <ChevronRight />
        </Button>
        <small>
          Test card: 4242 4242 4242 4242 · any future expiry · any CVC
        </small>
      </div>
    </div>
  );
}

function CheckoutSuccess() {
  const navigate = useNavigate();
  const [state, setState] = useState({ loading: true });
  useEffect(() => {
    const session = new URLSearchParams(window.location.search).get(
      "session_id",
    );
    if (!session)
      return setState({ loading: false, error: "Missing checkout session" });
    request(`/payments/confirm/${session}`)
      .then((data) => setState({ loading: false, data }))
      .catch((error) => setState({ loading: false, error: error.message }));
  }, []);
  return (
    <Shell title="Payment confirmation" eyebrow="STRIPE TEST MODE">
      <div className="success-state payment-success">
        {state.loading ? (
          <>
            <span>
              <CreditCard />
            </span>
            <h2>Confirming your payment…</h2>
          </>
        ) : state.error ? (
          <>
            <span className="error-icon">
              <X />
            </span>
            <h2>We could not confirm the payment</h2>
            <p>{state.error}</p>
            <Button onClick={() => navigate("/courses")}>
              Return to courses
            </Button>
          </>
        ) : (
          <>
            <span>
              <CheckCircle2 />
            </span>
            <h2>Enrollment confirmed</h2>
            <p>
              Your Stripe sandbox payment succeeded and the course is now in My
              Learning.
            </p>
            <Button onClick={() => navigate("/my-learning")}>
              Start learning
            </Button>
          </>
        )}
      </div>
    </Shell>
  );
}

// MOBILE VERIFIED 375px
function CourseDetail() {
  usePageMeta(
    "Course details",
    "Review the course syllabus, instructor, lessons, ratings, price, and enrollment options on Skill Tank.",
  );
  const { id } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [course, setCourse] = useState(null);
  const [open, setOpen] = useState([0]);
  const [related, setRelated] = useState([]);
  const [qna, setQna] = useState([]);
  const [question, setQuestion] = useState("");
  const [review, setReview] = useState({ rating: 5, comment: "" });
  const [enrolled, setEnrolled] = useState(false);
  const [checkout, setCheckout] = useState(false);
  const refresh = useCallback(
    () =>
      request(`/courses/${id}`).then((row) => {
        setCourse(row);
        request(`/catalog?category=${encodeURIComponent(row.category)}`).then(
          (items) =>
            setRelated(items.filter((item) => item.id !== row.id).slice(0, 6)),
        );
      }),
    [id],
  );
  useEffect(() => {
    refresh();
    request(`/courses/${id}/qna`).then(setQna);
    if (user?.role === "student")
      request("/dashboard").then((d) =>
        setEnrolled(d.enrollments.some((e) => e.course_id === id)),
      );
  }, [id, user?.role, refresh]);
  if (!course) return <Loading />;
  const modules = Array.isArray(course.modules) ? course.modules : [];
  const reviews = Array.isArray(course.reviews) ? course.reviews : [];
  const firstLesson = modules.flatMap((module) => module.lessons || [])[0];
  const lessons = modules.reduce((n, m) => n + (m.lessons || []).length, 0);
  const totalMinutes = modules
    .flatMap((module) => module.lessons || [])
    .reduce((sum, lesson) => sum + Math.round((lesson.duration_seconds || 0) / 60), 0);
  const ratingCounts = [5, 4, 3, 2, 1].map((star) => ({
    star,
    count: reviews.filter((item) => item.rating === star).length,
  }));
  const enroll = async () => {
    if (!user) return navigate("/login", { state: { from: location } });
    if (!course.is_free) return setCheckout(true);
    await request(`/enroll/${course.id}`, { method: "POST" });
    setEnrolled(true);
    if (firstLesson) navigate(`/learn/${course.id}/${firstLesson.id}`);
    else navigate("/my-learning");
  };
  const submitReview = async (e) => {
    e.preventDefault();
    await request(`/courses/${course.id}/reviews`, {
      method: "POST",
      body: JSON.stringify(review),
    });
    setReview({ rating: 5, comment: "" });
    refresh();
  };
  const ask = async (e) => {
    e.preventDefault();
    const row = await request(`/courses/${course.id}/qna`, {
      method: "POST",
      body: JSON.stringify({ question_text: question }),
    });
    setQna([...qna, row]);
    setQuestion("");
  };
  return (
    <PublicPage>
      <main className="udemy-detail">
        <BackButton to="/courses" />
        <section className="course-dark-hero">
          <div>
            <span className="bestseller">Bestseller</span>
            <h1>{course.title}</h1>
            <p>{course.description}</p>
            <div className="detail-meta">
              <span>
                <Star fill="currentColor" /> {course.rating_avg} (
                {reviews.length} ratings)
              </span>
              <span>
                <Users /> {course.enrollment_count.toLocaleString()} students
              </span>
            </div>
            <div className="course-badges">
              <span>🏆 Bestseller</span>
              <span>🆕 Updated June 2026</span>
              <span>🌐 English</span>
              <span>📱 Mobile-friendly</span>
            </div>
            <p>
              Created by <a href="#instructor">{course.instructor_name}</a>
            </p>
          </div>
        </section>
        <aside className="purchase-panel">
          <button
            className="preview-thumb"
            onClick={() =>
              firstLesson?.video_url &&
              window.open(youtubeEmbedUrl(firstLesson.video_url), "_blank")
            }
            style={{ backgroundImage: `url(${course.thumbnail_url})` }}
          >
            <Play fill="currentColor" /> Preview this course
          </button>
          <strong>{course.is_free ? "FREE" : `₹${course.price}`}</strong>
          {!course.is_free && <del>₹{course.original_price || 4999}</del>}
          <label>
            <input placeholder="Coupon code" />
            <button>Apply</button>
          </label>
          <Button onClick={enrolled ? () => navigate("/my-learning") : enroll}>
            {enrolled
              ? "Continue Learning"
              : course.is_free
                ? "Enroll Now"
                : "Buy Now"}
          </Button>
          <Button
            variant="ghost"
            onClick={() =>
              firstLesson?.video_url &&
              window.open(youtubeEmbedUrl(firstLesson.video_url), "_blank")
            }
            disabled={!firstLesson?.video_url}
          >
            Try free preview
          </Button>
          <small>30-Day Money-Back Guarantee</small>
          <h4>This course includes:</h4>
          <ul>
            <li>✓ {course.total_hours || 10} hours on-demand video</li>
            <li>✓ {lessons} downloadable resources</li>
            <li>✓ Full lifetime access</li>
            <li>✓ Certificate of completion</li>
            <li>✓ AI Mock Interview prep</li>
          </ul>
        </aside>
        <div className="course-detail-body">
          <section className="panel outcomes-panel">
            <h2>What you'll learn</h2>
            <div>
              {(course.learning_outcomes || []).map((item) => (
                <p key={item}>
                  <Check /> {item}
                </p>
              ))}
            </div>
          </section>
          <section>
            <h2>Requirements</h2>
            <ul className="requirements">
              {(course.requirements || []).map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </section>
          <section className="course-content">
            <div className="content-heading">
              <div>
                <h2>Course content</h2>
                <p>
                  {modules.length} sections · {lessons} lectures ·{" "}
                  {Math.floor(totalMinutes / 60)}h {totalMinutes % 60}m total
                  length
                </p>
              </div>
              <button
                onClick={() =>
                  setOpen(
                    open.length === modules.length
                      ? []
                      : modules.map((_, index) => index),
                  )
                }
              >
                Expand all sections
              </button>
            </div>
            <div className="curriculum">
              {modules.map((module, moduleIndex) => (
                <div key={module.id}>
                  <button
                    onClick={() =>
                      setOpen(
                        open.includes(moduleIndex)
                          ? open.filter((index) => index !== moduleIndex)
                          : [...open, moduleIndex],
                      )
                    }
                  >
                    <span>
                      <strong>{module.title}</strong>
                      <small>
                        {(module.lessons || []).length} lectures ·{" "}
                        {Math.round(
                          (module.lessons || []).reduce(
                            (sum, lesson) => sum + (lesson.duration_seconds || 0),
                            0,
                          ) / 60,
                        )}{" "}
                        min
                      </small>
                    </span>
                    <ChevronDown
                      className={open.includes(moduleIndex) ? "rotate" : ""}
                    />
                  </button>
                  {open.includes(moduleIndex) && (
                    <div className="lesson-list">
                      {(module.lessons || []).map((lesson, lessonIndex) => (
                        <div key={lesson.id}>
                          <Play />
                          <span>{lesson.title}</span>
                          {moduleIndex === 0 && lessonIndex < 2 ? (
                            <button className="preview-link">Preview</button>
                          ) : (
                            !enrolled && <span>🔒</span>
                          )}
                          <small>
                            {Math.floor((lesson.duration_seconds || 0) / 60)}:
                            {String((lesson.duration_seconds || 0) % 60).padStart(
                              2,
                              "0",
                            )}
                          </small>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </section>
          <section id="instructor" className="instructor-profile">
            <h2>Instructor</h2>
            <h3>{course.instructor_name}</h3>
            <p>Senior practitioner and Skill Tank instructor</p>
            <div>
              <span className="avatar">
                {course.instructor_name
                  .split(" ")
                  .map((part) => part[0])
                  .join("")}
              </span>
              <ul>
                <li>★ {course.rating_avg} instructor rating</li>
                <li>{course.reviews.length}+ reviews</li>
                <li>{course.enrollment_count.toLocaleString()} students</li>
                <li>12 courses</li>
              </ul>
            </div>
            <p>
              {course.instructor_name} teaches practical, career-focused
              workflows built from real projects. Every lesson connects
              foundational ideas to professional decisions, repeatable
              techniques, and portfolio evidence.
            </p>
          </section>
          <section className="reviews-section">
            <h2>Student feedback</h2>
            <div className="rating-breakdown">
              <strong>{course.rating_avg}</strong>
              <span>★★★★★</span>
              <div>
                {ratingCounts.map((row) => (
                  <p key={row.star}>
                    <span>{row.star} stars</span>
                    <i>
                      <b
                        style={{
                          width: `${course.reviews.length ? (row.count / course.reviews.length) * 100 : 0}%`,
                        }}
                      />
                    </i>
                    <small>{row.count}</small>
                  </p>
                ))}
              </div>
            </div>
            {course.reviews.slice(0, 8).map((r) => (
              <div className="review" key={r.id}>
                <span className="avatar">
                  {r.student_name
                    .split(" ")
                    .map((x) => x[0])
                    .join("")}
                </span>
                <div>
                  <strong>{r.student_name}</strong>
                  <span className="stars">{"★★★★★".slice(0, r.rating)}</span>
                  <small>{new Date(r.created_at).toLocaleDateString()}</small>
                  <p>{r.comment}</p>
                </div>
              </div>
            ))}
            {user?.role === "student" && enrolled && (
              <form className="compact-form" onSubmit={submitReview}>
                <select
                  value={review.rating}
                  onChange={(e) =>
                    setReview({ ...review, rating: Number(e.target.value) })
                  }
                >
                  {[5, 4, 3, 2, 1].map((x) => (
                    <option key={x} value={x}>
                      {x} stars
                    </option>
                  ))}
                </select>
                <textarea
                  value={review.comment}
                  onChange={(e) =>
                    setReview({ ...review, comment: e.target.value })
                  }
                  placeholder="Share an honest review"
                  required
                />
                <Button>Submit review</Button>
              </form>
            )}
          </section>
          <section className="panel qna-panel">
            <SectionHead
              title="Course discussion"
              sub={`${qna.length} questions from learners`}
            />
            {user?.role === "student" && enrolled && (
              <form className="question-form" onSubmit={ask}>
                <input
                  value={question}
                  onChange={(e) => setQuestion(e.target.value)}
                  placeholder="Ask a question about this course…"
                  required
                />
                <Button>
                  <Send size={16} /> Ask
                </Button>
              </form>
            )}
            <div className="thread-list">
              {qna.slice(0, 3).map((thread) => (
                <div className="thread" key={thread.id}>
                  <div>
                    <span className="avatar">
                      {thread.student_name
                        .split(" ")
                        .map((x) => x[0])
                        .join("")}
                    </span>
                    <span>
                      <strong>{thread.student_name}</strong>
                      <p>{thread.question_text}</p>
                    </span>
                  </div>
                  {thread.replies?.map((item) => (
                    <div className="thread-reply" key={item.id}>
                      <MessageCircle />
                      <span>
                        <strong>{item.author_name}</strong>
                        <p>{item.reply_text}</p>
                      </span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </section>
          <section className="also-bought">
            <h2>Students also bought</h2>
            <div className="horizontal-cards popular-strip">
              {related.map((item) => (
                <CourseCard key={item.id} course={item} />
              ))}
            </div>
          </section>
        </div>
        {user?.role === "student" && (
          <div className="mobile-enroll-bar">
            <strong>{course.is_free ? "Free" : `₹${course.price}`}</strong>
            <Button
              onClick={enrolled ? () => navigate("/my-learning") : enroll}
            >
              {enrolled ? "Continue" : "Enroll now"}
            </Button>
          </div>
        )}
        {checkout && (
          <CheckoutModal course={course} onClose={() => setCheckout(false)} />
        )}
      </main>
    </PublicPage>
  );
}

// MOBILE VERIFIED 375px
function MyLearning() {
  const [data, setData] = useState(null);
  const navigate = useNavigate();
  const [tab, setTab] = useState("all");
  const [sort, setSort] = useState("recent");
  const [filter, setFilter] = useState("all");
  useEffect(() => {
    request("/dashboard").then(setData);
  }, []);
  if (!data) return <Loading />;
  let enrollments = data.enrollments.filter(
    (row) =>
      tab === "all" ||
      (tab === "progress" && !row.archived && row.progress_percent > 0 && row.progress_percent < 100) ||
      (tab === "completed" && !row.archived && row.progress_percent >= 100) ||
      (tab === "archived" && (row.archived || row.status === "archived")),
  );
  const filterOptions = [
    "all",
    ...Array.from(new Set(data.enrollments.map((row) => row.course?.category).filter(Boolean))).sort(),
  ];
  enrollments = enrollments.filter((row) => filter === "all" || row.course?.category === filter);
  enrollments = [...enrollments].sort((a, b) =>
    sort === "title"
      ? a.course.title.localeCompare(b.course.title)
      : sort === "newest"
        ? new Date(b.enrolled_at) - new Date(a.enrolled_at)
        : (b.last_lesson_id ? 1 : 0) - (a.last_lesson_id ? 1 : 0),
  );
  return (
    <Shell title="My learning" eyebrow="PERSONAL LIBRARY">
      <div className="learning-controls">
        <div>
          {[
            ["all", "All Courses"],
            ["progress", "In Progress"],
            ["completed", "Completed"],
            ["archived", "Archived"],
          ].map(([key, label]) => (
            <button
              className={tab === key ? "active" : ""}
              onClick={() => setTab(key)}
              key={key}
            >
              {label}
            </button>
          ))}
        </div>
        <select value={sort} onChange={(e) => setSort(e.target.value)}>
          <option value="recent">Recently Accessed</option>
          <option value="title">Title A-Z</option>
          <option value="newest">Newest</option>
        </select>
        <select value={filter} onChange={(e) => setFilter(e.target.value)}>
          {filterOptions.map((option) => (
            <option key={option} value={option}>
              {option === "all" ? "All categories" : option}
            </option>
          ))}
        </select>
      </div>
      <div className="udemy-learning-list">
        {enrollments.map((e) => (
          <article key={e.id}>
            <img src={e.course.thumbnail_url} alt="" />
            <div>
              <small>{e.course.category}</small>
              <h2>{e.course.title}</h2>
              <p>{e.course.instructor_name}</p>
              <div className="progress-line">
                <i style={{ width: `${e.progress_percent}%` }} />
              </div>
              <span>{e.progress_percent}% complete</span>
              <div>
                <Button
                  onClick={() =>
                    navigate(
                      `/learn/${e.course_id}/${e.last_lesson_id || `les_${e.course_id}_1_1`}`,
                    )
                  }
                >
                  {e.progress_percent ? "Continue Learning" : "Start Course"}
                </Button>
                {e.status === "completed" &&
                  data.certificates.find(
                    (cert) => cert.enrollment_id === e.id,
                  ) && (
                    <Button
                      variant="ghost"
                      onClick={() =>
                        navigate(
                          `/certificates/${data.certificates.find((cert) => cert.enrollment_id === e.id).id}`,
                        )
                      }
                    >
                      <Download /> Download Certificate
                    </Button>
                  )}
              </div>
            </div>
          </article>
        ))}
      </div>
      <SectionHead
        title="Certificates"
        sub="Proof of the work you've completed."
      />
      <div className="certificate-grid">
        {data.certificates.map((c) => (
          <CertificateCard
            key={c.id}
            cert={c}
            enrollment={data.enrollments.find((e) => e.id === c.enrollment_id)}
          />
        ))}
      </div>
    </Shell>
  );
}

function CertificateCard({ cert, enrollment }) {
  return (
    <div className="certificate" id={`certificate-${cert.id}`}>
      <Logo />
      <Award size={44} />
      <small>CERTIFICATE OF COMPLETION</small>
      <h3>{enrollment?.course?.title || "Course completion"}</h3>
      <p>
        Awarded to <strong>Aarav Sharma</strong>
      </p>
      <span>{cert.certificate_number}</span>
      <button
        onClick={() =>
          downloadCard(
            `certificate-${cert.id}`,
            `${cert.certificate_number}.pdf`,
          )
        }
      >
        <Download size={16} /> Download PDF
      </button>
    </div>
  );
}

async function downloadCard(id, filename) {
  const element = document.getElementById(id);
  if (!element) return;
  // Build a canvas-based LinkedIn-ready share image
  const canvas = document.createElement("canvas");
  canvas.width = 900;
  canvas.height = 500;
  const ctx = canvas.getContext("2d");
  // Background gradient
  const grad = ctx.createLinearGradient(0, 0, 900, 500);
  grad.addColorStop(0, "#0a1628");
  grad.addColorStop(1, "#0e2b1a");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 900, 500);
  // Decorative accent blob
  ctx.beginPath();
  ctx.arc(750, 80, 180, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(34,197,94,0.08)";
  ctx.fill();
  // Brand pill
  ctx.fillStyle = "rgba(34,197,94,0.15)";
  ctx.beginPath(); ctx.roundRect(54, 48, 160, 36, 18); ctx.fill();
  ctx.fillStyle = "#4ade80";
  ctx.font = "bold 13px system-ui, sans-serif";
  ctx.fillText("SKILL TANK", 80, 71);
  // Year
  ctx.fillStyle = "rgba(255,255,255,0.3)";
  ctx.font = "12px system-ui, sans-serif";
  ctx.fillText(new Date().getFullYear(), 800, 71);
  // Headline
  const progressEl = element.querySelector("[class*=progress-ring] strong, [class*=ring] strong");
  const progressValue = progressEl?.innerText || "100";
  const courseTitle = document.querySelector(".study-workspace h1, .learn-header h1, .lesson-title")?.innerText
    || document.title.replace(" · Skill Tank", "").trim()
    || "Course Module";
  // Big motivational headline
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 38px system-ui, sans-serif";
  const headlineLine = `${progressValue}% Course Completed`;
  ctx.fillText(headlineLine, 54, 180);
  // Sub-headline
  ctx.fillStyle = "#4ade80";
  ctx.font = "bold 20px system-ui, sans-serif";
  ctx.fillText("Your skills are taking shape!", 54, 222);
  // Course title
  ctx.fillStyle = "rgba(255,255,255,0.7)";
  ctx.font = "16px system-ui, sans-serif";
  ctx.fillText(courseTitle.slice(0, 60), 54, 270);
  // Progress bar
  ctx.fillStyle = "rgba(255,255,255,0.1)";
  ctx.beginPath(); ctx.roundRect(54, 310, 500, 16, 8); ctx.fill();
  ctx.fillStyle = "#22c55e";
  const barWidth = Math.max(8, Math.round((Math.min(100, parseInt(progressValue, 10) || 100) / 100) * 500));
  ctx.beginPath(); ctx.roundRect(54, 310, barWidth, 16, 8); ctx.fill();
  // Progress label
  ctx.fillStyle = "rgba(255,255,255,0.5)";
  ctx.font = "13px system-ui, sans-serif";
  ctx.fillText(`${progressValue}% complete`, 54, 348);
  // Badge circle
  ctx.fillStyle = "rgba(34,197,94,0.18)";
  ctx.beginPath(); ctx.arc(770, 300, 90, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = "rgba(34,197,94,0.45)";
  ctx.lineWidth = 3;
  ctx.beginPath(); ctx.arc(770, 300, 90, 0, Math.PI * 2); ctx.stroke();
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 40px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(progressValue + "%", 770, 310);
  ctx.font = "13px system-ui, sans-serif";
  ctx.fillStyle = "#4ade80";
  ctx.fillText("done", 770, 335);
  ctx.textAlign = "left";
  // Footer
  ctx.fillStyle = "rgba(255,255,255,0.2)";
  ctx.fillRect(54, 430, 792, 1);
  ctx.fillStyle = "rgba(255,255,255,0.35)";
  ctx.font = "12px system-ui, sans-serif";
  ctx.fillText("Earned with Skill Tank · skilltank.dev", 54, 458);
  ctx.fillText("Learning is progress. Progress is everything.", 400, 458);
  // Export as PNG
  const link = document.createElement("a");
  link.download = filename.replace(".pdf", ".png");
  link.href = canvas.toDataURL("image/png");
  link.click();
}

function MarkdownNotes({ text }) {
  return (
    <div className="markdown-notes">
      {String(text || "")
        .split("\n")
        .map((line, index) =>
          line.startsWith("## ") ? (
            <h2 key={index}>{line.slice(3)}</h2>
          ) : line.startsWith("- ") ? (
            <p key={index}>
              <CheckCircle2 />{" "}
              {line.slice(2).replaceAll("**", "").replaceAll("`", "")}
            </p>
          ) : line ? (
            <p key={index}>{line}</p>
          ) : (
            <br key={index} />
          ),
        )}
    </div>
  );
}

function InlineLessonQuiz({ module, enrollment, unlocked }) {
  const quiz = module?.quiz;
  const [questions, setQuestions] = useState([]);
  const [answers, setAnswers] = useState([]);
  const [current, setCurrent] = useState(0);
  const [result, setResult] = useState(null);
  useEffect(() => {
    if (quiz && unlocked)
      request(`/quizzes/${quiz.id}/questions`).then((rows) => {
        setQuestions(rows);
        setAnswers(Array(rows.length).fill(-1));
        setCurrent(0);
        setResult(null);
      });
  }, [quiz, unlocked]);
  if (!quiz)
    return (
      <div className="mode-empty">
        <FileQuestion />
        <h2>No quiz for this module</h2>
      </div>
    );
  if (!unlocked)
    return (
      <div className="mode-empty">
        <ShieldCheck />
        <h2>Complete all lessons in this module to unlock the quiz</h2>
        <p>
          {module.completed_lessons || 0}/{module.lessons.length} lessons done
        </p>
        <div className="progress-line">
          <i
            style={{
              width: `${((module.completed_lessons || 0) / module.lessons.length) * 100}%`,
            }}
          />
        </div>
      </div>
    );
  if (!questions.length) return <Loading />;
  const submit = async () =>
    setResult(
      await request("/quiz-attempts", {
        method: "POST",
        body: JSON.stringify({
          quiz_id: quiz.id,
          enrollment_id: enrollment.id,
          answers: questions.map((question, index) => ({
            question_id: question.id,
            selected_option_index: answers[index],
          })),
        }),
      }),
    );
  if (result)
    return (
      <div
        className={`inline-quiz-result ${result.passed ? "passed" : "failed"}`}
      >
        <CheckCircle2 />
        <h2>{result.passed ? "Quiz passed" : "Keep practising"}</h2>
        <strong>{result.score_percent}%</strong>
        <Button
          onClick={() => {
            setResult(null);
            setCurrent(0);
            setAnswers(Array(questions.length).fill(-1));
          }}
        >
          <RotateCcw /> Retry
        </Button>
      </div>
    );
  return (
    <div className="inline-quiz">
      <div className="quiz-step">
        <span>
          Question {current + 1} of {questions.length}
        </span>
        <div>
          <i
            style={{ width: `${((current + 1) / questions.length) * 100}%` }}
          />
        </div>
      </div>
      <h2>{questions[current].question_text}</h2>
      {questions[current].options.map((option, optionIndex) => (
        <label
          className={answers[current] === optionIndex ? "selected" : ""}
          key={option}
        >
          <input
            type="radio"
            checked={answers[current] === optionIndex}
            onChange={() =>
              setAnswers(
                answers.map((value, index) =>
                  index === current ? optionIndex : value,
                ),
              )
            }
          />
          <span>{String.fromCharCode(65 + optionIndex)}</span>
          {option}
        </label>
      ))}
      <div className="quiz-submit">
        <Button
          variant="ghost"
          disabled={current === 0}
          onClick={() => setCurrent(current - 1)}
        >
          Previous
        </Button>
        {current < questions.length - 1 ? (
          <Button
            disabled={answers[current] < 0}
            onClick={() => setCurrent(current + 1)}
          >
            Next
          </Button>
        ) : (
          <Button disabled={answers[current] < 0} onClick={submit}>
            Submit Quiz
          </Button>
        )}
      </div>
    </div>
  );
}

// MOBILE VERIFIED 375px
function Learn() {
  usePageMeta(
    "Lesson workspace",
    "Watch lessons, take notes, chat with the AI coach, complete quizzes, and track focus inside Skill Tank.",
  );
  const { courseId, lessonId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [notes, setNotes] = useState("");
  const [position, setPosition] = useState(0);
  const videoRef = useRef(null);
  const youtubeRef = useRef(null);
  const autoCompleteRef = useRef(false);
  const completeRef = useRef(null);
  const [toast, setToast] = useState("");
  const [nextPrompt, setNextPrompt] = useState(null);
  const [curriculumOpen, setCurriculumOpen] = useState(false);
  const [studyMode, setStudyMode] = useState("video");
  const [focusWarning, setFocusWarning] = useState(false);
  const [liveFocusPercent, setLiveFocusPercent] = useState(100);
  const [progressRows, setProgressRows] = useState([]);
  const [collapsedModules, setCollapsedModules] = useState([]);
  const [notesStatus, setNotesStatus] = useState("");
  const [aiQuestion, setAiQuestion] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [chatMessages, setChatMessages] = useState([]);
  const [notesPeek, setNotesPeek] = useState(false);
  const enrollmentId = data?.enrollment?.id;
  const lessonVideoUrl = data?.lesson?.video_url;
  const updateFocus = useCallback((value) => setLiveFocusPercent(value), []);
  useFocusTracker({
    studentId: user?.id,
    lessonId,
    onFocusUpdate: updateFocus,
  });
  useEffect(() => {
    request(`/learn/${courseId}/${lessonId}`).then(async (d) => {
      autoCompleteRef.current = false;
      setNextPrompt(null);
      setData(d);
      setNotes(d.progress?.bookmark_notes || "");
      setPosition(d.progress?.last_position_seconds || 0);
      const rows = await request(
        `/lesson-progress?enrollment_id=${d.enrollment.id}`,
      );
      setProgressRows(rows);
    });
  }, [courseId, lessonId]);
  useEffect(() => {
    const key = `skilltank_lesson_started_${lessonId}`;
    if (!data?.lesson?.id || sessionStorage.getItem(key)) return;
    sessionStorage.setItem(key, "1");
    request(`/lessons/${lessonId}/started`, { method: "POST" }).catch(() => {});
  }, [data?.lesson?.id, lessonId]);
  useEffect(() => {
    // Only show focus warning on real tab switches (document.hidden),
    // not on same-page iframe clicks which also fired window.blur.
    const lost = () => { if (document.hidden) setFocusWarning(true); };
    const returned = () => setFocusWarning(false);
    window.addEventListener("skilltank:focus-lost", lost);
    window.addEventListener("skilltank:focus-returned", returned);
    return () => {
      window.removeEventListener("skilltank:focus-lost", lost);
      window.removeEventListener("skilltank:focus-returned", returned);
    };
  }, []);
  useEffect(() => {
    if (!enrollmentId || !lessonVideoUrl?.includes("youtube")) return undefined;
    const receive = (event) => {
      if (!String(event.origin).includes("youtube.com")) return;
      try {
        const message =
          typeof event.data === "string" ? JSON.parse(event.data) : event.data;
        const current =
          message?.info?.currentTime ?? message?.info?.playerState?.currentTime;
        if (Number.isFinite(current)) setPosition(Math.round(current));
        if (message?.info?.playerState === 0 && !autoCompleteRef.current) {
          autoCompleteRef.current = true;
          completeRef.current?.({ auto: true }).catch(() => {
            autoCompleteRef.current = false;
          });
        }
      } catch (_) {}
    };
    window.addEventListener("message", receive);
    const poll = window.setInterval(() => {
      youtubeRef.current?.contentWindow?.postMessage(
        JSON.stringify({ event: "command", func: "getCurrentTime", args: [] }),
        "*",
      );
    }, 3000);
    const persist = window.setInterval(() => {
      setPosition((current) => {
        if (current > 0)
          request(`/progress/${enrollmentId}/notes?lesson_id=${lessonId}`, {
            method: "PUT",
            body: JSON.stringify({
              bookmark_notes: notes,
              last_position_seconds: current,
            }),
          }).catch(() => {});
        return current;
      });
    }, 10000);
    return () => {
      window.removeEventListener("message", receive);
      window.clearInterval(poll);
      window.clearInterval(persist);
    };
  }, [enrollmentId, lessonVideoUrl, lessonId, notes]);
  if (!data) return <Loading />;
  const allLessons = data.course.modules.flatMap((m) => m.lessons);
  const index = allLessons.findIndex((l) => l.id === lessonId);
  const currentModule = data.course.modules.find((module) =>
    module.lessons.some((lesson) => lesson.id === lessonId),
  );
  const saveNotes = async (content) => {
    if (!data.enrollment) return;
    setNotesStatus("Saving…");
    await request(
      `/progress/${data.enrollment.id}/notes?lesson_id=${lessonId}`,
      {
        method: "PUT",
        body: JSON.stringify({
          bookmark_notes: content ?? notes,
          last_position_seconds: position,
        }),
      },
    );
    setNotesStatus("Saved");
    setTimeout(() => setNotesStatus(""), 1800);
  };
  const sendChat = async () => {
    const question = aiQuestion.trim();
    if (!question) return;
    setChatMessages((messages) => [
      ...messages,
      { role: "user", text: question },
    ]);
    setAiQuestion("");
    setAiLoading(true);
    try {
      const result = await request(`/lessons/${lessonId}/ai`, {
        method: "POST",
        body: JSON.stringify({ action: "question", question }),
      });
      setChatMessages((messages) => [
        ...messages,
        { role: "assistant", text: result.response },
      ]);
    } catch (err) {
      setChatMessages((messages) => [
        ...messages,
        {
          role: "assistant",
          text:
            err.message ||
            "I could not reach the lesson coach right now. Try again in a moment.",
        },
      ]);
    } finally {
      setAiLoading(false);
    }
  };
  const complete = async ({ auto = false } = {}) => {
    const result = await request(`/progress/${data.enrollment.id}`, {
      method: "PUT",
      body: JSON.stringify({
        lesson_id: lessonId,
        completed: true,
        watched_seconds: Math.max(position, data.lesson.duration_seconds),
        last_position_seconds: position || data.lesson.duration_seconds,
        bookmark_notes: notes,
      }),
    });
    setProgressRows((rows) => [
      ...rows.filter((row) => row.lesson_id !== lessonId),
      { lesson_id: lessonId, completed: true },
    ]);
    setToast(
      `Lesson complete — course progress is now ${result.progress_percent}%`,
    );
    if (allLessons[index + 1]) {
      if (auto) setNextPrompt(allLessons[index + 1]);
      else
        setTimeout(
          () => navigate(`/learn/${courseId}/${allLessons[index + 1].id}`),
          900,
        );
    }
  };
  completeRef.current = complete;
  return (
    <div className="learn-shell">
      <aside className={`learn-nav ${curriculumOpen ? "mobile-open" : ""}`}>
        <div className="learn-logo">
          <Logo />
          <button
            aria-label="Close curriculum"
            onClick={() =>
              curriculumOpen
                ? setCurriculumOpen(false)
                : navigate("/my-learning")
            }
          >
            <X size={19} />
          </button>
        </div>
        <div className="learn-course">
          <small>COURSE</small>
          <h2>{data.course.title}</h2>
          <div className="progress-line">
            <i
              style={{ width: `${data.enrollment?.progress_percent || 0}%` }}
            />
          </div>
          <span>{data.enrollment?.progress_percent || 0}% complete</span>
        </div>
        <div className="learn-modules">
          {data.course.modules.map((m, mi) => {
            const completeCount = m.lessons.filter((lesson) =>
              progressRows.some(
                (row) => row.lesson_id === lesson.id && row.completed,
              ),
            ).length;
            const collapsed = collapsedModules.includes(m.id);
            const lockedMessage = `Complete Module ${mi} first to unlock this.`;
            return (
              <div key={m.id}>
                <button
                  className="module-toggle"
                  onClick={() =>
                    setCollapsedModules(
                      collapsed
                        ? collapsedModules.filter((id) => id !== m.id)
                        : [...collapsedModules, m.id],
                    )
                  }
                >
                  <strong>
                    Module {mi + 1}: {m.title}
                    {m.locked ? " 🔒" : ""}
                  </strong>
                  <small>
                    {completeCount}/{m.lessons.length} lessons complete
                  </small>
                  <ChevronDown className={collapsed ? "" : "rotate"} />
                </button>
                {!collapsed && (
                  <>
                    {m.lessons.map((l) => {
                      const completed = progressRows.some(
                        (row) => row.lesson_id === l.id && row.completed,
                      );
                      return (
                        <button
                          className={`${l.id === lessonId ? "active" : completed ? "completed" : ""} ${m.locked ? "locked" : ""}`}
                          key={l.id}
                          onClick={() => {
                            if (m.locked) return setToast(lockedMessage);
                            navigate(`/learn/${courseId}/${l.id}`);
                            setCurriculumOpen(false);
                          }}
                        >
                          <span>
                            {m.locked ? (
                              "🔒"
                            ) : completed ? (
                              <CheckCircle2 size={15} />
                            ) : l.id === lessonId ? (
                              <Play size={14} fill="currentColor" />
                            ) : (
                              <span>○</span>
                            )}
                          </span>
                          {l.title}
                        </button>
                      );
                    })}
                    {m.quiz && (
                      <button
                        className={`quiz-link ${completeCount === m.lessons.length ? "quiz-ready" : ""} ${m.quiz.latest_attempt?.passed ? "quiz-passed" : m.quiz.latest_attempt ? "quiz-failed" : ""}`}
                        onClick={() => {
                          if (m.locked || completeCount < m.lessons.length)
                            return setToast(
                              m.locked
                                ? lockedMessage
                                : `Complete all lessons in ${m.title} to unlock the quiz.`,
                            );
                          setStudyMode("quiz");
                        }}
                      >
                        <FileQuestion size={16} /> {m.quiz.title}
                      </button>
                    )}
                  </>
                )}
              </div>
            );
          })}
        </div>
      </aside>
      <main className="learn-main">
        <header>
          <button onClick={() => navigate("/my-learning")}>
            <ChevronLeft size={18} /> My learning
          </button>
          <button
            className="mobile-curriculum"
            onClick={() => setCurriculumOpen(true)}
          >
            <Menu size={17} /> Contents
          </button>
          <span>
            Lesson {index + 1} of {allLessons.length}
          </span>
        </header>
        <div className="study-workspace lesson-content-column">
          <nav className="study-modes">
            {[
              ["video", Play, "Video"],
              ["notes", Save, "Notes"],
              ["chatbot", Bot, "Chatbot"],
              ["quiz", FileQuestion, "Quiz"],
            ].map(([key, Icon, label]) => (
              <button
                className={studyMode === key ? "active" : ""}
                onClick={() => setStudyMode(key)}
                key={key}
              >
                <Icon /> {label}
              </button>
            ))}
          </nav>
          <div className="mode-content-panel">
          {studyMode === "video" && (
            <section className="study-panel video-mode">
              <div className="video-wrap">
                {data.lesson.video_url?.match(/\.(mp4|webm)(\?|$)/i) ? (
                  <video
                    ref={videoRef}
                    src={mediaUrl(data.lesson.video_url)}
                    controls
                    onLoadedMetadata={(e) => {
                      e.currentTarget.currentTime = position;
                    }}
                    onTimeUpdate={(e) =>
                      setPosition(Math.round(e.currentTarget.currentTime))
                    }
                  />
                ) : ENABLE_EXTERNAL_VIDEO ? (
                  <iframe
                    ref={youtubeRef}
                    src={youtubeEmbedUrl(data.lesson.video_url, position)}
                    title={data.lesson.title}
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                  />
                ) : (
                  <div className="video-fallback">
                    <Play size={52} fill="currentColor" />
                    <strong>{data.lesson.title}</strong>
                    <p>
                      External video embeds are disabled in this local demo so
                      the app does not throw network errors.
                    </p>
                    <Button
                      variant="ghost"
                      onClick={() =>
                        window.open(data.lesson.video_url, "_blank", "noopener,noreferrer")
                      }
                    >
                      <Play size={16} /> Open video
                    </Button>
                  </div>
                )}
                <div className="focus-pill">
                  Focus: {liveFocusPercent}%{" "}
                  <span title="Focus is measured by tab/window activity, not camera.">
                    ⓘ
                  </span>
                </div>
                {focusWarning && (
                  <div className="focus-warning">
                    <div>
                      <span>👀</span>
                      <h2>Stay focused!</h2>
                      <p>Come back and continue your course.</p>
                      <Button onClick={() => setFocusWarning(false)}>
                        Resume Learning
                      </Button>
                    </div>
                  </div>
                )}
              </div>
              <div className="lesson-copy">
                <span className="eyebrow">LESSON {index + 1}</span>
                <h1>{data.lesson.title}</h1>
                <p>{data.lesson.content_text}</p>
                {position > 0 && (
                  <div className="resume-note">
                    <Clock3 /> Resume position saved at{" "}
                    {Math.floor(position / 60)}:
                    {String(position % 60).padStart(2, "0")}
                  </div>
                )}
                <div className="lesson-actions">
                  <Button onClick={complete}>
                    <CheckCircle2 /> Mark Complete
                  </Button>
                  {allLessons[index + 1] && (
                    <Button
                      variant="ghost"
                      onClick={() =>
                        navigate(
                          `/learn/${courseId}/${allLessons[index + 1].id}`,
                        )
                      }
                    >
                      Next Lesson <ChevronRight />
                    </Button>
                  )}
                </div>
              </div>
            </section>
          )}
          {studyMode === "notes" && (
            <section className="study-panel notes-mode">
              <div id={`lesson-notes-${lessonId}`}>
                <span className="eyebrow">LESSON STUDY NOTES</span>
                <MarkdownNotes text={data.lesson.demo_notes} />
              </div>
              <Button
                variant="ghost"
                onClick={() =>
                  downloadCard(
                    `lesson-notes-${lessonId}`,
                    `${data.lesson.title}-notes.pdf`,
                  )
                }
              >
                <Download /> Download Notes as PDF
              </Button>
              <div className="notes-box">
                <div className="notes-head">
                  <label>My Notes</label>
                  <span>{notesStatus}</span>
                </div>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  onBlur={() => saveNotes()}
                  placeholder="Add your personal notes…"
                />
                <Button onClick={() => saveNotes()}>
                  <Save /> Save Notes
                </Button>
              </div>
            </section>
          )}
          {studyMode === "chatbot" && (
            <section className="study-panel chatbot-mode">
              <button
                className="notes-peek-toggle"
                onClick={() => setNotesPeek(!notesPeek)}
              >
                <Save /> My Notes{" "}
                <ChevronDown className={notesPeek ? "rotate" : ""} />
              </button>
              {notesPeek && (
                <div className="notes-peek">
                  <MarkdownNotes text={data.lesson.demo_notes} />
                  <p>
                    <strong>Personal:</strong>{" "}
                    {notes || "No personal notes yet."}
                  </p>
                </div>
              )}
              <div className="chat-thread">
                {chatMessages.length ? (
                  chatMessages.map((message, messageIndex) => (
                    <div
                      className={`chat-bubble ${message.role}`}
                      key={messageIndex}
                    >
                      {message.text}
                    </div>
                  ))
                ) : (
                  <div className="chat-welcome">
                    <Bot />
                    <h2>Ask about {data.lesson.title}</h2>
                    <p>Answers use this lesson's notes and content.</p>
                  </div>
                )}
              </div>
              <div className="chat-composer">
                <textarea
                  value={aiQuestion}
                  onChange={(e) => setAiQuestion(e.target.value)}
                  placeholder="Ask a lesson-grounded question…"
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      if (!aiLoading && aiQuestion.trim()) sendChat();
                    }
                  }}
                />
                <Button
                  disabled={aiLoading || !aiQuestion.trim()}
                  onClick={sendChat}
                >
                  <Send /> {aiLoading ? "Thinking…" : "Send"}
                </Button>
              </div>
            </section>
          )}
          {studyMode === "quiz" && (
            <section className="study-panel quiz-mode">
              <InlineLessonQuiz
                module={currentModule}
                enrollment={data.enrollment}
                unlocked={currentModule?.quiz_unlocked}
              />
            </section>
          )}
          <section className="study-resources">
            <h3>Downloadable resources</h3>
            {(data.lesson.resources || []).map((resource) => (
              <div className="resource" key={resource.name}>
                <Download />
                <span>
                  <strong>{resource.name}</strong>
                  <small>PDF lesson resource</small>
                </span>
                <a href={`${API_ORIGIN}${resource.url}`} download>
                  Download
                </a>
              </div>
            ))}
          </section>
          </div>
        </div>
      </main>
      {nextPrompt && (
        <div className="next-lesson-prompt">
          <span>
            <CheckCircle2 size={18} /> Lesson complete - next lesson is ready.
          </span>
          <Button onClick={() => navigate(`/learn/${courseId}/${nextPrompt.id}`)}>
            Next Lesson <ChevronRight size={16} />
          </Button>
          <button type="button" onClick={() => setNextPrompt(null)}>
            Stay here
          </button>
        </div>
      )}
      {toast && (
        <div className="toast">
          <Target size={18} /> {toast}
        </div>
      )}
    </div>
  );
}

// MOBILE VERIFIED 375px
function QuizPage() {
  const { courseId, quizId } = useParams();
  const navigate = useNavigate();
  const [quiz, setQuiz] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [answers, setAnswers] = useState([]);
  const [result, setResult] = useState(null);
  const [current, setCurrent] = useState(0);
  const [enrollment, setEnrollment] = useState(null);
  const [course, setCourse] = useState(null);
  useEffect(() => {
    Promise.all([
      request(`/quizzes/${quizId}`),
      request(`/quizzes/${quizId}/questions`),
      request("/dashboard"),
      request(`/courses/${courseId}`),
    ]).then(([meta, questionRows, dashboard, courseRow]) => {
      setQuiz(meta);
      setQuestions(questionRows);
      setAnswers(Array(questionRows.length).fill(-1));
      setEnrollment(
        dashboard.enrollments.find((item) => item.course_id === courseId),
      );
      setCourse(courseRow);
    });
  }, [courseId, quizId]);
  if (!quiz || !questions.length || !enrollment) return <Loading />;
  const submit = async () =>
    setResult(
      await request("/quiz-attempts", {
        method: "POST",
        body: JSON.stringify({
          quiz_id: quizId,
          enrollment_id: enrollment.id,
          answers: questions.map((question, index) => ({
            question_id: question.id,
            selected_option_index: answers[index],
          })),
        }),
      }),
    );
  const retry = () => {
    setAnswers(Array(questions.length).fill(-1));
    setResult(null);
    setCurrent(0);
  };
  const currentModuleIndex =
    course?.modules?.findIndex((module) => module.quiz?.id === quizId) ?? -1;
  const nextModuleLesson =
    currentModuleIndex >= 0
      ? course?.modules?.[currentModuleIndex + 1]?.lessons?.[0]
      : null;
  return (
    <Shell title={quiz.title} eyebrow="KNOWLEDGE CHECK">
      <div className="quiz-page">
        {result ? (
          <div className={`quiz-result ${result.passed ? "passed" : "failed"}`}>
            <span>{result.passed ? <CheckCircle2 /> : <X />}</span>
            <h2>{result.passed ? "You passed" : "Not quite yet"}</h2>
            <strong>{result.score_percent}%</strong>
            <p>
              {result.passed
                ? "Excellent work. Your score, quiz status, points, and readiness profile have been updated."
                : "Review the breakdown, revisit the module, and try again. A retry notification has been logged."}
            </p>
            {result.certificate && (
              <div className="certificate-unlocked">
                <Award /> Certificate unlocked:{" "}
                {result.certificate.certificate_number}
              </div>
            )}
            <div className="question-breakdown">
              {result.question_results?.map((item, index) => (
                <div
                  className={item.is_correct ? "correct" : "incorrect"}
                  key={item.question_id}
                >
                  <strong>
                    {index + 1}. {item.question_text}
                  </strong>
                  <span>
                    Your answer:{" "}
                    {item.selected_option_index >= 0
                      ? item.options[item.selected_option_index]
                      : "No answer"}
                  </span>
                  <span>
                    Correct answer: {item.options[item.correct_option_index]}
                  </span>
                </div>
              ))}
            </div>
            <div className="quiz-result-actions">
              {result.passed && nextModuleLesson && (
                <Button
                  onClick={() =>
                    navigate(`/learn/${courseId}/${nextModuleLesson.id}`)
                  }
                >
                  Continue to next module
                </Button>
              )}
              {result.passed && !nextModuleLesson && (
                <Button onClick={() => navigate("/my-learning")}>
                  View completion & certificate
                </Button>
              )}
              {!result.passed && (
                <Button onClick={retry}>
                  <RotateCcw size={17} /> Retry quiz
                </Button>
              )}
              <Button
                variant="ghost"
                onClick={() =>
                  navigate(
                    `/learn/${courseId}/${course.modules[currentModuleIndex]?.lessons?.[0]?.id}`,
                  )
                }
              >
                Review module
              </Button>
            </div>
          </div>
        ) : (
          <>
            <div className="quiz-intro">
              <FileQuestion />
              <div>
                <h2>{quiz.title}</h2>
                <p>
                  Pass with {quiz.pass_threshold_percent}% or higher. Answer one
                  question at a time.
                </p>
              </div>
            </div>
            <div className="quiz-step">
              <span>
                Question {current + 1} of {questions.length}
              </span>
              <div>
                <i
                  style={{
                    width: `${((current + 1) / questions.length) * 100}%`,
                  }}
                />
              </div>
            </div>
            <div className="quiz-question">
              <small>QUESTION {current + 1}</small>
              <h3>{questions[current].question_text}</h3>
              <div>
                {questions[current].options.map((option, optionIndex) => (
                  <label
                    className={
                      answers[current] === optionIndex ? "selected" : ""
                    }
                    key={option}
                  >
                    <input
                      type="radio"
                      name={`q${current}`}
                      checked={answers[current] === optionIndex}
                      onChange={() =>
                        setAnswers(
                          answers.map((value, index) =>
                            index === current ? optionIndex : value,
                          ),
                        )
                      }
                    />
                    <span>{String.fromCharCode(65 + optionIndex)}</span>
                    {option}
                  </label>
                ))}
              </div>
            </div>
            <div className="quiz-submit">
              <Button
                variant="ghost"
                disabled={current === 0}
                onClick={() => setCurrent(current - 1)}
              >
                Previous
              </Button>
              {current < questions.length - 1 ? (
                <Button
                  disabled={answers[current] < 0}
                  onClick={() => setCurrent(current + 1)}
                >
                  Next question
                </Button>
              ) : (
                <Button disabled={answers[current] < 0} onClick={submit}>
                  Submit quiz
                </Button>
              )}
            </div>
          </>
        )}
      </div>
    </Shell>
  );
}

// MOBILE VERIFIED 375px
function Interview() {
  usePageMeta(
    "AI career mock interview",
    "Practice five-question role-based mock interviews with structured per-question scoring and feedback.",
  );
  const [role, setRole] = useState("Software Engineer");
  const [started, setStarted] = useState(false);
  const [beginLoading, setBeginLoading] = useState(false);
  const [questions, setQuestions] = useState([]);
  const [provider, setProvider] = useState("structured_fallback");
  const [step, setStep] = useState(0);
  const [answer, setAnswer] = useState("");
  const [transcript, setTranscript] = useState([]);
  const [result, setResult] = useState(null);
  const [listening, setListening] = useState(false);
  const [past, setPast] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [interviewMessage, setInterviewMessage] = useState("");
  const FALLBACK_QS = [
    { type: "open_ended", prompt: "Tell me about yourself and why you're excited about this role." },
    { type: "open_ended", prompt: "Describe a challenging technical problem you solved recently. Walk me through your approach." },
    { type: "open_ended", prompt: "How do you handle disagreements with teammates on a technical decision?" },
    { type: "open_ended", prompt: "Walk me through a project you're most proud of and your specific contributions." },
    { type: "open_ended", prompt: "Where do you see yourself in three years and how does this role fit that path?" },
  ];
  const roleOptions = [
    { title: "Frontend Developer", icon: Code, description: "UI architecture, React, accessibility, and browser fundamentals.", skills: ["React", "JavaScript", "CSS", "Accessibility"] },
    { title: "Python Developer", icon: Terminal, description: "Python fundamentals, automation, APIs, and clean backend code.", skills: ["Python", "APIs", "Testing", "Automation"] },
    { title: "UI/UX Designer", icon: Palette, description: "Research, interaction design, accessibility, and visual systems.", skills: ["Research", "Figma", "Prototyping", "A11y"] },
    { title: "Backend Developer", icon: Database, description: "API design, databases, security, and scalable services.", skills: ["REST", "SQL", "Security", "Architecture"] },
    { title: "Data Scientist", icon: Database, description: "Statistics, modelling, experimentation, and data communication.", skills: ["Python", "Statistics", "ML", "SQL"] },
    { title: "Product Manager", icon: Briefcase, description: "Discovery, prioritisation, metrics, and stakeholder decisions.", skills: ["Roadmaps", "Metrics", "Discovery", "Strategy"] },
    { title: "DevOps Engineer", icon: Terminal, description: "Delivery pipelines, cloud infrastructure, reliability, and security.", skills: ["Docker", "CI/CD", "Cloud", "Kubernetes"] },
    { title: "Digital Marketer", icon: Megaphone, description: "Campaign strategy, acquisition, analytics, and optimisation.", skills: ["SEO", "Ads", "Content", "Analytics"] },
  ];
  const currentQuestion =
    questions[step] && typeof questions[step] === "object"
      ? questions[step]
      : { type: "open_ended", prompt: questions[step] || "Loading question…" };
  const isMultipleChoice = currentQuestion.type === "multiple_choice";
  const canSubmit = isMultipleChoice ? Boolean(answer) : answer.trim().split(/\s+/).filter(Boolean).length >= 3;
  useEffect(() => {
    request("/dashboard").then((data) => setPast(data.interviews || []));
  }, [result]);
  const begin = async (selectedRole = role) => {
    setBeginLoading(true);
    setInterviewMessage("");
    try {
      const d = await request(
        `/interviews/questions/${encodeURIComponent(selectedRole)}`,
      );
      const loaded = (d.questions || []).map((q) =>
        typeof q === "string" ? { type: "open_ended", prompt: q } : q,
      );
      setQuestions(loaded.length >= 5 ? loaded : FALLBACK_QS);
      setProvider(d.provider || "structured_fallback");
    } catch (_) {
      setQuestions(FALLBACK_QS);
      setProvider("local_fallback");
    } finally {
      setBeginLoading(false);
    }
    setRole(selectedRole);
    setStep(0);
    setAnswer("");
    setTranscript([]);
    setResult(null);
    setStarted(true);
  };
  const next = async () => {
    if (submitting) return;
    if (!canSubmit) {
      setInterviewMessage(
        isMultipleChoice
          ? "Please choose one option before submitting."
          : "Please write a bit more detail before submitting.",
      );
      return;
    }
    setInterviewMessage("");
    const nextTranscript = [
      ...transcript,
      { role: "assistant", text: currentQuestion.prompt },
      { role: "user", text: answer },
    ];
    setSubmitting(true);
    try {
      setTranscript(nextTranscript);
      setAnswer("");
      if (step === questions.length - 1)
        setResult(
          await request("/interviews", {
            method: "POST",
            body: JSON.stringify({
              job_role: role,
              transcript: nextTranscript,
              provider,
            }),
          }),
        );
      else setStep(step + 1);
    } finally {
      setSubmitting(false);
    }
  };
  const dictate = () => {
    const Recognition =
      window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Recognition)
      return setInterviewMessage(
        "Voice input is not supported in this browser. You can still type your answer.",
      );
    const recognition = new Recognition();
    recognition.lang = "en-US";
    recognition.interimResults = true;
    recognition.continuous = false;
    setListening(true);
    recognition.onresult = (event) => {
      const text = Array.from(event.results)
        .map((result) => result[0].transcript)
        .join(" ")
        .trim();
      if (text) setAnswer(text);
    };
    recognition.onend = () => setListening(false);
    recognition.onerror = () => setListening(false);
    recognition.start();
  };
  return (
    <Shell title="AI mock interview" eyebrow="CAREER PRACTICE">
      {!started ? (
        <>
          <section className="interview-role-page">
            <span className="eyebrow">CAREER PRACTICE</span>
            <h1>AI Career Mock Interview</h1>
            <p>Practice role-based technical interviews and receive detailed structured scorecards.</p>
            <div className="interview-info"><BrainCircuit /><span><strong>AI Readiness Score + XP</strong>Complete five answers to earn 30 XP and improve your career-readiness profile.</span></div>
            <div className="role-grid">{roleOptions.map(option => { const Icon = option.icon; return <article className={role === option.title ? "selected" : ""} key={option.title}><span><Icon /></span><h2>{option.title}</h2><p>{option.description}</p><small>SKILLS CHECKED</small><div>{option.skills.map(skill => <i key={skill}>{skill}</i>)}</div><Button onClick={() => begin(option.title)} disabled={beginLoading} data-testid={`start-interview-${option.title.replace(/\s+/g,"-").toLowerCase()}`}>{beginLoading && role === option.title ? "Loading…" : "Start Interview"}</Button></article>; })}</div>
          </section>
          <section className="past-interviews">
            <SectionHead
              title="My Past Interviews"
              sub="Saved reports from your previous practice sessions."
            />
            {past
              .slice()
              .reverse()
              .map((item) => (
                <article className="past-interview-card" key={item.id}>
                  <div>
                    <span>
                      <strong>{item.job_role}</strong>
                      <small>
                        {new Date(item.created_at).toLocaleDateString()}
                      </small>
                    </span>
                    <b>{item.score_percent}%</b>
                  </div>
                  <p>{item.feedback_text}</p>
                  <Button
                    variant="ghost"
                    onClick={() => {
                      setRole(item.job_role);
                      setTranscript(item.transcript || []);
                      setResult(item);
                      setStarted(true);
                    }}
                  >
                    View Full Report
                  </Button>
                </article>
              ))}
          </section>
        </>
      ) : result ? (
        <section className="interview-result">
          <BackButton
            label="Back to roles"
            onBeforeBack={() => {
              setStarted(false);
              setResult(null);
              setStep(0);
              setTranscript([]);
              return false;
            }}
          />
          <ProgressRing value={result.score_percent} label="Interview score" />
          <div>
            <span className="eyebrow">FULL INTERVIEW REPORT</span>
            <h2>
              {result.score_percent >= 75
                ? "Interview-ready performance."
                : result.score_percent >= 50
                  ? "Strong foundation. Sharpen the proof."
                  : "Build deeper, more structured answers."}
            </h2>
            <p>{result.feedback_text}</p>
            <div className="score-breakdown">
              {Object.entries(result.score_breakdown || {}).map(
                ([key, value]) => (
                  <div key={key}>
                    <span>{key.replace("_", " ")}</span>
                    <div>
                      <i style={{ width: `${value}%` }} />
                    </div>
                    <strong>{value}</strong>
                  </div>
                ),
              )}
            </div>
            <div className="feedback-grid">
              <div>
                <CheckCircle2 />
                <strong>Interview Strengths</strong>
                {(result.strengths || []).map((item) => (
                  <span key={item}>{item}</span>
                ))}
              </div>
              <div>
                <Target />
                <strong>Areas to Improve</strong>
                {(result.improvements || []).map((item) => (
                  <span key={item}>{item}</span>
                ))}
              </div>
            </div>
            <section className="question-report">
              <h2>Per-question performance</h2>
              {(result.question_breakdown || []).map((row, index) => (
                <article key={index}>
                  <header>
                    <strong>{index + 1}. {row.question}</strong>
                    <b>{row.score}/10</b>
                  </header>
                  <details><summary>Your answer</summary><p>{row.answer}</p></details>
                  <div><span><CheckCircle2 /> What you did well</span><p>{row.strengths}</p></div>
                  <div><span><Target /> What could be improved</span><p>{row.improvements}</p></div>
                </article>
              ))}
            </section>
            <details className="interview-transcript">
              <summary>Full Q&A transcript</summary>
              {transcript.map((item, index) => (
                <p key={index}>
                  <strong>
                    {item.role === "assistant" ? "Interviewer" : "You"}:
                  </strong>{" "}
                  {item.text}
                </p>
              ))}
            </details>
            <div className="report-actions"><Button variant="ghost" disabled><Save size={16} /> Report Saved</Button><Button onClick={() => { setResult(null); setStep(0); setTranscript([]); begin(role); }}>Retake Interview</Button><Button variant="ghost" onClick={() => { setStarted(false); setResult(null); setStep(0); setTranscript([]); }}>Try Another Role</Button></div>
          </div>
        </section>
      ) : (
        <section className="interview-room">
          <BackButton
            label="Back to roles"
            onBeforeBack={() => {
              setStarted(false);
              setStep(0);
              setAnswer("");
              setTranscript([]);
              return false;
            }}
          />
          <div className="interview-progress">
            <span>Question {step + 1} of 5</span>
            <div>
              <i style={{ width: `${((step + 1) / 5) * 100}%` }} />
            </div>
          </div>
          {transcript.length > 0 && (
            <div className="interview-chat-history">
              {transcript.map((item, index) => (
                <p className={item.role} key={index}>
                  <strong>
                    {item.role === "assistant" ? "Interviewer" : "You"}:
                  </strong>{" "}
                  {item.text}
                </p>
              ))}
            </div>
          )}
          <div className="ai-message">
            <span>
              <Bot />
            </span>
            <div>
              <small>SKILLTANK AI INTERVIEWER</small>
              <h2>{currentQuestion.prompt}</h2>
              <button
                className="speak-question"
                onClick={() =>
                  window.speechSynthesis?.speak(
                    new SpeechSynthesisUtterance(currentQuestion.prompt),
                  )
                }
              >
                <Mic size={15} /> Hear question
              </button>
            </div>
          </div>
          {isMultipleChoice ? (
            <div className="interview-options">
              {(currentQuestion.options || []).map((option) => (
                <button
                  type="button"
                  className={answer === option ? "selected" : ""}
                  key={option}
                  onClick={() => setAnswer(option)}
                >
                  {option}
                </button>
              ))}
            </div>
          ) : (
            <textarea
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
              placeholder="Use situation, action, result, and a measurable outcome…"
            />
          )}
          {interviewMessage && (
            <div className="inline-alert">
              <Mic size={16} /> {interviewMessage}
              <button onClick={() => setInterviewMessage("")}>
                <X size={15} />
              </button>
            </div>
          )}
          <div>
            <span>
              <small>
                {isMultipleChoice
                  ? answer
                    ? "Option selected"
                    : "Choose one option"
                  : `${answer.split(/\s+/).filter(Boolean).length} words`}
              </small>
              {!isMultipleChoice && (
                <button
                  className={`voice-button ${listening ? "listening" : ""}`}
                  onClick={dictate}
                >
                  <Mic size={16} /> {listening ? "Listening…" : "Answer by voice"}
                </button>
              )}
            </span>
            <Button disabled={submitting} onClick={next}>
              {submitting
                ? "Submitting..."
                : step === 4
                  ? "Finish interview"
                  : "Submit Answer"}{" "}
              <ChevronRight size={18} />
            </Button>
          </div>
        </section>
      )}
    </Shell>
  );
}

// MOBILE VERIFIED 375px
function Leaderboard() {
  const { user } = useAuth();
  const [rows, setRows] = useState([]);
  useEffect(() => {
    request("/leaderboard").then(setRows);
  }, []);
  return (
    <Shell title="Leaderboard" eyebrow="LEARNING COMMUNITY">
      <div className="podium">
        {rows.slice(0, 3).map((r, i) => (
          <div className={`place p${i + 1}`} key={r.student_id}>
            <span className="avatar">
              {r.student_name
                .split(" ")
                .map((x) => x[0])
                .join("")}
            </span>
            <strong>{r.student_name}</strong>
            <small>
              {r.points} pts · {r.courses_completed} completed
            </small>
            <div className="podium-badges">
              {r.badges?.slice(0, 3).map((badge) => (
                <span key={badge.id} title={badge.name}>
                  {badge.icon}
                </span>
              ))}
            </div>
            <i>{i + 1}</i>
          </div>
        ))}
      </div>
      <div className="panel leaderboard-scroll">
        <div className="leaderboard-table leaderboard-rich">
          <div className="leaderboard-head">
            <strong>Rank</strong>
            <span>Learner</span>
            <span>Badges</span>
            <span>Completed</span>
            <b>Points</b>
          </div>
          {rows.map((r, i) => (
            <div
              className={r.student_id === user.id ? "current-student" : ""}
              key={r.student_id}
            >
              <strong>#{i + 1}</strong>
              <span className="leader-name">
                <span className="avatar">
                  {r.student_name
                    .split(" ")
                    .map((x) => x[0])
                    .join("")}
                </span>
                {r.student_name}
              </span>
              <span className="badge-pills">
                {r.badges?.map((badge) => (
                  <i key={badge.id} title={badge.criteria_description}>
                    {badge.icon} {badge.name}
                  </i>
                ))}
              </span>
              <span>{r.courses_completed}</span>
              <b>{r.points} pts</b>
            </div>
          ))}
        </div>
      </div>
    </Shell>
  );
}

// MOBILE VERIFIED 375px
function InstructorDashboard() {
  const [data, setData] = useState(null);
  const [coupon, setCoupon] = useState({ code: "", discount_percent: 15, course_id: "" });
  const navigate = useNavigate();
  useEffect(() => {
    request("/instructor/dashboard").then(setData);
  }, []);
  if (!data) return <Loading />;
  const chart = data.trend.map((value, i) => ({
    day: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"][i],
    value,
  }));
  return (
    <Shell
      title="Instructor studio"
      eyebrow="TEACHING OVERVIEW"
      action={
        <Button onClick={() => navigate("/instructor/courses/new")}>
          <Plus size={17} /> New course
        </Button>
      }
    >
      <section className="stats-grid">
        <StatCard
          icon={Users}
          label="Unique learners"
          value={data.stats.students}
          note="+12% this month"
        />
        <StatCard
          icon={BookOpen}
          label="Enrollments"
          value={data.stats.enrollments}
          note="Across all courses"
          color="purple"
        />
        <StatCard
          icon={Star}
          label="Average rating"
          value={data.stats.average_rating}
          note="Learner sentiment"
          color="yellow"
        />
        <StatCard
          icon={Gauge}
          label="Completion rate"
          value={`${data.stats.completion_rate}%`}
          note="All active cohorts"
          color="blue"
        />
      </section>
      <section className="two-column wide-left">
        <div className="panel chart-panel">
          <SectionHead title="Enrollment momentum" sub="Last seven days" />
          <ResponsiveContainer width="100%" height={260}>
            <AreaChart data={chart}>
              <defs>
                <linearGradient id="green" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#00b879" stopOpacity={0.35} />
                  <stop offset="95%" stopColor="#00b879" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid
                strokeDasharray="3 3"
                vertical={false}
                stroke="#edf0f2"
              />
              <XAxis dataKey="day" axisLine={false} tickLine={false} />
              <Tooltip />
              <Area
                type="monotone"
                dataKey="value"
                stroke="#00b879"
                strokeWidth={3}
                fill="url(#green)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
        <div className="panel">
          <SectionHead title="Quick actions" />
          <div className="quick-actions">
            <button onClick={() => navigate("/instructor/courses/new")}>
              <Plus /> Create a course
            </button>
            <button onClick={() => navigate("/instructor/courses/new")}>
              <FileQuestion /> Generate quiz
            </button>
            <button onClick={() => navigate("/instructor/qna")}>
              <MessageCircle /> Answer Q&A
            </button>
            <button
              onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
            >
              <BarChart3 /> View analytics
            </button>
          </div>
        </div>
      </section>
      <SectionHead
        title="Your courses"
        sub="Performance at a glance."
        action={
          <button onClick={() => navigate("/instructor/courses")}>
            Manage all <ChevronRight size={16} />
          </button>
        }
      />
      <div className="course-grid compact">
        {data.courses.slice(0, 3).map((c) => (
          <CourseCard key={c.id} course={c} />
        ))}
      </div>
      <section className="panel instructor-coupons">
        <SectionHead title="Course coupons" sub="Create discounts scoped to courses you own." />
        <form onSubmit={async event => { event.preventDefault(); await request("/instructor/coupons", { method: "POST", body: JSON.stringify({ ...coupon, active: true }) }); setCoupon({ code: "", discount_percent: 15, course_id: "" }); setData(await request("/instructor/dashboard")); }}>
          <select value={coupon.course_id} onChange={event => setCoupon({ ...coupon, course_id: event.target.value })} required><option value="">Select course</option>{data.courses.map(course => <option value={course.id} key={course.id}>{course.title}</option>)}</select>
          <input value={coupon.code} onChange={event => setCoupon({ ...coupon, code: event.target.value.toUpperCase() })} placeholder="COUPON CODE" required />
          <input type="number" min="1" max="100" value={coupon.discount_percent} onChange={event => setCoupon({ ...coupon, discount_percent: Number(event.target.value) })} />
          <Button>Create Coupon</Button>
        </form>
        <div>{data.coupons.map(row => <span className="coupon-chip" key={row.id}>{row.code} · {row.discount_percent}%</span>)}</div>
      </section>
    </Shell>
  );
}

function InstructorCourses() {
  const [data, setData] = useState(null);
  const [message, setMessage] = useState("");
  const [editingCourse, setEditingCourse] = useState(null);
  useEffect(() => {
    request("/instructor/dashboard").then(setData);
  }, []);
  if (!data) return <Loading />;
  const toggle = async (course) => {
    const updated = await request(
      `/courses/${course.id}/status?published=${course.status !== "published"}`,
      { method: "PATCH" },
    );
    setData({
      ...data,
      courses: data.courses.map((c) => (c.id === course.id ? updated : c)),
    });
  };
  const edit = async (course) => {
    const updated = await request(`/courses/${course.id}`, {
      method: "PATCH",
      body: JSON.stringify(course),
    });
    setEditingCourse(null);
    setMessage("Course updated.");
    setData({
      ...data,
      courses: data.courses.map((c) => (c.id === course.id ? updated : c)),
    });
  };
  return (
    <Shell title="My courses" eyebrow="CONTENT STUDIO">
      {message && (
        <div className="toast admin-toast">
          <CheckCircle2 size={18} /> {message}
          <button onClick={() => setMessage("")}>
            <X size={16} />
          </button>
        </div>
      )}
      {editingCourse && (
        <CourseEditModal
          course={editingCourse}
          onClose={() => setEditingCourse(null)}
          onSave={(changes) => edit({ ...editingCourse, ...changes })}
        />
      )}
      <div className="panel table instructor-courses-table">
        {data.courses.map((c) => (
          <div className="table-row" key={c.id}>
            <span
              className="table-art"
              style={{ background: c.thumbnail_color }}
            >
              <BookOpen />
            </span>
            <span>
              <strong>{c.title}</strong>
              <small>
                {c.category} · {c.level}
              </small>
            </span>
            <span>
              <small>Status</small>
              <b className={`status ${c.status}`}>{c.status}</b>
            </span>
            <span>
              <small>Learners</small>
              <strong>{c.enrollment_count}</strong>
            </span>
            <div className="row-actions instructor-course-actions">
              <button title="Edit course" onClick={() => setEditingCourse(c)}>
                <Pencil />
              </button>
              <Button variant="ghost" onClick={() => toggle(c)}>
                {c.status === "published" ? "Unpublish" : "Publish"}
              </Button>
            </div>
          </div>
        ))}
      </div>
    </Shell>
  );
}

// MOBILE VERIFIED 375px
function InstructorQna() {
  const [data, setData] = useState(null);
  const [reply, setReply] = useState({});
  useEffect(() => {
    request("/instructor/dashboard").then(setData);
  }, []);
  if (!data) return <Loading />;
  const answer = async (thread) => {
    const updated = await request(`/qna/${thread.id}/reply`, {
      method: "POST",
      body: JSON.stringify({ reply_text: reply[thread.id] }),
    });
    setData({
      ...data,
      qna: data.qna.map((item) => (item.id === thread.id ? updated : item)),
    });
    setReply({ ...reply, [thread.id]: "" });
  };
  return (
    <Shell title="Learner Q&A" eyebrow="COURSE DISCUSSIONS">
      <div className="thread-list">
        {data.qna.map((thread) => (
          <div className="thread panel" key={thread.id}>
            <div>
              <span className="avatar">
                {thread.student_name
                  .split(" ")
                  .map((x) => x[0])
                  .join("")}
              </span>
              <span>
                <strong>{thread.student_name}</strong>
                <p>{thread.question_text}</p>
              </span>
            </div>
            {thread.replies?.map((item) => (
              <div className="thread-reply" key={item.id}>
                <MessageCircle />
                <span>
                  <strong>{item.author_name}</strong>
                  <p>{item.reply_text}</p>
                </span>
              </div>
            ))}
            <div className="reply-form">
              <input
                value={reply[thread.id] || ""}
                onChange={(e) =>
                  setReply({ ...reply, [thread.id]: e.target.value })
                }
                placeholder="Write a helpful reply…"
              />
              <Button
                disabled={!reply[thread.id]}
                onClick={() => answer(thread)}
              >
                Reply
              </Button>
            </div>
          </div>
        ))}
      </div>
    </Shell>
  );
}

// MOBILE VERIFIED 375px
function CourseBuilder() {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [saved, setSaved] = useState(false);
  const [form, setForm] = useState({
    title: "",
    description: "",
    category: "Development",
    level: "Beginner",
    price: 0,
    thumbnail: "/images/courses/development.jpg",
  });
  const starterVideo = "https://www.youtube.com/embed/vD3B6guUI0o";
  const starterQuestions = () => [
    {
      question_text: "Which action best demonstrates applied learning?",
      options: [
        "Practice with feedback",
        "Skip the task",
        "Only reread",
        "Avoid examples",
      ],
      correct_option_index: 0,
    },
    {
      question_text: "What should a useful outcome be?",
      options: ["Observable", "Hidden", "Unrelated", "Vague"],
      correct_option_index: 0,
    },
    {
      question_text: "What improves a first attempt?",
      options: [
        "Specific feedback",
        "No review",
        "More ambiguity",
        "Skipping evidence",
      ],
      correct_option_index: 0,
    },
  ];
  const [modules, setModules] = useState([
    {
      title: "Get oriented",
      unlock_date: "",
      lessons: [
        { title: "Welcome and outcomes", video_url: starterVideo },
        { title: "Core concepts", video_url: starterVideo },
        { title: "Guided practice", video_url: starterVideo },
      ],
      quiz_questions: starterQuestions(),
    },
    {
      title: "Build the core",
      unlock_date: "",
      lessons: [
        { title: "Workflow setup", video_url: starterVideo },
        { title: "Applied example", video_url: starterVideo },
        { title: "Practice lab", video_url: starterVideo },
      ],
      quiz_questions: starterQuestions(),
    },
    {
      title: "Apply and ship",
      unlock_date: "",
      lessons: [
        { title: "Final project", video_url: starterVideo },
        { title: "Review checklist", video_url: starterVideo },
        { title: "Next steps", video_url: starterVideo },
      ],
      quiz_questions: starterQuestions(),
    },
  ]);
  const [generated, setGenerated] = useState(false);
  const updateModule = (index, changes) =>
    setModules(
      modules.map((item, i) => (i === index ? { ...item, ...changes } : item)),
    );
  const addLesson = (index) =>
    updateModule(index, {
      lessons: [
        ...modules[index].lessons,
        {
          title: `New lesson ${modules[index].lessons.length + 1}`,
          video_url: starterVideo,
          content_text: "",
        },
      ],
    });
  const updateLesson = (moduleIndex, lessonIndex, changes) =>
    updateModule(moduleIndex, {
      lessons: modules[moduleIndex].lessons.map((lesson, i) =>
        i === lessonIndex ? { ...lesson, ...changes } : lesson,
      ),
    });
  const updateQuestion = (moduleIndex, questionIndex, changes) =>
    updateModule(moduleIndex, {
      quiz_questions: modules[moduleIndex].quiz_questions.map((question, i) =>
        i === questionIndex ? { ...question, ...changes } : question,
      ),
    });
  const uploadLessonFile = async (moduleIndex, lessonIndex, file) => {
    const result = await uploadFile(file);
    updateLesson(moduleIndex, lessonIndex, { video_url: result.url });
  };
  const save = async () => {
    await request("/courses", {
      method: "POST",
      body: JSON.stringify({
        ...form,
        modules: modules.map((m) => ({
          ...m,
          unlock_date: m.unlock_date || null,
          lessons: m.lessons.map((l) => ({
            ...l,
            content_text:
              l.content_text ||
              `A practical lesson for ${l.title}. Follow the video, capture notes, and complete the applied task.`,
            duration_seconds: 600,
            resources: [{ name: "Lesson workbook.pdf", url: "#" }],
          })),
        })),
      }),
    });
    setSaved(true);
  };
  return (
    <Shell title="Create a course" eyebrow="COURSE BUILDER">
      <div className="builder-steps">
        {["Details", "Curriculum", "Quiz", "Publish"].map((s, i) => (
          <div className={step >= i + 1 ? "active" : ""} key={s}>
            <span>{step > i + 1 ? <Check /> : i + 1}</span>
            <strong>{s}</strong>
          </div>
        ))}
      </div>
      <div className="builder-card">
        {saved ? (
          <div className="success-state">
            <span>
              <CheckCircle2 />
            </span>
            <h2>Your course is live.</h2>
            <p>It has been added to the catalog and is ready for learners.</p>
            <Button onClick={() => navigate("/instructor/courses")}>
              View my courses
            </Button>
          </div>
        ) : (
          <>
            {step === 1 && (
              <div className="form-grid">
                <label className="full">
                  Course title
                  <input
                    value={form.title}
                    onChange={(e) =>
                      setForm({ ...form, title: e.target.value })
                    }
                    placeholder="e.g. Practical Product Strategy"
                  />
                </label>
                <label className="full">
                  Description
                  <textarea
                    value={form.description}
                    onChange={(e) =>
                      setForm({ ...form, description: e.target.value })
                    }
                    placeholder="What will learners be able to do?"
                  />
                </label>
                <label>
                  Category
                  <select
                    value={form.category}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        category: e.target.value,
                        thumbnail: `/images/courses/${e.target.value.toLowerCase()}.jpg`,
                      })
                    }
                  >
                    <option>Development</option>
                    <option>Design</option>
                    <option>Business</option>
                  </select>
                </label>
                <label>
                  Level
                  <select
                    value={form.level}
                    onChange={(e) =>
                      setForm({ ...form, level: e.target.value })
                    }
                  >
                    <option>Beginner</option>
                    <option>Intermediate</option>
                    <option>Advanced</option>
                  </select>
                </label>
                <label>
                  Price (₹)
                  <input
                    type="number"
                    value={form.price}
                    onChange={(e) =>
                      setForm({ ...form, price: Number(e.target.value) })
                    }
                  />
                </label>
                <label className="full">
                  Thumbnail URL
                  <input
                    value={form.thumbnail}
                    onChange={(e) =>
                      setForm({ ...form, thumbnail: e.target.value })
                    }
                  />
                  <small>
                    Use a local image path or upload an image below.
                  </small>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={async (e) => {
                      if (e.target.files[0]) {
                        const result = await uploadFile(e.target.files[0]);
                        setForm({ ...form, thumbnail: result.url });
                      }
                    }}
                  />
                </label>
              </div>
            )}
            {step === 2 && (
              <div>
                <SectionHead
                  title="Shape the curriculum"
                  sub="Add modules, video links/files, transcripts/content, and optional drip dates."
                />
                <div className="module-builder editable">
                  {modules.map((module, i) => (
                    <div key={i}>
                      <span>{i + 1}</span>
                      <div>
                        <input
                          value={module.title}
                          onChange={(e) =>
                            updateModule(i, { title: e.target.value })
                          }
                        />
                        <label>
                          Unlock date{" "}
                          <input
                            type="date"
                            value={module.unlock_date}
                            onChange={(e) =>
                              updateModule(i, { unlock_date: e.target.value })
                            }
                          />
                        </label>
                        <div className="builder-lessons">
                          {module.lessons.map((lesson, li) => (
                            <div className="builder-lesson-row" key={li}>
                              <input
                                value={lesson.title}
                                onChange={(e) =>
                                  updateLesson(i, li, { title: e.target.value })
                                }
                                placeholder="Lesson title"
                              />
                              <input
                                value={lesson.video_url || ""}
                                onChange={(e) =>
                                  updateLesson(i, li, {
                                    video_url: e.target.value,
                                  })
                                }
                                placeholder="YouTube embed URL or uploaded file URL"
                              />
                              <textarea
                                value={lesson.content_text || ""}
                                onChange={(e) =>
                                  updateLesson(i, li, {
                                    content_text: e.target.value,
                                  })
                                }
                                placeholder="Lesson transcript, description, or source notes for the AI coach"
                              />
                              <label className="file-upload">
                                Upload video
                                <input
                                  type="file"
                                  accept="video/*"
                                  onChange={(e) =>
                                    e.target.files[0] &&
                                    uploadLessonFile(i, li, e.target.files[0])
                                  }
                                />
                              </label>
                            </div>
                          ))}
                        </div>
                      </div>
                      <button onClick={() => addLesson(i)}>
                        <Plus /> Add lesson
                      </button>
                    </div>
                  ))}
                  <Button
                    variant="soft"
                    onClick={() =>
                      setModules([
                        ...modules,
                        {
                          title: "New module",
                          unlock_date: "",
                          lessons: [
                            {
                              title: "New lesson",
                              video_url: starterVideo,
                              content_text: "",
                            },
                          ],
                          quiz_questions: starterQuestions(),
                        },
                      ])
                    }
                  >
                    <Plus /> Add module
                  </Button>
                </div>
              </div>
            )}
            {step === 3 && (
              <div className="quiz-assist">
                <span>
                  <Sparkles />
                </span>
                <h2>Build knowledge checks</h2>
                <p>
                  Edit questions manually or generate a starter set. Every
                  module requires answer options and a correct-answer index.
                </p>
                <Button
                  variant="soft"
                  onClick={() => {
                    setModules(
                      modules.map((module) => ({
                        ...module,
                        quiz_questions: starterQuestions(),
                      })),
                    );
                    setGenerated(true);
                  }}
                >
                  <BrainCircuit size={18} /> Generate starter quizzes
                </Button>
                {generated && (
                  <div className="generated-question">
                    <small>GENERATED FOR {modules.length} MODULES</small>
                    <strong>Editable questions are ready below.</strong>
                    <span>Structured fallback · 60% pass threshold</span>
                  </div>
                )}
                <div className="quiz-builder-list">
                  {modules.map((module, mi) => (
                    <div key={mi}>
                      <h3>{module.title}</h3>
                      {module.quiz_questions.map((question, qi) => (
                        <div className="quiz-builder-question" key={qi}>
                          <input
                            value={question.question_text}
                            onChange={(e) =>
                              updateQuestion(mi, qi, {
                                question_text: e.target.value,
                              })
                            }
                          />
                          <div>
                            {question.options.map((option, oi) => (
                              <label key={oi}>
                                <input
                                  type="radio"
                                  name={`correct-${mi}-${qi}`}
                                  checked={question.correct_option_index === oi}
                                  onChange={() =>
                                    updateQuestion(mi, qi, {
                                      correct_option_index: oi,
                                    })
                                  }
                                />
                                <input
                                  value={option}
                                  onChange={(e) =>
                                    updateQuestion(mi, qi, {
                                      options: question.options.map(
                                        (item, index) =>
                                          index === oi ? e.target.value : item,
                                      ),
                                    })
                                  }
                                />
                              </label>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              </div>
            )}
            {step === 4 && (
              <div className="publish-check">
                <h2>Ready to meet your learners?</h2>
                {[
                  "Course details complete",
                  `${modules.length} modules created`,
                  "Video links/files configured",
                  "Quiz questions prepared",
                  "Certificate enabled",
                ].map((x) => (
                  <div key={x}>
                    <CheckCircle2 /> {x}
                  </div>
                ))}
              </div>
            )}
            <div className="builder-footer">
              <Button
                variant="ghost"
                disabled={step === 1}
                onClick={() => setStep(step - 1)}
              >
                Back
              </Button>
              <Button
                disabled={step === 1 && !form.title}
                onClick={() => (step < 4 ? setStep(step + 1) : save())}
              >
                {step === 4 ? "Publish course" : "Continue"} <ChevronRight />
              </Button>
            </div>
          </>
        )}
      </div>
    </Shell>
  );
}

// MOBILE VERIFIED 375px
function AdminDashboard({ view = "overview" }) {
  usePageMeta(
    "Admin panel",
    "Manage Skill Tank courses, users, enrollments, certificates, cohorts, notifications, interviews, and analytics.",
  );
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [stats, setStats] = useState(null);
  const [tab, setTab] = useState(view);
  const [message, setMessage] = useState("");
  const [editingCourse, setEditingCourse] = useState(null);
  const [deletingCourse, setDeletingCourse] = useState(null);
  const [editingCoupon, setEditingCoupon] = useState(null);
  const [manual, setManual] = useState({ student_id: "", course_id: "" });
  const [couponForm, setCouponForm] = useState({
    code: "",
    discount_percent: 10,
    active: true,
  });
  const [cohortCourse, setCohortCourse] = useState({});
  const [cohortForm, setCohortForm] = useState({
    name: "",
    organization_name: "",
    student_ids: [],
  });
  const [certForm, setCertForm] = useState({
    title: "",
    issuer: "",
    slug: "",
    description: "",
    difficulty: "intermediate",
  });
  const refresh = () =>
    Promise.all([request("/admin/dashboard"), request("/admin/stats")]).then(
      ([dashboard, statRows]) => {
        setData(dashboard);
        setStats(statRows);
      },
    );
  useEffect(() => {
    refresh();
  }, []);
  useEffect(() => setTab(view), [view]);
  if (!data || !stats) return <Loading />;
  const deactivate = async (u) => {
    await request(`/admin/users/${u.id}/active?active=${!u.active}`, {
      method: "PATCH",
    });
    setData({
      ...data,
      users: data.users.map((x) =>
        x.id === u.id ? { ...x, active: !x.active } : x,
      ),
    });
  };
  const toggleCourse = async (course) => {
    await request(
      `/courses/${course.id}/status?published=${course.status !== "published"}`,
      { method: "PATCH" },
    );
    refresh();
  };
  const editCourse = async (course) => {
    await request(`/courses/${course.id}`, {
      method: "PATCH",
      body: JSON.stringify(course),
    });
    setEditingCourse(null);
    setMessage("Course updated.");
    refresh();
  };
  const deleteCourse = async (course) => {
    await request(`/courses/${course.id}`, { method: "DELETE" });
    setDeletingCourse(null);
    setMessage("Course deleted.");
    refresh();
  };
  const manualEnroll = async (e) => {
    e.preventDefault();
    await request("/admin/enroll", {
      method: "POST",
      body: JSON.stringify(manual),
    });
    setManual({ student_id: "", course_id: "" });
    setMessage("Student enrolled successfully.");
    refresh();
  };
  const createCoupon = async (e) => {
    e.preventDefault();
    await request("/admin/coupons", {
      method: "POST",
      body: JSON.stringify(couponForm),
    });
    setCouponForm({ code: "", discount_percent: 10, active: true });
    refresh();
  };
  const runReminders = async () => {
    const result = await request("/admin/notifications/daily-reminder", {
      method: "POST",
    });
    setMessage(
      `Logged ${result.log_rows} reminder notifications for ${result.students} active enrollments.`,
    );
    refresh();
  };
  const reissue = async (certificate) => {
    await request("/admin/certificates/reissue", {
      method: "POST",
      body: JSON.stringify({ certificate_id: certificate.id }),
    });
    setMessage("Certificate reissued and notification triggered.");
    refresh();
  };
  const issue = async (enrollment) => {
    await request(`/admin/enrollments/${enrollment.id}/certificate`, {
      method: "POST",
    });
    refresh();
  };
  const createCohort = async (e) => {
    e.preventDefault();
    await request("/admin/cohorts", {
      method: "POST",
      body: JSON.stringify(cohortForm),
    });
    setCohortForm({ name: "", organization_name: "", student_ids: [] });
    refresh();
  };
  const createCertification = async (e) => {
    e.preventDefault();
    await request("/admin/certifications", {
      method: "POST",
      body: JSON.stringify(certForm),
    });
    setCertForm({
      title: "",
      issuer: "",
      slug: "",
      description: "",
      difficulty: "intermediate",
    });
    refresh();
  };
  return (
    <Shell title="Command center" eyebrow="ADMINISTRATION">
      {message && (
        <div className="toast admin-toast">
          <CheckCircle2 size={18} /> {message}
          <button onClick={() => setMessage("")}>
            <X size={16} />
          </button>
        </div>
      )}
      {editingCourse && (
        <CourseEditModal
          course={editingCourse}
          onClose={() => setEditingCourse(null)}
          onSave={(changes) => editCourse({ ...editingCourse, ...changes })}
        />
      )}
      {deletingCourse && (
        <ConfirmModal
          title="Delete course?"
          body={`This will remove ${deletingCourse.title} and its related learning content.`}
          confirmLabel="Delete course"
          onCancel={() => setDeletingCourse(null)}
          onConfirm={() => deleteCourse(deletingCourse)}
        />
      )}
      {editingCoupon && (
        <CouponEditModal
          coupon={editingCoupon}
          onClose={() => setEditingCoupon(null)}
          onSave={async (discount) => {
            await request(`/admin/coupons/${editingCoupon.id}`, {
              method: "PATCH",
              body: JSON.stringify({ ...editingCoupon, discount_percent: discount }),
            });
            setEditingCoupon(null);
            setMessage("Coupon updated.");
            refresh();
          }}
        />
      )}
      <section className="stats-grid admin-stats">
        <StatCard
          icon={Users}
          label="Students"
          value={stats.total_students}
          note={`${stats.total_instructors} instructors`}
        />
        <StatCard
          icon={BookOpen}
          label="Courses"
          value={stats.total_courses}
          note="Catalog inventory"
          color="purple"
        />
        <StatCard
          icon={GraduationCap}
          label="Enrollments"
          value={stats.total_enrollments}
          note="All time"
          color="yellow"
        />
        <StatCard
          icon={Award}
          label="Certificates"
          value={stats.total_certificates}
          note="Issued and verified"
          color="blue"
        />
        <StatCard
          icon={CircleDollarSign}
          label="Revenue"
          value={`₹${stats.total_revenue.toLocaleString()}`}
          note="Sandbox recorded value"
        />
      </section>
      {tab === "overview" && (
        <>
          {/* Analytics Charts Grid */}
          <div className="admin-charts-grid">
            <div className="panel chart-panel">
              <SectionHead title="Platform metrics" sub="Live data from your database." />
              <div className="admin-metric-bars">
                {[
                  { label: "Students", value: stats.total_students, max: Math.max(stats.total_students, 1), color: "var(--green)" },
                  { label: "Enrollments", value: stats.total_enrollments, max: Math.max(stats.total_enrollments, 1), color: "#7c3aed" },
                  { label: "Certificates", value: stats.total_certificates, max: Math.max(stats.total_enrollments, 1), color: "#1d4ed8" },
                  { label: "Courses", value: stats.total_courses, max: Math.max(stats.total_courses, 1), color: "#d97706" },
                ].map(({ label, value, max, color }) => (
                  <div key={label} className="admin-metric-bar-row">
                    <span>{label}</span>
                    <div className="admin-bar-track">
                      <div className="admin-bar-fill" style={{ width: `${Math.round((value / max) * 100)}%`, background: color }} />
                    </div>
                    <strong>{value.toLocaleString()}</strong>
                  </div>
                ))}
              </div>
            </div>
            <div className="panel chart-panel">
              <SectionHead title="Completion rate" sub="Enrollments converted to certificates." />
              <div className="admin-completion-ring">
                <svg viewBox="0 0 120 120" width="120" height="120">
                  <circle cx="60" cy="60" r="52" fill="none" stroke="#f0f4f2" strokeWidth="12" />
                  <circle
                    cx="60" cy="60" r="52" fill="none"
                    stroke="var(--green)" strokeWidth="12"
                    strokeDasharray={`${Math.round((stats.total_certificates / Math.max(stats.total_enrollments, 1)) * 326)} 326`}
                    strokeLinecap="round" transform="rotate(-90 60 60)"
                  />
                </svg>
                <div className="admin-ring-center">
                  <strong>{stats.total_enrollments > 0 ? Math.round((stats.total_certificates / stats.total_enrollments) * 100) : 0}%</strong>
                  <small>Completion</small>
                </div>
              </div>
              <div className="admin-ring-legend">
                <span><i style={{ background: "var(--green)" }} /> Certified: {stats.total_certificates}</span>
                <span><i style={{ background: "#f0f4f2", border: "1px solid #d1d5db" }} /> Enrolled: {stats.total_enrollments}</span>
              </div>
            </div>
            <div className="panel chart-panel">
              <SectionHead title="Enrollments by category" sub="Top course categories." />
              <div className="admin-category-bars">
                {Object.entries(
                  (data.courses || []).reduce((acc, c) => {
                    acc[c.category] = (acc[c.category] || 0) + (c.enrollment_count || 0);
                    return acc;
                  }, {})
                )
                  .sort((a, b) => b[1] - a[1])
                  .slice(0, 5)
                  .map(([cat, count], i) => {
                    const maxVal = Math.max(...Object.values(
                      (data.courses || []).reduce((acc, c) => { acc[c.category] = (acc[c.category] || 0) + (c.enrollment_count || 0); return acc; }, {})
                    ), 1);
                    const colors = ["var(--green)", "#7c3aed", "#1d4ed8", "#d97706", "#be185d"];
                    return (
                      <div key={cat} className="admin-metric-bar-row">
                        <span style={{ fontSize: 11 }}>{cat.length > 14 ? cat.slice(0, 13) + "…" : cat}</span>
                        <div className="admin-bar-track">
                          <div className="admin-bar-fill" style={{ width: `${Math.round((count / maxVal) * 100)}%`, background: colors[i % colors.length] }} />
                        </div>
                        <strong>{count}</strong>
                      </div>
                    );
                  })}
              </div>
            </div>
          </div>
          <div className="two-column">
            <div className="panel">
              <SectionHead
                title="System pulse"
                sub="Core workflows are healthy."
              />
              <div className="health-list">
                {[
                  ["Authentication", "Operational"],
                  ["Payment sandbox", "Test mode active"],
                  ["AI interview", "Claude 4.6 + fallback"],
                  ["Notification triggers", "Logging + Resend"],
                ].map((x) => (
                  <div key={x[0]}>
                    <span>
                      <i />
                      {x[0]}
                    </span>
                    <strong>{x[1]}</strong>
                  </div>
                ))}
              </div>
            </div>
            <div className="panel">
              <SectionHead title="Recent notification events" />
              {data.notifications
                .slice(-4)
                .reverse()
                .map((n) => (
                  <div className="notification-row" key={n.id}>
                    <span>
                      <Bell />
                    </span>
                    <div>
                      <strong>{n.event_type.replaceAll("_", " ")}</strong>
                      <small>
                        {n.channel} · {n.status}
                      </small>
                    </div>
                  </div>
                ))}
            </div>
          </div>
        </>
      )}
      {tab === "users" && (
        <div className="panel table">
          {data.users.map((u) => (
            <div className="table-row" key={u.id}>
              <span className="avatar">{u.avatar}</span>
              <span>
                <strong>{u.full_name}</strong>
                <small>{u.email}</small>
              </span>
              <b className="role">{u.role}</b>
              <b className={`status ${u.active ? "published" : "draft"}`}>
                {u.active ? "active" : "disabled"}
              </b>
              <Button variant="ghost" onClick={() => deactivate(u)}>
                {u.active ? "Deactivate" : "Restore"}
              </Button>
            </div>
          ))}
        </div>
      )}
      {tab === "courses" && (
        <>
          <div className="panel admin-page-head">
            <SectionHead
              title="Courses"
              sub="Manage catalog content, publication state, ratings, and enrollment signals."
              action={<Button onClick={() => navigate("/admin/courses/new")}><Plus /> Add Course</Button>}
            />
          </div>
          <div className="panel admin-table-scroll">
            <table className="data-table admin-courses-table">
              <thead>
                <tr>
                  <th>Course</th>
                  <th>Category</th>
                  <th>Price</th>
                  <th>Status</th>
                  <th>Enrollments</th>
                  <th>Rating</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {data.courses.map((c) => (
                  <tr key={c.id}>
                    <td>
                      <div className="admin-course-cell">
                        <img src={c.thumbnail_url} alt="" />
                        <span>
                          <strong>{c.title}</strong>
                          <small>{c.instructor_name}</small>
                        </span>
                      </div>
                    </td>
                    <td><span className="category-badge">{c.category}</span></td>
                    <td>{c.is_free ? "Free" : `₹${c.price}`}</td>
                    <td><b className={`status ${c.status}`}>{c.status}</b></td>
                    <td>{c.enrollment_count}</td>
                    <td><Star size={14} fill="currentColor" /> {c.rating_avg}</td>
                    <td>
                      <div className="row-actions contained">
                        <button title="Edit course" onClick={() => setEditingCourse(c)}><Pencil /></button>
                        <button title="Publish or unpublish" onClick={() => toggleCourse(c)}><Check /></button>
                        <button title="Delete" onClick={() => setDeletingCourse(c)}><Trash2 /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="panel report-table">
            <SectionHead
              title="Completion report"
              sub="Filterable course-level certificate and completion evidence."
            />
            {data.completion_report.map((row) => (
              <div key={row.course_id}>
                <strong>{row.course_title}</strong>
                <span>
                  {row.completed}/{row.enrollments} completed
                </span>
                <div className="progress-line">
                  <i
                    style={{
                      width: `${row.enrollments ? (row.completed / row.enrollments) * 100 : 0}%`,
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </>
      )}
      {tab === "enrollments" && (
        <>
          <div className="panel">
            <SectionHead title="Enroll student" sub="Add a learner to any course manually." />
            <form className="inline-admin-form" onSubmit={manualEnroll}>
              <select value={manual.student_id} onChange={(e) => setManual({ ...manual, student_id: e.target.value })} required>
                <option value="">Select student</option>
                {data.users.filter((u) => u.role === "student").map((u) => (
                  <option key={u.id} value={u.id}>{u.full_name}</option>
                ))}
              </select>
              <select value={manual.course_id} onChange={(e) => setManual({ ...manual, course_id: e.target.value })} required>
                <option value="">Select course</option>
                {data.courses.map((c) => (
                  <option key={c.id} value={c.id}>{c.title}</option>
                ))}
              </select>
              <Button><GraduationCap /> Enroll Student</Button>
            </form>
          </div>
          <div className="panel admin-table-scroll">
            <table className="data-table">
            <thead>
              <tr>
                <th>Student</th>
                <th>Course</th>
                <th>Progress</th>
                <th>Enrolled</th>
                <th>Status</th>
                <th>Payment</th>
              </tr>
            </thead>
            <tbody>
              {data.enrollments.map((enrollment) => (
                <tr key={enrollment.id}>
                  <td>{enrollment.student?.full_name}</td>
                  <td>{enrollment.course?.title}</td>
                  <td>{enrollment.progress_percent}%</td>
                  <td>
                    {new Date(enrollment.enrolled_at).toLocaleDateString()}
                  </td>
                  <td>
                    <b
                      className={`status ${enrollment.status === "completed" ? "published" : "draft"}`}
                    >
                      {enrollment.status}
                    </b>
                  </td>
                  <td>{enrollment.payment_status}</td>
                </tr>
              ))}
            </tbody>
            </table>
          </div>
        </>
      )}
      {tab === "coupons" && (
        <div className="panel">
          <SectionHead
            title="Coupon management"
            sub="Create, edit, activate, or deactivate sandbox discounts."
          />
          <form className="coupon-form" onSubmit={createCoupon}>
            <input
              value={couponForm.code}
              onChange={(e) =>
                setCouponForm({
                  ...couponForm,
                  code: e.target.value.toUpperCase(),
                })
              }
              placeholder="CODE"
              required
            />
            <input
              type="number"
              min="1"
              max="100"
              value={couponForm.discount_percent}
              onChange={(e) =>
                setCouponForm({
                  ...couponForm,
                  discount_percent: Number(e.target.value),
                })
              }
            />
            <Button>
              <Plus />
            </Button>
          </form>
          {data.coupons.map((c) => (
            <div className="coupon-row" key={c.id}>
              <span>{c.code}</span>
              <strong>{c.discount_percent}% off</strong>
              <button
                onClick={() => setEditingCoupon(c)}
              >
                Edit
              </button>
              <button
                onClick={async () => {
                  await request(`/admin/coupons/${c.id}`, {
                    method: "PATCH",
                    body: JSON.stringify({ ...c, active: !c.active }),
                  });
                  refresh();
                }}
              >
                {c.active ? "Deactivate" : "Activate"}
              </button>
            </div>
          ))}
        </div>
      )}
      {tab === "notifications" && (
        <div className="panel admin-table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>Event</th>
                <th>Channel</th>
                <th>Recipient</th>
                <th>Status</th>
                <th>Timestamp</th>
              </tr>
            </thead>
            <tbody>
              {data.notifications
                .slice()
                .reverse()
                .map((row) => (
                  <tr key={row.id}>
                    <td>{row.event_type.replaceAll("_", " ")}</td>
                    <td>{row.channel}</td>
                    <td>
                      {data.users.find((user) => user.id === row.user_id)
                        ?.email || row.user_id}
                    </td>
                    <td>
                      <b className={`delivery-status ${row.status}`}>
                        {row.status}
                      </b>
                      {row.payload?.whatsapp_url && (
                        <a className="mini-link" href={row.payload.whatsapp_url} target="_blank" rel="noreferrer">
                          Open WhatsApp
                        </a>
                      )}
                    </td>
                    <td>{new Date(row.sent_at).toLocaleString()}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      )}
      {tab === "interviews" && (
        <div className="panel admin-table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>Student</th>
                <th>Job role</th>
                <th>Score</th>
                <th>Date</th>
                <th>Feedback</th>
              </tr>
            </thead>
            <tbody>
              {data.interviews.map((row) => (
                <tr key={row.id}>
                  <td>
                    {
                      data.users.find((user) => user.id === row.student_id)
                        ?.full_name
                    }
                  </td>
                  <td>{row.job_role}</td>
                  <td>{row.score_percent}%</td>
                  <td>{new Date(row.created_at).toLocaleDateString()}</td>
                  <td>{row.feedback_text}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {tab === "attention" && (
        <div className="panel admin-table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>Student</th>
                <th>Lesson</th>
                <th>Focus</th>
                <th>Tab switches</th>
                <th>Duration</th>
              </tr>
            </thead>
            <tbody>
              {data.attention_logs.map((row) => {
                const start = row.session_start
                  ? new Date(row.session_start)
                  : null;
                const end = row.session_end ? new Date(row.session_end) : null;
                return (
                  <tr key={row.id}>
                    <td>
                      {
                        data.users.find((user) => user.id === row.student_id)
                          ?.full_name
                      }
                    </td>
                    <td>{row.lesson_id}</td>
                    <td>{row.focus_percent}%</td>
                    <td>{row.tab_switch_count}</td>
                    <td>
                      {start && end
                        ? `${Math.max(0, Math.round((end - start) / 60000))} min`
                        : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {tab === "operations" && (
        <div className="operations-grid">
          <div>
            <div className="panel">
              <SectionHead
                title="Manual enrollment"
                sub="Enroll any student in one action."
              />
              <form className="inline-admin-form" onSubmit={manualEnroll}>
                <select
                  value={manual.student_id}
                  onChange={(e) =>
                    setManual({ ...manual, student_id: e.target.value })
                  }
                  required
                >
                  <option value="">Select student</option>
                  {data.users
                    .filter((u) => u.role === "student")
                    .map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.full_name}
                      </option>
                    ))}
                </select>
                <select
                  value={manual.course_id}
                  onChange={(e) =>
                    setManual({ ...manual, course_id: e.target.value })
                  }
                  required
                >
                  <option value="">Select course</option>
                  {data.courses.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.title}
                    </option>
                  ))}
                </select>
                <Button>Enroll</Button>
              </form>
            </div>
            <div className="panel">
              <SectionHead
                title="Notification evidence"
                sub="Every trigger writes here, whether live delivery is configured or not."
                action={
                  <div className="inline-actions">
                    <Button onClick={runReminders}>Run daily reminders</Button>
                    <Button
                      variant="ghost"
                      onClick={async () => {
                        await request("/settings/test-notification", { method: "POST" });
                        setMessage("Test notification pipeline triggered.");
                        refresh();
                      }}
                    >
                      Send test notification
                    </Button>
                  </div>
                }
              />
              {data.notifications
                .slice()
                .reverse()
                .map((n) => (
                  <div className="log-row" key={n.id}>
                    <span className={`channel ${n.channel}`}>{n.channel}</span>
                    <span>
                      <strong>{n.event_type.replaceAll("_", " ")}</strong>
                      <small>{JSON.stringify(n.payload)}</small>
                    </span>
                    <b>{n.status}</b>
                  </div>
                ))}
            </div>
            <div className="panel">
              <SectionHead
                title="Certificates"
                sub="Issue overrides or reissue existing certificates."
              />
              {data.enrollments
                .filter((e) => e.status === "completed")
                .map((enrollment) => {
                  const cert = data.certificates.find(
                    (c) => c.enrollment_id === enrollment.id,
                  );
                  return (
                    <div className="certificate-admin-row" key={enrollment.id}>
                      <span>
                        <strong>{enrollment.student?.full_name}</strong>
                        <small>{enrollment.course?.title}</small>
                      </span>
                      <Button
                        variant="ghost"
                        onClick={() =>
                          cert ? reissue(cert) : issue(enrollment)
                        }
                      >
                        {cert
                          ? `Reissue (${cert.reissued_count})`
                          : "Issue certificate"}
                      </Button>
                    </div>
                  );
                })}
            </div>
            <div className="panel">
              <SectionHead
                title="All enrollments"
                sub="Student, course, payment, and completion status."
              />
              {data.enrollments.map((enrollment) => (
                <div className="enrollment-admin-row" key={enrollment.id}>
                  <span>
                    <strong>{enrollment.student?.full_name}</strong>
                    <small>{enrollment.course?.title}</small>
                  </span>
                  <b>{enrollment.payment_status}</b>
                  <span>{enrollment.progress_percent}%</span>
                </div>
              ))}
            </div>
            <div className="panel">
              <SectionHead title="Mock interview reports" />
              {data.interviews.map((item) => (
                <div className="interview-admin-row" key={item.id}>
                  <Bot />
                  <span>
                    <strong>{item.job_role}</strong>
                    <small>{item.feedback_text}</small>
                  </span>
                  <b>{item.score_percent}%</b>
                </div>
              ))}
            </div>
          </div>
          <div>
            <div className="panel">
              <SectionHead
                title="Focus monitor"
                sub="Recent tracked sessions."
              />
              {data.attention_logs.map((a) => (
                <div className="focus-row" key={a.id}>
                  <Target />
                  <span>
                    <strong>{a.focus_percent}% focus</strong>
                    <small>{a.tab_switch_count} tab switches</small>
                  </span>
                </div>
              ))}
            </div>
            <div className="panel">
              <SectionHead title="Coupons" />
              <form className="coupon-form" onSubmit={createCoupon}>
                <input
                  value={couponForm.code}
                  onChange={(e) =>
                    setCouponForm({
                      ...couponForm,
                      code: e.target.value.toUpperCase(),
                    })
                  }
                  placeholder="CODE"
                  required
                />
                <input
                  type="number"
                  min="1"
                  max="100"
                  value={couponForm.discount_percent}
                  onChange={(e) =>
                    setCouponForm({
                      ...couponForm,
                      discount_percent: Number(e.target.value),
                    })
                  }
                />
                <Button>
                  <Plus />
                </Button>
              </form>
              {data.coupons.map((c) => (
                <div className="coupon-row" key={c.id}>
                  <span>{c.code}</span>
                  <strong>{c.discount_percent}% off</strong>
                  <button
                    onClick={() => setEditingCoupon(c)}
                  >
                    Edit
                  </button>
                  <button
                    onClick={async () => {
                      await request(`/admin/coupons/${c.id}`, {
                        method: "PATCH",
                        body: JSON.stringify({ ...c, active: !c.active }),
                      });
                      refresh();
                    }}
                  >
                    {c.active ? "Deactivate" : "Activate"}
                  </button>
                </div>
              ))}
            </div>
            <div className="panel">
              <SectionHead
                title="B2B cohorts"
                sub="Create a cohort, select students, then enroll everyone in one action."
              />
              <form className="cohort-create-form" onSubmit={createCohort}>
                <input
                  value={cohortForm.name}
                  onChange={(e) =>
                    setCohortForm({ ...cohortForm, name: e.target.value })
                  }
                  placeholder="Cohort name"
                  required
                />
                <input
                  value={cohortForm.organization_name}
                  onChange={(e) =>
                    setCohortForm({
                      ...cohortForm,
                      organization_name: e.target.value,
                    })
                  }
                  placeholder="Organization"
                />
                <div>
                  {data.users
                    .filter((u) => u.role === "student")
                    .map((student) => (
                      <label key={student.id}>
                        <input
                          type="checkbox"
                          checked={cohortForm.student_ids.includes(student.id)}
                          onChange={(e) =>
                            setCohortForm({
                              ...cohortForm,
                              student_ids: e.target.checked
                                ? [...cohortForm.student_ids, student.id]
                                : cohortForm.student_ids.filter(
                                    (id) => id !== student.id,
                                  ),
                            })
                          }
                        />{" "}
                        {student.full_name}
                      </label>
                    ))}
                </div>
                <Button>Create cohort</Button>
              </form>
              {data.cohorts.map((cohort) => (
                <div className="cohort-row" key={cohort.id}>
                  <UsersRound />
                  <span>
                    <strong>{cohort.name}</strong>
                    <small>{cohort.organization_name}</small>
                  </span>
                  <select
                    value={cohortCourse[cohort.id] || ""}
                    onChange={(e) =>
                      setCohortCourse({
                        ...cohortCourse,
                        [cohort.id]: e.target.value,
                      })
                    }
                  >
                    <option value="">Choose course</option>
                    {data.courses.map((c) => (
                      <option value={c.id} key={c.id}>
                        {c.title}
                      </option>
                    ))}
                  </select>
                  <Button
                    variant="ghost"
                    disabled={!cohortCourse[cohort.id]}
                    onClick={async () => {
                      const result = await request("/admin/cohort-enroll", {
                        method: "POST",
                        body: JSON.stringify({
                          cohort_id: cohort.id,
                          course_id: cohortCourse[cohort.id],
                        }),
                      });
                      setMessage(`${result.count} students enrolled.`);
                      refresh();
                    }}
                  >
                    Bulk enroll
                  </Button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
      {tab === "cohorts" && (
        <div className="admin-page-grid">
          <div className="panel">
            <SectionHead
              title="Cohort management"
              sub="Create cohorts and review membership."
            />
            <form className="inline-admin-form" onSubmit={createCohort}>
              <input
                placeholder="Cohort name"
                value={cohortForm.name}
                onChange={(e) =>
                  setCohortForm({ ...cohortForm, name: e.target.value })
                }
                required
              />
              <input
                placeholder="Organisation"
                value={cohortForm.organization_name}
                onChange={(e) =>
                  setCohortForm({
                    ...cohortForm,
                    organization_name: e.target.value,
                  })
                }
              />
              <Button>Create Cohort</Button>
            </form>
            <div className="admin-table-scroll">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Organisation</th>
                    <th>Students</th>
                    <th>Created</th>
                    <th>Manage Students</th>
                  </tr>
                </thead>
                <tbody>
                  {data.cohorts.map((cohort) => (
                    <tr key={cohort.id}>
                      <td>{cohort.name}</td>
                      <td>{cohort.organization_name}</td>
                      <td>
                        {
                          data.cohort_students.filter(
                            (row) => row.cohort_id === cohort.id,
                          ).length
                        }
                      </td>
                      <td>
                        {cohort.created_at
                          ? new Date(cohort.created_at).toLocaleDateString()
                          : "Seeded"}
                      </td>
                      <td>
                        <label className="cohort-student-picker">
                          <span>Add student to cohort</span>
                          <select
                            defaultValue=""
                            onChange={async (event) => {
                              if (!event.target.value) return;
                              await request(`/admin/cohorts/${cohort.id}/students`, {
                                method: "POST",
                                body: JSON.stringify({ student_id: event.target.value }),
                              });
                              event.target.value = "";
                              refresh();
                            }}
                          >
                            <option value="">Choose student...</option>
                            {data.users
                              .filter(
                                (candidate) =>
                                  candidate.role === "student" &&
                                  !data.cohort_students.some(
                                    (row) =>
                                      row.cohort_id === cohort.id &&
                                      row.student_id === candidate.id,
                                  ),
                              )
                              .map((candidate) => (
                                <option value={candidate.id} key={candidate.id}>
                                  {candidate.full_name} - {candidate.email}
                                </option>
                              ))}
                          </select>
                        </label>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <div className="panel">
            <SectionHead title="Bulk enroll a cohort" />
            <form
              className="inline-admin-form"
              onSubmit={async (e) => {
                e.preventDefault();
                const result = await request("/admin/cohort-enroll", {
                  method: "POST",
                  body: JSON.stringify({
                    cohort_id: e.currentTarget.cohort.value,
                    course_id: e.currentTarget.course.value,
                  }),
                });
                setMessage(`Successfully enrolled ${result.count} students.`);
                refresh();
              }}
            >
              <select name="cohort" required>
                <option value="">Select cohort</option>
                {data.cohorts.map((row) => (
                  <option value={row.id} key={row.id}>
                    {row.name}
                  </option>
                ))}
              </select>
              <select name="course" required>
                <option value="">Select course</option>
                {data.courses.map((row) => (
                  <option value={row.id} key={row.id}>
                    {row.title}
                  </option>
                ))}
              </select>
              <Button>Enroll All Students</Button>
            </form>
          </div>
        </div>
      )}
      {tab === "certifications" && (
        <div className="panel">
          <SectionHead
            title="Certification paths"
            sub="Create and inspect certification preparation paths."
          />
          <form className="cert-admin-form" onSubmit={createCertification}>
            <input
              placeholder="Path title"
              value={certForm.title}
              onChange={(e) =>
                setCertForm({ ...certForm, title: e.target.value })
              }
              required
            />
            <input
              placeholder="Issuer"
              value={certForm.issuer}
              onChange={(e) =>
                setCertForm({ ...certForm, issuer: e.target.value })
              }
              required
            />
            <input
              placeholder="slug"
              value={certForm.slug}
              onChange={(e) =>
                setCertForm({ ...certForm, slug: e.target.value })
              }
              required
            />
            <select
              value={certForm.difficulty}
              onChange={(e) =>
                setCertForm({ ...certForm, difficulty: e.target.value })
              }
            >
              <option>beginner</option>
              <option>intermediate</option>
              <option>advanced</option>
            </select>
            <textarea
              placeholder="Description"
              value={certForm.description}
              onChange={(e) =>
                setCertForm({ ...certForm, description: e.target.value })
              }
            />
            <Button>Add Path</Button>
          </form>
          <div className="admin-table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Path</th>
                  <th>Issuer</th>
                  <th>Difficulty</th>
                  <th>Courses</th>
                </tr>
              </thead>
              <tbody>
                {data.certification_paths.map((path) => (
                  <tr key={path.id}>
                    <td>{path.title}</td>
                    <td>{path.issuer}</td>
                    <td>{path.difficulty}</td>
                    <td>
                      {
                        data.certification_courses.filter(
                          (link) => link.certification_id === path.id,
                        ).length
                      }
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </Shell>
  );
}

function Loading() {
  return (
    <div className="loading">
      <Logo />
      <span />
    </div>
  );
}

function NotificationsPage() {
  const [rows, setRows] = useState(null);
  useEffect(() => {
    request("/notifications").then(setRows);
  }, []);
  if (!rows) return <Loading />;
  return (
    <Shell title="Notifications" eyebrow="EVENT INBOX">
      <div className="panel notification-list">
        {rows
          .slice()
          .reverse()
          .map((row) => (
            <div className="notification-row" key={row.id}>
              <span>
                <Bell />
              </span>
              <div>
                <strong>{row.event_type.replaceAll("_", " ")}</strong>
                <small>
                  {row.channel} · {row.status} ·{" "}
                  {new Date(row.sent_at).toLocaleString()}
                </small>
                <p>{JSON.stringify(row.payload)}</p>
                {row.payload?.whatsapp_url && (
                  <a className="mini-link" href={row.payload.whatsapp_url} target="_blank" rel="noreferrer">
                    Open WhatsApp
                  </a>
                )}
              </div>
            </div>
          ))}
        {!rows.length && <p className="empty">No notifications yet.</p>}
      </div>
    </Shell>
  );
}

function SettingsPage() {
  const { user } = useAuth();
  const [settings, setSettings] = useState(null);
  const [status, setStatus] = useState("");
  useEffect(() => {
    request("/settings").then(setSettings);
  }, []);
  if (!settings) return <Loading />;
  const save = async () => {
    setSettings(
      await request("/settings", {
        method: "PUT",
        body: JSON.stringify(settings),
      }),
    );
    setStatus("Settings saved to the database.");
  };
  const test = async () => {
    await save();
    await request("/settings/test-notification", { method: "POST" });
    setStatus("Test trigger created. Check Notifications and the admin log.");
  };
  return (
    <Shell title="Settings" eyebrow="ACCOUNT PREFERENCES">
      <div className="settings-grid">
        <div className="panel">
          <SectionHead title="Profile" />
          <div className="profile-settings">
            <span className="avatar">{user.avatar}</span>
            <div>
              <strong>{user.full_name}</strong>
              <p>{user.email}</p>
              <b className="role">{user.role}</b>
            </div>
          </div>
          <div className="provider-status">
            <strong>Delivery status</strong>
            <span>
              Email: {settings.email_notifications ? "enabled" : "disabled"}
            </span>
            <span>
              Recipient: {settings.notification_email || user.email}
            </span>
            <span>
              WhatsApp: {settings.whatsapp_number ? "ready" : "not configured"}
            </span>
          </div>
        </div>
        <div className="panel">
          <SectionHead title="Notification preferences" />
          <label className="toggle-row">
            <span>
              <strong>Email notifications</strong>
              <small>Enrollment, reminders, and certificates</small>
            </span>
            <input
              type="checkbox"
              checked={settings.email_notifications}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  email_notifications: e.target.checked,
                })
              }
            />
          </label>
          <label className="settings-field">
            WhatsApp number
            <input
              value={settings.whatsapp_number || ""}
              onChange={(e) =>
                setSettings({ ...settings, whatsapp_number: e.target.value })
              }
              placeholder="+91XXXXXXXXXX"
            />
            <small>
              Skill Tank creates wa.me click-to-chat links for account and learning notifications.
            </small>
          </label>
          <label className="settings-field">
            Notification email
            <input
              type="email"
              value={settings.notification_email || ""}
              onChange={(e) =>
                setSettings({ ...settings, notification_email: e.target.value })
              }
              placeholder="name@example.com"
            />
            <small>
              Skill Tank sends account, login, course-start, and payment emails only to this address.
            </small>
          </label>
          <label className="toggle-row">
            <span>
              <strong>Daily learning reminders</strong>
              <small>Nudges for incomplete courses</small>
            </span>
            <input
              type="checkbox"
              checked={settings.daily_reminders}
              onChange={(e) =>
                setSettings({ ...settings, daily_reminders: e.target.checked })
              }
            />
          </label>
          <label className="toggle-row">
            <span>
              <strong>Certificate notifications</strong>
              <small>Sent as soon as a certificate is issued</small>
            </span>
            <input
              type="checkbox"
              checked={settings.certificate_notifications}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  certificate_notifications: e.target.checked,
                })
              }
            />
          </label>
          <div className="settings-actions">
            <Button onClick={save}>
              <Save size={16} /> Save settings
            </Button>
            <Button variant="ghost" onClick={test}>
              <Send size={16} /> Send test
            </Button>
          </div>
          {status && (
            <div className="saved-note">
              <CheckCircle2 /> {status}
            </div>
          )}
        </div>
      </div>
    </Shell>
  );
}

function SubscribePage() {
  usePageMeta(
    "Subscription plans",
    "Compare Skill Tank learning plans and continue with sandbox checkout.",
  );
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    const session = new URLSearchParams(window.location.search).get("session_id");
    if (!session || !user) return;
    request("/subscriptions/confirm", {
      method: "POST",
      body: JSON.stringify({ session_id: session }),
    })
      .then((result) => {
        if (result.active) {
          localStorage.setItem("skilltank_user", JSON.stringify(result.user));
          setStatus("You are subscribed. Skill Tank Pro is active on this account.");
        } else setStatus(`Checkout status: ${result.status}`);
      })
      .catch((err) => setStatus(err.message));
  }, [user]);
  const subscribe = async () => {
    if (!user) return navigate("/login", { state: { from: location } });
    setLoading(true);
    setStatus("");
    try {
      const result = await request("/subscriptions/checkout", { method: "POST" });
      window.location.assign(result.checkout_url);
    } catch (err) {
      setStatus(err.message);
      setLoading(false);
    }
  };
  return (
    <PublicPage>
      <main className="subscribe-page">
        <span className="pill">SANDBOX CHECKOUT</span>
        <h1>Skill Tank Pro</h1>
        <p>Unlimited access to practical courses, certification paths, AI coaching, and career-readiness tools.</p>
        <div className="pro-plan">
          <Logo />
          <strong>
            ?999 <small>/ month</small>
          </strong>
          <span>Sandbox subscription - test mode only</span>
          <ul>
            <li>Unlimited course access</li>
            <li>Priority AI interview credits</li>
            <li>Downloadable certificates</li>
            <li>Early access to new certification paths</li>
          </ul>
          <Button onClick={subscribe} disabled={loading}>
            <CreditCard size={16} /> {loading ? "Opening checkout..." : "Subscribe Now"}
          </Button>
          {status && <p className="saved-note">{status}</p>}
        </div>
      </main>
    </PublicPage>
  );
}

function CertificationsPage() {
  usePageMeta(
    "Certification paths",
    "Explore certification preparation paths connected to Skill Tank courses and certificates.",
  );
  const [rows, setRows] = useState([]);
  const [search, setSearch] = useState("");
  const navigate = useNavigate();
  useEffect(() => {
    request(`/certifications?search=${encodeURIComponent(search)}`).then(
      setRows,
    );
  }, [search]);
  return (
    <PublicPage>
      <main className="certifications-page">
        <section>
          <h1>Prepare for your next certification</h1>
          <p>
            Structured paths, practical courses, and exam-aligned practice for
            industry credentials.
          </p>
          <label>
            <Search />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search certifications or issuers"
            />
          </label>
        </section>
        <div className="issuer-grid">
          {rows.map((row) => (
            <article key={row.id}>
              <span className="issuer-mark">
                {row.issuer.slice(0, 2).toUpperCase()}
              </span>
              <small>{row.issuer}</small>
              <h2>{row.title}</h2>
              <p>{row.description}</p>
              <span>
                {row.course_count} courses · {row.estimated_hours} hours
              </span>
              <Button onClick={() => navigate(`/certifications/${row.slug}`)}>
                View path
              </Button>
            </article>
          ))}
        </div>
      </main>
    </PublicPage>
  );
}

function CertificationDetailPage() {
  usePageMeta(
    "Certification path details",
    "View certification path outcomes, recommended courses, and enrollment options.",
  );
  const { slug } = useParams();
  const [path, setPath] = useState(null);
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [status, setStatus] = useState("");
  useEffect(() => {
    request(`/certifications/${slug}`).then(setPath);
  }, [slug]);
  if (!path) return <Loading />;
  const enrollPath = async () => {
    if (!user) return navigate("/login", { state: { from: location } });
    const result = await request(`/certifications/${slug}/enroll`, {
      method: "POST",
    });
    setStatus(
      `Enrolled in ${result.free_enrolled} free courses. ${result.paid_pending_checkout} paid courses ready for checkout.`,
    );
  };
  return (
    <PublicPage>
      <main className="cert-path-page">
        <BackButton to="/certifications" />
        <section className="cert-path-hero">
          <span className="issuer-mark">
            {path.issuer.slice(0, 2).toUpperCase()}
          </span>
          <div>
            <small>{path.issuer}</small>
            <h1>{path.title}</h1>
            <p>{path.description}</p>
            <div>
              <span>{path.difficulty}</span>
              <span>{path.estimated_hours} estimated hours</span>
              <span>
                {path.exam_cost_usd
                  ? `$${path.exam_cost_usd} exam fee`
                  : "No exam fee listed"}
              </span>
            </div>
            <Button onClick={enrollPath}>Enroll in full path</Button>
            {status && <p className="saved-note">{status}</p>}
          </div>
        </section>
        <section className="two-column">
          <div className="panel">
            <h2>What this certification covers</h2>
            {path.coverage.map((item) => (
              <p key={item}>
                <Check /> {item}
              </p>
            ))}
          </div>
          <div className="panel">
            <h2>Exam resources</h2>
            <a className="external-cta" href={path.official_url} target="_blank" rel="noreferrer">
              Official exam page <ChevronRight />
            </a>
            {path.courses[0] && (
              <button
                onClick={() =>
                  navigate(
                    `/learn/${path.courses[0].id}/quiz/quiz_${path.courses[0].id}_1`,
                  )
                }
              >
                Open practice quiz
              </button>
            )}
          </div>
        </section>
        <section className="cert-detail-grid">
          <article className="panel">
            <h2>Who this certification is for</h2>
            <p>
              This path is built for learners who want a guided route from fundamentals
              to exam-ready practice. It suits career switchers, early professionals,
              and working learners who need structured milestones rather than a loose
              playlist.
            </p>
          </article>
          <article className="panel">
            <h2>Skills you'll gain</h2>
            <div className="skill-pills">
              {(path.coverage || [])
                .flatMap((item) => item.split(/[,&]/))
                .map((item) => item.trim())
                .filter(Boolean)
                .slice(0, 8)
                .map((skill) => (
                  <span key={skill}>{skill}</span>
                ))}
            </div>
          </article>
          <article className="panel path-advisor">
            <span className="avatar">MC</span>
            <div>
              <h2>Path advisor</h2>
              <strong>Maya Chen</strong>
              <p>
                Senior Skill Tank instructor focused on practical certification prep,
                portfolio evidence, and interview-ready explanations.
              </p>
            </div>
          </article>
          <article className="panel cert-reviews">
            <h2>Path reviews</h2>
            {[
              ["Nina Patel", "The course order made exam prep feel manageable."],
              ["Kabir Rao", "The practice quizzes helped me find weak spots fast."],
              ["Sara Khan", "Clear milestones and useful projects after each topic."],
              ["Dev Mehta", "I liked that the path connected skills to job scenarios."],
            ].map(([name, quote]) => (
              <p key={name}>
                <strong>{name}</strong>
                <span>{quote}</span>
              </p>
            ))}
          </article>
        </section>
        <section>
          <h2>Courses in this path</h2>
          <div className="course-grid">
            {path.courses.map((course) => (
              <CourseCard course={course} key={course.id} />
            ))}
          </div>
        </section>
      </main>
    </PublicPage>
  );
}

function CertificatePage() {
  const { id } = useParams();
  const [data, setData] = useState(null);
  useEffect(() => {
    request("/dashboard").then(setData);
  }, []);
  if (!data) return <Loading />;
  const cert = data.certificates.find((item) => item.id === id);
  if (!cert)
    return (
      <Shell title="Certificate" eyebrow="VERIFICATION">
        <div className="panel empty">
          Certificate not found for this account.
        </div>
      </Shell>
    );
  return (
    <Shell title="Certificate" eyebrow="VERIFIED ACHIEVEMENT">
      <div className="certificate-grid">
        <CertificateCard
          cert={cert}
          enrollment={data.enrollments.find(
            (item) => item.id === cert.enrollment_id,
          )}
        />
      </div>
    </Shell>
  );
}

function CheckoutPage() {
  const navigate = useNavigate();
  return (
    <Shell title="Secure checkout" eyebrow="STRIPE TEST MODE">
      <div className="success-state">
        <span>
          <CreditCard />
        </span>
        <h2>Choose a paid course to open Stripe Checkout.</h2>
        <p>Payments use Stripe sandbox mode; no real charge is created.</p>
        <Button onClick={() => navigate("/courses")}>
          Browse paid courses
        </Button>
      </div>
    </Shell>
  );
}

function LogoutPage() {
  const { logout } = useAuth();
  useEffect(() => {
    logout();
  }, [logout]);
  return <Navigate to="/login" replace />;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/signup" element={<Login initialMode="signup" />} />
      <Route path="/logout" element={<LogoutPage />} />
      <Route path="/auth/callback" element={<AuthCallback />} />
      <Route path="/" element={<Landing />} />
      <Route path="/subscribe" element={<SubscribePage />} />
      <Route path="/certifications" element={<CertificationsPage />} />
      <Route
        path="/certifications/:slug"
        element={<CertificationDetailPage />}
      />
      <Route
        path="/dashboard"
        element={
          <Protected roles={["student"]}>
            <StudentDashboard />
          </Protected>
        }
      />
      <Route path="/courses" element={<Catalog />} />
      <Route
        path="/courses/:id"
        element={
          <CourseErrorBoundary resetKey={window.location.pathname}>
            <CourseDetail />
          </CourseErrorBoundary>
        }
      />
      <Route
        path="/my-learning"
        element={
          <Protected roles={["student"]}>
            <MyLearning />
          </Protected>
        }
      />
      <Route
        path="/certificates/:id"
        element={
          <Protected roles={["student"]}>
            <CertificatePage />
          </Protected>
        }
      />
      <Route
        path="/learn/:courseId/:lessonId"
        element={
          <Protected roles={["student"]}>
            <CourseErrorBoundary resetKey={window.location.pathname}>
              <Learn />
            </CourseErrorBoundary>
          </Protected>
        }
      />
      <Route
        path="/learn/:courseId/quiz/:quizId"
        element={
          <Protected roles={["student"]}>
            <QuizPage />
          </Protected>
        }
      />
      <Route
        path="/checkout"
        element={
          <Protected roles={["student"]}>
            <CheckoutPage />
          </Protected>
        }
      />
      <Route
        path="/checkout/success"
        element={
          <Protected roles={["student"]}>
            <CheckoutSuccess />
          </Protected>
        }
      />
      <Route
        path="/mock-interview"
        element={
          <Protected roles={["student"]}>
            <Interview />
          </Protected>
        }
      />
      <Route
        path="/ai-interview"
        element={
          <Protected roles={["student"]}>
            <Interview />
          </Protected>
        }
      />
      <Route
        path="/leaderboard"
        element={
          <Protected roles={["student"]}>
            <Leaderboard />
          </Protected>
        }
      />
      <Route
        path="/notifications"
        element={
          <Protected>
            <NotificationsPage />
          </Protected>
        }
      />
      <Route
        path="/settings"
        element={
          <Protected>
            <SettingsPage />
          </Protected>
        }
      />
      <Route
        path="/instructor"
        element={
          <Protected roles={["instructor"]}>
            <InstructorDashboard />
          </Protected>
        }
      />
      <Route
        path="/instructor/courses"
        element={
          <Protected roles={["instructor"]}>
            <InstructorCourses />
          </Protected>
        }
      />
      <Route
        path="/instructor/courses/new"
        element={
          <Protected roles={["instructor", "admin"]}>
            <CourseBuilder />
          </Protected>
        }
      />
      <Route
        path="/admin/courses/new"
        element={
          <Protected roles={["admin"]}>
            <CourseBuilder />
          </Protected>
        }
      />
      <Route
        path="/instructor/qna"
        element={
          <Protected roles={["instructor"]}>
            <InstructorQna />
          </Protected>
        }
      />
      <Route
        path="/admin"
        element={
          <Protected roles={["admin"]}>
            <AdminDashboard />
          </Protected>
        }
      />
      <Route
        path="/admin/users"
        element={
          <Protected roles={["admin"]}>
            <AdminDashboard view="users" />
          </Protected>
        }
      />
      <Route
        path="/admin/courses"
        element={
          <Protected roles={["admin"]}>
            <AdminDashboard view="courses" />
          </Protected>
        }
      />
      <Route
        path="/admin/enrollments"
        element={
          <Protected roles={["admin"]}>
            <AdminDashboard view="enrollments" />
          </Protected>
        }
      />
      <Route
        path="/admin/cohorts"
        element={
          <Protected roles={["admin"]}>
            <AdminDashboard view="cohorts" />
          </Protected>
        }
      />
      <Route
        path="/admin/operations"
        element={
          <Protected roles={["admin"]}>
            <AdminDashboard view="operations" />
          </Protected>
        }
      />
      <Route
        path="/admin/coupons"
        element={
          <Protected roles={["admin"]}>
            <AdminDashboard view="coupons" />
          </Protected>
        }
      />
      <Route
        path="/admin/notifications"
        element={
          <Protected roles={["admin"]}>
            <AdminDashboard view="notifications" />
          </Protected>
        }
      />
      <Route
        path="/admin/interviews"
        element={
          <Protected roles={["admin"]}>
            <AdminDashboard view="interviews" />
          </Protected>
        }
      />
      <Route
        path="/admin/attention"
        element={
          <Protected roles={["admin"]}>
            <AdminDashboard view="attention" />
          </Protected>
        }
      />
      <Route
        path="/admin/certifications"
        element={
          <Protected roles={["admin"]}>
            <AdminDashboard view="certifications" />
          </Protected>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppRoutes />
    </AuthProvider>
  );
}
