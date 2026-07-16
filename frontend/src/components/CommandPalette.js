import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, X, ArrowUp, ArrowDown, Command, Bolt, UserPlus, Users, FileText, ShoppingCart, CalendarCheck, Truck, Package, Briefcase, Calendar, DollarSign, BookOpen, LayoutDashboard, BarChart3, Wrench, Warehouse, UserCircle, Shield, Settings, ScrollText, Server, User, LogOut, Bell, ClipboardList } from 'lucide-react';
import { useSearch } from '../context/SearchContext';
import '../styles/commandPalette.css';

const ACTION_ICONS = {
  UserPlus: UserPlus,
  Users: Users,
  FileText: FileText,
  ShoppingCart: ShoppingCart,
  CalendarCheck: CalendarCheck,
  Truck: Truck,
  Package: Package,
  Briefcase: Briefcase,
  Calendar: Calendar,
  DollarSign: DollarSign,
  BookOpen: BookOpen,
  LayoutDashboard: LayoutDashboard,
  BarChart3: BarChart3,
  Wrench: Wrench,
  Warehouse: Warehouse,
  UserCircle: UserCircle,
  Shield: Shield,
  Settings: Settings,
  ScrollText: ScrollText,
  Server: Server,
  User: User,
  LogOut: LogOut,
  Search: Search,
  Bolt: Bolt,
  Bell: Bell,
  ClipboardList: ClipboardList,
  Command: Command,
};

export default function CommandPalette() {
  const navigate = useNavigate();
  const { isCommandPaletteOpen, closeCommandPalette, commandQuery, setCommandQuery, getFilteredCommands, executeCommand } = useSearch();
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef(null);
  const listRef = useRef(null);

  useEffect(() => {
    if (isCommandPaletteOpen) {
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [isCommandPaletteOpen]);

  const commands = getFilteredCommands(commandQuery);

  useEffect(() => {
    setSelectedIndex(0);
  }, [commandQuery]);

  const handleKeyDown = (e) => {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setSelectedIndex(prev => (prev < commands.length - 1 ? prev + 1 : 0));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setSelectedIndex(prev => (prev > 0 ? prev - 1 : commands.length - 1));
        break;
      case 'Enter':
        e.preventDefault();
        if (commands[selectedIndex]) {
          executeCommand(commands[selectedIndex], navigate);
        }
        break;
      case 'Escape':
        e.preventDefault();
        closeCommandPalette();
        break;
      default:
        break;
    }
  };

  useEffect(() => {
    if (selectedIndex >= 0 && listRef.current) {
      const items = listRef.current.querySelectorAll('.cp-item');
      if (items[selectedIndex]) {
        items[selectedIndex].scrollIntoView({ block: 'nearest' });
      }
    }
  }, [selectedIndex]);

  const renderIcon = (iconName) => {
    const Icon = ACTION_ICONS[iconName];
    return Icon ? <Icon size={16} /> : <Bolt size={16} />;
  };

  if (!isCommandPaletteOpen) return null;

  return (
    <div className="command-palette-overlay" onClick={closeCommandPalette}>
      <div className="command-palette" onClick={e => e.stopPropagation()} onKeyDown={handleKeyDown}>
        <div className="cp-header">
          <div className="cp-input-wrapper">
            <Command size={18} />
            <input
              ref={inputRef}
              type="text"
              className="cp-input"
              placeholder="Type a command or search..."
              value={commandQuery}
              onChange={e => setCommandQuery(e.target.value)}
              onKeyDown={handleKeyDown}
            />
            {commandQuery && (
              <button className="cp-clear-btn" onClick={() => setCommandQuery('')}>
                <X size={16} />
              </button>
            )}
          </div>
        </div>

        <div className="cp-body" ref={listRef}>
          {commands.length === 0 ? (
            <div className="cp-empty">
              <Search size={24} />
              <span>No commands found</span>
            </div>
          ) : (
            commands.map((cmd, idx) => (
              <div
                key={cmd.id}
                className={`cp-item ${idx === selectedIndex ? 'selected' : ''}`}
                onClick={() => executeCommand(cmd, navigate)}
                onMouseEnter={() => setSelectedIndex(idx)}
              >
                <div className="cp-item-icon">
                  {renderIcon(cmd.icon)}
                </div>
                <div className="cp-item-text">
                  <span className="cp-item-label">{cmd.label}</span>
                  <span className="cp-item-url">{cmd.url}</span>
                </div>
              </div>
            ))
          )}
        </div>

        <div className="cp-footer">
          <span><ArrowUp size={12} /> <ArrowDown size={12} /> Navigate</span>
          <span><kbd>Enter</kbd> Run</span>
          <span><kbd>ESC</kbd> Close</span>
        </div>
      </div>
    </div>
  );
}
