import { AnySchema } from 'joi';
import { Filter } from '@directus/shared/types';
export default function generateJoi(filter: Filter | null): AnySchema;
