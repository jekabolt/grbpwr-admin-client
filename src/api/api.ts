import axios from 'axios';
import { ROUTES } from 'constants/routes';

const BASE_URL = process.env.REACT_APP_SERVER_URL;

const axiosInstance = axios.create({
  baseURL: BASE_URL,
  headers: {
    'Content-Type': 'application/json',
    'Origin': window.location.origin
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

axiosInstance.interceptors.response.use(
  (response) => {
    return response;
  },
  (error) => {
    if (error.response && error.response.status === 401) {
      localStorage.removeItem('authToken');
      return Promise.reject((window.location.href = ROUTES.login));
    }
    return Promise.reject(error);
  },
);

interface AxiosRequestConfig {
  path: string;
  method: string;
  body?: any;
}

export const axiosRequestHandler = async ({ path, method, body }: AxiosRequestConfig) => {
  try {
    const response = await axiosInstance({
      method: method as 'GET' | 'POST' | 'PUT' | 'DELETE',
      url: path,
      data: body,
    });
    return response.data;
  } catch (error) {
    console.error('api request error', error);
    throw error;
  }
};
