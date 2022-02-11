interface AuthProvider {
    name: string;
    driver: string;
    icon?: string;
}
export declare function getAuthProviders(): AuthProvider[];
export {};
