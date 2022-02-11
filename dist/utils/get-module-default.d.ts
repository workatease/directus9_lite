export default function getModuleDefault<T>(mod: T | {
    default: T;
}): T;
