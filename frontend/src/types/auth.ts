export interface User {
  id: string;
  username: string;
  email?: string;
  full_name: string;
  role: string;
  permissions: string[];
}

export interface LoginResponse {
  access_token: string;
  token_type: string;
  user: User;
}

export interface LoginCredentials {
  identifier: string;
  password: string;
}
