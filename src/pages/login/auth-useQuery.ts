import { useQuery } from "@tanstack/react-query";
import { getCurrentUser, type ProfileRole } from "../../queries/auth";

export type { ProfileRole };

export interface Profile {
  id: string;
  user_id: string;
  roles: ProfileRole;
}
export const currentUserQueryKey = ["auth", "me"] as const;

export function useCurrentProfile() {
  const query = useQuery({
    queryKey: currentUserQueryKey,
    queryFn: getCurrentUser,
    staleTime: 60 * 60 * 1000,
    retry: false,
  });

  return {
    ...query,
    data: query.data
      ? { id: query.data.id, user_id: query.data.id, roles: query.data.role }
      : undefined,
    email: query.data?.email ?? null,
  };
}
