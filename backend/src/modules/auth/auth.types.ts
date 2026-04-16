export type AuthUserRole = 'admin' | 'user';
export type AuthUserStatus = 'active' | 'suspended';

export interface AuthenticatedUser {
  id: string;
  email: string;
  name: string;
  role: AuthUserRole;
  isSuperAdmin: boolean;
  status: AuthUserStatus;
  createdAt: Date;
  updatedAt: Date;
}

export interface AuthenticatedRequest {
  user: AuthenticatedUser;
}
