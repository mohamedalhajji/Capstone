export interface AuthUser {
    id: number;
    name: string;
    email: string;
    createdAt?: string;
}

export interface AuthSession {
    token: string;
    user: AuthUser;
}
