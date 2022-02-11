/**
 * @NOTE
 * See example.env for all possible keys
 */
declare let env: Record<string, any>;
export default env;
/**
 * When changes have been made during runtime, like in the CLI, we can refresh the env object with
 * the newly created variables
 */
export declare function refreshEnv(): void;
