import React, {
  useState,
  useEffect,
  useRef,
  useCallback,
  useImperativeHandle,
  forwardRef,
} from 'react';
import { createPortal } from 'react-dom';
import { Search, X, ChevronDown, Loader2, Check } from 'lucide-react';
import useDebounce from '../hooks/useDebounce';
import useClickOutside from '../hooks/useClickOutside';
import './UniversalSearchDropdown.css';

var DEFAULT_GAP = 6;
var VIEWPORT_PADDING = 8;
var MIN_DROPDOWN_HEIGHT = 60;
var DEFAULT_MAX_HEIGHT = 320;
var DEFAULT_DEBOUNCE = 300;
var DEFAULT_MIN_QUERY = 1;
var DEFAULT_Z_INDEX = 10000;

function getViewport() {
  if (window.visualViewport) {
    return {
      width: window.visualViewport.width,
      height: window.visualViewport.height,
      offsetTop: window.visualViewport.offsetTop,
      offsetLeft: window.visualViewport.offsetLeft,
    };
  }
  return {
    width: window.innerWidth,
    height: window.innerHeight,
    offsetTop: 0,
    offsetLeft: 0,
  };
}

function calculatePosition(inputEl, viewport, maxDesiredHeight, dropdownWidth) {
  var inputRect = inputEl.getBoundingClientRect();
  var vpTop = viewport.offsetTop;
  var vpBottom = viewport.offsetTop + viewport.height;

  var spaceBelow = vpBottom - inputRect.bottom - DEFAULT_GAP;
  var spaceAbove = inputRect.top - vpTop - DEFAULT_GAP;

  var desired = Math.min(
    maxDesiredHeight,
    Math.max(spaceBelow, spaceAbove) - VIEWPORT_PADDING
  );

  var top, bottom, maxHeight, direction;

  if (spaceBelow >= desired + VIEWPORT_PADDING) {
    direction = 'below';
    top = inputRect.bottom + DEFAULT_GAP;
    maxHeight = Math.min(desired, spaceBelow - VIEWPORT_PADDING);
  } else if (spaceAbove >= desired + VIEWPORT_PADDING) {
    direction = 'above';
    top = undefined;
    bottom = viewport.height - inputRect.top + DEFAULT_GAP + vpTop;
    maxHeight = Math.min(desired, spaceAbove - VIEWPORT_PADDING);
  } else if (spaceBelow >= spaceAbove) {
    direction = 'below';
    top = inputRect.bottom + DEFAULT_GAP;
    maxHeight = Math.max(MIN_DROPDOWN_HEIGHT, spaceBelow - VIEWPORT_PADDING);
  } else {
    direction = 'above';
    top = undefined;
    bottom = viewport.height - inputRect.top + DEFAULT_GAP + vpTop;
    maxHeight = Math.max(MIN_DROPDOWN_HEIGHT, spaceAbove - VIEWPORT_PADDING);
  }

  maxHeight = Math.max(MIN_DROPDOWN_HEIGHT, Math.floor(maxHeight));

  if (direction === 'above') {
    bottom = Math.floor(bottom);
  } else {
    top = Math.floor(top);
  }

  var w = dropdownWidth || inputRect.width;
  var left = Math.floor(
    Math.max(
      VIEWPORT_PADDING,
      Math.min(
        inputRect.left,
        viewport.width + viewport.offsetLeft - w - VIEWPORT_PADDING
      )
    )
  );

  var width = Math.floor(w);

  return {
    top: top,
    bottom: bottom,
    left: left,
    width: width,
    maxHeight: maxHeight,
    direction: direction,
  };
}

function defaultRenderItem(item, opts) {
  return React.createElement(
    React.Fragment,
    null,
    React.createElement(
      'span',
      { className: 'usd-option-label' },
      item.label || item.value
    ),
    item.description
      ? React.createElement(
          'span',
          { className: 'usd-option-description' },
          item.description
        )
      : null,
    opts.selected
      ? React.createElement(Check, { size: 16, className: 'usd-option-check' })
      : null
  );
}

