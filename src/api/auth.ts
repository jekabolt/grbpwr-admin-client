import { axiosRequestHandler } from './api';
import { LoginRequest, LoginResponse, createAuthServiceClient } from './proto-http/auth';

// TODO: create authService

const authService = createAuthServiceClient(axiosRequestHandler);

export function login(request: LoginRequest): Promise<LoginResponse> {
  return authService.Login(request);
}
