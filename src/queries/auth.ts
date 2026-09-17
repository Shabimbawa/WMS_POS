import { apiRequest } from "../utils/api-client";

export type ProfileRole = "warehouse_admin" | "pos_admin";

export interface CurrentUser {
  id: string;
  email: string;
  role: ProfileRole;
}

interface AuthResponse {
  user: CurrentUser;
}

export async function login(email: string, password: string): Promise<CurrentUser> {
  const result = await apiRequest<AuthResponse>("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
  return result.user;
}

export async function logout(): Promise<void> {
  await apiRequest<void>("/auth/logout", { method: "POST" });
}

export async function getCurrentUser(): Promise<CurrentUser> {
  const result = await apiRequest<AuthResponse>("/auth/me");
  return result.user;
}

