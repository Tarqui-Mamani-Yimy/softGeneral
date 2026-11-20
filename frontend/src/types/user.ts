export interface UserItem {
  id: string;
  username: string;
  email: string;
  full_name: string;
  role: string;
  role_name: string;
  is_active: boolean;
  last_login_at: string | null;
  created_at: string;
}

export interface RoleItem {
  id: number;
  code: string;
  name: string;
  description: string;
}

export interface UserCreatePayload {
  username: string;
  email: string;
  full_name: string;
  password: string;
  role: string;
  is_active?: boolean;
}

export interface UserUpdatePayload {
  email?: string;
  full_name?: string;
  password?: string;
  role?: string;
  is_active?: boolean;
}