function defaultRenderTrigger(opts) {
  return React.createElement(
    'div',
    {
      className: 'usd-trigger' + (opts.disabled ? ' usd-trigger--disabled' : ''),
      onClick: opts.onToggle,
    },
    React.createElement(Search, { size: 16, className: 'usd-trigger-icon' }),
    React.createElement('input', opts.inputProps),
    opts.value
      ? React.createElement(
          'span',
          { className: 'usd-trigger-actions' },
          React.createElement(
            'button',
            {
              className: 'usd-trigger-clear',
              tabIndex: -1,
              'aria-label': 'Clear search',
              onClick: function (e) {
                e.stopPropagation();
                opts.onClear();
              },
            },
            React.createElement(X, { size: 14 })
          )
        )
      : null,
    React.createElement(
      'span',
      { className: 'usd-trigger-actions' },
      React.createElement(ChevronDown, {
        size: 16,
        className:
          'usd-trigger-chevron' +
          (opts.isOpen ? ' usd-trigger-chevron--open' : ''),
      })
    )
  );
}

function defaultRenderLoading() {
  return React.createElement(
    'div',
    { className: 'usd-skeleton' },
    React.createElement('div', { className: 'usd-skeleton-line' }),
    React.createElement('div', { className: 'usd-skeleton-line' }),
    React.createElement('div', { className: 'usd-skeleton-line' }),
    React.createElement('div', { className: 'usd-skeleton-line' }),
    React.createElement('div', { className: 'usd-skeleton-line' })
  );
}

function defaultRenderEmpty(query) {
  return React.createElement(
    'div',
    { className: 'usd-state' },
    React.createElement(Search, { size: 24, className: 'usd-state-icon' }),
    React.createElement(
      'div',
      { className: 'usd-state-text' },
      'No results for "' + query + '"'
    ),
    React.createElement(
      'div',
      { className: 'usd-state-hint' },
      'Try a different search term'
    )
  );
}

function defaultRenderInitial() {
  return React.createElement(
    'div',
    { className: 'usd-state' },
    React.createElement(Search, { size: 24, className: 'usd-state-icon' }),
    React.createElement(
      'div',
      { className: 'usd-state-text' },
      'Start typing to search'
    ),
    React.createElement(
      'div',
      { className: 'usd-state-hint' },
      'Minimum ' + DEFAULT_MIN_QUERY + ' character' + (DEFAULT_MIN_QUERY !== 1 ? 's' : '')
    )
  );
}

function defaultRenderError(error) {
  return React.createElement(
    'div',
    { className: 'usd-state' },
    React.createElement(
      'div',
      { className: 'usd-state-text' },
      error || 'An error occurred'
    ),
    React.createElement(
      'div',
      { className: 'usd-state-hint' },
      'Please try again'
    )
  );
}

