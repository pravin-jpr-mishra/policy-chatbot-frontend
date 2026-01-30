/**
 * OAuth Callback Handler
 * Add this to your React app to handle Microsoft OAuth redirects
 */

import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import API from './api';

const AuthCallback = () => {
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    const handleCallback = async () => {
      const params = new URLSearchParams(location.search);
      const code = params.get('code');
      const state = params.get('state');

      if (code) {
        try {
          // Send code to backend for token exchange
          const response = await fetch(`http://localhost:8000/api/auth/callback?code=${code}&state=${state || ''}`);
          const data = await response.json();

          if (data.authenticated && data.session_token) {
            // Store session token
            API.setSessionToken(data.session_token);
            
            // Redirect to main app
            navigate('/');
          } else {
            console.error('Authentication failed');
            navigate('/');
          }
        } catch (error) {
          console.error('Error processing auth callback:', error);
          navigate('/');
        }
      }
    };

    handleCallback();
  }, [location, navigate]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 flex items-center justify-center">
      <div className="text-white text-center">
        <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-white mx-auto mb-4"></div>
        <p className="text-xl">Completing login...</p>
      </div>
    </div>
  );
};

export default AuthCallback;
