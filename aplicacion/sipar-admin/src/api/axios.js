import axios from 'axios';

// Toma la URL del backend desde el .env, o asume localhost por defecto
const baseURL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

const api = axios.create({
    baseURL,
    headers: {
        'Content-Type': 'application/json',
        // Defensas Anti-Caché ISO 27001
        'Cache-Control': 'no-store',
        'Pragma': 'no-cache'
    }
});

// Interceptor de Peticiones (Inyectar JWT)
api.interceptors.request.use((config) => {
    const token = localStorage.getItem('sipar_access_token');
    if (token) {
        config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
}, (error) => {
    return Promise.reject(error);
});

// Interceptor de Respuestas (Guardián Expulsor)
api.interceptors.response.use((response) => {
    return response;
}, (error) => {
    if (error.response && error.response.status === 401) {
        // Si el backend rechaza el token, destruimos la sesión y forzamos recarga dura
        localStorage.removeItem('sipar_access_token');
        window.location.href = '/login';
    }
    return Promise.reject(error);
});

export default api;