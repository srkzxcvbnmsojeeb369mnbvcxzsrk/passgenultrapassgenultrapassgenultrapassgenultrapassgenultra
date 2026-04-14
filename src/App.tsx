import React, { useState, useEffect, useRef } from 'react';
import { 
  Menu, 
  MoreVertical,
  Settings as SettingsIcon, 
  History, 
  Copy, 
  Trash2, 
  ChevronDown,
  X,
  Shield,
  Cloud,
  RefreshCw,
  Calendar,
  User,
  Check,
  LogOut,
  Monitor,
  Moon,
  Sun,
  Download,
  Search,
  ArrowRight,
  Lock,
  Key,
  AlertCircle,
  Eye,
  EyeOff,
  Plus,
  StickyNote,
  Edit3,
  LayoutGrid,
  List,
  Lightbulb,
  ArrowUpDown,
  Square,
  CheckSquare,
  Archive,
  Pin,
  Info,
  Tag
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from './lib/utils';
import CryptoJS from 'crypto-js';
import { auth, signInWithGoogle, logout, db } from './firebase';
import { onAuthStateChanged, User as FirebaseUser } from 'firebase/auth';
import { doc, setDoc, getDoc } from 'firebase/firestore';
import { GoogleGenAI } from "@google/genai";
import { Note, PasswordOptions, AppSettings, AccentColor, Theme, HistoryItem, BackupData, PasswordType, Label, BackupMeta, DriveFile } from './types';
import { backupToCloud, restoreFromCloud, listBackupVersions } from './lib/backup';
import { initDriveClient, signInToDrive, exportToDrive, listDriveBackups, downloadFromDrive, deleteFromDrive, checkDriveAuth } from './lib/googleDrive';

// --- Constants ---
const CHARSETS = {
  small: 'abcdefghijklmnopqrstuvwxyz',
  capital: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
  numbers: '0123456789',
  special: '!@#$%^&*()_+-=[]{}|;:,.<>?/~`',
  similar: 'O0Il1',
  ambiguous: '{}[]()/\\\'"`~,;:.<>',
  consonants: 'bcdfghjklmnpqrstvwxyz',
  vowels: 'aeiou'
};

const WORD_LIST = [
  'apple', 'banana', 'coffee', 'dragon', 'eagle', 'forest', 'guitar', 'helmet', 'island', 'jacket',
  'karma', 'lemon', 'mango', 'ninja', 'ocean', 'pizza', 'quest', 'robot', 'sunset', 'tiger',
  'umbrella', 'violet', 'wizard', 'xylon', 'yellow', 'zebra', 'amber', 'bravo', 'cloud', 'delta',
  'echo', 'frost', 'gamma', 'hotel', 'indigo', 'jupiter', 'kilo', 'lunar', 'magic', 'nova',
  'omega', 'pulse', 'quartz', 'radar', 'solar', 'tetra', 'ultra', 'vector', 'wave', 'zulu'
];

const ACCENT_COLORS = [
  { name: 'Indigo', value: '#4f46e5' },
  { name: 'Emerald', value: '#10b981' },
  { name: 'Rose', value: '#f43f5e' },
  { name: 'Amber', value: '#f59e0b' },
  { name: 'Violet', value: '#8b5cf6' },
  { name: 'Blue', value: '#3b82f6' },
];

// --- Error Handling ---
enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId: string | undefined;
    email: string | null | undefined;
    emailVerified: boolean | undefined;
    isAnonymous: boolean | undefined;
    tenantId: string | null | undefined;
    providerInfo: {
      providerId: string;
      displayName: string | null;
      email: string | null;
      photoUrl: string | null;
    }[];
  }
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData.map(provider => ({
        providerId: provider.providerId,
        displayName: provider.displayName,
        email: provider.email,
        photoUrl: provider.photoURL
      })) || []
    },
    operationType,
    path
  }
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

const ErrorBoundary: any = class extends React.Component<any, any> {
  constructor(props: any) {
    super(props);
    (this as any).state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("ErrorBoundary caught an error", error, errorInfo);
  }

  render() {
    const s = (this as any).state;
    if (s.hasError) {
      let message = "Something went wrong.";
      try {
        const parsed = JSON.parse(s.error?.message || '{}');
        if (parsed.error) message = `Firestore Error: ${parsed.error}`;
      } catch (e) {
        message = s.error?.message || message;
      }
      return (
        <div className="min-h-screen flex items-center justify-center bg-red-50 p-4 text-center">
          <div className="bg-white p-8 rounded-3xl shadow-xl max-w-md">
            <AlertCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Oops!</h2>
            <p className="text-gray-600 mb-6">{message}</p>
            <button 
              onClick={() => window.location.reload()} 
              className="bg-accent text-white px-8 py-3 rounded-xl font-bold"
            >
              Reload App
            </button>
          </div>
        </div>
      );
    }

    return (this as any).props.children;
  }
}

export default function App() {
  return (
    <ErrorBoundary>
      <AppContent />
    </ErrorBoundary>
  );
}

