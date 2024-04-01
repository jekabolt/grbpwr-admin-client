import axios from 'axios';

const BASE_URL = process.env.REACT_APP_SERVER_URL;

const axiosInstance = axios.create({
  baseURL: BASE_URL,
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

axiosInstance.interceptors.response.use(
  (response) => {
    return response;
  },
  (error) => {
    if (error.response && error.response.status === 401) {
      localStorage.removeItem('authToken');
      return Promise.resolve((window.location.href = '/grbpwr-admin-client/'));
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
  const response = await axiosInstance({
    method: method as 'GET' | 'POST' | 'PUT' | 'DELETE',
    url: path,
    data: body,
  });
  return response.data;
};
