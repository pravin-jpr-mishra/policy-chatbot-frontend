import React, { useState, useRef, useCallback } from 'react';
import { useEffect } from "react";
import API from './api';

const AIDocumentAnalysis = () => {
  const [bgStyle, setBgStyle] = useState(() => {
    // Load theme from localStorage - try user-specific first, then fallback to lastTheme
    try {
      const savedUser = localStorage.getItem('currentUser');
      if (savedUser) {
        const user = JSON.parse(savedUser);
        const themeKey = `theme_${user.preferred_username}`;
        const savedTheme = localStorage.getItem(themeKey);
        if (savedTheme) {
          console.log('✅ Loading user theme:', savedTheme);
          return savedTheme;
        }
      }
      // Fallback: use lastTheme (persists even after logout)
      const lastTheme = localStorage.getItem('lastTheme');
      if (lastTheme) {
        console.log('✅ Loading lastTheme:', lastTheme);
        return lastTheme;
      }
    } catch (e) {
      console.error('❌ Error loading theme:', e);
    }
    console.log('⚠️ Using default theme: cosmic');
    return 'cosmic';
  });
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [isAuthenticating, setIsAuthenticating] = useState(() => {
    // If there's an OAuth code in the URL or a session token exists, start in authenticating state
    const hasOAuthCode = window.location.search.includes('code=');
    const hasSessionToken = !!localStorage.getItem('sessionToken');
    return hasOAuthCode || hasSessionToken;
  });
  
  const [loginLoading, setLoginLoading] = useState(false);
  const [error, setError] = useState(null);
  
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    // Auto-collapse sidebar on mobile
    return window.innerWidth < 768;
  });
  const [question, setQuestion] = useState('');
  const [chatHistory, setChatHistory] = useState(() => {
    // Load chat history from localStorage using saved user
    const savedUser = localStorage.getItem('currentUser');
    if (savedUser) {
      const user = JSON.parse(savedUser);
      const userKey = `chatHistory_${user.preferred_username}`;
      const saved = localStorage.getItem(userKey);
      return saved ? JSON.parse(saved) : [];
    }
    return [];
  });
  const [currentUser, setCurrentUser] = useState(() => {
    // Load current user from localStorage on initial render
    const saved = localStorage.getItem('currentUser');
    return saved ? JSON.parse(saved) : null;
  });
  const [bgMenuOpen, setBgMenuOpen] = useState(false);
  const [uploadedFiles, setUploadedFiles] = useState([]);
  const [selectedFiles, setSelectedFiles] = useState([]); // Files selected but not yet uploaded
  const [isLoading, setIsLoading] = useState(false);
  const [isClearingInactive, setIsClearingInactive] = useState(false); // Loading state for clearing inactive
  const [clearingProgress, setClearingProgress] = useState({ current: 0, total: 0 }); // Track clearing progress
  const [toast, setToast] = useState({ show: false, message: '', type: '' }); // Toast notification state
  const [expandedSections, setExpandedSections] = useState({}); // Track which sections are expanded
  const [showScrollButton, setShowScrollButton] = useState(false); // Show/hide scroll to bottom button
  const [uploadProgress, setUploadProgress] = useState({}); // Track upload progress per file
  const [removedFiles, setRemovedFiles] = useState([]); // Track removed files for undo
  const [showUndoBar, setShowUndoBar] = useState(false); // Show undo bar after clearing inactive
  
  // Constants for limits
  const MAX_FILE_SIZE = 200 * 1024 * 1024; // 200MB in bytes
  const MAX_DOCUMENTS_PER_USER = 10;
  const MAX_DOCUMENTS_PER_UPLOAD = 10;
  const fileInputRef = useRef(null);
  const chatContainerRef = useRef(null); // Ref for auto-scrolling chat
  const textareaRef = useRef(null); // Ref for textarea to reset height

  // Auto-scroll to bottom when chat history changes
  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
    }
  }, [chatHistory]);

  // Handle window resize for responsive sidebar
  useEffect(() => {
    const handleResize = () => {
      // Auto-collapse sidebar on mobile
      if (window.innerWidth < 768 && !sidebarCollapsed) {
        setSidebarCollapsed(true);
      }
    };
    
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [sidebarCollapsed]);

  // Detect scroll position to show/hide scroll button
  useEffect(() => {
    const container = chatContainerRef.current;
    if (!container) return;

    const handleScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = container;
      // Show button if user is more than 100px from bottom and there's scrollable content
      const hasScrollableContent = scrollHeight > clientHeight;
      const isNearBottom = scrollHeight - scrollTop - clientHeight < 100;
      setShowScrollButton(hasScrollableContent && !isNearBottom);
    };

    // Initial check
    handleScroll();

    container.addEventListener('scroll', handleScroll);
    // Also listen for resize events
    window.addEventListener('resize', handleScroll);
    
    return () => {
      container.removeEventListener('scroll', handleScroll);
      window.removeEventListener('resize', handleScroll);
    };
  }, [isLoggedIn, chatHistory.length]); // Re-run when logged in or chat changes

  // Scroll to bottom function
  const scrollToBottom = () => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTo({
        top: chatContainerRef.current.scrollHeight,
        behavior: 'smooth'
      });
    }
  };

  // Toggle expand/collapse for chat sections
  const toggleSection = (chatId, section) => {
    setExpandedSections(prev => ({
      ...prev,
      [`${chatId}-${section}`]: !prev[`${chatId}-${section}`]
    }));
  };

  const backgrounds = {
    cosmic: 'bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900',
    ocean: 'bg-gradient-to-br from-blue-950 via-cyan-900 to-blue-950',
    sunset: 'bg-gradient-to-br from-purple-950 via-pink-900 to-orange-950',
    forest: 'bg-gradient-to-br from-emerald-950 via-teal-900 to-slate-900',
    midnight: 'bg-gradient-to-br from-indigo-950 via-slate-900 to-black'
  };

  // Track if we've loaded the user's chat history (to prevent overwriting on login)
  const [chatHistoryLoaded, setChatHistoryLoaded] = useState(false);
  const [themeLoaded, setThemeLoaded] = useState(false); // Track if theme has been loaded

  // Save chat history to localStorage whenever it changes (per user)
  // Only save after we've loaded the history to prevent overwriting with empty array
  useEffect(() => {
    if (currentUser?.preferred_username && chatHistoryLoaded) {
      const userKey = `chatHistory_${currentUser.preferred_username}`;
      localStorage.setItem(userKey, JSON.stringify(chatHistory));
    }
  }, [chatHistory, currentUser, chatHistoryLoaded]);

  // Save theme to localStorage whenever it changes (per user)
  // Only save after theme has been loaded to prevent overwriting
  useEffect(() => {
    if (currentUser?.preferred_username && themeLoaded) {
      const themeKey = `theme_${currentUser.preferred_username}`;
      localStorage.setItem(themeKey, bgStyle);
      // Also save as lastTheme for authenticating screen
      localStorage.setItem('lastTheme', bgStyle);
    }
  }, [bgStyle, currentUser, themeLoaded]);

  // Save currentUser to localStorage and load their chat history when user changes
  useEffect(() => {
    if (currentUser?.preferred_username) {
      localStorage.setItem('currentUser', JSON.stringify(currentUser));
      // Load this user's chat history
      const userKey = `chatHistory_${currentUser.preferred_username}`;
      const saved = localStorage.getItem(userKey);
      if (saved) {
        setChatHistory(JSON.parse(saved));
      } else {
        setChatHistory([]);
      }
      // Load this user's theme preference
      const themeKey = `theme_${currentUser.preferred_username}`;
      const savedTheme = localStorage.getItem(themeKey);
      if (savedTheme) {
        setBgStyle(savedTheme);
      }
      // Mark that we've loaded the history and theme
      setChatHistoryLoaded(true);
      setThemeLoaded(true);
    } else {
      // Reset when user logs out
      setChatHistoryLoaded(false);
      setThemeLoaded(false);
    }
  }, [currentUser]);

  // Load session and documents on mount
  useEffect(() => {
    const initAuth = async () => {
      try {
        // First check if we have an OAuth callback
        const params = new URLSearchParams(window.location.search);
        const code = params.get('code');
        
        // Check if we already processed this code (prevents double calls in React StrictMode)
        const processedCode = sessionStorage.getItem('processed_auth_code');
        
        if (code && code !== processedCode) {
          // Mark this code as being processed
          sessionStorage.setItem('processed_auth_code', code);
          // Handle OAuth callback
          await handleOAuthCallback();
        } else if (code && code === processedCode) {
          // Code was already processed, just check session and clear URL
          window.history.replaceState({}, document.title, window.location.pathname);
          await checkSession();
        } else {
          // No code in URL, check for existing session
          await checkSession();
        }
      } catch (error) {
        console.error('Auth initialization error:', error);
      } finally {
        // Always stop the authenticating spinner
        setIsAuthenticating(false);
      }
    };
    
    initAuth();
  }, []);

  // Load documents from backend for current user
  const loadDocuments = useCallback(async () => {
    try {
      const username = currentUser?.preferred_username;
      console.log('Loading documents for user:', username);
      const documents = await API.getDocuments(username);
      console.log('Documents received:', documents);
      setUploadedFiles(documents.map((doc, index) => ({
        id: index + 1,
        name: doc.name,
        active: doc.active
      })));
      console.log(`Loaded ${documents.length} documents for user: ${username}`);
    } catch (error) {
      console.error('Failed to load documents:', error);
    }
  }, [currentUser?.preferred_username]);

  // Load documents when user logs in or changes
  useEffect(() => {
    if (isLoggedIn && currentUser?.preferred_username) {
      loadDocuments();
    } else if (!isLoggedIn) {
      setUploadedFiles([]); // Clear documents when logged out
    }
  }, [isLoggedIn, currentUser?.preferred_username, loadDocuments]);

  // Handle OAuth callback
  const handleOAuthCallback = async () => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    const state = params.get('state');

    if (code) {
      try {
        // Determine API URL dynamically (same logic as api.js)
        const getApiUrl = () => {
          if (process.env.REACT_APP_API_URL) return process.env.REACT_APP_API_URL;
          if (window.location.hostname.includes('vercel.app') || window.location.hostname !== 'localhost') {
            return process.env.REACT_APP_API_URL || 'https://policy-chatbot-backend-mnwj.onrender.com';
          }
          return 'http://localhost:8000';
        };
        const apiUrl = getApiUrl();
        
        const response = await fetch(`${apiUrl}/api/auth/callback?code=${code}&state=${state || ''}`, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
          },
        });
        
        if (!response.ok) {
          throw new Error(`Auth callback failed: ${response.status}`);
        }
        
        const data = await response.json();

        if (data.authenticated && data.session_token) {
          API.setSessionToken(data.session_token);
          // Clear URL params first to avoid any redirect issues
          window.history.replaceState({}, document.title, window.location.pathname);
          // Clear the processed code from session storage
          sessionStorage.removeItem('processed_auth_code');
          // Set user and login state together
          setCurrentUser(data.user); // Store user info for chat history key
          setIsLoggedIn(true);
        } else {
          console.error('Authentication failed:', data);
          sessionStorage.removeItem('processed_auth_code');
          window.history.replaceState({}, document.title, window.location.pathname);
        }
      } catch (error) {
        console.error('OAuth callback error:', error);
        sessionStorage.removeItem('processed_auth_code');
        window.history.replaceState({}, document.title, window.location.pathname);
      }
    }
  };

  // Check for existing session
  const checkSession = async () => {
    try {
      const response = await API.checkSession();
      if (response.authenticated) {
        setCurrentUser(response.user); // Store user info for chat history key
        setIsLoggedIn(true);
      }
    } catch (error) {
      console.error('Session check failed:', error);
    }
  };

  const handleLogin = async () => {
    setLoginLoading(true);
    setError(null);
    
    try {
      // Show user that we're waking up the server
      console.log('Initiating login - waking up server if needed...');
      
      // Use a longer timeout since Render free tier can take 50+ seconds to wake up
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 90000); // 90 second timeout
      
      const response = await fetch(`${API_BASE_URL}/api/auth/login-url`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
        signal: controller.signal,
      });
      
      clearTimeout(timeoutId);
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const data = await response.json();
      
      if (data.login_url) {
        console.log('Redirecting to Microsoft login...');
        window.location.href = data.login_url;
      } else {
        throw new Error('No login URL received from server');
      }
    } catch (error) {
      console.error('Login error:', error);
      if (error.name === 'AbortError') {
        setError('Server is waking up. This can take up to 60 seconds on free hosting. Please try again.');
      } else {
        setError(`Login failed: ${error.message}. The server might be starting up, please wait and try again.`);
      }
    } finally {
      setLoginLoading(false);
    }
  };

  const handleLogout = async () => {
    try {
      await API.logout();
      setIsLoggedIn(false);
      setChatHistory([]); // Clear from state but keep in localStorage
      setCurrentUser(null);
      localStorage.removeItem('currentUser'); // Clear current user on logout
      setQuestion('');
      setUploadedFiles([]);
    } catch (error) {
      console.error('Logout failed:', error);
    }
  };

  const handleClearChat = async () => {
    try {
      await API.clearChatHistory();
      setChatHistory([]);
      // Clear from localStorage using user-specific key
      if (currentUser?.preferred_username) {
        localStorage.removeItem(`chatHistory_${currentUser.preferred_username}`);
      }
    } catch (error) {
      console.error('Failed to clear chat:', error);
    }
  };

  const handleBrowseFiles = () => {
    fileInputRef.current?.click();
  };

  const handleFileSelect = (e) => {
    const newFiles = Array.from(e.target.files);
    const errors = [];
    const validFiles = [];
    
    for (const file of newFiles) {
      // Check file size (200MB limit)
      if (file.size > MAX_FILE_SIZE) {
        errors.push(`"${file.name}" exceeds 200MB limit`);
        continue;
      }
      
      // Check for duplicate in already selected files
      const isDuplicateSelected = selectedFiles.some(f => f.name === file.name);
      if (isDuplicateSelected) {
        errors.push(`"${file.name}" is already selected`);
        continue;
      }
      
      // Check for duplicate in already uploaded files
      const isDuplicateUploaded = uploadedFiles.some(f => f.name === file.name);
      if (isDuplicateUploaded) {
        errors.push(`"${file.name}" already exists. Remove it before adding again`);
        continue;
      }
      
      validFiles.push(file);
    }
    
    // Check total documents limit (current + selected + new)
    const totalAfterUpload = uploadedFiles.length + selectedFiles.length + validFiles.length;
    if (totalAfterUpload > MAX_DOCUMENTS_PER_USER) {
      const allowedCount = MAX_DOCUMENTS_PER_USER - uploadedFiles.length - selectedFiles.length;
      if (allowedCount <= 0) {
        errors.push(`You can upload maximum ${MAX_DOCUMENTS_PER_USER} documents. Remove some to add more.`);
        validFiles.length = 0;
      } else {
        errors.push(`Only ${allowedCount} more document(s) can be added. Max limit is ${MAX_DOCUMENTS_PER_USER}.`);
        validFiles.splice(allowedCount);
      }
    }
    
    // Check max files per upload
    if (selectedFiles.length + validFiles.length > MAX_DOCUMENTS_PER_UPLOAD) {
      const allowedCount = MAX_DOCUMENTS_PER_UPLOAD - selectedFiles.length;
      errors.push(`You can only upload ${MAX_DOCUMENTS_PER_UPLOAD} documents at once.`);
      validFiles.splice(allowedCount);
    }
    
    // Show errors if any
    if (errors.length > 0) {
      setToast({ show: true, message: errors[0], type: 'error' });
      setTimeout(() => setToast({ show: false, message: '', type: '' }), 4000);
    }
    
    // Append valid files to existing selection (don't replace)
    if (validFiles.length > 0) {
      setSelectedFiles(prev => [...prev, ...validFiles]);
    }
    
    e.target.value = ''; // Reset input so same file can be selected again
  };

  const handleRemoveSelectedFile = (index) => {
    setSelectedFiles(selectedFiles.filter((_, i) => i !== index));
  };

  const handleUploadSelectedFiles = async () => {
    if (selectedFiles.length === 0) return;
    
    setIsLoading(true);
    let uploadedCount = 0;
    let failedFiles = [];
    const username = currentUser?.preferred_username;
    
    // Initialize progress for all files
    const initialProgress = {};
    selectedFiles.forEach((file, idx) => {
      initialProgress[file.name] = { status: 'pending', percent: 0 };
    });
    setUploadProgress(initialProgress);
    
    for (let i = 0; i < selectedFiles.length; i++) {
      const file = selectedFiles[i];
      try {
        // Simulate progress updates
        setUploadProgress(prev => ({
          ...prev,
          [file.name]: { status: 'uploading', percent: 10 }
        }));
        
        // Simulate gradual progress
        const progressInterval = setInterval(() => {
          setUploadProgress(prev => {
            const current = prev[file.name];
            if (current && current.status === 'uploading' && current.percent < 90) {
              return {
                ...prev,
                [file.name]: { ...current, percent: Math.min(current.percent + 15, 90) }
              };
            }
            return prev;
          });
        }, 200);
        
        console.log(`Uploading ${file.name} for user: ${username}...`);
        await API.uploadDocument(file, username);
        uploadedCount++;
        
        clearInterval(progressInterval);
        
        // Update progress to complete
        setUploadProgress(prev => ({
          ...prev,
          [file.name]: { status: 'complete', percent: 100 }
        }));
        
        console.log(`Successfully uploaded ${file.name}`);
      } catch (error) {
        console.error(`Failed to upload ${file.name}:`, error);
        
        // Determine error type
        let errorMsg = 'Upload failed';
        if (error.message.includes('memory') || error.message.includes('Memory')) {
          errorMsg = 'Memory error - file too large';
        } else if (error.message.includes('corrupt') || error.message.includes('invalid')) {
          errorMsg = 'Corrupted or invalid file';
        } else if (error.message.includes('format') || error.message.includes('type')) {
          errorMsg = 'Incompatible file format';
        } else if (error.message.includes('network') || error.message.includes('timeout')) {
          errorMsg = 'Network error - please retry';
        } else {
          errorMsg = error.message || 'Upload failed';
        }
        
        failedFiles.push({ name: file.name, error: errorMsg });
        
        // Update progress to failed
        setUploadProgress(prev => ({
          ...prev,
          [file.name]: { status: 'failed', percent: 0, error: errorMsg }
        }));
      }
    }
    
    setSelectedFiles([]); // Clear selected files after upload
    setIsLoading(false);
    
    // Clear progress after a delay
    setTimeout(() => setUploadProgress({}), 2000);
    
    if (uploadedCount > 0) {
      console.log(`Reloading documents list...`);
      await loadDocuments(); // Reload documents list
      // Show success toast with proper pluralization
      let msg;
      if (failedFiles.length > 0) {
        msg = `${uploadedCount} uploaded, ${failedFiles.length} failed`;
      } else {
        msg = uploadedCount === 1 ? '1 document added successfully' : `${uploadedCount} documents added successfully`;
      }
      setToast({ show: true, message: msg, type: failedFiles.length > 0 ? 'warning' : 'success' });
      setTimeout(() => setToast({ show: false, message: '', type: '' }), 3000);
    } else if (failedFiles.length > 0) {
      setToast({ show: true, message: `Upload failed: ${failedFiles[0].error}`, type: 'error' });
      setTimeout(() => setToast({ show: false, message: '', type: '' }), 4000);
    }
  };

  const handleSendMessage = async () => {
    if (!question.trim() || isLoading) return;
    
    // Validate and sanitize input
    const validation = validateQuestionInput(question);
    
    if (!validation.valid) {
      setToast({ show: true, message: validation.message, type: 'error' });
      setTimeout(() => setToast({ show: false, message: '', type: '' }), 3000);
      return;
    }
    
    const userQuestion = validation.sanitized; // Use sanitized input
    const messageId = Date.now();
    setQuestion('');
    
    // Reset textarea height
    if (textareaRef.current) {
      textareaRef.current.style.height = '48px';
    }
    
    setIsLoading(true);
    
    // Immediately add question with loading state
    const loadingMessage = {
      id: messageId,
      question: userQuestion,
      answer: null,
      shortAnswer: null,
      confidence: null,
      sources: null,
      responseTime: null,
      isShortAnswerType: false,
      isLoading: true // Flag to show searching state
    };
    
    setChatHistory(prev => [...prev, loadingMessage]);
    
    try {
      const username = currentUser?.preferred_username;
      const response = await API.askQuestion(userQuestion, username);
      
      // Update the message with actual response
      const completedMessage = {
        id: messageId,
        question: userQuestion,
        answer: response.answer,
        shortAnswer: response.short_answer,
        confidence: response.confidence,
        sources: response.sources,
        responseTime: response.response_time.toFixed(2) + 's',
        isShortAnswerType: response.is_short_answer_type,
        isGreeting: response.is_greeting || false,
        isList: response.is_list || false,
        isLoading: false
      };
      
      setChatHistory(prev => prev.map(msg => 
        msg.id === messageId ? completedMessage : msg
      ));
    } catch (error) {
      console.error('Failed to get answer:', error);
      // Update message with error state
      setChatHistory(prev => prev.map(msg => 
        msg.id === messageId ? {
          ...msg,
          answer: 'Sorry, failed to get an answer. Please try again.',
          isLoading: false,
          isError: true
        } : msg
      ));
    } finally {
      setIsLoading(false);
    }
  };

  const toggleFileActive = async (id) => {
    const file = uploadedFiles.find(f => f.id === id);
    if (file) {
      try {
        const username = currentUser?.preferred_username;
        await API.toggleDocument(file.name, !file.active, username);
        setUploadedFiles(uploadedFiles.map(f => 
          f.id === id ? { ...f, active: !f.active } : f
        ));
      } catch (error) {
        console.error('Failed to toggle document:', error);
      }
    }
  };

  const clearInactiveFiles = async () => {
    const inactiveFiles = uploadedFiles.filter(f => !f.active);
    
    if (inactiveFiles.length === 0) {
      setToast({ show: true, message: 'No inactive documents to clear', type: 'info' });
      setTimeout(() => setToast({ show: false, message: '', type: '' }), 2000);
      return;
    }
    
    // Store removed files for undo and update UI immediately
    setRemovedFiles(inactiveFiles);
    setUploadedFiles(uploadedFiles.filter(f => f.active));
    setShowUndoBar(true);
  };

  // Undo the clear inactive action
  const undoClearInactive = () => {
    setUploadedFiles(prev => [...prev, ...removedFiles]);
    setRemovedFiles([]);
    setShowUndoBar(false);
    setToast({ show: true, message: 'Documents restored', type: 'success' });
    setTimeout(() => setToast({ show: false, message: '', type: '' }), 2000);
  };

  // Permanently delete the removed files (called when X is clicked on undo bar)
  const permanentlyDeleteRemovedFiles = async () => {
    setShowUndoBar(false);
    setIsClearingInactive(true);
    const totalFiles = removedFiles.length;
    setClearingProgress({ current: 0, total: totalFiles, percent: 0 });
    const username = currentUser?.preferred_username;
    
    let successCount = 0;
    let failCount = 0;
    
    for (let i = 0; i < removedFiles.length; i++) {
      const file = removedFiles[i];
      const basePercent = (i / totalFiles) * 100;
      const nextPercent = ((i + 1) / totalFiles) * 100;
      
      // Simulate smooth progress within this file's deletion
      let currentPercent = basePercent;
      const progressInterval = setInterval(() => {
        currentPercent = Math.min(currentPercent + 5, basePercent + (nextPercent - basePercent) * 0.9);
        setClearingProgress({ current: i, total: totalFiles, percent: currentPercent });
      }, 100);
      
      try {
        await API.deleteDocument(file.name, username);
        successCount++;
      } catch (error) {
        console.error(`Failed to delete ${file.name}:`, error);
        failCount++;
      }
      
      clearInterval(progressInterval);
      setClearingProgress({ current: i + 1, total: totalFiles, percent: nextPercent });
    }
    
    setRemovedFiles([]);
    setIsClearingInactive(false);
    setClearingProgress({ current: 0, total: 0, percent: 0 });
    
    if (failCount > 0) {
      setToast({ show: true, message: `${successCount} deleted, ${failCount} failed`, type: 'info' });
    } else {
      const msg = successCount === 1 ? '1 document permanently deleted' : `${successCount} documents permanently deleted`;
      setToast({ show: true, message: msg, type: 'success' });
    }
    setTimeout(() => setToast({ show: false, message: '', type: '' }), 2000);
  };

  // Helper function to get file extension icon color and text
  const getFileTypeInfo = (filename) => {
    const ext = filename.split('.').pop().toLowerCase();
    switch (ext) {
      case 'pdf':
        return { color: 'bg-red-500', text: 'PDF' };
      case 'doc':
      case 'docx':
        return { color: 'bg-blue-600', text: 'DOC' };
      case 'txt':
        return { color: 'bg-gray-500', text: 'TXT' };
      default:
        return { color: 'bg-purple-500', text: ext.toUpperCase() };
    }
  };

  // Helper function to format file size
  const formatFileSize = (bytes) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / 1024 / 1024).toFixed(2) + ' MB';
  };

  // Constants for input validation
  const MAX_QUESTION_LENGTH = 200;
  const MIN_QUESTION_LENGTH = 2;

  // Sanitize user input to prevent XSS attacks (preserves newlines for multiline input)
  const sanitizeInput = (input, trimWhitespace = false) => {
    if (!input) return '';
    let sanitized = input
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '') // Remove <script> tags
      .replace(/<[^>]+>/g, '') // Remove all HTML tags
      .replace(/javascript:/gi, '') // Remove javascript: protocol
      .replace(/on\w+\s*=/gi, '') // Remove event handlers (onclick=, onerror=, etc.)
      .replace(/data:/gi, '') // Remove data: protocol
      .replace(/vbscript:/gi, ''); // Remove vbscript: protocol
    
    // Only trim when explicitly requested (e.g., before sending)
    if (trimWhitespace) {
      sanitized = sanitized.trim();
    }
    
    return sanitized;
  };

  // Validate question input for security and quality
  const validateQuestionInput = (input) => {
    const sanitized = sanitizeInput(input, true); // Trim whitespace before validation
    
    // Check for empty input
    if (sanitized.length === 0) {
      return { valid: false, message: 'Please enter a question', sanitized };
    }
    
    // Check minimum length
    if (sanitized.length < MIN_QUESTION_LENGTH) {
      return { valid: false, message: `Question too short (minimum ${MIN_QUESTION_LENGTH} characters)`, sanitized };
    }
    
    // Check maximum length
    if (sanitized.length > MAX_QUESTION_LENGTH) {
      return { valid: false, message: `Question too long (maximum ${MAX_QUESTION_LENGTH} characters)`, sanitized };
    }
    
    // Check for SQL injection patterns
    const sqlPatterns = [
      /(\bselect\b.*\bfrom\b)/i,
      /(\bdrop\b.*\btable\b)/i,
      /(\bdelete\b.*\bfrom\b)/i,
      /(\binsert\b.*\binto\b)/i,
      /(\bupdate\b.*\bset\b)/i,
      /(union.*select)/i,
      /(exec\s*\()/i,
      /(;\s*--)/i,
      /(\bor\b\s+1\s*=\s*1)/i,
      /(\band\b\s+1\s*=\s*1)/i,
    ];
    
    for (const pattern of sqlPatterns) {
      if (pattern.test(sanitized)) {
        return { valid: false, message: 'Invalid input detected. Please rephrase your question.', sanitized };
      }
    }
    
    // Check for script injection patterns
    const scriptPatterns = [
      /(eval\s*\()/i,
      /(alert\s*\()/i,
      /(document\.)/i,
      /(window\.)/i,
      /(<\s*iframe)/i,
      /(<\s*embed)/i,
      /(<\s*object)/i,
    ];
    
    for (const pattern of scriptPatterns) {
      if (pattern.test(sanitized)) {
        return { valid: false, message: 'Invalid characters detected. Please use plain text.', sanitized };
      }
    }
    
    return { valid: true, sanitized };
  };

  const toggleSidebar = () => {
    setSidebarCollapsed(!sidebarCollapsed);
  };

  const BackgroundElements = () => (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      <div className="absolute top-20 right-1/4 w-96 h-96 bg-blue-500/20 rounded-full blur-3xl animate-pulse"></div>
      <div className="absolute bottom-20 left-1/4 w-96 h-96 bg-cyan-500/20 rounded-full blur-3xl animate-pulse" style={{animationDelay: '1s'}}></div>
      {[...Array(50)].map((_, i) => (
        <div
          key={i}
          className="absolute w-1 h-1 bg-white rounded-full opacity-70"
          style={{
            top: `${Math.random() * 100}%`,
            left: `${Math.random() * 100}%`,
            animation: `twinkle ${2 + Math.random() * 3}s infinite ${Math.random() * 2}s`
          }}
        ></div>
      ))}
    </div>
  );

  useEffect(() => {
  const closeMenu = () => setBgMenuOpen(false);
  window.addEventListener("click", closeMenu);
  return () => window.removeEventListener("click", closeMenu);
}, []);

  // AUTHENTICATING SCREEN - shows while processing OAuth callback or checking session
  // Also show if there's a code in the URL (just returned from Microsoft)
  const hasCodeInUrl = window.location.search.includes('code=');
  if (isAuthenticating || hasCodeInUrl) {
    return (
      <div className={`min-h-screen ${backgrounds[bgStyle]} relative overflow-hidden flex items-center justify-center p-4`}>
        <BackgroundElements />
        <div className="relative z-10 text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-t-4 border-b-4 border-blue-500 mx-auto mb-6"></div>
          <h2 className="text-2xl font-semibold text-white mb-2">Authenticating...</h2>
          <p className="text-gray-400">Please wait while we sign you in</p>
        </div>
      </div>
    );
  }

  // LOGIN SCREEN
  if (!isLoggedIn) {
    return (
      <div className={`min-h-screen ${backgrounds[bgStyle]} relative overflow-hidden flex items-center justify-center p-4`}>
        <BackgroundElements />

        {/* Login button with loading state */}
        <button
          onClick={handleLogin}
          disabled={loginLoading}
          className={`flex items-center gap-3 px-8 py-4 rounded-xl font-semibold text-lg transition-all duration-300 ${
            loginLoading 
              ? 'bg-gray-500 cursor-not-allowed' 
              : 'bg-blue-600 hover:bg-blue-700 hover:scale-105 hover:shadow-xl'
          } text-white shadow-lg`}
        >
          {loginLoading ? (
            <>
              <svg className="animate-spin h-6 w-6 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              <span>Connecting to server...</span>
            </>
          ) : (
            <>
              <svg className="w-6 h-6" viewBox="0 0 24 24" fill="currentColor">
                <path d="M11.4 24H0V12.6h11.4V24zM24 24H12.6V12.6H24V24zM11.4 11.4H0V0h11.4v11.4zm12.6 0H12.6V0H24v11.4z"/>
              </svg>
              <span>Login with Microsoft</span>
            </>
          )}
        </button>

        {/* Error message */}
        {error && (
          <div className="mt-4 p-4 bg-red-500/20 border border-red-500/50 rounded-lg text-red-200 max-w-md text-center">
            {error}
          </div>
        )}
      </div>
    );
  }

  // CHATBOT SCREEN
  return (
    <div className={`min-h-screen ${backgrounds[bgStyle]} relative overflow-hidden`}>
      <BackgroundElements />

      {/* Background selector */}
      {/* <div className="absolute top-6 right-6 z-20 flex gap-2">
        {Object.keys(backgrounds).map((bg) => (
          <button
            key={bg}
            onClick={() => setBgStyle(bg)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
              bgStyle === bg
                ? 'bg-white/20 text-white border border-white/30'
                : 'bg-white/5 text-white/70 border border-white/10 hover:bg-white/10'
            }`}
          >
            {bg.charAt(0).toUpperCase() + bg.slice(1)}
          </button>
        ))}
      </div> */}

      <div className="relative z-10 w-full h-screen flex">
        {/* Overlay when undo bar is showing */}
        {showUndoBar && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40" />
        )}
        
        {/* Undo Modal - positioned slightly below center */}
        {showUndoBar && removedFiles.length > 0 && (
          <div className="fixed inset-0 flex items-center justify-center z-50 pointer-events-none" style={{ paddingTop: '10vh' }}>
            <div className="bg-slate-800/95 backdrop-blur-md text-white px-5 py-3 rounded-lg shadow-xl flex items-center gap-4 border border-slate-600/50 pointer-events-auto">
              <svg className="w-5 h-5 text-yellow-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <span className="text-sm font-medium whitespace-nowrap">
                {removedFiles.length} document{removedFiles.length > 1 ? 's' : ''} will be deleted
              </span>
              <div className="flex items-center gap-2 ml-2">
                <button
                  onClick={undoClearInactive}
                  className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded font-medium transition-colors"
                >
                  Undo
                </button>
                <button
                  onClick={permanentlyDeleteRemovedFiles}
                  className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white text-sm rounded font-medium transition-colors flex items-center gap-1.5"
                  disabled={isClearingInactive}
                >
                  {isClearingInactive ? (
                    <>
                      <svg className="w-3.5 h-3.5 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      <span>Deleting...</span>
                    </>
                  ) : (
                    'Delete'
                  )}
                </button>
              </div>
            </div>
          </div>
        )}
        
        {/* Left Sidebar - responsive on mobile */}
        <div className={`${sidebarCollapsed ? 'w-16' : 'w-80'} bg-slate-900/50 backdrop-blur-sm border-r border-white/10 transition-all duration-300 flex flex-col ${
          // Mobile: absolute positioning when open, hidden when collapsed
          sidebarCollapsed ? '' : 'md:relative absolute left-0 top-0 h-full z-30'
        }`}>
          {/* Collapse Button */}
          <div className="p-4 border-b border-white/10 flex items-center justify-between min-h-[73px]">
            {!sidebarCollapsed && (
              <h2 className="text-xl font-semibold text-white flex items-center gap-2">
                Manage Documents
              </h2>
            )}
            <button 
              onClick={toggleSidebar}
              className="text-white hover:bg-white/10 p-2 rounded transition-colors ml-auto"
              title={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            >
              <svg className={`w-5 h-5 transition-transform ${sidebarCollapsed ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
              </svg>
            </button>
          </div>

          {!sidebarCollapsed && (
            <div className="p-6 flex flex-col flex-1 overflow-y-auto">
              <div className="mb-6 flex-shrink-0">
                <h3 className="text-lg font-medium text-white mb-3">Upload Documents</h3>
                <div className="border-2 border-dashed border-blue-400/30 rounded-lg p-6 text-center mb-3">
                  <p className="text-gray-300 mb-1">Drag and drop files here</p>
                  <p className="text-gray-500 text-sm mb-3">Limit: 200MB per file</p>
                  <input 
                    ref={fileInputRef}
                    type="file"
                    multiple
                    accept=".pdf,.doc,.docx,.txt"
                    onChange={handleFileSelect}
                    className="hidden"
                  />
                  <button 
                    onClick={handleBrowseFiles}
                    disabled={showUndoBar}
                    className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                      showUndoBar 
                        ? 'bg-gray-600 cursor-not-allowed text-gray-400' 
                        : 'bg-blue-600 hover:bg-blue-700 text-white'
                    }`}
                  >
                    Browse files
                  </button>
                </div>

                {/* Selected Files Preview */}
                {selectedFiles.length > 0 && (
                  <div className="space-y-2 mb-3 flex-shrink-0">
                    {selectedFiles.map((file, index) => {
                      const fileInfo = getFileTypeInfo(file.name);
                      const progress = uploadProgress[file.name];
                      return (
                        <div 
                          key={index} 
                          className="relative bg-slate-800/50 rounded-lg p-3"
                          title={`${file.name}\nSize: ${formatFileSize(file.size)}`}
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2 flex-1 min-w-0">
                              <div className={`w-8 h-8 ${fileInfo.color} rounded flex items-center justify-center text-white text-xs font-bold flex-shrink-0`}>
                                {fileInfo.text}
                              </div>
                              <span className="text-white text-sm truncate">{file.name}</span>
                              <span className="text-gray-400 text-xs flex-shrink-0">
                                ({formatFileSize(file.size)})
                              </span>
                            </div>
                            {progress ? (
                              <span className={`ml-2 text-xs flex-shrink-0 ${
                                progress.status === 'complete' ? 'text-green-400' : 
                                progress.status === 'failed' ? 'text-red-400' : 
                                'text-blue-400'
                              }`}>
                                {progress.status === 'uploading' ? `${progress.percent || 0}%` : 
                                 progress.status === 'complete' ? '✓ Done' : 
                                 progress.status === 'failed' ? '✗ Failed' : 'Pending'}
                              </span>
                            ) : (
                              <button
                                onClick={() => handleRemoveSelectedFile(index)}
                                className="ml-2 text-red-400 hover:text-red-300 flex-shrink-0"
                                title="Remove file"
                              >
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                                </svg>
                              </button>
                            )}
                          </div>
                          {/* Progress bar */}
                          {progress && progress.status === 'uploading' && (
                            <div className="mt-2 h-1.5 bg-slate-700 rounded-full overflow-hidden">
                              <div 
                                className="h-full bg-blue-500 rounded-full transition-all duration-300" 
                                style={{ width: `${progress.percent || 0}%` }}
                              ></div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                    <button
                      onClick={handleUploadSelectedFiles}
                      disabled={isLoading || showUndoBar}
                      className={`w-full py-2 rounded-lg font-medium transition-colors ${
                        isLoading || showUndoBar
                          ? 'bg-gray-600 cursor-not-allowed text-gray-400' 
                          : 'bg-green-600 hover:bg-green-700 text-white'
                      }`}
                    >
                      {isLoading ? 'Uploading...' : `Add ${selectedFiles.length} Document${selectedFiles.length > 1 ? 's' : ''}`}
                    </button>
                  </div>
                )}
              </div>

              <div className="flex-1 overflow-y-auto">
                <h3 className="text-lg font-medium text-white mb-3">Uploaded Files</h3>
                <div className="space-y-2">
                  {uploadedFiles.map(file => {
                    const fileInfo = getFileTypeInfo(file.name);
                    return (
                      <div 
                        key={file.id} 
                        className="flex items-center justify-between bg-slate-800/50 rounded-lg p-3"
                        title={`${file.name}${file.size ? '\nSize: ' + formatFileSize(file.size) : ''}`}
                      >
                        <div className="flex items-center gap-2 flex-1 min-w-0">
                          <div className={`w-8 h-8 ${fileInfo.color} rounded flex items-center justify-center text-white text-xs font-bold flex-shrink-0`}>
                            {fileInfo.text}
                          </div>
                          <span className="text-white text-sm truncate">{file.name}</span>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                          <span className={`text-xs ${file.active ? 'text-green-400' : 'text-gray-400'}`}>
                            {file.active ? 'Active' : 'Inactive'}
                          </span>
                          <button
                            onClick={() => toggleFileActive(file.id)}
                            disabled={showUndoBar}
                            className={`relative w-10 h-6 rounded-full transition-colors ${
                              file.active ? 'bg-green-500' : 'bg-gray-600'
                            } ${showUndoBar ? 'opacity-50 cursor-not-allowed' : ''}`}
                          >
                            <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-transform ${
                              file.active ? 'translate-x-5' : 'translate-x-1'
                            }`}></div>
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
                <button 
                  onClick={clearInactiveFiles}
                  disabled={isClearingInactive || showUndoBar}
                  className={`mt-4 text-sm text-gray-400 hover:text-white flex items-center gap-2 transition-colors ${isClearingInactive || showUndoBar ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                  Clear Inactive Documents
                </button>
                
                {/* Clearing Progress Bar */}
                {isClearingInactive && clearingProgress.total > 0 && (
                  <div className="mt-3">
                    <div className="flex justify-between text-xs text-gray-400 mb-1">
                      <span>Deleting documents...</span>
                      <span>{Math.round(clearingProgress.percent || 0)}%</span>
                    </div>
                    <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-red-500 rounded-full transition-all duration-150" 
                        style={{ width: `${clearingProgress.percent || 0}%` }}
                      ></div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Main Chat Area */}
        <div className="flex-1 flex flex-col relative">
          {/* Header - matches sidebar header height */}
          <div className="bg-slate-900/50 backdrop-blur-sm border-b border-white/10 p-4 flex items-center justify-between min-h-[73px]">
            <h1 className="text-xl font-semibold text-white">HR Policy Chatbot</h1>
            <div className="flex items-center gap-3">
              {chatHistory.length > 0 && (
                <button 
                  onClick={handleClearChat}
                  disabled={showUndoBar}
                  className={`px-4 py-2 rounded-lg border border-red-400/30 transition-colors flex items-center gap-2 ${
                    showUndoBar 
                      ? 'bg-red-600/10 text-gray-500 cursor-not-allowed' 
                      : 'bg-red-600/20 hover:bg-red-600/30 text-white'
                  }`}
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                  Clear Chat
                </button>
              )}
              <button 
                onClick={handleLogout}
                className="px-4 py-2 bg-blue-600/20 hover:bg-blue-600/30 text-white rounded-lg border border-blue-400/30 transition-colors"
              >
                Logout
              </button>
              <div className="relative">
                <button
                  // onClick={() => setBgMenuOpen(!bgMenuOpen)}
                  onClick={(e) => {
                    e.stopPropagation();
                    setBgMenuOpen(!bgMenuOpen);
                  }}
                  className="text-white hover:bg-white/10 p-2 rounded transition-colors"
                >
                  <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z" />
                  </svg>
                </button>

                {/* Background selector dropdown */}
                {bgMenuOpen && (
                  <div className="absolute right-0 mt-2 w-48 bg-slate-900/90 backdrop-blur border border-white/10 rounded-xl shadow-xl overflow-hidden z-50">
                    <div className="px-4 py-2 text-xs text-gray-400 uppercase tracking-wide border-b border-white/10">
                      Background Theme
                    </div>

                    {Object.keys(backgrounds).map((bg) => (
                      <button
                        key={bg}
                        onClick={() => {
                          setBgStyle(bg);
                          setBgMenuOpen(false);
                        }}
                        className={`w-full text-left px-4 py-2 text-sm transition-colors ${bgStyle === bg
                            ? 'bg-blue-600/20 text-white'
                            : 'text-gray-300 hover:bg-white/10'
                          }`}
                      >
                        {bg.charAt(0).toUpperCase() + bg.slice(1)}
                      </button>
                    ))}
                  </div>
                )}
              </div>

            </div>
          </div>


          {/* Chat Messages */}
          <div ref={chatContainerRef} className="flex-1 overflow-y-auto p-6">
            <div className="max-w-4xl mx-auto">
              {chatHistory.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-center py-20">
                  <div className="mb-6">
                    <svg className="w-20 h-20 text-blue-400 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                    </svg>
                  </div>
                  <h2 className="text-3xl font-bold text-white mb-3">Welcome!</h2>
                  <p className="text-xl text-gray-300 max-w-md">Ask questions about your uploaded documents</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {chatHistory.map((chat) => (
                    <div key={chat.id}>
                      {/* User Question */}
                      <div className="flex justify-end mb-4">
                        <div className="bg-blue-600 text-white rounded-2xl rounded-tr-sm px-6 py-3 max-w-2xl break-words whitespace-pre-wrap overflow-hidden">
                          {chat.question}
                        </div>
                      </div>

                      {/* Loading State - Searching... */}
                      {chat.isLoading ? (
                        <div className="bg-slate-800/50 backdrop-blur-sm rounded-2xl p-6 max-w-3xl mb-3">
                          <div className="flex items-center gap-3">
                            <div className="animate-spin rounded-full h-5 w-5 border-2 border-blue-400 border-t-transparent"></div>
                            <span className="text-gray-300">Searching policies...</span>
                          </div>
                        </div>
                      ) : chat.isError ? (
                        /* Error State */
                        <div className="bg-red-900/30 backdrop-blur-sm rounded-2xl p-6 max-w-3xl mb-3 border border-red-500/30">
                          <p className="text-red-300">{chat.answer}</p>
                        </div>
                      ) : chat.isGreeting ? (
                        /* Greeting - Just show full answer, no read more, no confidence */
                        <div className="bg-slate-800/50 backdrop-blur-sm rounded-2xl p-6 max-w-3xl mb-3">
                          <div className="text-white leading-relaxed">
                            {chat.answer}
                          </div>
                          <div className="text-xs text-gray-500 mt-4">Response time: {chat.responseTime}</div>
                        </div>
                      ) : chat.isList ? (
                        /* List Question - Show full formatted list, no read more */
                        <>
                          <div className="bg-slate-800/50 backdrop-blur-sm rounded-2xl p-6 max-w-3xl mb-3">
                            <div className="text-white leading-relaxed whitespace-pre-line">
                              {chat.answer}
                            </div>
                            <div className="text-xs text-gray-500 mt-4">Response time: {chat.responseTime}</div>
                          </div>
                        </>
                      ) : (
                        /* Regular Answer - With Read More option */
                        <>
                          <div className="bg-slate-800/50 backdrop-blur-sm rounded-2xl p-6 max-w-3xl mb-3">
                            {/* Short Meaningful Answer */}
                            <div className="text-white leading-relaxed whitespace-pre-line">
                              {chat.shortAnswer || chat.answer}
                            </div>
                            
                            {/* Read More - Only show if there's more content and not a greeting/list */}
                            {chat.answer && chat.shortAnswer && chat.answer.length > chat.shortAnswer.length && (
                              <div className="mt-4">
                                <button 
                                  onClick={() => toggleSection(chat.id, 'readmore')}
                                  className="text-blue-400 hover:text-blue-300 text-sm font-medium flex items-center gap-1 transition-colors"
                                >
                                  {expandedSections[`${chat.id}-readmore`] ? (
                                    <>
                                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 15l7-7 7 7" />
                                      </svg>
                                      Show Less
                                    </>
                                  ) : (
                                    <>
                                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                                      </svg>
                                      Read More
                                    </>
                                  )}
                                </button>
                                
                                {/* Expanded Full Answer */}
                                {expandedSections[`${chat.id}-readmore`] && (
                                  <div className="mt-4 pt-4 border-t border-white/10 text-gray-300 leading-relaxed whitespace-pre-line">
                                    {chat.answer}
                                  </div>
                                )}
                              </div>
                            )}
                            
                            <div className="text-xs text-gray-500 mt-4">Response time: {chat.responseTime}</div>
                          </div>
                        </>
                      )}

                      {/* Confidence & Sources - Only shown when not loading and not a greeting */}
                      {!chat.isLoading && !chat.isError && !chat.isGreeting && (
                        <>
                          <button 
                            onClick={() => toggleSection(chat.id, 'sources')}
                            className="w-full max-w-3xl flex items-center justify-between text-white bg-slate-800/50 hover:bg-slate-800 px-4 py-3 rounded-lg transition-colors mb-2"
                          >
                            <div className="flex items-center gap-2">
                              <svg className={`w-4 h-4 transition-transform ${expandedSections[`${chat.id}-sources`] ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
                              </svg>
                              <span>Confidence & Sources</span>
                            </div>
                          </button>
                          {expandedSections[`${chat.id}-sources`] && (
                            <div className="max-w-3xl bg-slate-800/30 rounded-lg p-4 mb-6 text-gray-300">
                              <p><strong>Confidence:</strong> {(chat.confidence.toFixed(2))}</p>
                              {chat.sources && chat.sources.length > 0 ? (
                                <div className="mt-2">
                                  <strong>Sources:</strong>
                                  <ul className="list-disc ml-5 mt-1">
                                    {(() => {
                                      // Remove duplicate sources
                                      const seen = new Set();
                                      const uniqueSources = chat.sources.filter(src => {
                                        if (typeof src === 'object') {
                                          const key = `${src.source}-${src.page}-${src.section || ''}`;
                                          if (seen.has(key)) return false;
                                          seen.add(key);
                                          return true;
                                        }
                                        if (seen.has(src)) return false;
                                        seen.add(src);
                                        return true;
                                      });
                                      
                                      return uniqueSources.map((src, idx) => (
                                        <li key={idx}>
                                          {typeof src === 'object' 
                                            ? `${src.source || 'Unknown'} - Page ${src.page || 'N/A'}${src.section ? ` - Section: ${src.section}` : ''}` 
                                            : src}
                                        </li>
                                      ));
                                    })()}
                                  </ul>
                                </div>
                              ) : (
                                <p className="mt-2"><strong>Sources:</strong> No sources available</p>
                              )}
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Input Area */}
          <div className="bg-slate-900/50 backdrop-blur-sm border-t border-white/10 p-6 relative">
            {/* Floating Scroll to Bottom Button - positioned above input */}
            {showScrollButton && chatHistory.length > 0 && (
              <button
                onClick={scrollToBottom}
                className="absolute -top-14 left-1/2 transform -translate-x-1/2 bg-slate-700/90 hover:bg-slate-600 text-white p-2 rounded-full shadow-lg transition-all duration-300 z-20 border border-white/20 backdrop-blur-sm"
                title="Scroll to bottom"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 14l-7 7m0 0l-7-7m7 7V3" />
                </svg>
              </button>
            )}
            
            <div className="max-w-4xl mx-auto flex gap-3 items-end">
              <div className="flex-1 relative">
                <textarea
                  ref={textareaRef}
                  placeholder="Type your question here..."
                  value={question}
                  disabled={showUndoBar}
                  onChange={(e) => {
                    // Sanitize input as user types and enforce max length
                    const sanitized = sanitizeInput(e.target.value);
                    if (sanitized.length <= 200) {
                      setQuestion(sanitized);
                      // Auto-resize textarea
                      e.target.style.height = '48px';
                      e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px';
                    }
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleSendMessage();
                      // Reset textarea height after sending
                      if (textareaRef.current) {
                        textareaRef.current.style.height = '48px';
                      }
                    }
                    // Shift+Enter allows natural newline - no need to prevent default
                  }}
                  maxLength={200}
                  rows={1}
                  style={{ minHeight: '48px', maxHeight: '120px' }}
                  className={`w-full bg-slate-800/50 text-white placeholder-gray-400 rounded-xl px-6 py-3 pr-16 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none overflow-y-auto custom-scrollbar ${
                    showUndoBar ? 'opacity-50 cursor-not-allowed' : ''
                  }`}
                />
                {/* Character counter */}
                <span className={`absolute right-3 bottom-3 text-xs ${
                  question.length > 175 ? 'text-red-400' : 
                  question.length > 150 ? 'text-yellow-400' : 'text-gray-500'
                }`}>
                  {question.length}/200
                </span>
              </div>
              <button
                onClick={handleSendMessage}
                disabled={question.length < 2 || showUndoBar}
                className={`p-3 rounded-xl transition-colors flex-shrink-0 ${
                  question.length < 2 || showUndoBar
                    ? 'bg-gray-600 cursor-not-allowed text-gray-400' 
                    : 'bg-blue-600 hover:bg-blue-700 text-white'
                }`}
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M14 5l7 7m0 0l-7 7m7-7H3" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Toast Notification */}
      {toast.show && (
        <div className={`fixed top-8 right-8 z-50 px-6 py-3 rounded-xl shadow-lg flex items-center gap-2 transition-all duration-300 animate-fade-in ${
          toast.type === 'success' ? 'bg-green-600/90 text-white' : 
          toast.type === 'info' ? 'bg-blue-600/90 text-white' : 
          'bg-gray-700/90 text-white'
        }`}>
          {toast.type === 'success' && (
            <svg className="w-5 h-5 text-green-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
            </svg>
          )}
          {toast.type === 'info' && (
            <svg className="w-5 h-5 text-blue-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          )}
          <span className="font-medium">{toast.message}</span>
        </div>
      )}

      <style jsx>{`
        @keyframes twinkle {
          0%, 100% { opacity: 0.3; }
          50% { opacity: 1; }
        }
        @keyframes fade-in {
          from { opacity: 0; transform: translateY(-20px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .animate-fade-in {
          animation: fade-in 0.3s ease-out forwards;
        }
        /* Custom scrollbar styles for dark theme */
        ::-webkit-scrollbar {
          width: 8px;
          height: 8px;
        }
        ::-webkit-scrollbar-track {
          background: rgba(30, 41, 59, 0.5);
          border-radius: 4px;
        }
        ::-webkit-scrollbar-thumb {
          background: rgba(100, 116, 139, 0.5);
          border-radius: 4px;
        }
        ::-webkit-scrollbar-thumb:hover {
          background: rgba(100, 116, 139, 0.8);
        }
        .custom-scrollbar::-webkit-scrollbar {
          width: 6px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: rgba(100, 116, 139, 0.4);
          border-radius: 3px;
        }
        /* Firefox scrollbar */
        * {
          scrollbar-width: thin;
          scrollbar-color: rgba(100, 116, 139, 0.5) rgba(30, 41, 59, 0.5);
        }
      `}</style>
    </div>
  );
};

export default AIDocumentAnalysis;