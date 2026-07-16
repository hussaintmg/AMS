import React, {
  useState,
  useRef,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
} from "react";
import { createPortal } from "react-dom";
import "../styles/searchableSelect.css";

const SEARCHABLE_SELECT_ZINDEX = 20000;
const OPTION_ITEM_HEIGHT = 42;
const LIST_PADDING = 8;
const VIEWPORT_PADDING = 8;
const EDGE_GAP = 0;
const MIN_DROPDOWN_HEIGHT = 200;

function computeDropdownPosition(
  triggerRect,
  viewportHeight,
  viewportWidth,
  openAbove,
) {
  return {
    position: "fixed",
    top: openAbove ? "auto" : `${triggerRect.bottom + EDGE_GAP}px`,
    bottom: openAbove
      ? `${viewportHeight - triggerRect.top + EDGE_GAP}px`
      : "auto",
    left: `${Math.max(VIEWPORT_PADDING, Math.min(triggerRect.left, viewportWidth - triggerRect.width - VIEWPORT_PADDING))}px`,
    width: `${triggerRect.width}px`,
  };
}

function parseChildrenToOptions(children) {
  if (!children) return [];
  const options = [];
  React.Children.forEach(children, (child) => {
    if (child && child.type === "option") {
      options.push({
        value: child.props.value != null ? String(child.props.value) : "",
        label: child.props.children != null ? String(child.props.children) : "",
        disabled: child.props.disabled || false,
      });
    }
  });
  return options;
}

function normalizeOptions(options, labelField, valueField) {
  if (!options || !Array.isArray(options)) return [];
  return options.map((opt) => ({
    value: opt[valueField] != null ? String(opt[valueField]) : "",
    label: opt[labelField] != null ? String(opt[labelField]) : "",
    disabled: opt.disabled || false,
  }));
}

function detectField(options, defaultField, candidates) {
  if (!options || options.length === 0) return defaultField;
  for (const field of candidates) {
    if (options.some((opt) => opt[field] != null)) return field;
  }
  return defaultField;
}

function makeChangeEvent(name, value) {
  return {
    target: { name: name || "", value: value },
    preventDefault() {},
    stopPropagation() {},
    nativeEvent: new Event("change"),
    persist() {},
    type: "change",
  };
}

function CheckIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  );
}

function ArrowIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

let globalIdCounter = 0;

