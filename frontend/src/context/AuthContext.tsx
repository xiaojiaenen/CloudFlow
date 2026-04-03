import type { ReactNode } from "react";
import { createContext, useContext, useEffect, useMemo, useState } from "react";
import {
  clearAuthToken,
  getAuthToken,
  getCurrentUser,
  login as loginRequest,
  setAuthToken,
  UserRecord,
} from "@/src/lib/cloudflow";

interface AuthContextValue {
  user: UserRecord | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<UserRecord>;
  logout: () => void;
  refreshUser: () => Promise<UserRecord | null>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserRecord | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const token = getAuthToken();
    if (!token) {
      setIsLoading(false);
      return;
    }

    void getCurrentUser()
      .then((currentUser) => {
        setUser(currentUser);
      })
      .catch(() => {
        clearAuthToken();
        setUser(null);
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      isLoading,
      async login(email: string, password: string) {
        const result = await loginRequest({
          email,
          password,
        });
        setAuthToken(result.token);
        setUser(result.user);
        return result.user;
      },
      logout() {
        clearAuthToken();
        setUser(null);
      },
      async refreshUser() {
        const token = getAuthToken();
        if (!token) {
          setUser(null);
          return null;
        }

        const currentUser = await getCurrentUser();
        setUser(currentUser);
        return currentUser;
      },
    }),
    [isLoading, user],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }

  return context;
}
