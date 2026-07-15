/**
 * Header Component
 * Maintained by Hussain Developer
 * AMS ERP
 */

import React, {
  useState,
  useEffect,
  useLayoutEffect,
  useRef,
  useCallback,
} from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { searchAPI, notificationsAPI } from "../services/api";
import { getAvatarUrl } from "../utils/assetUrl";
import SearchDropdown from "./SearchDropdown";
import { LogOut, LayoutDashboard, Bell, Settings, CheckCheck } from "lucide-react";
import "../styles/notifications.css";

const USER_DROPDOWN_WIDTH = 240;
const USER_DROPDOWN_MAX_HEIGHT = 320;
const USER_DROPDOWN_GAP = 10;
const USER_DROPDOWN_EDGE_GAP = 8;

function Header({ onMenuClick }) {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [suggestions, setSuggestions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [showUserDropdown, setShowUserDropdown] = useState(false);
  const [userDropdownStyle, setUserDropdownStyle] = useState({});
  const [avatarError, setAvatarError] = useState(false);
  const [error, setError] = useState(null);
  const [showNotifications, setShowNotifications] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [unread, setUnread] = useState(0);
  const dropdownRef = useRef(null);
  const userMenuRef = useRef(null);
  const userDropdownRef = useRef(null);
  const searchTimeoutRef = useRef(null);
  const searchAbortRef = useRef(null);
  const searchInputRef = useRef(null);
  const notifRef = useRef(null);
  const [activeSearchIndex, setActiveSearchIndex] = useState(0);

  const hasAvatar = user?.avatar && !avatarError;
  const avatarUrl = hasAvatar ? getAvatarUrl(user.avatar) : "";
  const initials = user
    ? `${user.firstName?.[0] || ""}${user.lastName?.[0] || ""}`.toUpperCase()
    : "U";

  const loadNotifications = useCallback(() => {
    if (!user) return;
    notificationsAPI.list(20).then((res) => {
      setNotifications(res.data?.data?.items || []);
      setUnread(res.data?.data?.unread || 0);
    }).catch(() => {});
  }, [user]);

  useEffect(() => {
    loadNotifications();
    const timer = setInterval(loadNotifications, 30000);
    return () => clearInterval(timer);
  }, [loadNotifications]);

  const openNotification = async (item) => {
    if (!item.isRead) await notificationsAPI.markRead(item._id).catch(() => {});
    setShowNotifications(false); loadNotifications();
    if (item.link) navigate(item.link);
  };

  const markAllRead = async () => {
    await notificationsAPI.markAllRead(); loadNotifications();
  };

  const positionUserDropdown = useCallback(() => {
    if (!userMenuRef.current) return;

    const rect = userMenuRef.current.getBoundingClientRect();
    const viewportWidth =
      window.innerWidth || document.documentElement.clientWidth;
    const viewportHeight =
      window.innerHeight || document.documentElement.clientHeight;
    const spaceBelow = viewportHeight - rect.bottom - USER_DROPDOWN_GAP;
    const spaceAbove = rect.top - USER_DROPDOWN_GAP;
    const dropdownContentHeight =
      userDropdownRef.current?.scrollHeight || USER_DROPDOWN_MAX_HEIGHT;
    const dropdownHeight = Math.min(
      dropdownContentHeight,
      USER_DROPDOWN_MAX_HEIGHT,
    );
    const openUp = spaceBelow < dropdownHeight && spaceAbove > spaceBelow;
    const availableSpace = Math.max(
      120,
      Math.min(
        USER_DROPDOWN_MAX_HEIGHT,
        openUp ? spaceAbove : spaceBelow,
      ),
    );
    const visibleHeight = Math.min(dropdownContentHeight, availableSpace);
    const needsScrollbar = dropdownContentHeight > availableSpace;
    const left = Math.max(
      USER_DROPDOWN_EDGE_GAP,
      Math.min(
        rect.right - USER_DROPDOWN_WIDTH,
        viewportWidth - USER_DROPDOWN_WIDTH - USER_DROPDOWN_EDGE_GAP,
      ),
    );

    setUserDropdownStyle({
      position: "fixed",
      top: openUp
        ? `${Math.max(USER_DROPDOWN_EDGE_GAP, rect.top - visibleHeight - USER_DROPDOWN_GAP)}px`
        : `${rect.bottom + USER_DROPDOWN_GAP}px`,
      left: `${left}px`,
      right: "auto",
      minWidth: `${USER_DROPDOWN_WIDTH}px`,
      height: "auto",
      maxHeight: `${availableSpace}px`,
      overflowY: needsScrollbar ? "auto" : "visible",
      overflowX: "hidden",
      zIndex: 10000,
    });
  }, []);

  useLayoutEffect(() => {
    if (!showUserDropdown) return;
    positionUserDropdown();
  }, [showUserDropdown, positionUserDropdown]);

  useEffect(() => {
    const handleShortcut = (event) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); searchInputRef.current?.focus(); }
      if (event.key === 'Escape') setShowDropdown(false);
      if (!showDropdown || !results.length) return;
      if (event.key === 'ArrowDown') { event.preventDefault(); setActiveSearchIndex(i => (i + 1) % results.length); }
      if (event.key === 'ArrowUp') { event.preventDefault(); setActiveSearchIndex(i => (i - 1 + results.length) % results.length); }
      if (event.key === 'Enter') { event.preventDefault(); const item=results[activeSearchIndex]; if(item){navigate(item.link||item.url);setShowDropdown(false);} }
    };
    document.addEventListener('keydown', handleShortcut); return () => document.removeEventListener('keydown', handleShortcut);
  }, [showDropdown, results, activeSearchIndex, navigate]);

  // Handle clicks outside of search dropdown
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setShowDropdown(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    if (!showUserDropdown) return undefined;

    positionUserDropdown();
    const handleClickOutside = (event) => {
      const clickedTrigger =
        userMenuRef.current && userMenuRef.current.contains(event.target);
      const clickedDropdown =
        userDropdownRef.current &&
        userDropdownRef.current.contains(event.target);
      if (!clickedTrigger && !clickedDropdown) {
        setShowUserDropdown(false);
      }
    };
    const handleKey = (event) => {
      if (event.key === "Escape") setShowUserDropdown(false);
    };

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKey);
    window.addEventListener("resize", positionUserDropdown);
    window.addEventListener("scroll", positionUserDropdown, true);

    let resizeFrame = null;
    const resizeObserver =
      typeof ResizeObserver !== "undefined" && userDropdownRef.current
        ? new ResizeObserver(() => {
            if (resizeFrame) cancelAnimationFrame(resizeFrame);
            resizeFrame = requestAnimationFrame(positionUserDropdown);
          })
        : null;

    if (resizeObserver && userDropdownRef.current) {
      resizeObserver.observe(userDropdownRef.current);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKey);
      window.removeEventListener("resize", positionUserDropdown);
      window.removeEventListener("scroll", positionUserDropdown, true);
      if (resizeFrame) cancelAnimationFrame(resizeFrame);
      if (resizeObserver) resizeObserver.disconnect();
    };
  }, [showUserDropdown, positionUserDropdown]);

  useEffect(() => {
    if (!showNotifications) return;
    const handleClickOutside = (event) => {
      if (notifRef.current && !notifRef.current.contains(event.target)) {
        setShowNotifications(false);
      }
    };
    const handleKey = (event) => {
      if (event.key === "Escape") setShowNotifications(false);
    };
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKey);
    };
  }, [showNotifications]);

  // Perform search
  const performSearch = async (searchTerm) => {
    if (!searchTerm || searchTerm.trim().length < 3) {
      setResults([]);
      setShowDropdown(false);
      return;
    }

    setLoading(true);
    setError(null);
    setShowDropdown(true);

    try {
      searchAbortRef.current?.abort();
      const controller = new AbortController(); searchAbortRef.current = controller;
      const res = await searchAPI.search(searchTerm, 5, 'all', { signal: controller.signal });
      searchAPI.suggest(searchTerm, { signal: controller.signal }).then(r => setSuggestions(r.data?.suggestions || [])).catch(() => {});
      if (res.data?.success) {
        const items = res.data.results || res.data.data || [];
        setResults(Array.isArray(items) ? items : []);
      } else {
        setError(res.data?.message || "Search failed");
      }
    } catch (err) {
      if (err.code === 'ERR_CANCELED' || err.name === 'CanceledError') return;
      console.error("Global search error:", err);
      setError("Failed to fetch search results");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => () => {
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    searchAbortRef.current?.abort();
  }, []);

  // Debounced search input handler
  const handleSearchChange = (e) => {
    const value = e.target.value;
    setQuery(value);

    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    if (value.trim().length >= 3) {
      setLoading(true);
      setError(null);
      setShowDropdown(true);
      searchAbortRef.current?.abort();
      searchTimeoutRef.current = setTimeout(() => {
        performSearch(value);
      }, 500); // 500ms debounce
    } else {
      searchAbortRef.current?.abort();
      setLoading(false);
      setResults([]);
      setSuggestions([]);
      setShowDropdown(false);
    }
  };

  return (
    <header className="header">
      {/* Mobile hamburger button */}
      <button
        className="header-menu-btn"
        onClick={onMenuClick}
        aria-label="Open menu"
      >
        <svg
          width="24"
          height="24"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="2"
            d="M4 6h16M4 12h16M4 18h16"
          />
        </svg>
      </button>

      <div
        className="header-search-container"
        ref={dropdownRef}
        style={{ position: "relative" }}
      >
        <div className="header-search" role="combobox" aria-expanded={showDropdown} aria-controls="global-search-results">
          <svg
            width="20"
            height="20"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>
          <input
            ref={searchInputRef}
            type="text"
            placeholder="Search customers, invoices, orders..."
            value={query}
            onChange={(e) => { setActiveSearchIndex(0); handleSearchChange(e); }}
            onFocus={() => query.trim().length >= 3 && setShowDropdown(true)}
          />
        </div>
        {showDropdown && (
          <SearchDropdown
            results={results}
            loading={loading}
            error={error}
            query={query}
            onClose={() => setShowDropdown(false)}
            activeIndex={activeSearchIndex}
            suggestions={suggestions}
          />
        )}
      </div>

      <div className="header-actions">
        <div ref={notifRef} style={{position:'relative'}}>
          <button className="header-action-btn" title="Notifications" onClick={() => { setShowNotifications(v => !v); setShowUserDropdown(false); if (!showNotifications) loadNotifications(); }}><Bell size={20}/>{unread > 0 && <span className="notification-badge">{unread > 99 ? '99+' : unread}</span>}</button>
          {showNotifications && (
            <div className="notification-popover">
              <div className="notification-popover-header">
                <strong>Notifications</strong>
                <div>
                  <button title="Mark all read" onClick={markAllRead}><CheckCheck size={16}/></button>
                  <button title="Settings" onClick={() => {setShowNotifications(false);navigate('/notification-settings')}}><Settings size={16}/></button>
                </div>
              </div>
              <div className="notification-list">
                {notifications.map(item => (
                  <button key={item._id} className={`notification-item ${item.isRead ? '' : 'unread'}`} onClick={() => openNotification(item)}>
                    <strong>{item.title}</strong>
                    <span>{item.message}</span>
                    <small>{new Date(item.createdAt).toLocaleString()}</small>
                  </button>
                ))}
                {!notifications.length && <div className="notification-empty">No notifications yet.</div>}
              </div>
              <button className="notification-popover-footer" onClick={() => {setShowNotifications(false);navigate('/notification-settings')}}>Manage notification settings</button>
            </div>
          )}
        </div>

        <div className="user-menu-container" style={{ position: "relative" }}>
          <div
            className="user-menu"
            ref={userMenuRef}
            onClick={() => {
              setShowUserDropdown((open) => !open);
            }}
            title="User Menu"
          >
            <div className="user-avatar">
              {hasAvatar ? (
                <img
                  src={avatarUrl}
                  alt=""
                  onError={() => setAvatarError(true)}
                  style={{
                    width: "100%",
                    height: "100%",
                    borderRadius: "50%",
                    objectFit: "cover",
                  }}
                />
              ) : (
                initials
              )}
            </div>
            <div className="user-info-desktop">
              <div style={{ fontWeight: 600, fontSize: "14px" }}>
                {user?.firstName} {user?.lastName}
              </div>
              <div style={{ fontSize: "12px", color: "var(--gray-500)" }}>
                {user?.roleDisplayName || user?.role}
              </div>
            </div>
            <svg
              width="16"
              height="16"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              style={{ marginLeft: "8px", opacity: 0.5 }}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M19 9l-7 7-7-7"
              />
            </svg>
          </div>

          {showUserDropdown &&
            createPortal(
              <div
                className="header-dropdown header-dropdown-portal animate-fade-in"
                ref={userDropdownRef}
                style={userDropdownStyle}
              >
                <div className="dropdown-user-header">
                  <div
                    style={{
                      fontSize: "14px",
                      fontWeight: 600,
                      color: "var(--gray-800)",
                    }}
                  >
                    {user?.firstName} {user?.lastName}
                  </div>
                  <div
                    style={{
                      fontSize: "12px",
                      color: "var(--gray-500)",
                      marginTop: "2px",
                    }}
                  >
                    {user?.email}
                  </div>
                </div>

                <a
                  href="/dashboard"
                  className="dropdown-item"
                  onClick={(e) => {
                    e.preventDefault();
                    setShowUserDropdown(false);
                    navigate("/dashboard");
                  }}
                >
                  <LayoutDashboard size={18} style={{ marginRight: "8px" }} />
                  Dashboard
                </a>

                <div
                  style={{
                    height: "1px",
                    background: "var(--gray-50)",
                    margin: "4px 0",
                  }}
                ></div>

                <div className="dropdown-item logout" onClick={logout}>
                  <LogOut size={18} style={{ marginRight: "8px" }} />
                  Logout
                </div>
              </div>,
              document.body,
            )}
        </div>
      </div>
    </header>
  );
}

export default Header;
