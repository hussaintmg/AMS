/**
 * Header Component
 * Created by LOGIXINVENTOR (PVT) Ltd.
 * www.logixinventor.com | AMS
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
import { searchAPI } from "../services/api";
import { getAvatarUrl } from "../utils/assetUrl";
import SearchDropdown from "./SearchDropdown";
import { LogOut, LayoutDashboard } from "lucide-react";

const USER_DROPDOWN_WIDTH = 240;
const USER_DROPDOWN_MAX_HEIGHT = 320;
const USER_DROPDOWN_GAP = 10;
const USER_DROPDOWN_EDGE_GAP = 8;

function Header({ onMenuClick }) {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [showUserDropdown, setShowUserDropdown] = useState(false);
  const [userDropdownStyle, setUserDropdownStyle] = useState({});
  const [avatarError, setAvatarError] = useState(false);
  const [error, setError] = useState(null);
  const dropdownRef = useRef(null);
  const userMenuRef = useRef(null);
  const userDropdownRef = useRef(null);
  const searchTimeoutRef = useRef(null);

  const hasAvatar = user?.avatar && !avatarError;
  const avatarUrl = hasAvatar ? getAvatarUrl(user.avatar) : "";
  const initials = user
    ? `${user.firstName?.[0] || ""}${user.lastName?.[0] || ""}`.toUpperCase()
    : "U";

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
      const res = await searchAPI.search(searchTerm);
      if (res.data.success) {
        setResults(res.data.data);
      } else {
        setError(res.data.message || "Search failed");
      }
    } catch (err) {
      console.error("Global search error:", err);
      setError("Failed to fetch search results");
    } finally {
      setLoading(false);
    }
  };

  // Debounced search input handler
  const handleSearchChange = (e) => {
    const value = e.target.value;
    setQuery(value);

    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    if (value.trim().length >= 3) {
      searchTimeoutRef.current = setTimeout(() => {
        performSearch(value);
      }, 500); // 500ms debounce
    } else {
      setResults([]);
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
        <div className="header-search">
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
            type="text"
            placeholder="Search leads, customers, vehicles..."
            value={query}
            onChange={handleSearchChange}
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
          />
        )}
      </div>

      <div className="header-actions">
        <button className="header-action-btn" title="Notifications">
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
              d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
            />
          </svg>
        </button>

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
