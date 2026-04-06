import { createContext, useState, useEffect } from 'react';
import axios from 'axios';

// Backend base — defaults to localhost for local dev; empty in Docker (nginx proxies /api)
const BASE = import.meta.env.VITE_API_BASE || 'http://localhost:5000';

export const API_URL = `${BASE}/api/auth`;

// Create an Axios instance for API calls
const api = axios.create({ baseURL: `${BASE}/api` });

// Axios interceptor: auto-refresh access token on 401
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    // If access token expired and we haven't retried yet
    if (
      error.response?.status === 401 &&
      error.response?.data?.expired &&
      !originalRequest._retry
    ) {
      originalRequest._retry = true;

      const refreshToken = localStorage.getItem('refreshToken');
      if (!refreshToken) {
        // No refresh token — force logout
        localStorage.removeItem('accessToken');
        localStorage.removeItem('refreshToken');
        window.location.href = '/login';
        return Promise.reject(error);
      }

      try {
        const res = await axios.post(`${API_URL}/refresh`, { refreshToken });
        const newAccessToken = res.data.accessToken;

        localStorage.setItem('accessToken', newAccessToken);

        // Retry the original request with new token
        originalRequest.headers.Authorization = `Bearer ${newAccessToken}`;
        return api(originalRequest);
      } catch (refreshError) {
        // Refresh also failed — force logout
        localStorage.removeItem('accessToken');
        localStorage.removeItem('refreshToken');
        window.location.href = '/login';
        return Promise.reject(refreshError);
      }
    }

    return Promise.reject(error);
  }
);

export { api };

export const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    checkAuthStatus();
  }, []);

  // Set auth header on the api instance whenever we have a token
  const setAuthHeader = (token) => {
    if (token) {
      api.defaults.headers.common['Authorization'] = `Bearer ${token}`;
    } else {
      delete api.defaults.headers.common['Authorization'];
    }
  };

  const checkAuthStatus = async () => {
    const accessToken = localStorage.getItem('accessToken');

    if (!accessToken) {
      setLoading(false);
      return;
    }

    setAuthHeader(accessToken);

    try {
      const response = await api.get('/auth/me');
      setUser(response.data);
    } catch (error) {
      console.error('Auth verification failed:', error);
      // Interceptor may have already handled the refresh; if still failing, clear
      localStorage.removeItem('accessToken');
      localStorage.removeItem('refreshToken');
      setUser(null);
    } finally {
      setLoading(false);
    }
  };

  const login = async (email, password) => {
    try {
      const response = await axios.post(`${API_URL}/login`, { email, password });

      localStorage.setItem('accessToken', response.data.accessToken);
      localStorage.setItem('refreshToken', response.data.refreshToken);
      setAuthHeader(response.data.accessToken);

      setUser({
        _id: response.data._id,
        name: response.data.name,
        email: response.data.email,
        createdAt: response.data.createdAt,
      });

      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error.response?.data?.message || 'Login failed. Please try again.',
      };
    }
  };

  const register = async (name, email, password) => {
    try {
      const response = await axios.post(`${API_URL}/register`, {
        name,
        email,
        password,
      });

      localStorage.setItem('accessToken', response.data.accessToken);
      localStorage.setItem('refreshToken', response.data.refreshToken);
      setAuthHeader(response.data.accessToken);

      setUser({
        _id: response.data._id,
        name: response.data.name,
        email: response.data.email,
        createdAt: response.data.createdAt,
      });

      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error.response?.data?.message || 'Registration failed. Please try again.',
      };
    }
  };

  const logout = async () => {
    try {
      const accessToken = localStorage.getItem('accessToken');
      if (accessToken) {
        await axios.post(
          `${API_URL}/logout`,
          {},
          { headers: { Authorization: `Bearer ${accessToken}` } }
        );
      }
    } catch (error) {
      console.error('Logout API call failed:', error);
    } finally {
      localStorage.removeItem('accessToken');
      localStorage.removeItem('refreshToken');
      setAuthHeader(null);
      setUser(null);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        login,
        register,
        logout,
        checkAuthStatus,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};
