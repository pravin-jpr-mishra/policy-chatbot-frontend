/**
 * API Service for HR Policy Chatbot
 * Handles all communication with FastAPI backend
 */

// Determine API URL based on environment
const getApiBaseUrl = () => {
  // Check if we're in production (Vercel sets NODE_ENV to production)
  // Also check for REACT_APP_API_URL environment variable
  if (process.env.REACT_APP_API_URL) {
    return process.env.REACT_APP_API_URL;
  }
  
  // Check if we're on Vercel (production)
  if (window.location.hostname.includes('vercel.app') || 
      window.location.hostname !== 'localhost') {
    // Use the production backend URL (Render.com)
    // This should be set via REACT_APP_API_URL, but fallback for safety
    return process.env.REACT_APP_API_URL || 'https://policy-chatbot-backend-mnwj.onrender.com';
  }
  
  // Default to localhost for development
  return 'http://localhost:8000';
};

const API_BASE_URL = getApiBaseUrl();

class APIService {
  constructor() {
    this.sessionToken = localStorage.getItem('sessionToken') || null;
    console.log('API Base URL:', API_BASE_URL);
  }

  // Helper method for API calls
  async request(endpoint, options = {}) {
    const url = `${API_BASE_URL}${endpoint}`;
    const headers = {
      'Content-Type': 'application/json',
      ...options.headers,
    };

    if (this.sessionToken && !options.skipAuth) {
      headers['Authorization'] = `Bearer ${this.sessionToken}`;
    }

    try {
      // Add timeout for requests (60 seconds - Render free tier can be slow to wake up)
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 60000);
      
      const response = await fetch(url, {
        ...options,
        headers,
        signal: controller.signal,
      });
      
      clearTimeout(timeoutId);

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || 'API request failed');
      }

      return await response.json();
    } catch (error) {
      if (error.name === 'AbortError') {
        console.error(`API Timeout (${endpoint}): Request took too long`);
        throw new Error('Server is waking up. Please try again in a moment.');
      }
      console.error(`API Error (${endpoint}):`, error);
      throw error;
    }
  }

  // Authentication endpoints
  async getLoginUrl() {
    return await this.request('/api/auth/login-url');
  }

  async checkSession() {
    const params = this.sessionToken ? `?session_token=${this.sessionToken}` : '';
    return await this.request(`/api/auth/session${params}`);
  }

  async logout() {
    const result = await this.request('/api/auth/logout', { method: 'POST' });
    this.sessionToken = null;
    localStorage.removeItem('sessionToken');
    return result;
  }

  setSessionToken(token) {
    this.sessionToken = token;
    localStorage.setItem('sessionToken', token);
  }

  // Document endpoints
  async getDocuments(user = null) {
    const params = user ? `?user=${encodeURIComponent(user)}` : '';
    return await this.request(`/api/documents${params}`);
  }

  // Upload document with extended timeout for free hosting
  async uploadDocument(file, userEmail, onProgress = null) {
    const formData = new FormData();
    formData.append('file', file);

    // Validate file size (max 50MB)
    const maxSize = 50 * 1024 * 1024;
    if (file.size > maxSize) {
      throw new Error(`File too large. Maximum size is 50MB, your file is ${(file.size / (1024 * 1024)).toFixed(2)}MB`);
    }

    try {
      // Use XMLHttpRequest for progress tracking and longer timeout
      return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        
        // 5 minute timeout for upload + processing (Render free tier is slow)
        xhr.timeout = 300000; // 5 minutes
        
        xhr.upload.addEventListener('progress', (event) => {
          if (event.lengthComputable && onProgress) {
            const progress = Math.round((event.loaded / event.total) * 100);
            onProgress(progress);
          }
        });

        xhr.addEventListener('load', () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            try {
              const response = JSON.parse(xhr.responseText);
              resolve(response);
            } catch (e) {
              resolve({ success: true, message: 'Document uploaded successfully' });
            }
          } else {
            reject(new Error(`Upload failed with status ${xhr.status}: ${xhr.responseText}`));
          }
        });

        xhr.addEventListener('error', () => {
          reject(new Error('Network error during upload. Server might be waking up - please try again.'));
        });

        xhr.addEventListener('timeout', () => {
          reject(new Error('Upload timed out. The server might be processing a large file or waking up. Please try again.'));
        });

        xhr.addEventListener('abort', () => {
          reject(new Error('Upload was cancelled'));
        });

        xhr.open('POST', `${this.baseURL}/api/documents/upload?owner=${encodeURIComponent(userEmail)}`);
        
        // Add auth token if available
        const token = localStorage.getItem('session_token');
        if (token) {
          xhr.setRequestHeader('Authorization', `Bearer ${token}`);
        }
        
        xhr.send(formData);
      });
    } catch (error) {
      console.error('Upload error:', error);
      throw error;
    }
  }

  async toggleDocument(name, active, owner = null) {
    return await this.request('/api/documents/toggle', {
      method: 'POST',
      body: JSON.stringify({ name, active, owner }),
    });
  }

  async deleteDocument(name, owner = null) {
    const params = owner ? `?owner=${encodeURIComponent(owner)}` : '';
    return await this.request(`/api/documents/${encodeURIComponent(name)}${params}`, {
      method: 'DELETE',
    });
  }

  // Chat endpoints
  async askQuestion(question, user = null) {
    return await this.request('/api/chat/question', {
      method: 'POST',
      body: JSON.stringify({ question, session_token: this.sessionToken, user }),
    });
  }

  async getChatHistory() {
    return await this.request('/api/chat/history');
  }

  async clearChatHistory() {
    return await this.request('/api/chat/clear', { 
      method: 'POST',
      body: JSON.stringify({ session_token: this.sessionToken }),
    });
  }
}

const apiService = new APIService();
export default apiService;