var UniversalSearchDropdown = forwardRef(function UniversalSearchDropdown(props, ref) {
  var fetchResults = props.fetchResults || function () {
    return Promise.resolve([]);
  };
  var onSelect = props.onSelect || function () {};
  var onInputChange = props.onInputChange || function () {};
  var onOpen = props.onOpen || function () {};
  var onClose = props.onClose || function () {};
  var externalValue = props.value || '';
  var placeholder = props.placeholder || 'Search...';
  var debounceMs = props.debounceMs || DEFAULT_DEBOUNCE;
  var minQueryLength = props.minQueryLength || DEFAULT_MIN_QUERY;
  var disabled = props.disabled || false;
  var zIndex = props.zIndex || DEFAULT_Z_INDEX;
  var portalTarget = props.portalTarget || document.body;
  var className = props.className || '';
  var renderItem = props.renderItem || defaultRenderItem;
  var renderTrigger = props.renderTrigger || defaultRenderTrigger;
  var renderLoading = props.renderLoading || defaultRenderLoading;
  var renderEmpty = props.renderEmpty || defaultRenderEmpty;
  var renderInitial = props.renderInitial || defaultRenderInitial;
  var renderError = props.renderError || defaultRenderError;
  var maxDesiredHeight = props.maxHeight || DEFAULT_MAX_HEIGHT;
  var dropdownWidth = props.width || null;
  var showFooter =
    props.showFooter !== undefined ? props.showFooter : true;

  var _useState = useState(false);
  var isOpen = _useState[0];
  var setIsOpen = _useState[1];

  var _useState2 = useState(externalValue);
  var query = _useState2[0];
  var setQuery = _useState2[1];

  var _useState3 = useState([]);
  var results = _useState3[0];
  var setResults = _useState3[1];

  var _useState4 = useState(false);
  var isLoading = _useState4[0];
  var setIsLoading = _useState4[1];

  var _useState5 = useState(-1);
  var highlightedIndex = _useState5[0];
  var setHighlightedIndex = _useState5[1];

  var _useState6 = useState(null);
  var position = _useState6[0];
  var setPosition = _useState6[1];

  var _useState7 = useState(null);
  var error = _useState7[0];
  var setError = _useState7[1];

  var wrapperRef = useClickOutside(function () {
    if (isOpenRef.current) {
      setIsOpen(false);
      onClose();
    }
  });

  var inputRef = useRef(null);
  var dropdownRef = useRef(null);
  var listRef = useRef(null);
  var abortRef = useRef(null);
  var rafRef = useRef(null);
  var isOpenRef = useRef(false);
  var positionTimerRef = useRef(null);

  isOpenRef.current = isOpen;

  useEffect(
    function () {
      setQuery(externalValue);
    },
    [externalValue]
  );

  var debouncedQuery = useDebounce(query, debounceMs);

  var handleSearch = useCallback(
    function (q) {
      if (abortRef.current) {
        abortRef.current.abort();
      }
      if (q.length < minQueryLength) {
        setResults([]);
        setIsLoading(false);
        setError(null);
        return;
      }
      var controller = new AbortController();
      abortRef.current = controller;
      setIsLoading(true);
      setError(null);
      Promise.resolve(fetchResults(q, controller.signal))
        .then(function (data) {
          if (!controller.signal.aborted) {
            setResults(Array.isArray(data) ? data : []);
            setIsLoading(false);
          }
        })
        .catch(function (err) {
          if (err && err.name === 'AbortError') return;
          if (!controller.signal.aborted) {
            setResults([]);
            setIsLoading(false);
            setError(
              err && err.message ? err.message : 'Search failed'
            );
          }
        });
    },
    [fetchResults, minQueryLength]
  );

  useEffect(
    function () {
      handleSearch(debouncedQuery);
    },
    [debouncedQuery, handleSearch]
  );

  useEffect(
    function () {
      setHighlightedIndex(-1);
    },
    [query]
  );

  var reposition = useCallback(
    function () {
      if (!inputRef.current || !isOpenRef.current) return;
      var vp = getViewport();
      var pos = calculatePosition(
        inputRef.current,
        vp,
        maxDesiredHeight,
        dropdownWidth
      );
      setPosition(pos);
    },
    [maxDesiredHeight, dropdownWidth]
  );

  var open = useCallback(
    function () {
      if (disabled) return;
      setIsOpen(true);
      onOpen();
    },
    [disabled, onOpen]
  );

  var close = useCallback(
    function () {
      setIsOpen(false);
      onClose();
    },
    [onClose]
  );

  var toggle = useCallback(
    function () {
      if (disabled) return;
      setIsOpen(function (prev) {
        if (prev) {
          onClose();
        } else {
          onOpen();
        }
        return !prev;
      });
    },
    [disabled, onOpen, onClose]
  );

  useImperativeHandle(
    ref,
    function () {
      return {
        open: open,
        close: close,
        toggle: toggle,
        reposition: reposition,
        updateResults: function () {
          handleSearch(debouncedQuery);
        },
      };
    },
    [open, close, toggle, reposition, handleSearch, debouncedQuery]
  );

  var handleInputChange = useCallback(
    function (e) {
      var v = e.target.value;
      setQuery(v);
      onInputChange(v);
    },
    [onInputChange]
  );

  var handleClear = useCallback(
    function () {
      setQuery('');
      onInputChange('');
      if (inputRef.current) {
        inputRef.current.focus();
      }
    },
    [onInputChange]
  );

  var handleItemClick = useCallback(
    function (item, index) {
      onSelect(item);
      close();
      setHighlightedIndex(index);
    },
    [onSelect, close]
  );

  var handleItemMouseEnter = useCallback(function (index) {
    setHighlightedIndex(index);
  }, []);

  var handleKeyDown = useCallback(
    function (e) {
      if (!isOpen) return;

      var selectableCount = Array.isArray(results) ? results.length : 0;

      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          setHighlightedIndex(function (prev) {
            return prev < selectableCount - 1 ? prev + 1 : 0;
          });
          break;
        case 'ArrowUp':
          e.preventDefault();
          setHighlightedIndex(function (prev) {
            return prev > 0 ? prev - 1 : selectableCount - 1;
          });
          break;
        case 'Enter':
          e.preventDefault();
          if (
            highlightedIndex >= 0 &&
            highlightedIndex < selectableCount
          ) {
            onSelect(results[highlightedIndex]);
            close();
          }
          break;
        case 'Escape':
          e.preventDefault();
          close();
          break;
        default:
          break;
      }
    },
    [isOpen, results, highlightedIndex, onSelect, close]
  );

  useEffect(
    function () {
      if (!isOpen) {
        setPosition(null);
        setError(null);
        return;
      }
      reposition();

      function handlePositionUpdate() {
        if (positionTimerRef.current) {
          cancelAnimationFrame(positionTimerRef.current);
        }
        positionTimerRef.current = requestAnimationFrame(reposition);
      }

      window.addEventListener('scroll', handlePositionUpdate, true);
      window.addEventListener('resize', handlePositionUpdate);

      var vv = window.visualViewport;
      if (vv) {
        vv.addEventListener('resize', handlePositionUpdate);
        vv.addEventListener('scroll', handlePositionUpdate);
      }

      var ro = null;
      if (typeof ResizeObserver !== 'undefined' && dropdownRef.current) {
        ro = new ResizeObserver(function () {
          if (positionTimerRef.current) {
            cancelAnimationFrame(positionTimerRef.current);
          }
          positionTimerRef.current = requestAnimationFrame(reposition);
        });
        ro.observe(dropdownRef.current);
      }

      return function () {
        window.removeEventListener('scroll', handlePositionUpdate, true);
        window.removeEventListener('resize', handlePositionUpdate);
        if (vv) {
          vv.removeEventListener('resize', handlePositionUpdate);
          vv.removeEventListener('scroll', handlePositionUpdate);
        }
        if (positionTimerRef.current) {
          cancelAnimationFrame(positionTimerRef.current);
        }
        if (ro) {
          ro.disconnect();
        }
      };
    },
    [isOpen, reposition]
  );

  useEffect(
    function () {
      if (highlightedIndex < 0 || !listRef.current) return;
      var items = listRef.current.querySelectorAll('.usd-option');
      if (items[highlightedIndex]) {
        items[highlightedIndex].scrollIntoView({ block: 'nearest' });
      }
    },
    [highlightedIndex]
  );

  var bodyContent;
  if (error) {
    bodyContent = renderError(error);
  } else if (isLoading) {
    bodyContent = renderLoading();
  } else if (!query || query.length < minQueryLength) {
    bodyContent = renderInitial();
  } else if (results.length === 0) {
    bodyContent = renderEmpty(query);
  } else {
    bodyContent = results.map(function (item, index) {
      var itemClass = 'usd-option';
      if (index === highlightedIndex) {
        itemClass += ' usd-option--highlighted';
      }
      if (item.selected) {
        itemClass += ' usd-option--selected';
      }
      return React.createElement(
        'div',
        {
          key: item.value != null ? item.value : index,
          className: itemClass,
          role: 'option',
          'aria-selected': index === highlightedIndex,
          id: 'usd-option-' + index,
          'data-index': index,
          onClick: function () {
            handleItemClick(item, index);
          },
          onMouseEnter: function () {
            handleItemMouseEnter(index);
          },
          onTouchStart: function () {
            setHighlightedIndex(index);
          },
        },
        renderItem(item, {
          highlighted: index === highlightedIndex,
          selected: !!item.selected,
          index: index,
        })
      );
    });
  }

  var inputProps = {
    ref: inputRef,
    type: 'text',
    className: 'usd-trigger-input',
    placeholder: placeholder,
    value: query,
    disabled: disabled,
    onChange: handleInputChange,
    onFocus: open,
    onKeyDown: handleKeyDown,
    'aria-autocomplete': 'list',
    'aria-expanded': isOpen,
    'aria-controls': isOpen ? 'usd-listbox' : undefined,
    'aria-activedescendant':
      highlightedIndex >= 0 ? 'usd-option-' + highlightedIndex : undefined,
    autoComplete: 'off',
    spellCheck: false,
  };

  return React.createElement(
    'div',
    {
      ref: wrapperRef,
      className:
        'usd-wrapper' +
        (disabled ? ' usd-wrapper--disabled' : '') +
        (className ? ' ' + className : ''),
    },
    renderTrigger({
      value: query,
      placeholder: placeholder,
      isOpen: isOpen,
      disabled: disabled,
      inputProps: inputProps,
      onClear: handleClear,
      onToggle: toggle,
    }),
    isOpen && portalTarget
      ? createPortal(
          React.createElement(
            'div',
            { className: 'usd-portal', style: { zIndex: zIndex } },
            React.createElement(
              'div',
              {
                ref: dropdownRef,
                className:
                  'usd-dropdown' +
                  (position && position.direction === 'above'
                    ? ' usd-dropdown--above'
                    : ''),
                style: {
                  top:
                    position && position.top != null
                      ? position.top + 'px'
                      : undefined,
                  bottom:
                    position && position.bottom != null
                      ? position.bottom + 'px'
                      : undefined,
                  left: position ? position.left + 'px' : 0,
                  width: position ? position.width + 'px' : 'auto',
                  maxHeight: position
                    ? position.maxHeight + 'px'
                    : 'auto',
                  zIndex: zIndex,
                },
                role: 'listbox',
                id: 'usd-listbox',
                'aria-label': placeholder,
              },
              React.createElement(
                'div',
                { ref: listRef, className: 'usd-body' },
                bodyContent
              ),
              showFooter
                ? React.createElement(
                    'div',
                    { className: 'usd-footer' },
                    React.createElement(
                      'span',
                      { className: 'usd-footer-item' },
                      React.createElement(
                        'kbd',
                        { className: 'usd-footer-kbd' },
                        '\u2191'
                      ),
                      React.createElement(
                        'kbd',
                        { className: 'usd-footer-kbd' },
                        '\u2193'
                      ),
                      ' Navigate'
                    ),
                    React.createElement(
                      'span',
                      { className: 'usd-footer-item' },
                      React.createElement(
                        'kbd',
                        { className: 'usd-footer-kbd' },
                        '\u23CE'
                      ),
                      ' Select'
                    ),
                    React.createElement(
                      'span',
                      { className: 'usd-footer-item' },
                      React.createElement(
                        'kbd',
                        { className: 'usd-footer-kbd' },
                        'ESC'
                      ),
                      ' Close'
                    )
                  )
                : null
            )
          ),
          portalTarget
        )
      : null
  );
});

UniversalSearchDropdown.displayName = 'UniversalSearchDropdown';

export default UniversalSearchDropdown;
