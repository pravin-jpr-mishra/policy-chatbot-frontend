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
    return process.env.REACT_APP_API_URL || 'https://policy-chatbot-backend.onrender.com';
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
      const response = await fetch(url, {
        ...options,
        headers,
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || 'API request failed');
      }

      return await response.json();
    } catch (error) {
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

  async uploadDocument(file, owner = null) {
    const formData = new FormData();
    formData.append('file', file);

    let url = `${API_BASE_URL}/api/documents/upload`;
    if (owner) {
      url += `?owner=${encodeURIComponent(owner)}`;
    }
    
    const headers = {};
    if (this.sessionToken) {
      headers['Authorization'] = `Bearer ${this.sessionToken}`;
    }
    
    console.log(`Uploading ${file.name} to ${url} for user: ${owner}`);
    
    try {
      // Add timeout for document processing
      const controller = new AbortController();
      const timeoutId = setTimeout(() => {
        console.log('Upload/processing timeout - aborting request');
        controller.abort();
      }, 120000); // 2 minutes timeout for processing

      const response = await fetch(url, {
        method: 'POST',
        headers,
        body: formData,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      console.log(`Upload response status: ${response.status}`);
      
      if (!response.ok) {
        const error = await response.json();
        console.error('Upload error:', error);
        throw new Error(error.detail || 'Upload failed');
      }

      const result = await response.json();
      console.log('Upload result:', result);
      return result;
    } catch (error) {
      if (error.name === 'AbortError') {
        throw new Error('Upload timed out during processing. Please try again.');
      }
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