function AppContent() {
  const [showSplash, setShowSplash] = useState(true);
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [theme, setTheme] = useState<Theme>(() => (localStorage.getItem('theme') as Theme) || 'auto');
  const [activeModal, setActiveModal] = useState<string | null>(null);
  
  const [password, setPassword] = useState('P@$$w0rd!');
  const [passwordType, setPasswordType] = useState<PasswordType>('random');
  const [passLength, setPassLength] = useState(16);
  const [options, setOptions] = useState<PasswordOptions>({
    length: 16,
    includeSmall: true,
    includeCapital: true,
    includeNumbers: true,
    includeSpecial: true,
    excludeConfusing: false
  });
  const [passwordHistory, setPasswordHistory] = useState<HistoryItem[]>(() => {
    const saved = localStorage.getItem('savedPasswordGenHistory');
    return saved ? JSON.parse(saved) : [];
  });
  const [historySearchQuery, setHistorySearchQuery] = useState('');
  const [selectedHistoryItems, setSelectedHistoryItems] = useState<number[]>([]);

  const [aiModel, setAiModel] = useState(() => localStorage.getItem('aiModel') || 'deepseek');
  
  const [masterKey, setMasterKey] = useState(() => localStorage.getItem('master_key') || '');
  const [showMasterKey, setShowMasterKey] = useState(false);
  const [backupStatus, setBackupStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [backupVersions, setBackupVersions] = useState<BackupMeta[]>([]);
  const [driveBackups, setDriveBackups] = useState<DriveFile[]>([]);
  const [isDriveAuthReady, setIsDriveAuthReady] = useState(false);
  const [showConflictModal, setShowConflictModal] = useState<{ cloudTime: number, localTime: number } | null>(null);
  const [autoSync, setAutoSync] = useState(() => localStorage.getItem('auto_sync') === 'true');
  const [unsavedChanges, setUnsavedChanges] = useState(false);
  const [lastBackupTime, setLastBackupTime] = useState<number | null>(() => {
    const saved = localStorage.getItem('last_backup_time');
    return saved ? parseInt(saved) : null;
  });
  const [activeTab, setActiveTab] = useState<'password' | 'notes'>('password');
  const [accentColor, setAccentColor] = useState(() => localStorage.getItem('accent_color') || '#4f46e5');
  const [showSavedToast, setShowSavedToast] = useState(false);
  const [toast, setToast] = useState<{ message: string, type: 'success' | 'error' | 'info', id: number } | null>(null);
  const [copyFeedback, setCopyFeedback] = useState(false);
  const [clearFeedback, setClearFeedback] = useState(false);

  const triggerSavedToast = () => {
    setShowSavedToast(true);
    setTimeout(() => setShowSavedToast(false), 2000);
  };
  const [notes, setNotes] = useState<Note[]>(() => {
    const saved = localStorage.getItem('passgen_notes');
    if (saved) {
      const parsed = JSON.parse(saved);
      if (parsed.length > 0) return parsed;
    }
    
    // Default 10 sample notes
    const defaultNotes: Note[] = [
      {
        id: '1',
        title: 'The Future of Technology',
        content: 'Technology is evolving at an unprecedented pace, transforming how we live and work. From artificial intelligence to quantum computing, the possibilities are endless.',
        color: 'blue',
        pinned: false,
        updatedAt: Date.now() - 10000,
        isArchived: false,
        isDeleted: false
      },
      {
        id: '2',
        title: 'The Importance of Nature',
        content: 'Spending time in nature can significantly improve mental health and reduce stress. A simple walk in the park can clear the mind and boost creativity.',
        color: 'green',
        pinned: false,
        updatedAt: Date.now() - 20000,
        isArchived: false,
        isDeleted: false
      },
      {
        id: '3',
        title: 'Healthy Living',
        content: 'A balanced diet and regular exercise are the cornerstones of a healthy lifestyle. Small, consistent changes can lead to long-term benefits for the body and mind.',
        color: 'red',
        pinned: false,
        updatedAt: Date.now() - 30000,
        isArchived: false,
        isDeleted: false
      },
      {
        id: '4',
        title: 'The Power of Reading',
        content: 'Reading opens up new worlds and perspectives. It enhances empathy, improves vocabulary, and provides a much-needed escape from daily routines.',
        color: 'yellow',
        pinned: false,
        updatedAt: Date.now() - 40000,
        isArchived: false,
        isDeleted: false
      },
      {
        id: '5',
        title: 'Space Exploration',
        content: 'Humanity\'s quest to explore the stars continues to inspire. Missions to Mars and beyond are pushing the boundaries of what we thought was possible.',
        color: 'purple',
        pinned: false,
        updatedAt: Date.now() - 50000,
        isArchived: false,
        isDeleted: false
      },
      {
        id: '6',
        title: 'Sustainable Energy',
        content: 'Transitioning to renewable energy sources is crucial for the planet\'s future. Solar, wind, and hydro power are key to reducing our carbon footprint.',
        color: 'teal',
        pinned: false,
        updatedAt: Date.now() - 60000,
        isArchived: false,
        isDeleted: false
      },
      {
        id: '7',
        title: 'The Art of Cooking',
        content: 'Cooking is both a science and an art. Experimenting with different flavors and techniques can be a deeply rewarding and creative process.',
        color: 'orange',
        pinned: false,
        updatedAt: Date.now() - 70000,
        isArchived: false,
        isDeleted: false
      },
      {
        id: '8',
        title: 'Digital Privacy',
        content: 'In an increasingly connected world, protecting our digital privacy is more important than ever. Understanding how our data is used is the first step.',
        color: 'default',
        pinned: false,
        updatedAt: Date.now() - 80000,
        isArchived: false,
        isDeleted: false
      },
      {
        id: '9',
        title: 'The Joy of Travel',
        content: 'Traveling allows us to experience different cultures and traditions. It broadens our horizons and creates memories that last a lifetime.',
        color: 'blue',
        pinned: false,
        updatedAt: Date.now() - 90000,
        isArchived: false,
        isDeleted: false
      },
      {
        id: '10',
        title: 'Lifelong Learning',
        content: 'Learning should never stop. Whether it\'s a new language, a musical instrument, or a professional skill, continuous growth keeps the mind sharp.',
        color: 'green',
        pinned: false,
        updatedAt: Date.now() - 100000,
        isArchived: false,
        isDeleted: false
      }
    ];
    localStorage.setItem('passgen_notes', JSON.stringify(defaultNotes));
    return defaultNotes;
  });
  const [editingNote, setEditingNote] = useState<Partial<Note> | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [noteMenuOpen, setNoteMenuOpen] = useState(false);
  const [isGridView, setIsGridView] = useState(true);
  const [noteFilter, setNoteFilter] = useState<string>('all');
  const [labels, setLabels] = useState<Label[]>(() => {
    const saved = localStorage.getItem('passgen_labels');
    return saved ? JSON.parse(saved) : [];
  });
  const [sortOrder, setSortOrder] = useState<'newest' | 'oldest' | 'title'>('newest');
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [lastTrashedNoteId, setLastTrashedNoteId] = useState<string | null>(null);
  const [showUndoToast, setShowUndoToast] = useState(false);
  const undoTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const moveToTrash = (id: string) => {
    setNotes(prev => prev.map(n => n.id === id ? { ...n, isDeleted: true } : n));
    setLastTrashedNoteId(id);
    setShowUndoToast(true);
    
    if (undoTimeoutRef.current) clearTimeout(undoTimeoutRef.current);
    undoTimeoutRef.current = setTimeout(() => {
      setShowUndoToast(false);
      setLastTrashedNoteId(null);
    }, 5000);
  };

  const emptyTrash = () => {
    if (confirm('Are you sure you want to permanently delete all items in the trash?')) {
      setNotes(prev => prev.filter(n => !n.isDeleted));
      setToast({ message: 'Trash emptied', type: 'success', id: Date.now() });
    }
  };

  const duplicateNote = (note: Note) => {
    const newNote: Note = {
      ...note,
      id: Date.now().toString(),
      title: note.title ? `${note.title} (Copy)` : 'Untitled Note (Copy)',
      updatedAt: Date.now(),
      pinned: false,
      isArchived: false,
      isDeleted: false
    };
    setNotes(prev => [...prev, newNote]);
    setToast({ message: 'Note duplicated', type: 'success', id: Date.now() });
  };

  const calculateMasterKeyStrength = (key: string) => {
    if (!key) return 0;
    let score = 0;
    if (key.length >= 8) score += 1;
    if (key.length >= 12) score += 1;
    if (/[a-z]/.test(key) && /[A-Z]/.test(key)) score += 1;
    if (/\d/.test(key)) score += 1;
    if (/[^a-zA-Z\d]/.test(key)) score += 1;
    return Math.min(score, 5);
  };

  const undoTrash = () => {
    if (lastTrashedNoteId) {
      setNotes(prev => prev.map(n => n.id === lastTrashedNoteId ? { ...n, isDeleted: false } : n));
      setShowUndoToast(false);
      setLastTrashedNoteId(null);
      if (undoTimeoutRef.current) clearTimeout(undoTimeoutRef.current);
    }
  };

  const NOTE_COLORS = [
    { name: 'default', light: 'bg-white', dark: 'dark:bg-gray-800' },
    { name: 'red', light: 'bg-red-100', dark: 'dark:bg-red-900/30' },
    { name: 'orange', light: 'bg-orange-100', dark: 'dark:bg-orange-900/30' },
    { name: 'yellow', light: 'bg-yellow-100', dark: 'dark:bg-yellow-900/30' },
    { name: 'green', light: 'bg-green-100', dark: 'dark:bg-green-900/30' },
    { name: 'teal', light: 'bg-teal-100', dark: 'dark:bg-teal-900/30' },
    { name: 'blue', light: 'bg-blue-100', dark: 'dark:bg-blue-900/30' },
    { name: 'purple', light: 'bg-purple-100', dark: 'dark:bg-purple-900/30' },
    { name: 'pink', light: 'bg-pink-100', dark: 'dark:bg-pink-900/30' },
  ];

  useEffect(() => {
    localStorage.setItem('passgen_notes', JSON.stringify(notes));
  }, [notes]);

  useEffect(() => {
    localStorage.setItem('passgen_labels', JSON.stringify(labels));
  }, [labels]);

  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => setShowSplash(false), 1500);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    localStorage.setItem('accent_color', accentColor);
    document.documentElement.style.setProperty('--accent-color', accentColor);
    // Simple darken for hover state
    const darken = (hex: string) => {
      const r = parseInt(hex.slice(1, 3), 16);
      const g = parseInt(hex.slice(3, 5), 16);
      const b = parseInt(hex.slice(5, 7), 16);
      return `rgb(${Math.max(0, r - 20)}, ${Math.max(0, g - 20)}, ${Math.max(0, b - 20)})`;
    };
    document.documentElement.style.setProperty('--accent-hover', darken(accentColor));
  }, [accentColor]);

  useEffect(() => {
    localStorage.setItem('theme', theme);
    const root = document.documentElement;
    
    const updateTheme = () => {
      const isDark = theme === 'dark' || (theme === 'auto' && window.matchMedia('(prefers-color-scheme: dark)').matches);
      if (isDark) {
        root.classList.add('dark');
        document.body.style.backgroundColor = '#201a17';
      } else {
        root.classList.remove('dark');
        document.body.style.backgroundColor = '#f8fafc';
      }
    };

    updateTheme();

    if (theme === 'auto') {
      const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
      const handler = () => updateTheme();
      mediaQuery.addEventListener('change', handler);
      return () => mediaQuery.removeEventListener('change', handler);
    }
  }, [theme]);

  useEffect(() => {
    localStorage.setItem('auto_sync', autoSync.toString());
  }, [autoSync]);

  // Auto-sync logic
  useEffect(() => {
    if (!autoSync || !user || !masterKey || !unsavedChanges) return;

    const timer = setTimeout(() => {
      handleBackup();
    }, 30000); // 30 seconds debounce

    return () => clearTimeout(timer);
  }, [autoSync, user, masterKey, unsavedChanges, notes, labels, passwordHistory, options, theme, accentColor, passLength, passwordType]);

  // Track unsaved changes
  useEffect(() => {
    setUnsavedChanges(true);
  }, [notes, labels, passwordHistory, options, theme, accentColor, passLength, passwordType]);

  // Conflict Resolution on Login
  useEffect(() => {
    if (user && masterKey) {
      const checkConflict = async () => {
        try {
          const latestSnap = await getDoc(doc(db, `backups/${user.uid}`));
          if (latestSnap.exists()) {
            const cloudTime = latestSnap.data().updatedAt;
            const localTime = lastBackupTime || 0;
            const ignoredTime = parseInt(localStorage.getItem('ignored_conflict_time') || '0');
            
            if (cloudTime > localTime && cloudTime > ignoredTime) {
              setShowConflictModal({ cloudTime, localTime });
            }
          }
          
          // Load versions
          const versions = await listBackupVersions(user.uid);
          setBackupVersions(versions);
        } catch (e) {
          console.error('Conflict check failed', e);
        }
      };
      checkConflict();
    }
  }, [user, masterKey]);

  // Google Drive Initialization
  useEffect(() => {
    const initDrive = async () => {
      try {
        // These should be in .env
        const apiKey = (import.meta as any).env.VITE_GOOGLE_API_KEY;
        const clientId = (import.meta as any).env.VITE_GOOGLE_CLIENT_ID;
        
        if (apiKey && clientId) {
          await initDriveClient(apiKey, clientId);
          setIsDriveAuthReady(true);
          
          if (checkDriveAuth()) {
            const files = await listDriveBackups();
            setDriveBackups(files);
          }
        }
      } catch (e) {
        console.error('Drive init failed', e);
      }
    };
    initDrive();
  }, []);

  useEffect(() => {
    localStorage.setItem('savedPasswordGenHistory', JSON.stringify(passwordHistory));
  }, [passwordHistory]);

  useEffect(() => {
    localStorage.setItem('master_key', masterKey);
    if (masterKey) triggerSavedToast();
  }, [masterKey]);

  useEffect(() => {
    if (lastBackupTime) {
      localStorage.setItem('last_backup_time', lastBackupTime.toString());
    } else {
      localStorage.removeItem('last_backup_time');
    }
  }, [lastBackupTime]);

  const getRandomInt = (max: number) => {
    const randomBuffer = new Uint32Array(1);
    crypto.getRandomValues(randomBuffer);
    return randomBuffer[0] % max;
  };

  const getRandomItem = <T extends string | any[]>(items: T): any => {
    const length = typeof items === 'string' ? items.length : (items as any[]).length;
    const index = getRandomInt(length);
    return items[index];
  };

  const generatePassword = async () => {
    let newPass = '';
    if (passwordType === 'random') {
      let charSet = '';
      if (options.includeSmall) charSet += CHARSETS.small;
      if (options.includeCapital) charSet += CHARSETS.capital;
      if (options.includeNumbers) charSet += CHARSETS.numbers;
      if (options.includeSpecial) charSet += CHARSETS.special;
      if (options.excludeConfusing) {
        const similarRegex = new RegExp(`[${CHARSETS.similar}]`, 'g');
        charSet = charSet.replace(similarRegex, '');
        const ambiguousRegex = new RegExp(`[${CHARSETS.ambiguous.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}]`, 'g');
        charSet = charSet.replace(ambiguousRegex, '');
      }
      if (charSet.length === 0) return setPassword('Select at least one set.');
      const getFilteredSet = (set: string) => {
        if (!options.excludeConfusing) return set;
        const similarRegex = new RegExp(`[${CHARSETS.similar}]`, 'g');
        const ambiguousRegex = new RegExp(`[${CHARSETS.ambiguous.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}]`, 'g');
        return set.replace(similarRegex, '').replace(ambiguousRegex, '');
      };

      const guaranteed = [];
      const smallSet = getFilteredSet(CHARSETS.small);
      const capitalSet = getFilteredSet(CHARSETS.capital);
      const numbersSet = getFilteredSet(CHARSETS.numbers);
      const specialSet = getFilteredSet(CHARSETS.special);

      if (options.includeSmall && smallSet.length > 0) guaranteed.push(getRandomItem(smallSet));
      if (options.includeCapital && capitalSet.length > 0) guaranteed.push(getRandomItem(capitalSet));
      if (options.includeNumbers && numbersSet.length > 0) guaranteed.push(getRandomItem(numbersSet));
      if (options.includeSpecial && specialSet.length > 0) guaranteed.push(getRandomItem(specialSet));

      for (let i = 0; i < passLength; i++) {
        if (i < guaranteed.length) {
          newPass += guaranteed[i];
        } else {
          newPass += getRandomItem(charSet);
        }
      }
      
      // Shuffle the password so guaranteed chars aren't always at the start
      newPass = newPass.split('').sort(() => 0.5 - Math.random()).join('');
    } else if (passwordType === 'pronounceable') {
      let availableCons = CHARSETS.consonants;
      let availableVows = CHARSETS.vowels;
      if (options.includeCapital) {
        availableCons += CHARSETS.consonants.toUpperCase();
        availableVows += CHARSETS.vowels.toUpperCase();
      }
      for (let i = 0; i < passLength; i++) {
        if (options.includeNumbers && getRandomInt(6) === 0) {
          newPass += getRandomItem(CHARSETS.numbers);
        } else if (options.includeSpecial && getRandomInt(6) === 0) {
          newPass += getRandomItem(CHARSETS.special);
        } else {
          newPass += i % 2 === 0 ? getRandomItem(availableCons) : getRandomItem(availableVows);
        }
      }
    } else if (passwordType === 'memorable') {
      const words = [];
      for (let i = 0; i < passLength; i++) {
        let word = getRandomItem(WORD_LIST);
        if (options.includeCapital && getRandomInt(2) === 0) {
          word = word.charAt(0).toUpperCase() + word.slice(1);
        }
        words.push(word);
      }
      
      let separator = '-';
      if (options.includeSpecial) separator = getRandomItem(CHARSETS.special);
      
      newPass = words.join(separator);
      
      if (options.includeNumbers) {
        newPass += getRandomItem(CHARSETS.numbers);
      }
    } else if (passwordType === 'uuid') {
      newPass = crypto.randomUUID();
    } else if (passwordType === 'ai_memorable') {
      setPassword('Generating with AI...');
      try {
        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) {
          setPassword('Error: API Key missing in environment');
          return;
        }
        const ai = new GoogleGenAI({ apiKey });
        const response = await ai.models.generateContent({
          model: "gemini-3-flash-preview",
          contents: `Generate a highly memorable but secure password consisting of ${passLength} words. The words should be common but unrelated. Separate them with a hyphen. Example: "ocean-pizza-robot". Only return the password string.`
        });
        newPass = response.text?.trim() || 'AI Generation Failed';
      } catch (error) {
        console.error('AI Generation Error:', error);
        newPass = 'Error: AI Generation Failed';
      }
    }
    setPassword(newPass);
  };

  const copyToClipboard = (text: string) => {
    if (text === 'P@$$w0rd!' || text.includes('Select') || text.includes('Error')) return;
    navigator.clipboard.writeText(text);
    setToast({ message: 'Copied to clipboard', type: 'success', id: Date.now() });
    setCopyFeedback(true);
    setTimeout(() => setCopyFeedback(false), 200);
    
    if (!passwordHistory.some(h => h.password === text)) {
      setPasswordHistory(prev => [{ id: Date.now(), password: text, date: new Date().toLocaleString() }, ...prev]);
    }
  };

  const clearPassword = () => {
    setPassword('P@$$w0rd!');
    setClearFeedback(true);
    setTimeout(() => setClearFeedback(false), 200);
  };

  const encryptData = (data: any, key: string) => {
    return CryptoJS.AES.encrypt(JSON.stringify(data), key).toString();
  };

  const decryptData = (encryptedData: string, key: string) => {
    try {
      const bytes = CryptoJS.AES.decrypt(encryptedData, key);
      const decryptedData = JSON.parse(bytes.toString(CryptoJS.enc.Utf8));
      return decryptedData;
    } catch (e) {
      console.error('Decryption failed', e);
      return null;
    }
  };

  const handleBackup = async () => {
    if (!user || !masterKey) {
      setActiveModal('master-key-prompt');
      return;
    }

    setBackupStatus('loading');
    try {
      const dataToBackup: BackupData = {
        history: passwordHistory,
        settings: {
          theme,
          accentColor,
          passwordOptions: options,
          passLength,
          passwordType,
          masterKeySet: !!masterKey,
          autoSync
        },
        notes: notes,
        labels: labels,
        updatedAt: Date.now()
      };

      const timestamp = await backupToCloud(user.uid, dataToBackup, masterKey);
      setLastBackupTime(timestamp);
      setBackupStatus('success');
      setUnsavedChanges(false);
      setToast({ message: 'Backup successful!', type: 'success', id: Date.now() });
      setTimeout(() => setBackupStatus('idle'), 3000);
      
      // Refresh versions list
      const versions = await listBackupVersions(user.uid);
      setBackupVersions(versions);
    } catch (e) {
      console.error('Backup failed', e);
      setBackupStatus('error');
      setToast({ message: 'Backup failed', type: 'error', id: Date.now() });
    }
  };

  const handleRestore = async (versionId?: string) => {
    if (!user || !masterKey) {
      setActiveModal('master-key-prompt');
      return;
    }

    setBackupStatus('loading');
    try {
      const decrypted = await restoreFromCloud(user.uid, masterKey, versionId);
      if (decrypted) {
        setPasswordHistory(decrypted.history);
        setTheme(decrypted.settings.theme);
        if (decrypted.settings.accentColor) setAccentColor(decrypted.settings.accentColor);
        if (decrypted.settings.passwordOptions) setOptions(decrypted.settings.passwordOptions);
        if (decrypted.settings.passLength) setPassLength(decrypted.settings.passLength);
        if (decrypted.settings.passwordType) setPasswordType(decrypted.settings.passwordType);
        if (decrypted.notes) setNotes(decrypted.notes);
        if (decrypted.labels) setLabels(decrypted.labels);
        if (decrypted.settings.autoSync !== undefined) setAutoSync(decrypted.settings.autoSync);
        
        setLastBackupTime(decrypted.updatedAt);
        setBackupStatus('success');
        setUnsavedChanges(false);
        setToast({ message: 'Restore successful!', type: 'success', id: Date.now() });
        setTimeout(() => setBackupStatus('idle'), 3000);
      } else {
        setBackupStatus('error');
        setToast({ message: 'No backup found or invalid key', type: 'error', id: Date.now() });
      }
    } catch (e) {
      console.error('Restore failed', e);
      setBackupStatus('error');
      setToast({ message: 'Restore failed: ' + (e instanceof Error ? e.message : 'Unknown error'), type: 'error', id: Date.now() });
    }
  };

  const handleDriveExport = async () => {
    if (!user || !masterKey) {
      setActiveModal('master-key-prompt');
      return;
    }
    
    setBackupStatus('loading');
    try {
      if (!checkDriveAuth()) {
        await signInToDrive();
      }
      
      const dataToBackup: BackupData = {
        history: passwordHistory,
        settings: { theme, accentColor, passwordOptions: options, passLength, passwordType, masterKeySet: !!masterKey, autoSync },
        notes: notes,
        labels: labels,
        updatedAt: Date.now()
      };
      
      const { compressAndEncrypt } = await import('./lib/backup');
      const encrypted = compressAndEncrypt(dataToBackup, masterKey);
      const fileName = `passgen_backup_${new Date().toISOString().split('T')[0]}.enc`;
      
      await exportToDrive(encrypted, fileName);
      setBackupStatus('success');
      setToast({ message: 'Exported to Google Drive!', type: 'success', id: Date.now() });
      
      // Refresh drive list
      const files = await listDriveBackups();
      setDriveBackups(files);
    } catch (e) {
      console.error('Drive export failed', e);
      setBackupStatus('error');
      setToast({ message: 'Drive export failed', type: 'error', id: Date.now() });
    }
  };

  const handleDriveImport = async (fileId: string) => {
    if (!user || !masterKey) {
      setActiveModal('master-key-prompt');
      return;
    }
    
    setBackupStatus('loading');
    try {
      const encrypted = await downloadFromDrive(fileId);
      const { decryptAndDecompress } = await import('./lib/backup');
      const decrypted = decryptAndDecompress(encrypted, masterKey);
      
      if (decrypted) {
        setPasswordHistory(decrypted.history);
        setTheme(decrypted.settings.theme);
        if (decrypted.settings.accentColor) setAccentColor(decrypted.settings.accentColor);
        if (decrypted.settings.passwordOptions) setOptions(decrypted.settings.passwordOptions);
        if (decrypted.settings.passLength) setPassLength(decrypted.settings.passLength);
        if (decrypted.settings.passwordType) setPasswordType(decrypted.settings.passwordType);
        if (decrypted.notes) setNotes(decrypted.notes);
        if (decrypted.labels) setLabels(decrypted.labels);
        
        setBackupStatus('success');
        setToast({ message: 'Imported from Google Drive!', type: 'success', id: Date.now() });
      } else {
        setBackupStatus('error');
        setToast({ message: 'Invalid Master Key or corrupt file', type: 'error', id: Date.now() });
      }
    } catch (e) {
      console.error('Drive import failed', e);
      setBackupStatus('error');
      setToast({ message: 'Drive import failed', type: 'error', id: Date.now() });
    }
  };

  const filteredNotes = notes
    .filter(n => {
      const matchesSearch = n.title.toLowerCase().includes(searchQuery.toLowerCase()) || n.content.toLowerCase().includes(searchQuery.toLowerCase());
      if (noteFilter === 'trash') return matchesSearch && n.isDeleted;
      if (noteFilter === 'archive') return matchesSearch && n.isArchived && !n.isDeleted;
      if (noteFilter === 'reminders') return matchesSearch && !!n.reminder && !n.isDeleted;
      if (noteFilter === 'all') return matchesSearch && !n.isArchived && !n.isDeleted;
      // Label filter
      return matchesSearch && !n.isArchived && !n.isDeleted && (n.labels || []).includes(noteFilter);
    })
    .sort((a, b) => {
      if (a.pinned && !b.pinned) return -1;
      if (!a.pinned && b.pinned) return 1;
      if (sortOrder === 'newest') return b.updatedAt - a.updatedAt;
      if (sortOrder === 'oldest') return a.updatedAt - b.updatedAt;
      return a.title.localeCompare(b.title);
    });

  if (showSplash) {
    return (
      <div className="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-[#0f172a]">
        <h1 className="text-4xl font-bold bg-gradient-to-r from-accent to-violet-600 text-transparent bg-clip-text">PassGen Pro</h1>
        <p className="text-gray-500 mt-2">Powered by ͟͞〲Sojeeb</p>
        <div className="w-48 h-1.5 bg-gray-700 rounded-full overflow-hidden mt-8">
          <div className="h-full bg-gradient-to-r from-accent to-violet-600 animate-fill-bar"></div>
        </div>
      </div>
    );
  }

  const calculateStrength = (pass: string) => {
    if (!pass || pass === 'P@$$w0rd!') return 0;
    const len = pass.length;
    
    if (len >= 111) return 9;
    if (len >= 92) return 8;
    if (len >= 78) return 7;
    if (len >= 60) return 6;
    if (len >= 50) return 5;
    if (len >= 40) return 4;
    if (len >= 30) return 3;
    if (len >= 20) return 2;
    if (len >= 12) return 1;
    if (len >= 6) return 0;
    
    return 0;
  };

  const strength = calculateStrength(password);

  const handleLogout = async () => {
    if (unsavedChanges && confirm('You have unsaved changes. Would you like to backup before logging out?')) {
      await handleBackup();
    }
    
    await logout();
    
    // Clear sensitive data from localStorage
    localStorage.removeItem('passgen_notes');
    localStorage.removeItem('passgen_labels');
    localStorage.removeItem('savedPasswordGenHistory');
    localStorage.removeItem('master_key');
    localStorage.removeItem('last_backup_time');
    
    // Reset state
    setNotes([]);
    setLabels([]);
    setPasswordHistory([]);
    setMasterKey('');
    setLastBackupTime(null);
    setUnsavedChanges(false);
    
    setActiveModal(null);
    setToast({ message: 'Logged out successfully', type: 'info', id: Date.now() });
  };
  const strengthLabels = [
    'Very Weak', 
    'Weak', 
    'Fair', 
    'Medium', 
    'Strong', 
    'Very Strong', 
    'Ultra Strong', 
    'AES-256 Grounded', 
    'Quantum-Resistant', 
    'Immortal / Unbreakable'
  ];
  const strengthColors = [
    'bg-red-500', 
    'bg-red-600', 
    'bg-orange-500', 
    'bg-orange-600', 
    'bg-yellow-500', 
    'bg-lime-500', 
    'bg-green-500', 
    'bg-emerald-500', 
    'bg-teal-500', 
    'bg-blue-600'
  ];
  const strengthHexColors = [
    '#ef4444', // red-500
    '#dc2626', // red-600
    '#f97316', // orange-500
    '#ea580c', // orange-600
    '#eab308', // yellow-500
    '#84cc16', // lime-500
    '#22c55e', // green-500
    '#10b981', // emerald-500
    '#14b8a6', // teal-500
    '#2563eb'  // blue-600
  ];

  return (
    <div className="w-full min-h-screen md:min-h-0 md:max-w-2xl lg:max-w-4xl mx-auto bg-white dark:bg-[#201a17] md:rounded-2xl md:shadow-2xl p-6 md:p-8 pb-32 md:pb-32 relative overflow-x-hidden transition-all duration-200">
      <div className="flex items-center mb-6 pb-4 border-b border-gray-200 dark:border-gray-700">
        <div className="flex-1 flex justify-start">
          <button 
            onClick={() => setActiveModal('settings')} 
            className="text-gray-500 dark:text-gray-400 hover:text-accent transition-all p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800"
            title="Settings"
          >
            <SettingsIcon size={28} />
          </button>
        </div>
        <h1 className="flex-shrink-0 text-xl font-bold bg-gradient-to-r from-accent to-purple-600 bg-clip-text text-transparent text-center px-4">PassGen Pro</h1>
        <div className="flex-1 flex justify-end items-center gap-3">
          {user ? (
            <button onClick={() => setActiveModal('account')} className="w-8 h-8 rounded-full border-2 border-accent bg-accent flex items-center justify-center text-white text-xs font-bold overflow-hidden">
              {user.photoURL ? <img src={user.photoURL} alt="User" className="w-full h-full object-cover" /> : user.displayName?.charAt(0) || 'U'}
            </button>
          ) : (
            <button onClick={() => signInWithGoogle().catch((e: any) => alert('Login Failed: ' + e.message))} className="text-gray-500 dark:text-gray-400 hover:text-accent transition-colors">
              <User size={28} />
            </button>
          )}
          {activeTab === 'password' && (
            <button onClick={() => setActiveModal('history')} className="text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors">
              <History size={28} />
            </button>
          )}
        </div>
      </div>

      {activeTab === 'password' ? (
        <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }}>
      <motion.div 
        animate={copyFeedback ? { scale: 1.01 } : clearFeedback ? { x: [0, -4, 4, -4, 4, 0] } : { scale: 1 }}
        transition={{ duration: 0.2 }}
        className="bg-gray-100 dark:bg-gray-900 rounded-xl p-5 mb-4 min-h-[120px] flex items-center transition-colors border-2 border-transparent"
      >
        <motion.textarea 
          key={password}
          initial={{ opacity: 0, y: 5 }}
          animate={{ opacity: 1, y: 0 }}
          value={password} 
          readOnly 
          className="w-full bg-transparent text-2xl text-gray-900 dark:text-white font-mono break-words resize-none border-0 p-0 outline-none" 
        />
      </motion.div>

          {/* Strength Meter */}
          <div className="mb-6 space-y-2">
      <div className="flex justify-between items-center">
        <span className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Strength</span>
        <motion.span 
          key={strength}
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className={cn("text-xs font-bold px-2 py-0.5 rounded-full text-white", strengthColors[strength])}
        >
          {strengthLabels[strength]}
        </motion.span>
      </div>
      <div className="flex gap-1">
        {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((i) => (
          <motion.div 
            key={i} 
            initial={false}
            animate={{ 
              backgroundColor: i <= strength ? strengthHexColors[strength] : (theme === 'dark' ? '#1f2937' : '#e5e7eb')
            }}
            className="h-1.5 flex-1 rounded-full transition-all duration-500"
          />
        ))}
      </div>
          </div>

          <div className="flex justify-center gap-4 mb-6">
            <motion.button 
              onClick={() => copyToClipboard(password)} 
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              className="flex-1 flex items-center justify-center gap-2 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-800 dark:text-gray-200 font-medium py-3 px-4 rounded-xl transition-all shadow-sm"
            >
              <Copy size={20} /> Copy
            </motion.button>
            <motion.button 
              onClick={clearPassword} 
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              className="flex-1 flex items-center justify-center gap-2 bg-red-600 hover:bg-red-700 text-white font-medium py-3 px-4 rounded-xl transition-all shadow-sm"
            >
              <Trash2 size={20} /> Clear
            </motion.button>
          </div>

          <motion.button 
            onClick={generatePassword} 
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            className="w-full bg-accent hover:bg-accent-hover text-white font-bold py-4 px-4 rounded-xl text-lg transition-all shadow-lg mb-8"
          >
            Generate
          </motion.button>

          <div className="space-y-6">
            <div>
              <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Password Type</label>
              <div className="relative">
                <select value={passwordType} onChange={(e) => setPasswordType(e.target.value as PasswordType)} className="w-full bg-gray-100 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 text-gray-900 dark:text-white text-sm rounded-xl p-3 outline-none appearance-none">
                  <option value="random">Random</option>
                  <option value="pronounceable">Pronounceable</option>
                  <option value="memorable">Memorable (Offline)</option>
                  <option value="ai_memorable">✨ AI Memorable (Online)</option>
                  <option value="uuid">UUID</option>
                </select>
                <ChevronDown size={18} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
              </div>
            </div>

            {passwordType !== 'uuid' && (
              <div>
                <div className="flex justify-between items-center mb-3">
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300">{passwordType.includes('memorable') ? 'Number of Words' : 'Password Length'}</label>
                  <span className="text-xs font-bold text-white bg-accent px-2.5 py-1 rounded-full">{passLength}</span>
                </div>
                <input type="range" min={passwordType.includes('memorable') ? 2 : 4} max={passwordType.includes('memorable') ? 30 : 256} value={passLength} onChange={(e) => setPassLength(parseInt(e.target.value))} className="w-full" style={{ '--slider-fill-percent': `${((passLength - (passwordType.includes('memorable') ? 2 : 4)) / ((passwordType.includes('memorable') ? 30 : 256) - (passwordType.includes('memorable') ? 2 : 4))) * 100}%` } as any} />
              </div>
            )}

            {(passwordType === 'random' || passwordType === 'pronounceable') && (
              <div className="space-y-3">
                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Allowed Characters</label>
                {[
                  { id: 'includeSmall', label: 'Small Letters (a-z)' },
                  { id: 'includeCapital', label: 'Capital Letters (A-Z)' },
                  { id: 'includeNumbers', label: 'Numbers (0-9)' },
                  { id: 'includeSpecial', label: 'Special Characters (!@#...)' },
                  { id: 'excludeConfusing', label: 'Avoid Similar & Ambiguous (O, 0, I, l, 1, {}, [], etc.)' }
                ].map(opt => (
                  <label key={opt.id} className="flex items-center space-x-3 cursor-pointer group">
                    <input 
                      type="checkbox" 
                      checked={options[opt.id as keyof PasswordOptions] as boolean} 
                      onChange={(e) => setOptions(prev => ({ ...prev, [opt.id]: e.target.checked }))} 
                      className="custom-checkbox w-6 h-6 rounded-lg appearance-none outline-none" 
                    />
                    <span className="text-gray-700 dark:text-gray-300 group-hover:text-accent transition-colors">{opt.label}</span>
                  </label>
                ))}
              </div>
            )}
          </div>
        </motion.div>
      ) : (
        <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-6">
          {/* Keep-style Search Bar */}
          <div className="flex items-center gap-2 bg-[#3c332d] rounded-full px-4 py-2 shadow-sm">
            <div className="relative">
              <button 
                onClick={() => setNoteMenuOpen(!noteMenuOpen)}
                className="p-2 text-gray-400 hover:text-white transition-colors"
              >
                <Menu size={20} />
              </button>
              <AnimatePresence>
                {noteMenuOpen && (
                  <>
                    <div 
                      className="fixed inset-0 z-40" 
                      onClick={() => setNoteMenuOpen(false)}
                    />
                    <motion.div 
                      initial={{ opacity: 0, y: 10 }} 
                      animate={{ opacity: 1, y: 0 }} 
                      exit={{ opacity: 0, y: 10 }} 
                      className="absolute left-0 top-12 w-48 bg-[#3c332d] rounded-xl shadow-2xl py-2 z-50 border border-white/5"
                    >
                    <button 
                      onClick={() => { setNoteFilter('all'); setNoteMenuOpen(false); }} 
                      className={cn(
                        "w-full flex items-center gap-3 px-4 py-2 text-sm transition-colors",
                        noteFilter === 'all' ? "bg-white/10 text-white" : "text-gray-200 hover:bg-white/5"
                      )}
                    >
                      <StickyNote size={18} /> Notes
                    </button>
                    <button 
                      onClick={() => { setNoteFilter('reminders'); setNoteMenuOpen(false); }} 
                      className={cn(
                        "w-full flex items-center gap-3 px-4 py-2 text-sm transition-colors",
                        noteFilter === 'reminders' ? "bg-white/10 text-white" : "text-gray-200 hover:bg-white/5"
                      )}
                    >
                      <RefreshCw size={18} /> Reminders
                    </button>
                    
                    {labels.length > 0 && <hr className="border-white/5 my-1" />}
                    {labels.map(label => (
                      <button 
                        key={label.id}
                        onClick={() => { setNoteFilter(label.id); setNoteMenuOpen(false); }} 
                        className={cn(
                          "w-full flex items-center gap-3 px-4 py-2 text-sm transition-colors",
                          noteFilter === label.id ? "bg-white/10 text-white" : "text-gray-200 hover:bg-white/5"
                        )}
                      >
                        <List size={18} /> {label.name}
                      </button>
                    ))}

                    <hr className="border-white/5 my-1" />
                    <button 
                      onClick={() => { setActiveModal('edit-labels'); setNoteMenuOpen(false); }} 
                      className="w-full flex items-center gap-3 px-4 py-2 text-sm text-gray-200 hover:bg-white/5 transition-colors"
                    >
                      <Edit3 size={18} /> Edit labels
                    </button>
                    <button 
                      onClick={() => { setNoteFilter('archive'); setNoteMenuOpen(false); }} 
                      className={cn(
                        "w-full flex items-center gap-3 px-4 py-2 text-sm transition-colors",
                        noteFilter === 'archive' ? "bg-white/10 text-white" : "text-gray-200 hover:bg-white/5"
                      )}
                    >
                      <Archive size={18} /> Archive
                    </button>
                    <button 
                      onClick={() => { setNoteFilter('trash'); setNoteMenuOpen(false); }} 
                      className={cn(
                        "w-full flex items-center gap-3 px-4 py-2 text-sm transition-colors",
                        noteFilter === 'trash' ? "bg-white/10 text-white" : "text-gray-200 hover:bg-white/5"
                      )}
                    >
                      <Trash2 size={18} /> Trash
                    </button>
                    {noteFilter === 'trash' && notes.some(n => n.isDeleted) && (
                      <button 
                        onClick={emptyTrash}
                        className="w-full flex items-center gap-3 px-4 py-2 text-sm text-red-400 hover:bg-red-500/10 transition-colors"
                      >
                        <Trash2 size={18} /> Empty Trash
                      </button>
                    )}
                    <button onClick={() => setNoteMenuOpen(false)} className="w-full flex items-center gap-3 px-4 py-2 text-sm text-gray-200 hover:bg-white/5 transition-colors">
                      <AlertCircle size={18} /> Help & feedback
                    </button>
                  </motion.div>
                </>
              )}
            </AnimatePresence>
          </div>
            <input 
              type="text" 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search Keep" 
              className="flex-1 bg-transparent border-none outline-none text-gray-200 placeholder-gray-500 text-base"
            />
            <button 
              onClick={() => setIsGridView(!isGridView)}
              className="p-2 text-gray-400 hover:text-white transition-colors"
              title={isGridView ? "List View" : "Grid View"}
            >
              {isGridView ? <List size={18} /> : <LayoutGrid size={18} />}
            </button>
            <button 
              onClick={() => {
                const orders: ('newest' | 'oldest' | 'title')[] = ['newest', 'oldest', 'title'];
                const next = orders[(orders.indexOf(sortOrder) + 1) % orders.length];
                setSortOrder(next);
              }}
              className="p-2 text-gray-400 hover:text-white transition-colors"
              title={`Sort: ${sortOrder}`}
            >
              <ArrowUpDown size={18} className={cn(sortOrder !== 'newest' && "text-indigo-400")} />
            </button>
          </div>

          <div className={cn(
            "grid gap-4 pt-4",
            isGridView ? "grid-cols-2" : "grid-cols-1"
          )}>
            <AnimatePresence mode="popLayout">
              {filteredNotes.length === 0 ? (
                <motion.div 
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  className="col-span-full flex flex-col items-center justify-center py-32 space-y-4"
                >
                  {labels.find(l => l.id === noteFilter) ? (
                    <Tag size={120} className="text-[#3c332d] opacity-20" />
                  ) : (
                    <Lightbulb size={120} className="text-[#3c332d]" />
                  )}
                  <p className="text-gray-500 text-lg text-center px-6">
                    {noteFilter === 'trash' ? 'Trash is empty' : 
                     noteFilter === 'archive' ? 'No archived notes' : 
                     labels.find(l => l.id === noteFilter) ? `No notes with label "${labels.find(l => l.id === noteFilter)?.name}" yet` :
                     'Notes you add appear here'}
                  </p>
                </motion.div>
              ) : (
                filteredNotes.map((note, index) => {
                    const colorClass = NOTE_COLORS.find(c => c.name === note.color) || NOTE_COLORS[0];
                    return (
                      <motion.div 
                        layout
                        key={note.id} 
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        transition={{ delay: index * 0.05 }}
                        className={cn(
                          "p-5 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm hover:shadow-md transition-all group relative cursor-pointer",
                          colorClass.light,
                          colorClass.dark
                        )}
                        onClick={() => setEditingNote(note)}
                        whileHover={{ y: -4 }}
                      >
                        <div className="flex justify-between items-start mb-2">
                          <h3 className="font-bold dark:text-white truncate pr-6">{note.title || 'Untitled Note'}</h3>
                          <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button 
                              onClick={(e) => {
                                e.stopPropagation();
                                setNotes(prev => prev.map(n => n.id === note.id ? { ...n, isArchived: !n.isArchived } : n));
                              }} 
                              className="p-1.5 text-gray-500 hover:bg-black/5 dark:hover:bg-white/5 rounded-lg transition-all"
                              title={note.isArchived ? "Unarchive" : "Archive"}
                            >
                              <Archive size={16} />
                            </button>
                            <button 
                              onClick={(e) => {
                                e.stopPropagation();
                                if (note.isDeleted) {
                                  setConfirmDelete(note.id);
                                } else {
                                  moveToTrash(note.id);
                                }
                              }} 
                              className="p-1.5 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg transition-all"
                              title={note.isDeleted ? "Delete Forever" : "Move to Trash"}
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>
                        </div>
                        <p className="text-sm text-gray-600 dark:text-gray-400 line-clamp-4 whitespace-pre-wrap">{note.content}</p>
                        
                        {note.labels && note.labels.length > 0 && (
                          <div className="mt-2 flex flex-wrap gap-1">
                            {note.labels.map(labelId => {
                              const label = labels.find(l => l.id === labelId);
                              if (!label) return null;
                              return (
                                <span key={labelId} className="px-1.5 py-0.5 bg-accent/10 text-accent rounded text-[8px] font-bold uppercase tracking-wider">
                                  {label.name}
                                </span>
                              );
                            })}
                          </div>
                        )}

                        {note.reminder && (
                          <div className="mt-2 inline-flex items-center gap-1.5 px-2 py-1 bg-black/5 dark:bg-white/5 rounded-full text-[10px] text-gray-500 dark:text-gray-400">
                            <Calendar size={10} />
                            {new Date(note.reminder).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}
                          </div>
                        )}
                        <div className="mt-4 flex items-center justify-between">
                          <p className="text-[10px] text-gray-400 font-medium">{new Date(note.updatedAt).toLocaleDateString()}</p>
                          <Edit3 size={12} className="text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity" />
                        </div>
                      </motion.div>
                    );
                  })
              )}
            </AnimatePresence>
          </div>

          {/* FAB for New Note */}
          <motion.button 
            onClick={() => setEditingNote({ id: '', title: '', content: '', color: 'default', pinned: false, updatedAt: Date.now() })}
            whileHover={{ scale: 1.1, rotate: 90 }}
            whileTap={{ scale: 0.9 }}
            className="fixed bottom-28 right-8 bg-[#f8d49d] text-[#201a17] p-4 rounded-2xl shadow-xl transition-all z-[60]"
          >
            <Plus size={32} strokeWidth={2.5} />
          </motion.button>
        </motion.div>
      )}

      {/* Dashboard / Bottom Nav - Pill Style */}
      <div className="fixed bottom-0 left-0 right-0 md:absolute md:bottom-0 p-3 flex justify-center z-50">
        <button 
          onClick={() => setActiveTab(activeTab === 'password' ? 'notes' : 'password')}
          className="bg-[#9c7cf4] hover:bg-[#8b6ae3] text-white px-6 py-2 rounded-full shadow-2xl flex flex-col items-center gap-0.5 active:scale-95 transition-all min-w-[150px]"
        >
          <LayoutGrid size={20} />
          <span className="text-[10px] font-bold tracking-widest uppercase">
            {activeTab === 'notes' ? 'Back' : 'Dashboard'}
          </span>
        </button>
      </div>

      <AnimatePresence>
        {activeModal === 'edit-labels' && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }} className="w-full max-w-md bg-white dark:bg-gray-800 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
              <div className="p-6 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center bg-gray-50/50 dark:bg-gray-900/50">
                <div>
                  <h2 className="text-2xl font-bold dark:text-white">Edit Labels</h2>
                  <p className="text-xs text-gray-500 dark:text-gray-400">Organize your notes with custom labels</p>
                </div>
                <button onClick={() => setActiveModal(null)} className="p-2 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-full transition-colors"><X size={24} className="dark:text-white" /></button>
              </div>
              
              <div className="p-6 space-y-6 overflow-y-auto flex-1">
                <div className="flex gap-2">
                  <input 
                    type="text" 
                    id="new-label-input"
                    placeholder="Create new label" 
                    className="flex-1 bg-gray-100 dark:bg-gray-900 border-0 rounded-xl px-4 py-3 text-sm dark:text-white outline-none focus:ring-2 focus:ring-accent"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        const input = e.currentTarget;
                        const name = input.value.trim();
                        if (name) {
                          const newLabel: Label = { id: Date.now().toString(), name };
                          setLabels([...labels, newLabel]);
                          input.value = '';
                        }
                      }
                    }}
                  />
                  <button 
                    onClick={() => {
                      const input = document.getElementById('new-label-input') as HTMLInputElement;
                      const name = input.value.trim();
                      if (name) {
                        const newLabel: Label = { id: Date.now().toString(), name };
                        setLabels([...labels, newLabel]);
                        input.value = '';
                      }
                    }}
                    className="bg-accent text-white p-3 rounded-xl shadow-lg active:scale-95 transition-all"
                  >
                    <Plus size={20} />
                  </button>
                </div>

                <div className="space-y-2">
                  {labels.map(label => (
                    <div key={label.id} className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-900/50 rounded-xl group">
                      <div className="flex items-center gap-3">
                        <List size={18} className="text-gray-400" />
                        <input 
                          type="text" 
                          value={label.name} 
                          onChange={(e) => {
                            setLabels(labels.map(l => l.id === label.id ? { ...l, name: e.target.value } : l));
                          }}
                          className="bg-transparent border-0 text-sm dark:text-white outline-none focus:ring-1 focus:ring-accent rounded px-1"
                        />
                      </div>
                      <button 
                        onClick={() => {
                          setLabels(labels.filter(l => l.id !== label.id));
                          // Also remove label from all notes
                          setNotes(notes.map(n => ({
                            ...n,
                            labels: n.labels?.filter(id => id !== label.id)
                          })));
                        }}
                        className="p-2 text-gray-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  ))}
                  {labels.length === 0 && (
                    <div className="text-center py-8 text-gray-500">
                      <List size={48} className="mx-auto mb-2 opacity-20" />
                      <p>No labels yet. Create one above!</p>
                    </div>
                  )}
                </div>
              </div>
              
              <div className="p-6 bg-gray-50 dark:bg-gray-900/50 border-t border-gray-200 dark:border-gray-700">
                <button 
                  onClick={() => setActiveModal(null)}
                  className="w-full bg-accent text-white py-4 rounded-2xl font-bold shadow-lg active:scale-95 transition-all"
                >
                  Done
                </button>
              </div>
            </motion.div>
          </div>
        )}

        {activeModal === 'settings' && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }} className="w-full max-w-md bg-white dark:bg-gray-800 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
              <div className="p-6 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center bg-gray-50/50 dark:bg-gray-900/50">
                <div>
                  <h2 className="text-2xl font-bold dark:text-white">Settings</h2>
                  <p className="text-xs text-gray-500 dark:text-gray-400">Configure your professional workspace</p>
                </div>
                <button onClick={() => setActiveModal(null)} className="p-2 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-full transition-colors"><X size={24} className="dark:text-white" /></button>
              </div>
              
              <div className="p-6 space-y-8 overflow-y-auto flex-1">
                {/* Appearance Section */}
                <div className="space-y-4">
                  <div className="flex items-center gap-2 text-accent">
                    <Monitor size={18} />
                    <h3 className="text-sm font-bold uppercase tracking-wider">Appearance</h3>
                  </div>
                  <div className="grid grid-cols-3 gap-2 p-1 bg-gray-100 dark:bg-gray-900 rounded-2xl">
                    {[
                      { id: 'light', icon: Sun, label: 'Light' },
                      { id: 'dark', icon: Moon, label: 'Dark' },
                      { id: 'auto', icon: Monitor, label: 'System' }
                    ].map((t) => (
                      <button
                        key={t.id}
                        onClick={() => setTheme(t.id as Theme)}
                        className={cn(
                          "flex flex-col items-center gap-1.5 py-3 px-2 rounded-xl transition-all",
                          theme === t.id 
                            ? "bg-white dark:bg-gray-800 shadow-sm text-accent" 
                            : "text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
                        )}
                      >
                        <t.icon size={20} />
                        <span className="text-[10px] font-bold">{t.label}</span>
                      </button>
                    ))}
                  </div>
                  
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest ml-1">Accent Color</label>
                    <div className="flex flex-wrap gap-3 p-3 bg-gray-100 dark:bg-gray-900 rounded-2xl">
                      {ACCENT_COLORS.map((color) => (
                        <button
                          key={color.name}
                          onClick={() => setAccentColor(color.value)}
                          className={cn(
                            "w-8 h-8 rounded-full border-2 transition-all",
                            accentColor === color.value ? "border-white ring-2 ring-accent scale-110" : "border-transparent hover:scale-105"
                          )}
                          style={{ backgroundColor: color.value }}
                          title={color.name}
                        />
                      ))}
                    </div>
                  </div>
                </div>

                {/* Sync Section */}
                <div className="space-y-4">
                  <div className="flex items-center gap-2 text-accent">
                    <RefreshCw size={18} />
                    <h3 className="text-sm font-bold uppercase tracking-wider">Sync & Backup</h3>
                  </div>
                  <div className="flex items-center justify-between p-4 bg-gray-100 dark:bg-gray-900 rounded-2xl">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-accent/10 rounded-xl flex items-center justify-center text-accent">
                        <RefreshCw size={20} className={cn(autoSync && "animate-spin-slow")} />
                      </div>
                      <div>
                        <p className="text-sm font-bold dark:text-white">Auto-Sync</p>
                        <p className="text-[10px] text-gray-500">Backup changes automatically</p>
                      </div>
                    </div>
                    <button 
                      onClick={() => setAutoSync(!autoSync)}
                      className={cn(
                        "w-12 h-6 rounded-full transition-all relative",
                        autoSync ? "bg-accent" : "bg-gray-300 dark:bg-gray-700"
                      )}
                    >
                      <motion.div 
                        animate={{ x: autoSync ? 24 : 4 }}
                        className="absolute top-1 w-4 h-4 bg-white rounded-full shadow-sm"
                      />
                    </button>
                  </div>
                </div>

                {/* Security Section */}
                <div className="space-y-4">
                  <div className="flex items-center gap-2 text-accent">
                    <Shield size={18} />
                    <h3 className="text-sm font-bold uppercase tracking-wider">Security</h3>
                  </div>
                  <div className="space-y-3">
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-gray-500 dark:text-gray-400 ml-1">Master Key (Zero Knowledge)</label>
                      <div className="relative">
                        <input 
                          type={showMasterKey ? "text" : "password"} 
                          value={masterKey} 
                          onChange={(e) => setMasterKey(e.target.value)} 
                          placeholder="Set your Master Key" 
                          className="w-full bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl py-3.5 pl-3.5 pr-12 text-sm dark:text-white outline-none focus:ring-2 focus:ring-accent transition-all" 
                        />
                        <button 
                          onClick={() => setShowMasterKey(!showMasterKey)}
                          className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-accent transition-colors"
                        >
                          {showMasterKey ? <EyeOff size={18} /> : <Eye size={18} />}
                        </button>
                      </div>
                      <div className="flex gap-1 mt-2 px-1">
                        {[1, 2, 3, 4, 5].map((i) => (
                          <div 
                            key={i} 
                            className={cn(
                              "h-1 flex-1 rounded-full transition-all duration-500",
                              i <= calculateMasterKeyStrength(masterKey) 
                                ? (calculateMasterKeyStrength(masterKey) <= 2 ? 'bg-red-500' : calculateMasterKeyStrength(masterKey) <= 4 ? 'bg-yellow-500' : 'bg-emerald-500')
                                : 'bg-gray-200 dark:bg-gray-700'
                            )}
                          />
                        ))}
                      </div>
                      <p className="text-[10px] text-amber-600 dark:text-amber-400 flex items-center gap-1.5 px-1 mt-1">
                        <AlertCircle size={12} /> This key is never sent to the server.
                      </p>
                    </div>
                  </div>
                </div>

                {/* Cloud Versions Section */}
                {user && (
                  <div className="space-y-4">
                    <div className="flex items-center gap-2 text-accent">
                      <History size={18} />
                      <h3 className="text-sm font-bold uppercase tracking-wider">Cloud Versions</h3>
                    </div>
                    <div className="space-y-2 max-h-48 overflow-y-auto pr-2 custom-scrollbar">
                      {backupVersions.map(v => (
                        <div key={v.version} className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-900/50 rounded-xl border border-transparent hover:border-accent/20 transition-all">
                          <div>
                            <p className="text-xs font-bold dark:text-white">{new Date(v.updatedAt).toLocaleString()}</p>
                            <p className="text-[10px] text-gray-500">Chunks: {v.totalChunks} • v{v.appVersion}</p>
                          </div>
                          <button 
                            onClick={() => handleRestore(v.version)}
                            className="text-[10px] font-bold text-accent hover:underline"
                          >
                            Restore
                          </button>
                        </div>
                      ))}
                      {backupVersions.length === 0 && <p className="text-center text-[10px] text-gray-500 py-4">No cloud versions found</p>}
                    </div>
                  </div>
                )}

                {/* Google Drive Section */}
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-accent">
                      <Cloud size={18} />
                      <h3 className="text-sm font-bold uppercase tracking-wider">Google Drive</h3>
                    </div>
                    {!isDriveAuthReady ? (
                       <span className="text-[10px] text-gray-500">Initializing...</span>
                    ) : (
                       <button 
                         onClick={async () => {
                           try {
                             if (!checkDriveAuth()) await signInToDrive();
                             const files = await listDriveBackups();
                             setDriveBackups(files);
                           } catch (e) {
                             console.error(e);
                             setToast({ message: 'Failed to load Drive backups', type: 'error', id: Date.now() });
                           }
                         }}
                         className="text-[10px] font-bold text-accent hover:underline"
                       >
                         Load Backups
                       </button>
                    )}
                  </div>
                  <div className="grid grid-cols-1 gap-3">
                    <button 
                      onClick={handleDriveExport}
                      className="w-full flex items-center justify-center gap-2 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 py-3.5 rounded-xl font-bold hover:bg-gray-200 dark:hover:bg-gray-600 transition-all active:scale-95"
                    >
                      <Download size={18} /> Export to Drive
                    </button>
                    <div className="space-y-2 max-h-48 overflow-y-auto pr-2 custom-scrollbar">
                      {driveBackups.map(f => (
                        <div key={f.id} className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-900/50 rounded-xl border border-transparent hover:border-accent/20 transition-all">
                          <div className="flex-1 min-w-0 mr-2">
                            <p className="text-xs font-bold dark:text-white truncate">{f.name}</p>
                            <p className="text-[10px] text-gray-500">{new Date(f.createdTime).toLocaleString()}</p>
                          </div>
                          <div className="flex gap-2">
                            <button 
                              onClick={() => handleDriveImport(f.id)}
                              className="text-[10px] font-bold text-accent hover:underline"
                            >
                              Import
                            </button>
                            <button 
                              onClick={async () => {
                                if (confirm('Delete this Drive backup?')) {
                                  await deleteFromDrive(f.id);
                                  setDriveBackups(prev => prev.filter(file => file.id !== f.id));
                                }
                              }}
                              className="text-[10px] font-bold text-red-500 hover:underline"
                            >
                              Delete
                            </button>
                          </div>
                        </div>
                      ))}
                      {driveBackups.length === 0 && <p className="text-center text-[10px] text-gray-500 py-4">No Drive backups found</p>}
                    </div>
                  </div>
                </div>
              </div>

              <div className="p-4 bg-gray-50 dark:bg-gray-900 border-t border-gray-200 dark:border-gray-700 text-center">
                <p className="text-[10px] text-gray-400 font-medium">PassGen Pro v2.4.0 • Secure & Encrypted</p>
              </div>
            </motion.div>
          </div>
        )}

        {activeModal === 'history' && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }} className="w-full max-w-md bg-white dark:bg-gray-800 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
              <div className="p-6 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center">
                <h2 className="text-2xl font-bold dark:text-white">History</h2>
                <div className="flex items-center gap-2">
                  {selectedHistoryItems.length > 0 && (
                    <button 
                      onClick={() => {
                        setPasswordHistory(prev => prev.filter(h => !selectedHistoryItems.includes(h.id)));
                        setSelectedHistoryItems([]);
                      }}
                      className="p-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-full transition-colors"
                      title="Delete Selected"
                    >
                      <Trash2 size={20} />
                    </button>
                  )}
                  <button onClick={() => { setActiveModal(null); setHistorySearchQuery(''); setSelectedHistoryItems([]); }} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full transition-colors"><X size={24} className="dark:text-white" /></button>
                </div>
              </div>
              
              <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-700 space-y-4">
                <div className="relative">
                  <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input 
                    type="text" 
                    placeholder="Search history..." 
                    value={historySearchQuery}
                    onChange={(e) => setHistorySearchQuery(e.target.value)}
                    className="w-full bg-gray-100 dark:bg-gray-700 border-0 rounded-xl py-2.5 pl-10 pr-4 text-sm focus:ring-2 focus:ring-accent outline-none dark:text-white"
                  />
                </div>
                
                {passwordHistory.length > 0 && (
                  <div className="flex items-center justify-between px-1">
                    <button 
                      onClick={() => {
                        const filtered = passwordHistory.filter(h => h.password?.toLowerCase().includes(historySearchQuery.toLowerCase()));
                        if (selectedHistoryItems.length === filtered.length && filtered.length > 0) {
                          setSelectedHistoryItems([]);
                        } else {
                          setSelectedHistoryItems(filtered.map(h => h.id));
                        }
                      }}
                      className="text-xs font-bold text-accent flex items-center gap-2"
                    >
                      {selectedHistoryItems.length === passwordHistory.filter(h => h.password?.toLowerCase().includes(historySearchQuery.toLowerCase())).length && selectedHistoryItems.length > 0 ? <CheckSquare size={16} /> : <Square size={16} />}
                      {selectedHistoryItems.length > 0 ? `Selected ${selectedHistoryItems.length}` : 'Select All'}
                    </button>
                    {historySearchQuery && (
                      <span className="text-[10px] text-gray-400 uppercase tracking-wider font-bold">
                        {passwordHistory.filter(h => h.password?.toLowerCase().includes(historySearchQuery.toLowerCase())).length} Results
                      </span>
                    )}
                  </div>
                )}
              </div>

              <div className="p-6 space-y-3 overflow-y-auto flex-1">
                {passwordHistory.length === 0 ? (
                  <p className="text-center text-gray-500 py-10">No history yet.</p>
                ) : (
                  passwordHistory
                    .filter(h => h.password?.toLowerCase().includes(historySearchQuery.toLowerCase()))
                    .slice()
                    .reverse()
                    .map(item => (
                      <div 
                        key={item.id} 
                        className={cn(
                          "p-4 rounded-2xl flex justify-between items-center group transition-all border-2",
                          selectedHistoryItems.includes(item.id) 
                            ? "bg-indigo-50 dark:bg-indigo-900/20 border-indigo-200 dark:border-indigo-800" 
                            : "bg-gray-50 dark:bg-gray-700/50 border-transparent hover:border-gray-200 dark:hover:border-gray-600"
                        )}
                      >
                        <div className="flex items-center gap-3 flex-1 min-w-0">
                          <button 
                            onClick={() => {
                              setSelectedHistoryItems(prev => 
                                prev.includes(item.id) 
                                  ? prev.filter(id => id !== item.id) 
                                  : [...prev, item.id]
                              );
                            }}
                            className={cn(
                              "transition-colors",
                              selectedHistoryItems.includes(item.id) ? "text-accent" : "text-gray-300 dark:text-gray-600"
                            )}
                          >
                            {selectedHistoryItems.includes(item.id) ? <CheckSquare size={20} /> : <Square size={20} />}
                          </button>
                          <div className="flex-1 min-w-0 mr-2">
                            <p className="font-mono text-lg dark:text-white truncate">{item.password}</p>
                            <p className="text-[10px] text-gray-500 mt-1">{item.date}</p>
                          </div>
                        </div>
                        <div className="flex gap-1">
                          <button onClick={() => copyToClipboard(item.password!)} className="p-2 text-accent hover:bg-accent/10 rounded-lg transition-colors"><Copy size={18} /></button>
                          <button onClick={() => setPasswordHistory(prev => prev.filter(h => h.id !== item.id))} className="p-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg transition-colors"><Trash2 size={18} /></button>
                        </div>
                      </div>
                    ))
                )}
                {passwordHistory.length > 0 && passwordHistory.filter(h => h.password?.toLowerCase().includes(historySearchQuery.toLowerCase())).length === 0 && (
                  <p className="text-center text-gray-500 py-10">No matches found.</p>
                )}
              </div>
            </motion.div>
          </div>
        )}

        {activeModal === 'account' && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }} className="w-full max-w-md bg-white dark:bg-gray-800 rounded-3xl shadow-2xl overflow-hidden">
              <div className="bg-gradient-to-r from-accent to-purple-600 p-8 flex items-center gap-4">
                <div className="w-16 h-16 bg-white/20 rounded-full flex items-center justify-center text-white text-2xl font-bold border-2 border-white/30 overflow-hidden">
                  {user?.photoURL ? <img src={user.photoURL} alt="User" className="w-full h-full object-cover" /> : user?.displayName?.charAt(0) || 'U'}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-white font-bold text-xl truncate">{user?.displayName || 'User'}</p>
                  <p className="text-indigo-100 text-sm truncate">{user?.email}</p>
                </div>
                <button onClick={() => setActiveModal(null)} className="text-white/70 hover:text-white transition-colors"><X size={24} /></button>
              </div>
              <div className="p-6 space-y-6">
                <div className="bg-gradient-to-br from-accent to-violet-700 p-6 rounded-3xl text-white shadow-xl relative overflow-hidden">
                  <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -mr-16 -mt-16 blur-2xl"></div>
                  <div className="relative z-10 flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 bg-white/20 rounded-2xl flex items-center justify-center backdrop-blur-md border border-white/30">
                        {backupStatus === 'loading' ? <RefreshCw size={24} className="animate-spin" /> : <Cloud size={24} />}
                      </div>
                      <div>
                        <p className="text-xs text-indigo-100 font-medium">Cloud Backup Status</p>
                        <p className="text-lg font-bold">
                          {backupStatus === 'success' ? 'Sync Successful!' : backupStatus === 'error' ? 'Sync Failed' : 'Ready to Sync'}
                        </p>
                      </div>
                    </div>
                  </div>
                  {lastBackupTime && (
                    <div className="mt-4 pt-4 border-t border-white/10 flex items-center justify-between text-[10px] text-indigo-100">
                      <span className="flex items-center gap-1"><Calendar size={10} /> Last Backup:</span>
                      <span className="font-mono">{new Date(lastBackupTime).toLocaleString()}</span>
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <button 
                    onClick={handleBackup}
                    disabled={backupStatus === 'loading'}
                    className="flex flex-col items-center gap-2 bg-white dark:bg-gray-700 text-gray-800 dark:text-white py-5 rounded-2xl font-bold shadow-sm border border-gray-100 dark:border-gray-600 active:scale-95 transition-all disabled:opacity-50"
                  >
                    <div className="w-10 h-10 bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 rounded-xl flex items-center justify-center">
                      <Download size={20} />
                    </div>
                    <span className="text-[10px] uppercase tracking-widest">Backup</span>
                  </button>
                  <button 
                    onClick={handleRestore}
                    disabled={backupStatus === 'loading'}
                    className="flex flex-col items-center gap-2 bg-white dark:bg-gray-700 text-gray-800 dark:text-white py-5 rounded-2xl font-bold shadow-sm border border-gray-100 dark:border-gray-600 active:scale-95 transition-all disabled:opacity-50"
                  >
                    <div className="w-10 h-10 bg-violet-100 dark:bg-violet-900/30 text-violet-600 dark:text-violet-400 rounded-xl flex items-center justify-center">
                      <RefreshCw size={20} />
                    </div>
                    <span className="text-[10px] uppercase tracking-widest">Restore</span>
                  </button>
                </div>
                <button onClick={handleLogout} className="w-full flex items-center justify-center gap-2 bg-red-50 dark:bg-red-900/20 text-red-600 py-4 rounded-2xl font-bold border border-red-200 dark:border-red-800 active:scale-95 transition-all"><LogOut size={20} /> Logout</button>
              </div>
            </motion.div>
          </div>
        )}

        {showConflictModal && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
            <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }} className="w-full max-w-sm bg-white dark:bg-gray-800 rounded-3xl shadow-2xl p-8 text-center">
              <div className="w-16 h-16 bg-amber-100 dark:bg-amber-900/30 rounded-2xl flex items-center justify-center mx-auto mb-6">
                <RefreshCw className="h-8 w-8 text-amber-600 dark:text-amber-400" />
              </div>
              <h2 className="text-2xl font-bold dark:text-white mb-2">Sync Conflict</h2>
              <p className="text-gray-500 dark:text-gray-400 text-sm mb-6">Cloud-এ নতুন backup পাওয়া গেছে। আপনি কি cloud data restore করতে চান নাকি local data দিয়ে cloud overwrite করতে চান?</p>
              
              <div className="space-y-3 mb-6">
                <div className="p-3 bg-gray-50 dark:bg-gray-900/50 rounded-xl text-left border border-transparent hover:border-accent/20 transition-all">
                  <p className="text-[10px] font-bold text-accent uppercase tracking-widest">Cloud Backup</p>
                  <p className="text-xs font-bold dark:text-white">{new Date(showConflictModal.cloudTime).toLocaleString()}</p>
                </div>
                <div className="p-3 bg-gray-50 dark:bg-gray-900/50 rounded-xl text-left border border-transparent hover:border-accent/20 transition-all">
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Local Data</p>
                  <p className="text-xs font-bold dark:text-white">{showConflictModal.localTime ? new Date(showConflictModal.localTime).toLocaleString() : 'Never Backed Up'}</p>
                </div>
              </div>

              <div className="flex flex-col gap-3">
                <button 
                  onClick={() => { handleRestore(); setShowConflictModal(null); }} 
                  className="w-full bg-accent text-white py-4 rounded-2xl font-bold shadow-lg active:scale-95 transition-all"
                >
                  Restore Cloud Data
                </button>
                <button 
                  onClick={() => { handleBackup(); setShowConflictModal(null); }} 
                  className="w-full bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 py-4 rounded-2xl font-bold active:scale-95 transition-all"
                >
                  Overwrite Cloud with Local
                </button>
                <button 
                  onClick={() => { 
                    localStorage.setItem('ignored_conflict_time', showConflictModal.cloudTime.toString());
                    setShowConflictModal(null); 
                  }} 
                  className="text-gray-400 text-sm hover:text-gray-600 dark:hover:text-gray-200"
                >
                  Decide Later
                </button>
              </div>
            </motion.div>
          </div>
        )}

        {activeModal === 'master-key-prompt' && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
            <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }} className="w-full max-w-sm bg-white dark:bg-gray-800 rounded-3xl shadow-2xl p-8 text-center">
              <div className="w-16 h-16 bg-amber-100 dark:bg-amber-900/30 rounded-2xl flex items-center justify-center mx-auto mb-6">
                <Key className="h-8 w-8 text-amber-600 dark:text-amber-400" />
              </div>
              <h2 className="text-2xl font-bold dark:text-white mb-2">Master Key Required</h2>
              <p className="text-gray-500 dark:text-gray-400 text-sm mb-6">Backup বা Restore করার আগে একটি Master Key সেট করতে হবে। এটি আপনার data encrypt করতে ব্যবহৃত হয়।</p>
              <button 
                onClick={() => { setActiveModal('settings'); }} 
                className="w-full bg-accent text-white py-4 rounded-2xl font-bold shadow-lg active:scale-95 transition-all"
              >
                Set Master Key
              </button>
              <button onClick={() => setActiveModal('account')} className="mt-4 text-gray-400 text-sm hover:text-gray-600 dark:hover:text-gray-200">Cancel</button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {confirmDelete && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
            <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }} className="w-full max-w-sm bg-white dark:bg-gray-800 rounded-3xl shadow-2xl p-8 text-center">
              <div className="w-16 h-16 bg-red-100 dark:bg-red-900/30 rounded-2xl flex items-center justify-center mx-auto mb-6">
                <Trash2 className="h-8 w-8 text-red-600 dark:text-red-400" />
              </div>
              <h2 className="text-2xl font-bold dark:text-white mb-2">Delete Permanently?</h2>
              <p className="text-gray-500 dark:text-gray-400 text-sm mb-6">This action cannot be undone. Are you sure you want to delete this note forever?</p>
              <div className="flex gap-3">
                <button 
                  onClick={() => setConfirmDelete(null)} 
                  className="flex-1 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 py-4 rounded-2xl font-bold active:scale-95 transition-all"
                >
                  Cancel
                </button>
                <button 
                  onClick={() => {
                    setNotes(prev => prev.filter(n => n.id !== confirmDelete));
                    setConfirmDelete(null);
                  }} 
                  className="flex-1 bg-red-600 text-white py-4 rounded-2xl font-bold shadow-lg active:scale-95 transition-all"
                >
                  Delete
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {editingNote && (
          <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }} 
              animate={{ scale: 1, opacity: 1 }} 
              exit={{ scale: 0.9, opacity: 0 }} 
              className={cn(
                "w-full max-w-md rounded-3xl shadow-2xl overflow-hidden flex flex-col",
                NOTE_COLORS.find(c => c.name === (editingNote.color || 'default'))?.light || 'bg-white',
                NOTE_COLORS.find(c => c.name === (editingNote.color || 'default'))?.dark || 'dark:bg-gray-800'
              )}
            >
              <div className="p-6 border-b border-black/5 dark:border-white/5 flex justify-between items-center">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-black/5 dark:bg-white/5 rounded-xl flex items-center justify-center">
                    <StickyNote size={20} className="dark:text-white" />
                  </div>
                  <div>
                    <h2 className="text-lg font-bold dark:text-white leading-tight">{editingNote.id ? 'Edit Note' : 'New Note'}</h2>
                    <p className="text-[10px] text-gray-500 dark:text-gray-400 uppercase tracking-widest font-bold">Secure Workspace</p>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <button 
                    onClick={() => setEditingNote({ ...editingNote, pinned: !editingNote.pinned })}
                    className={cn(
                      "p-2 rounded-full transition-colors",
                      editingNote.pinned ? "text-amber-500 bg-amber-50 dark:bg-amber-900/30" : "text-gray-400 hover:bg-black/5 dark:hover:bg-white/5"
                    )}
                  >
                    <CheckSquare size={20} />
                  </button>
                  <button onClick={() => setEditingNote(null)} className="p-2 hover:bg-black/5 dark:hover:bg-white/5 rounded-full transition-colors"><X size={24} className="dark:text-white" /></button>
                </div>
              </div>
              <div className="p-6 space-y-5 overflow-y-auto max-h-[70vh]">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest ml-1">Title</label>
                  <input 
                    type="text" 
                    value={editingNote.title || ''} 
                    onChange={(e) => setEditingNote({ ...editingNote, title: e.target.value })}
                    placeholder="Note Title" 
                    className="w-full bg-black/5 dark:bg-white/5 border-0 rounded-2xl p-4 text-sm dark:text-white outline-none focus:ring-2 focus:ring-accent font-bold transition-all"
                  />
                </div>
                
                <div className="space-y-1.5">
                  <div className="flex justify-between items-center ml-1">
                    <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Content</label>
                    <span className="text-[10px] text-gray-400 font-mono">{(editingNote.content || '').length} chars</span>
                  </div>
                  <div className="relative">
                    <textarea 
                      value={editingNote.content || ''} 
                      onChange={(e) => setEditingNote({ ...editingNote, content: e.target.value })}
                      placeholder="Start typing your secret note..." 
                      rows={10}
                      className="w-full bg-black/5 dark:bg-white/5 border-0 rounded-2xl p-4 text-sm dark:text-white outline-none focus:ring-2 focus:ring-accent resize-none transition-all"
                    />
                    <button 
                      onClick={() => copyToClipboard(editingNote.content || '')}
                      className="absolute bottom-4 right-4 p-2 bg-white/10 hover:bg-white/20 backdrop-blur-md rounded-lg text-gray-500 dark:text-gray-400 transition-all"
                      title="Copy Content"
                    >
                      <Copy size={16} />
                    </button>
                  </div>
                  <div className="absolute top-4 right-4 flex gap-2">
                    <button 
                      onClick={() => setEditingNote({ ...editingNote, pinned: !editingNote.pinned })}
                      className={cn(
                        "p-2 rounded-lg transition-all",
                        editingNote.pinned ? "bg-accent text-white" : "bg-white/10 text-gray-400 hover:bg-white/20"
                      )}
                      title={editingNote.pinned ? "Unpin" : "Pin"}
                    >
                      <Pin size={16} />
                    </button>
                    {editingNote.id && (
                      <button 
                        onClick={() => duplicateNote(editingNote as Note)}
                        className="p-2 bg-white/10 hover:bg-white/20 rounded-lg text-gray-400 transition-all"
                        title="Duplicate"
                      >
                        <Copy size={16} />
                      </button>
                    )}
                  </div>
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  {/* Reminder Picker */}
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest ml-1 flex items-center gap-2">
                      <Calendar size={12} /> Reminder
                    </label>
                    <input 
                      type="datetime-local" 
                      value={editingNote.reminder || ''} 
                      onChange={(e) => setEditingNote({ ...editingNote, reminder: e.target.value })}
                      className="w-full bg-black/5 dark:bg-white/5 border-0 rounded-2xl p-3 text-xs dark:text-white outline-none focus:ring-2 focus:ring-accent transition-all"
                    />
                  </div>

                  {/* Color Picker Label */}
                  <div className="space-y-1.5 col-span-2">
                    <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest ml-1 flex items-center gap-2">
                      <List size={12} /> Labels
                    </label>
                    <div className="flex flex-wrap gap-2 p-3 bg-black/5 dark:bg-white/5 rounded-2xl min-h-[48px]">
                      {labels.map(label => (
                        <button
                          key={label.id}
                          onClick={() => {
                            const currentLabels = editingNote.labels || [];
                            const newLabels = currentLabels.includes(label.id)
                              ? currentLabels.filter(id => id !== label.id)
                              : [...currentLabels, label.id];
                            setEditingNote({ ...editingNote, labels: newLabels });
                          }}
                          className={cn(
                            "px-3 py-1 rounded-full text-[10px] font-bold transition-all border",
                            (editingNote.labels || []).includes(label.id)
                              ? "bg-accent text-white border-accent"
                              : "bg-transparent text-gray-500 border-gray-300 dark:border-gray-600 hover:border-accent"
                          )}
                        >
                          {label.name}
                        </button>
                      ))}
                      {labels.length === 0 && (
                        <div className="flex items-center justify-between w-full">
                          <span className="text-[10px] text-gray-400 italic">No labels created</span>
                          <button 
                            onClick={() => setActiveModal('edit-labels')}
                            className="text-[10px] text-accent font-bold hover:underline"
                          >
                            Create Labels
                          </button>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Color Picker Label */}
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest ml-1">Theme Color</label>
                    <div className="flex flex-wrap gap-2 pt-1">
                      {NOTE_COLORS.slice(0, 4).map(color => (
                        <button 
                          key={color.name}
                          onClick={() => setEditingNote({ ...editingNote, color: color.name })}
                          className={cn(
                            "w-7 h-7 rounded-full border-2 transition-all",
                            color.light,
                            color.dark,
                            editingNote.color === color.name ? "border-accent scale-110" : "border-transparent hover:scale-105"
                          )}
                        />
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              <div className="p-6 bg-black/5 dark:bg-white/5 flex justify-between items-center">
                {editingNote.id ? (
                  <button 
                    onClick={() => {
                      moveToTrash(editingNote.id!);
                      setEditingNote(null);
                    }}
                    className="flex items-center gap-2 text-red-500 font-bold text-xs hover:bg-red-50 dark:hover:bg-red-900/30 px-4 py-2 rounded-xl transition-all active:scale-95"
                  >
                    <Trash2 size={16} /> Delete
                  </button>
                ) : <div />}
                <button 
                  onClick={() => {
                    if (editingNote.id && notes.find(n => n.id === editingNote.id)) {
                      setNotes(prev => prev.map(n => n.id === editingNote.id ? { ...n, ...editingNote, updatedAt: Date.now() } as Note : n));
                    } else {
                      const newNote: Note = {
                        id: Date.now().toString(),
                        title: editingNote.title || '',
                        content: editingNote.content || '',
                        color: editingNote.color || 'default',
                        pinned: editingNote.pinned || false,
                        updatedAt: Date.now(),
                        isArchived: false,
                        isDeleted: false,
                        labels: editingNote.labels || [],
                        reminder: editingNote.reminder
                      };
                      setNotes(prev => [...prev, newNote]);
                    }
                    setEditingNote(null);
                  }}
                  className="bg-accent text-white py-3 px-10 rounded-2xl font-bold shadow-lg active:scale-95 transition-all flex items-center gap-2"
                >
                  <Check size={18} /> Save Note
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showSavedToast && (
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="fixed bottom-24 left-1/2 -translate-x-1/2 z-[110] bg-emerald-600 text-white px-4 py-2 rounded-full shadow-lg flex items-center gap-2 text-xs font-bold"
          >
            <Check size={14} /> Settings Saved
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {toast && (
          <motion.div 
            key={toast.id}
            initial={{ opacity: 0, y: 20, scale: 0.95 }} 
            animate={{ opacity: 1, y: 0, scale: 1 }} 
            exit={{ opacity: 0, y: 10, scale: 0.95 }}
            transition={{ duration: 0.15, ease: "easeOut" }}
            className={cn(
              "fixed bottom-24 left-1/2 -translate-x-1/2 z-[120] px-6 py-3 rounded-2xl shadow-2xl flex items-center gap-3 border",
              toast.type === 'success' ? "bg-emerald-600 border-emerald-500 text-white" : 
              toast.type === 'error' ? "bg-red-600 border-red-500 text-white" : 
              "bg-gray-900 border-white/10 text-white"
            )}
          >
            {toast.type === 'success' ? <Check size={18} /> : toast.type === 'error' ? <AlertCircle size={18} /> : <Info size={18} />}
            <span className="text-sm font-bold">{toast.message}</span>
            <button onClick={() => setToast(null)} className="ml-2 hover:opacity-70 transition-opacity"><X size={14} /></button>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showUndoToast && (
          <motion.div 
            initial={{ opacity: 0, y: 50 }} 
            animate={{ opacity: 1, y: 0 }} 
            exit={{ opacity: 0, y: 50 }}
            className="fixed bottom-24 left-1/2 -translate-x-1/2 z-[110] bg-gray-900 text-white px-6 py-3 rounded-2xl shadow-2xl flex items-center gap-4 border border-white/10"
          >
            <span className="text-sm">Note moved to trash</span>
            <button 
              onClick={undoTrash}
              className="text-indigo-400 font-bold text-sm hover:text-indigo-300 transition-colors"
            >
              UNDO
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
