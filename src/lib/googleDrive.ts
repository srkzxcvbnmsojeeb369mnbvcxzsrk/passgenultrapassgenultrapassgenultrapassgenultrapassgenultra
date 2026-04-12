import { DriveFile } from '../types';

const SCOPES = 'https://www.googleapis.com/auth/drive.file';

let accessToken = '';
let tokenClient: any = null;
let gisInitialized = false;

export const initDriveClient = async (apiKey: string, clientId: string) => {
  if (gisInitialized) return;

  return new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.onload = () => {
      try {
        tokenClient = (window as any).google.accounts.oauth2.initTokenClient({
          client_id: clientId,
          scope: SCOPES,
          callback: (tokenResponse: any) => {
            if (tokenResponse.error !== undefined) {
              console.error('GIS Error:', tokenResponse);
            }
          },
        });
        gisInitialized = true;
        resolve();
      } catch (error) {
        reject(error);
      }
    };
    script.onerror = () => {
      reject(new Error('Failed to load Google Identity Services script'));
    };
    document.body.appendChild(script);
  });
};

export const checkDriveAuth = () => {
  return !!accessToken;
};

export const signInToDrive = async () => {
  return new Promise<void>((resolve, reject) => {
    if (!tokenClient) return reject(new Error('Drive client not initialized'));
    
    try {
      tokenClient.callback = (tokenResponse: any) => {
        if (tokenResponse.error !== undefined) {
          reject(new Error(tokenResponse.error));
        } else {
          accessToken = tokenResponse.access_token;
          resolve();
        }
      };
      tokenClient.requestAccessToken({ prompt: 'consent' });
    } catch (error) {
      reject(error);
    }
  });
};

export const exportToDrive = async (encryptedData: string, fileName: string) => {
  if (!accessToken) throw new Error('Not authenticated with Google Drive');

  const metadata = {
    name: fileName,
    mimeType: 'application/octet-stream',
  };

  const form = new FormData();
  form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
  form.append('file', new Blob([encryptedData], { type: 'application/octet-stream' }));

  const response = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
    },
    body: form,
  });

  if (!response.ok) {
    const errorData = await response.text();
    throw new Error(`Failed to upload to Google Drive: ${errorData}`);
  }

  return await response.json();
};

export const listDriveBackups = async (): Promise<DriveFile[]> => {
  if (!accessToken) throw new Error('Not authenticated with Google Drive');

  const response = await fetch(`https://www.googleapis.com/drive/v3/files?pageSize=20&fields=nextPageToken,files(id,name,createdTime,size)&q=name contains 'passgen_backup_'&orderBy=createdTime desc`, {
    headers: {
      'Authorization': `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    const errorData = await response.text();
    throw new Error(`Failed to list Drive files: ${errorData}`);
  }

  const data = await response.json();
  return data.files || [];
};

export const downloadFromDrive = async (fileId: string): Promise<string> => {
  if (!accessToken) throw new Error('Not authenticated with Google Drive');

  const response = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
    headers: {
      'Authorization': `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    const errorData = await response.text();
    throw new Error(`Failed to download from Google Drive: ${errorData}`);
  }

  return await response.text();
};

export const deleteFromDrive = async (fileId: string) => {
  if (!accessToken) throw new Error('Not authenticated with Google Drive');

  const response = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}`, {
    method: 'DELETE',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    const errorData = await response.text();
    throw new Error(`Failed to delete from Google Drive: ${errorData}`);
  }
};
