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
import { useSearch } from "../context/SearchContext";
import { notificationsAPI } from "../services/api";
import { getAvatarUrl } from "../utils/assetUrl";
import { LogOut, LayoutDashboard, Bell, Settings, CheckCheck, Search, Command } from "lucide-react";
import SearchDropdown from "./SearchDropdown";
import eventBus from "../utils/eventBus";
import "../styles/notifications.css";

const USER_DROPDOWN_WIDTH = 240;
const USER_DROPDOWN_MAX_HEIGHT = 320;
const USER_DROPDOWN_GAP = 10;
const USER_DROPDOWN_EDGE_GAP = 8;

function Header({ onMenuClick }) {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const { searchQuery, setSearchQuery, performSearch, openCommandPalette } = useSearch();
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [showUserDropdown, setShowUserDropdown] = useState(false);
  const [userDropdownStyle, setUserDropdownStyle] = useState({});
  const [avatarError, setAvatarError] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [unread, setUnread] = useState(0);
  const userMenuRef = useRef(null);
  const userDropdownRef = useRef(null);
  const searchInputRef = useRef(null);
  const notifRef = useRef(null);

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
    const viewportWidth = window.innerWidth || document.documentElement.clientWidth;
    const viewportHeight = window.innerHeight || document.documentElement.clientHeight;
    const spaceBelow = viewportHeight - rect.bottom - USER_DROPDOWN_GAP;
    const spaceAbove = rect.top - USER_DROPDOWN_GAP;
    const dropdownContentHeight = userDropdownRef.current?.scrollHeight || USER_DROPDOWN_MAX_HEIGHT;
    const dropdownHeight = Math.min(dropdownContentHeight, USER_DROPDOWN_MAX_HEIGHT);
    const openUp = spaceBelow < dropdownHeight && spaceAbove > spaceBelow;
    const availableSpace = Math.max(120, Math.min(USER_DROPDOWN_MAX_HEIGHT, openUp ? spaceAbove : spaceBelow));
    const visibleHeight = Math.min(dropdownContentHeight, availableSpace);
    const needsScrollbar = dropdownContentHeight > availableSpace;
    const left = Math.max(USER_DROPDOWN_EDGE_GAP, Math.min(rect.right - USER_DROPDOWN_WIDTH, viewportWidth - USER_DROPDOWN_WIDTH - USER_DROPDOWN_EDGE_GAP));
    setUserDropdownStyle({
      position: "fixed",
      top: openUp ? `${Math.max(USER_DROPDOWN_EDGE_GAP, rect.top - visibleHeight - USER_DROPDOWN_GAP)}px` : `${rect.bottom + USER_DROPDOWN_GAP}px`,
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
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        openCommandPalette();
      }
    };
    document.addEventListener('keydown', handleShortcut);
    return () => document.removeEventListener('keydown', handleShortcut);
  }, [openCommandPalette]);

  useEffect(() => {
    const handler = () => logout();
    eventBus.on('command:logout', handler);
    return () => eventBus.remove('command:logout', handler);
  }, [logout]);

  useEffect(() => {
    if (!showUserDropdown) return undefined;
    positionUserDropdown();
    const handleClickOutside = (event) => {
      const clickedTrigger = userMenuRef.current && userMenuRef.current.contains(event.target);
      const clickedDropdown = userDropdownRef.current && userDropdownRef.current.contains(event.target);
      if (!clickedTrigger && !clickedDropdown) setShowUserDropdown(false);
    };
    const handleKey = (event) => { if (event.key === "Escape") setShowUserDropdown(false); };
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKey);
    window.addEventListener("resize", positionUserDropdown);
    window.addEventListener("scroll", positionUserDropdown, true);
    let resizeFrame = null;
    const resizeObserver = typeof ResizeObserver !== "undefined" && userDropdownRef.current
      ? new ResizeObserver(() => {
          if (resizeFrame) cancelAnimationFrame(resizeFrame);
          resizeFrame = requestAnimationFrame(positionUserDropdown);
        })
      : null;
    if (resizeObserver && userDropdownRef.current) resizeObserver.observe(userDropdownRef.current);
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
      if (notifRef.current && !notifRef.current.contains(event.target)) setShowNotifications(false);
    };
    const handleKey = (event) => { if (event.key === "Escape") setShowNotifications(false); };
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKey);
    };
  }, [showNotifications]);

  const handleSearchFocus = () => {
    setIsSearchOpen(true);
  };

  const handleSearchChange = (e) => {
    const value = e.target.value;
    setSearchQuery(value);
    if (value.length >= 2) performSearch(value);
  };

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    const term = searchQuery.trim();
    if (!term) return;
    if (isSearchOpen) {
      setIsSearchOpen(false);
    }
    navigate(`/search?q=${encodeURIComponent(term)}`);
  };

  const openSearch = () => {
    setIsSearchOpen(true);
  };

  return (
    <header className="header">
      <button className="header-menu-btn" onClick={onMenuClick} aria-label="Open menu">
        <svg width="24" height="24" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      </button>

      <div className="header-search-container" style={{ position: "relative" }}>
        <form className={`header-search ${isSearchOpen ? "is-open" : ""}`} onSubmit={handleSearchSubmit}>
          <button type="button" className="header-search-open" aria-label="Open search" onClick={openSearch}>
            <Search size={18} aria-hidden="true" />
          </button>
          <input
            ref={searchInputRef}
            type="search"
            placeholder="Search anything... (Ctrl+K for commands)"
            value={searchQuery}
            onFocus={handleSearchFocus}
            onChange={handleSearchChange}
          />
          <button type="submit" className="header-search-submit" aria-label="Search">
            <Search size={17} aria-hidden="true" />
          </button>
        </form>
        <SearchDropdown
          isOpen={isSearchOpen}
          onClose={() => setIsSearchOpen(false)}
        />
      </div>

      <div className="header-actions">
        <button
          className="header-action-btn header-command-btn"
          title="Command Palette (Ctrl+K)"
          onClick={openCommandPalette}
        >
          <Command size={18} />
        </button>

        <div ref={notifRef} style={{position:'relative'}}>
          <button className="header-action-btn" title="Notifications" onClick={() => { setShowNotifications(v => !v); setShowUserDropdown(false); if (!showNotifications) loadNotifications(); }}>
            <Bell size={20}/>{unread > 0 && <span className="notification-badge">{unread > 99 ? '99+' : unread}</span>}
          </button>
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
          <div className="user-menu" ref={userMenuRef} onClick={() => { setShowUserDropdown((open) => !open); }} title="User Menu">
            <div className="user-avatar">
              {hasAvatar ? (
                <img src={avatarUrl} alt="" onError={() => setAvatarError(true)} style={{ width: "100%", height: "100%", borderRadius: "50%", objectFit: "cover" }} />
              ) : initials}
            </div>
            <div className="user-info-desktop">
              <div style={{ fontWeight: 600, fontSize: "14px" }}>{user?.firstName} {user?.lastName}</div>
              <div style={{ fontSize: "12px", color: "var(--gray-500)" }}>{user?.roleDisplayName || user?.role}</div>
            </div>
            <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" style={{ marginLeft: "8px", opacity: 0.5 }}>
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
            </svg>
          </div>

          {showUserDropdown && createPortal(
            <div className="header-dropdown header-dropdown-portal animate-fade-in" ref={userDropdownRef} style={userDropdownStyle}>
              <div className="dropdown-user-header">
                <div style={{ fontSize: "14px", fontWeight: 600, color: "var(--gray-800)" }}>{user?.firstName} {user?.lastName}</div>
                <div style={{ fontSize: "12px", color: "var(--gray-500)", marginTop: "2px" }}>{user?.email}</div>
              </div>
              <a href="/dashboard" className="dropdown-item" onClick={(e) => { e.preventDefault(); setShowUserDropdown(false); navigate("/dashboard"); }}>
                <LayoutDashboard size={18} style={{ marginRight: "8px" }} />
                Dashboard
              </a>
              <div style={{ height: "1px", background: "var(--gray-50)", margin: "4px 0" }}></div>
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
