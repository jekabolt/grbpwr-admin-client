import axios from 'axios';

const BASE_URL = import.meta.env.VITE_SERVER_URL;

if (!BASE_URL) {
  console.error('VITE_SERVER_URL is not defined. API calls will fail.');
}

const axiosInstance = axios.create({
  baseURL: BASE_URL || 'https://backend.grbpwr.com',
  headers: {
    'Content-Type': 'application/json',
  },
});

axiosInstance.interceptors.request.use(
  (config) => {
    const authToken = localStorage.getItem('authToken');
    if (authToken) {
      config.headers = config.headers || {};
      config.headers['Grpc-Metadata-Authorization'] = `Bearer ${authToken}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  },
);

interface AxiosRequestConfig {
  path: string;
  method: string;
  body?: any;
}

axiosInstance.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response) {
      // The request was made and the server responded with a status code
      // that falls out of the range of 2xx
      const errorMessage = `Error: ${error.response.status} - ${error.response.data.message || error.response.statusText}`;
      return Promise.reject(new Error(errorMessage));
    } else if (error.request) {
      // The request was made but no response was received
      const errorMessage = 'Error: No response received from server';
      return Promise.reject(new Error(errorMessage));
    } else {
      // Something happened in setting up the request that triggered an Error
      const errorMessage = `Error: ${error.message}`;
      return Promise.reject(new Error(errorMessage));
    }
  },
);

export const axiosRequestHandler = async ({ path, method, body }: AxiosRequestConfig) => {
  try {
    const response = await axiosInstance({
      method: method as 'GET' | 'POST' | 'PUT' | 'DELETE',
      url: path,
      data: body,
    });
    return response.data;
  } catch (error) {
    // Handle error appropriately, maybe show a notification to the user
    throw error; // Rethrow so calling function can handle it
  }
};