export default function SearchableSelect({
  name,
  value,
  onChange,
  children,
  options,
  labelField = "name",
  valueField = "id",
  placeholder = "",
  required,
  disabled,
  className = "",
  style,
}) {
  const containerRef = useRef(null);
  const triggerRef = useRef(null);
  const searchInputRef = useRef(null);
  const optionsListRef = useRef(null);
  const optionRefs = useRef({});
  const portalRef = useRef(null);
  const posRafRef = useRef(null);
  const closeTimerRef = useRef(null);
  const idRef = useRef(`ss-${++globalIdCounter}`);
  const touchActiveRef = useRef(false);

  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const [dropdownStyle, setDropdownStyle] = useState({});
  const [openAbove, setOpenAbove] = useState(false);
  const [viewportHeight, setViewportHeight] = useState(
    () => window.innerHeight || 800,
  );

  const resolvedValueField = useMemo(() => {
    if (valueField !== "id") return valueField;
    if (!options || !Array.isArray(options) || options.length === 0) return valueField;
    return options.some((opt) => opt[valueField] != null)
      ? valueField
      : detectField(options, valueField, ["value", "_id"]);
  }, [options, valueField]);

  const resolvedLabelField = useMemo(() => {
    if (labelField !== "name") return labelField;
    if (!options || !Array.isArray(options) || options.length === 0) return labelField;
    return options.some((opt) => opt[labelField] != null)
      ? labelField
      : detectField(options, labelField, ["label", "name"]);
  }, [options, labelField]);

  const allOptions = useMemo(() => {
    if (options && Array.isArray(options)) {
      return normalizeOptions(options, resolvedLabelField, resolvedValueField);
    }
    return parseChildrenToOptions(children);
  }, [options, children, resolvedLabelField, resolvedValueField]);

  const filteredOptions = useMemo(() => {
    if (!search.trim()) return allOptions;
    const q = search.toLowerCase().trim();
    return allOptions.filter(
      (opt) => opt.value === "" || opt.label.toLowerCase().includes(q),
    );
  }, [allOptions, search]);

  const selectedLabel = useMemo(() => {
    const sv = value != null ? String(value) : "";
    const match = allOptions.find((opt) => opt.value === sv);
    return match ? match.label : "";
  }, [allOptions, value]);

  const hasValue = value != null && String(value).length > 0;

  const calculatePosition = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    const vh = window.innerHeight || document.documentElement.clientHeight;
    const vw = window.innerWidth || document.documentElement.clientWidth;

    setViewportHeight(vh);

    const spaceBelow = vh - rect.bottom;
    const spaceAbove = rect.top;
    const needsAbove = spaceBelow < 220 && spaceAbove > spaceBelow;

    setOpenAbove(needsAbove);
    setDropdownStyle(computeDropdownPosition(rect, vh, vw, needsAbove));
  }, []);

  const schedulePositionUpdate = useCallback(() => {
    if (posRafRef.current) cancelAnimationFrame(posRafRef.current);
    posRafRef.current = requestAnimationFrame(calculatePosition);
  }, [calculatePosition]);

  const open = useCallback(() => {
    if (disabled) return;
    setIsOpen(true);
    setSearch("");
    setHighlightedIndex(-1);
  }, [disabled]);

  const close = useCallback(() => {
    setIsOpen(false);
    setSearch("");
    setHighlightedIndex(-1);
  }, []);

  const toggle = useCallback(() => {
    if (isOpen) close();
    else open();
  }, [isOpen, open, close]);

  const selectOption = useCallback(
    (opt) => {
      if (opt.disabled) return;
      if (onChange) onChange(makeChangeEvent(name, opt.value));
      close();
      if (triggerRef.current) triggerRef.current.focus();
    },
    [onChange, name, close],
  );

  const clearSelection = useCallback(
    (e) => {
      e.stopPropagation();
      if (onChange) onChange(makeChangeEvent(name, ""));
      close();
    },
    [onChange, name, close],
  );

  const scrollHighlightedIntoView = useCallback((index) => {
    const el = optionRefs.current[index];
    const list = optionsListRef.current;
    if (!el || !list) return;
    const listRect = list.getBoundingClientRect();
    const elRect = el.getBoundingClientRect();
    if (elRect.top < listRect.top) {
      list.scrollTop -= listRect.top - elRect.top;
    } else if (elRect.bottom > listRect.bottom) {
      list.scrollTop += elRect.bottom - listRect.bottom;
    }
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    if (highlightedIndex >= 0 && highlightedIndex < filteredOptions.length) {
      scrollHighlightedIntoView(highlightedIndex);
    }
  }, [
    highlightedIndex,
    isOpen,
    filteredOptions.length,
    scrollHighlightedIntoView,
  ]);

  useEffect(() => {
    if (!isOpen) return;
    setHighlightedIndex(-1);
  }, [search, isOpen]);

  useLayoutEffect(() => {
    if (!isOpen) return;
    calculatePosition();
    if (searchInputRef.current)
      searchInputRef.current.focus({ preventScroll: true });
  }, [isOpen, calculatePosition]);

  useEffect(() => {
    if (!isOpen) return;

    const onScroll = () => schedulePositionUpdate();
    const onResize = () => schedulePositionUpdate();

    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onResize, true);

    let vv = null;
    const onVVChange = () => schedulePositionUpdate();
    if (window.visualViewport) {
      vv = window.visualViewport;
      vv.addEventListener("resize", onVVChange);
      vv.addEventListener("scroll", onVVChange);
    }

    return () => {
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onResize, true);
      if (vv) {
        vv.removeEventListener("resize", onVVChange);
        vv.removeEventListener("scroll", onVVChange);
      }
      if (posRafRef.current) cancelAnimationFrame(posRafRef.current);
    };
  }, [isOpen, schedulePositionUpdate]);

  useEffect(() => {
    if (!isOpen) return;

    const handleOutsideInteraction = (e) => {
      const container = containerRef.current;
      const portal = portalRef.current;
      if (!container || !portal) return;
      const target = e.target;
      if (container.contains(target) || portal.contains(target)) return;

      if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
      closeTimerRef.current = setTimeout(() => {
        close();
      }, 0);
    };

    const handleKeyDownGlobal = (e) => {
      if (e.key === "Escape" && isOpen) {
        e.preventDefault();
        close();
        if (triggerRef.current) triggerRef.current.focus();
      }
    };

    document.addEventListener("mousedown", handleOutsideInteraction, true);
    document.addEventListener("touchstart", handleOutsideInteraction, true);
    document.addEventListener("pointerdown", handleOutsideInteraction, true);
    document.addEventListener("keydown", handleKeyDownGlobal, true);

    return () => {
      document.removeEventListener("mousedown", handleOutsideInteraction, true);
      document.removeEventListener(
        "touchstart",
        handleOutsideInteraction,
        true,
      );
      document.removeEventListener(
        "pointerdown",
        handleOutsideInteraction,
        true,
      );
      document.removeEventListener("keydown", handleKeyDownGlobal, true);
      if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    };
  }, [isOpen, close]);

  useEffect(() => {
    return () => {
      if (posRafRef.current) cancelAnimationFrame(posRafRef.current);
      if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    };
  }, []);

  const handleTriggerClick = useCallback((e) => {
    if (disabled) return;
    e.stopPropagation();
    toggle();
  }, [disabled, toggle]);

  const handleTriggerKeyDown = useCallback(
    (e) => {
      if (disabled) return;
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        if (!isOpen) {
          open();
          return;
        }
        const len = filteredOptions.length;
        if (len === 0) return;
        setHighlightedIndex((prev) => {
          if (e.key === "ArrowDown") {
            return prev < 0 ? 0 : (prev + 1) % len;
          }
          return prev <= 0 ? len - 1 : prev - 1;
        });
      } else if (e.key === "Enter" && isOpen) {
        e.preventDefault();
        if (
          highlightedIndex >= 0 &&
          highlightedIndex < filteredOptions.length
        ) {
          selectOption(filteredOptions[highlightedIndex]);
        }
      }
    },
    [disabled, isOpen, open, filteredOptions, highlightedIndex, selectOption],
  );

  const handleSearchKeyDown = useCallback(
    (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        close();
        if (triggerRef.current) triggerRef.current.focus();
        return;
      }
      const len = filteredOptions.length;
      if (e.key === "ArrowDown") {
        e.preventDefault();
        if (len === 0) return;
        setHighlightedIndex((prev) => (prev < 0 ? 0 : (prev + 1) % len));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        if (len === 0) return;
        setHighlightedIndex((prev) => (prev <= 0 ? len - 1 : prev - 1));
      } else if (e.key === "Enter") {
        e.preventDefault();
        if (highlightedIndex >= 0 && highlightedIndex < len) {
          selectOption(filteredOptions[highlightedIndex]);
        } else if (len > 0) {
          selectOption(filteredOptions[0]);
        }
      } else if (e.key === "Tab") {
        close();
      }
    },
    [close, filteredOptions, highlightedIndex, selectOption],
  );

  const handleSearchChange = useCallback((e) => {
    setSearch(e.target.value);
  }, []);

  const handleOptionMouseDown = useCallback(
    (e, opt, idx) => {
      e.preventDefault();
      e.stopPropagation();
      touchActiveRef.current = true;
      setHighlightedIndex(idx);
      selectOption(opt);
      requestAnimationFrame(() => {
        touchActiveRef.current = false;
      });
    },
    [selectOption],
  );

  const handleOptionTouchEnd = useCallback(
    (e, opt, idx) => {
      if (touchActiveRef.current) return;
      e.preventDefault();
      e.stopPropagation();
      setHighlightedIndex(idx);
      selectOption(opt);
    },
    [selectOption],
  );

  const handleOptionMouseEnter = useCallback((idx) => {
    setHighlightedIndex(idx);
  }, []);

  const listHeight = useMemo(() => {
    const availableHeight = viewportHeight * 0.5;
    const contentHeight =
      filteredOptions.length * OPTION_ITEM_HEIGHT + LIST_PADDING * 2;
    return Math.max(
      MIN_DROPDOWN_HEIGHT,
      Math.min(contentHeight, availableHeight),
    );
  }, [filteredOptions.length, viewportHeight]);

  const dropdownPortal = isOpen
    ? createPortal(
        <div
          ref={portalRef}
          className={`ss-portal-dropdown${openAbove ? " ss-above" : ""}`}
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            visibility:
              dropdownStyle.top != null || dropdownStyle.bottom != null
                ? "visible"
                : "hidden",
            ...dropdownStyle,
            maxHeight: `${listHeight}px`,
            zIndex: SEARCHABLE_SELECT_ZINDEX,
          }}
          role="listbox"
          aria-label="Options"
        >
          <div className="ss-search-wrapper">
            <span className="ss-search-icon">
              <SearchIcon />
            </span>
            <input
              ref={searchInputRef}
              className="ss-search-input"
              type="text"
              placeholder="Search..."
              value={search}
              onChange={handleSearchChange}
              onKeyDown={handleSearchKeyDown}
              autoComplete="off"
              spellCheck={false}
              role="combobox"
              aria-expanded={true}
              aria-autocomplete="list"
              aria-controls={`${idRef.current}-listbox`}
            />
          </div>
          <div
            ref={optionsListRef}
            className="ss-options-list"
            id={`${idRef.current}-listbox`}
            role="listbox"
            style={{
              maxHeight: `calc(${listHeight}px - 49px)`,
              overflowY: `${filteredOptions.length === 0 ? "hidden" : "auto"}`,
            }}
          >
            {filteredOptions.length === 0 && (
              <div className="ss-no-results">
                {search.trim() ? "No results found" : "No options available"}
              </div>
            )}
            {filteredOptions.map((opt, idx) => {
              const isSelected = opt.value === String(value || "");
              const isHighlighted = idx === highlightedIndex;
              const classes = [
                "ss-option",
                isSelected ? "ss-selected" : "",
                isHighlighted ? "ss-highlighted" : "",
                opt.disabled ? "ss-disabled-option" : "",
              ]
                .filter(Boolean)
                .join(" ");
              return (
                <div
                  key={`${opt.value}-${idx}`}
                  ref={(el) => {
                    optionRefs.current[idx] = el;
                  }}
                  className={classes}
                  role="option"
                  aria-selected={isSelected}
                  aria-disabled={opt.disabled}
                  onMouseDown={(e) => handleOptionMouseDown(e, opt, idx)}
                  onTouchEnd={(e) => handleOptionTouchEnd(e, opt, idx)}
                  onMouseEnter={() => handleOptionMouseEnter(idx)}
                >
                  <span className="ss-option-label">{opt.label}</span>
                  {isSelected && (
                    <span className="ss-check">
                      <CheckIcon />
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>,
        document.body,
      )
    : null;

  const containerClasses = [
    "searchable-select",
    disabled ? "ss-disabled" : "",
    isOpen ? "ss-open" : "",
    isOpen ? (openAbove ? "ss-above" : "ss-below") : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div ref={containerRef} className={containerClasses} style={style}>
      <input
        type="hidden"
        name={name}
        value={value != null ? String(value) : ""}
      />

      <div
        ref={triggerRef}
        className="ss-trigger"
        role="combobox"
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        aria-controls={isOpen ? `${idRef.current}-listbox` : undefined}
        tabIndex={disabled ? -1 : 0}
        onClick={handleTriggerClick}
        onPointerDown={(e) => e.stopPropagation()}
        onKeyDown={handleTriggerKeyDown}
      >
        {hasValue ? (
          <span className="ss-value">{selectedLabel}</span>
        ) : (
          <span className="ss-placeholder">{placeholder || "Select..."}</span>
        )}
        <span className="ss-actions">
          <span className="ss-arrow">
            <ArrowIcon />
          </span>
        </span>
      </div>

      {dropdownPortal}
    </div>
  );
}
