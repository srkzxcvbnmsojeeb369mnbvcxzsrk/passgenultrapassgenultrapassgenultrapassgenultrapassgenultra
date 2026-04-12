export interface Label {
  id: string;
  name: string;
}

export interface Note {
  id: string;
  title: string;
  content: string;
  color: string;
  pinned: boolean;
  updatedAt: number;
  isArchived?: boolean;
  isDeleted?: boolean;
  reminder?: string; // ISO date string
  labels?: string[]; // Array of label IDs
}

export interface PasswordOptions {
  length: number;
  includeSmall: boolean;
  includeCapital: boolean;
  includeNumbers: boolean;
  includeSpecial: boolean;
  excludeConfusing: boolean;
}

export type Theme = 'dark' | 'light' | 'auto';
export type AccentColor = 'purple' | 'blue' | 'green' | 'red';

export type PasswordType = 'random' | 'pronounceable' | 'memorable' | 'ai_memorable' | 'uuid';

export interface AppSettings {
  theme: Theme;
  accentColor: string;
  passwordOptions: PasswordOptions;
  passLength: number;
  passwordType: PasswordType;
  masterKeySet: boolean;
  autoSync?: boolean;
}

export interface HistoryItem {
  id: number;
  password?: string;
  date: string;
}

export interface BackupData {
  history: HistoryItem[];
  settings: AppSettings;
  notes: Note[];
  labels: Label[];
  updatedAt: number;
}

export interface BackupMeta {
  version: string;
  updatedAt: number;
  totalChunks: number;
  checksum: string;
  appVersion: string;
  description?: string;
}

export interface ChunkData {
  payload: string;
  index: number;
}

export interface DriveFile {
  id: string;
  name: string;
  createdTime: string;
  size?: string;
}
