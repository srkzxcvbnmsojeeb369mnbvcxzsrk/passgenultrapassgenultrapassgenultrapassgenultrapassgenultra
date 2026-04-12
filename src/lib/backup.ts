import CryptoJS from 'crypto-js';
import LZString from 'lz-string';
import { db } from '../firebase';
import { 
  doc, 
  setDoc, 
  getDoc, 
  collection, 
  getDocs, 
  query, 
  orderBy, 
  limit, 
  writeBatch,
  deleteDoc,
  Timestamp
} from 'firebase/firestore';
import { BackupData, BackupMeta, ChunkData } from '../types';

const CHUNK_SIZE = 500 * 1024; // 500KB per chunk to be safe (Firestore limit is 1MB)
const MAX_VERSIONS = 10;
const APP_VERSION = '2.5.0';

// Helper: Generate Checksum
const generateChecksum = (data: string): string => {
  return CryptoJS.SHA256(data).toString();
};

// Helper: Compress and Encrypt
export const compressAndEncrypt = (data: any, key: string): string => {
  const json = JSON.stringify(data);
  const compressed = LZString.compressToUTF16(json);
  return CryptoJS.AES.encrypt(compressed, key).toString();
};

// Helper: Decrypt and Decompress
export const decryptAndDecompress = (encryptedData: string, key: string): any => {
  try {
    const bytes = CryptoJS.AES.decrypt(encryptedData, key);
    const decrypted = bytes.toString(CryptoJS.enc.Utf8);
    if (!decrypted) return null;
    const decompressed = LZString.decompressFromUTF16(decrypted);
    return decompressed ? JSON.parse(decompressed) : null;
  } catch (e) {
    console.error('Decryption/Decompression failed', e);
    return null;
  }
};

// Core: Backup Data with Chunking and Versioning
export const backupToCloud = async (userId: string, data: BackupData, masterKey: string) => {
  const timestamp = Date.now();
  const encrypted = compressAndEncrypt(data, masterKey);
  const checksum = generateChecksum(encrypted);
  
  // Split into chunks
  const chunks: string[] = [];
  for (let i = 0; i < encrypted.length; i += CHUNK_SIZE) {
    chunks.push(encrypted.substring(i, i + CHUNK_SIZE));
  }

  const versionId = timestamp.toString();
  const batch = writeBatch(db);

  // 1. Save Meta
  const metaRef = doc(db, `backups/${userId}/versions/${versionId}`);
  const meta: BackupMeta = {
    version: versionId,
    updatedAt: timestamp,
    totalChunks: chunks.length,
    checksum,
    appVersion: APP_VERSION
  };
  batch.set(metaRef, meta);

  // 2. Save Chunks
  chunks.forEach((payload, index) => {
    const chunkRef = doc(db, `backups/${userId}/versions/${versionId}/chunks/${index}`);
    batch.set(chunkRef, { payload, index });
  });

  // 3. Update Latest Pointer
  const latestRef = doc(db, `backups/${userId}`);
  batch.set(latestRef, { latestVersion: versionId, updatedAt: timestamp });

  await batch.commit();
  
  // 4. Cleanup old versions
  await cleanupOldVersions(userId);
  
  return timestamp;
};

// Core: Restore Data from Cloud
export const restoreFromCloud = async (userId: string, masterKey: string, versionId?: string): Promise<BackupData | null> => {
  let targetVersion = versionId;

  if (!targetVersion) {
    const latestSnap = await getDoc(doc(db, `backups/${userId}`));
    if (!latestSnap.exists()) return null;
    targetVersion = latestSnap.data().latestVersion;
  }

  if (!targetVersion) return null;

  // 1. Get Meta
  const metaSnap = await getDoc(doc(db, `backups/${userId}/versions/${targetVersion}`));
  if (!metaSnap.exists()) throw new Error('Backup metadata not found');
  const meta = metaSnap.data() as BackupMeta;

  // 2. Get Chunks
  const chunksSnap = await getDocs(collection(db, `backups/${userId}/versions/${targetVersion}/chunks`));
  const chunksData = chunksSnap.docs.map(d => d.data() as ChunkData).sort((a, b) => a.index - b.index);
  
  if (chunksData.length !== meta.totalChunks) {
    throw new Error('Backup data incomplete (missing chunks)');
  }

  const encrypted = chunksData.map(c => c.payload).join('');

  // 3. Integrity Check
  if (generateChecksum(encrypted) !== meta.checksum) {
    throw new Error('Backup data integrity check failed (checksum mismatch)');
  }

  // 4. Decrypt and Decompress
  return decryptAndDecompress(encrypted, masterKey);
};

// Core: List Backup Versions
export const listBackupVersions = async (userId: string): Promise<BackupMeta[]> => {
  const versionsSnap = await getDocs(
    query(collection(db, `backups/${userId}/versions`), orderBy('updatedAt', 'desc'), limit(MAX_VERSIONS))
  );
  return versionsSnap.docs.map(d => d.data() as BackupMeta);
};

// Helper: Cleanup Old Versions
const cleanupOldVersions = async (userId: string) => {
  const versionsSnap = await getDocs(
    query(collection(db, `backups/${userId}/versions`), orderBy('updatedAt', 'desc'))
  );
  
  if (versionsSnap.size > MAX_VERSIONS) {
    const toDelete = versionsSnap.docs.slice(MAX_VERSIONS);
    for (const vDoc of toDelete) {
      // Delete chunks first
      const chunksSnap = await getDocs(collection(db, `backups/${userId}/versions/${vDoc.id}/chunks`));
      const batch = writeBatch(db);
      chunksSnap.docs.forEach(cDoc => batch.delete(cDoc.ref));
      batch.delete(vDoc.ref);
      await batch.commit();
    }
  }
};
